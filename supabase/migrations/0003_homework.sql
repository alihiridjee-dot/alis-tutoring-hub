-- ─────────────────────────────────────────────────────────────────────────────
-- 0003 — Resources, and homework assigned PER STUDENT
--
-- The biggest departure from the previous product. There, a homework was a
-- resource scoped to (level, board, subject) and every enrolled student on that
-- course saw it — fine for a cohort, wrong for one-to-one teaching, where the
-- whole point is that two students on the same spec get different work.
--
-- So a resource is now a reusable TASK sitting in a library, and
-- homework_assignments is the per-student act of setting it, with its own due
-- date. Build the worksheet once, assign it to whoever needs it.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  kind public.resource_kind not null,
  title text not null,
  description text,
  instructions text,

  -- Course scoping. Board is nullable because a video or a general download is
  -- often board-agnostic even when the subject and level are not.
  subject public.subject not null,
  level   public.level   not null,
  board   public.board,

  -- Attached file (worksheet, past paper) in the private `resources` bucket.
  file_path text,
  file_name text,
  file_mime text,
  file_size bigint,

  -- Mark scheme, kept separate so it can be withheld until after submission.
  mark_scheme_path text,
  mark_scheme_name text,

  -- kind = 'video'
  video_url text,
  duration_seconds integer,

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index resources_course_idx on public.resources (kind, level, subject, board);

-- Which spec points a resource covers. This join table is canonical: it is what
-- renders a spec point's resources, and it is what maps a homework mark back
-- onto the FSRS cards it should advance.
create table public.resource_spec_points (
  resource_id uuid not null references public.resources(id) on delete cascade,
  spec_point_id uuid not null references public.spec_points(id) on delete cascade,
  primary key (resource_id, spec_point_id)
);

create index resource_spec_points_point_idx on public.resource_spec_points (spec_point_id);

-- ── Assignments ──────────────────────────────────────────────────────────────

create table public.homework_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id  uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  status public.assignment_status not null default 'assigned',
  -- A short note to this student about this particular setting of the task,
  -- distinct from the resource's own reusable instructions.
  note text,
  -- The same task can be set to the same student more than once across a year
  -- (a retake, a second pass before mocks), so this is NOT unique on
  -- (student_id, resource_id) — that would silently block resurfacing work.
  unique (student_id, resource_id, assigned_at)
);

create index homework_assignments_student_idx
  on public.homework_assignments (student_id, status, due_at);
create index homework_assignments_resource_idx
  on public.homework_assignments (resource_id);

comment on table public.homework_assignments is
  'Per-student homework. "Overdue" is derived (due_at < now() and status = '
  '''assigned''), never stored, so it cannot go stale.';

-- ── Submissions ──────────────────────────────────────────────────────────────

create table public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  -- Keyed to the ASSIGNMENT, not the resource. This is what makes a mark
  -- attributable to one student's one attempt, and it is the source_id the FSRS
  -- review ledger dedupes on.
  assignment_id uuid not null references public.homework_assignments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,

  files jsonb not null default '[]'::jsonb,
  notes text,
  submitted_at timestamptz not null default now(),

  score_pct numeric check (score_pct is null or (score_pct >= 0 and score_pct <= 100)),
  grade text,
  feedback text,
  graded_at timestamptz,
  graded_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  files_deleted_at timestamptz
);

create index homework_submissions_assignment_idx
  on public.homework_submissions (assignment_id);
create index homework_submissions_student_idx
  on public.homework_submissions (student_id, submitted_at desc);

-- ── Built-in questions (homework answered in the app rather than uploaded) ────

create table public.homework_questions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  spec_point_id uuid references public.spec_points(id) on delete set null,
  prompt text not null,
  marks integer not null default 1 check (marks > 0),
  -- Free-text model answer / mark scheme for this question.
  model_answer text,
  sort_order integer not null default 0
);

create index homework_questions_resource_idx
  on public.homework_questions (resource_id, sort_order);

create table public.homework_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.homework_submissions(id) on delete cascade,
  question_id uuid not null references public.homework_questions(id) on delete cascade,
  answer_text text,
  awarded_marks integer check (awarded_marks is null or awarded_marks >= 0),
  marker_comment text,
  unique (submission_id, question_id)
);

create index homework_answers_submission_idx on public.homework_answers (submission_id);

-- Keep the assignment's status in step with reality, rather than asking every
-- caller to remember to update it.
create or replace function public.sync_assignment_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.homework_assignments
     set status = case
                    when new.graded_at is not null then 'marked'::public.assignment_status
                    else 'submitted'::public.assignment_status
                  end
   where id = new.assignment_id;
  return new;
end;
$$;

create trigger homework_submission_syncs_status
  after insert or update of graded_at on public.homework_submissions
  for each row execute function public.sync_assignment_status();
