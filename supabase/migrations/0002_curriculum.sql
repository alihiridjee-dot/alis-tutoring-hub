-- ─────────────────────────────────────────────────────────────────────────────
-- 0002 — Curriculum: topics and spec points
--
-- Every scheduling, homework and progress surface keys off a spec point, so
-- this is the spine of the app. Only GCSE Biology arrives as seed data
-- (0008) — Chemistry, Physics and A-Level Biology have no verified spec data
-- anywhere, and are authored through the tutor UI rather than invented here.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  subject public.subject not null,
  board   public.board   not null,
  level   public.level   not null,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- The course tuple is read on nearly every query in the app.
create index topics_course_idx on public.topics (level, board, subject, sort_order);

create table public.spec_points (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  -- The board's own reference, e.g. "4.1.2". Not unique across boards.
  code text not null,
  title text not null,
  sort_order integer not null default 0,
  -- Share of a week's work this point represents. The planner uses it so that
  -- one dense point doesn't get paced the same as one trivial one.
  weight numeric not null default 1 check (weight > 0),
  -- Optional explainer video. Verified with an oEmbed lookup before it is
  -- written — see the note in 0005 and the dead-link checker in the tutor UI.
  video_url text,
  created_at timestamptz not null default now()
);

create index spec_points_topic_idx on public.spec_points (topic_id, sort_order);

-- A board never repeats a spec code within a topic, and relying on that catches
-- duplicate authoring in the tutor UI at the database rather than in a form.
create unique index spec_points_topic_code_idx on public.spec_points (topic_id, code);

-- ── Enrolments ───────────────────────────────────────────────────────────────
-- Level is shared across a student's subjects and lives on profiles; the exam
-- board is per subject, because a student can sit AQA Biology and OCR Physics
-- in the same year.

create table public.student_enrolments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  subject public.subject not null,
  board   public.board   not null,
  current_grade  text,
  target_grade   text,
  previous_grade text,
  created_at timestamptz not null default now(),
  unique (student_id, subject)
);

create index student_enrolments_student_idx on public.student_enrolments (student_id);
