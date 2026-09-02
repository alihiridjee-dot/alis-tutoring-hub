-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — Row Level Security
--
-- The shape throughout: a student reaches their OWN rows and nothing else; the
-- tutor reaches everything. Gating is on role and ownership — never on a
-- hardcoded user id or email, so adding a second tutor later is a row in
-- user_roles rather than a code change.
--
-- Content tables (resources, homework) additionally check
-- private.student_has_access(), which is why a lapsed independent student sees
-- an EMPTY list rather than an error. Agency students are exempt inside that
-- function, so they are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles                      enable row level security;
alter table public.student_tutor_notes           enable row level security;
alter table public.user_roles                    enable row level security;
alter table public.topics                        enable row level security;
alter table public.spec_points                   enable row level security;
alter table public.student_enrolments            enable row level security;
alter table public.resources                     enable row level security;
alter table public.resource_spec_points          enable row level security;
alter table public.homework_assignments          enable row level security;
alter table public.homework_submissions          enable row level security;
alter table public.homework_questions            enable row level security;
alter table public.homework_answers              enable row level security;
alter table public.student_topic_confidence      enable row level security;
alter table public.student_spec_point_confidence enable row level security;
alter table public.student_spec_point_schedule   enable row level security;
alter table public.student_spec_point_reviews    enable row level security;
alter table public.student_weekly_plans          enable row level security;
alter table public.student_weekly_plan_points    enable row level security;
alter table public.chat_threads                  enable row level security;
alter table public.chat_messages                 enable row level security;
alter table public.stripe_customers              enable row level security;
alter table public.subscriptions                 enable row level security;

-- ── Profiles ─────────────────────────────────────────────────────────────────

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or private.is_tutor());

-- A student may edit their own profile row — but see the trigger below, which
-- is what actually stops them editing the fields that matter.
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- PRIVILEGE ESCALATION GUARD.
--
-- `source` is the billing exemption: anything other than 'independent' means
-- "invoiced by an agency, never paywalled". The policy above lets a student
-- update their own row, and a WITH CHECK clause cannot express "this column did
-- not change" — it only sees the new row. So without this trigger a student
-- could PATCH /profiles?id=eq.<self> with {"source":"dulwich"} straight against
-- PostgREST and hand themselves free access for good.
--
-- `level` is guarded for the same reason at one remove: it selects which
-- curriculum they see, and flipping it would silently re-point their whole
-- schedule at a different qualification.
create or replace function public.guard_protected_profile_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if private.is_tutor() then
    return new; -- the tutor sets these, and is the only one who may
  end if;
  if new.source is distinct from old.source then
    raise exception 'source may only be changed by the tutor';
  end if;
  if new.level is distinct from old.level then
    raise exception 'level may only be changed by the tutor';
  end if;
  if new.confidence_seeded_at is distinct from old.confidence_seeded_at
     and old.confidence_seeded_at is not null then
    raise exception 'the confidence sort cannot be re-armed';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_protected_fields
  before update on public.profiles
  for each row execute function public.guard_protected_profile_fields();

create policy profiles_tutor_all on public.profiles
  for all using (private.is_tutor()) with check (private.is_tutor());

-- Tutor's private notes: there is deliberately NO student policy at all.
create policy tutor_notes_tutor_only on public.student_tutor_notes
  for all using (private.is_tutor()) with check (private.is_tutor());

-- ── Roles ────────────────────────────────────────────────────────────────────
-- Readable so the app can branch on it; writable by nobody through the API.
-- The tutor role is granted with SQL from the dashboard, on purpose.

create policy user_roles_select on public.user_roles
  for select using (user_id = auth.uid() or private.is_tutor());

-- ── Curriculum (readable by every signed-in user, authored by the tutor) ──────
-- Not access-gated: a lapsed student should still see the chapter list they are
-- being asked to pay for, and the confidence sort runs before any subscription
-- exists. What's gated is the teaching CONTENT, below.

create policy topics_select on public.topics
  for select to authenticated using (true);
create policy topics_tutor_write on public.topics
  for all using (private.is_tutor()) with check (private.is_tutor());

create policy spec_points_select on public.spec_points
  for select to authenticated using (true);
create policy spec_points_tutor_write on public.spec_points
  for all using (private.is_tutor()) with check (private.is_tutor());

create policy enrolments_select on public.student_enrolments
  for select using (student_id = auth.uid() or private.is_tutor());
create policy enrolments_tutor_write on public.student_enrolments
  for all using (private.is_tutor()) with check (private.is_tutor());

-- ── Resources: the paywalled content ─────────────────────────────────────────

create policy resources_select on public.resources
  for select to authenticated
  using (private.is_tutor() or private.student_has_access(auth.uid()));

create policy resources_tutor_write on public.resources
  for all using (private.is_tutor()) with check (private.is_tutor());

create policy resource_spec_points_select on public.resource_spec_points
  for select to authenticated
  using (private.is_tutor() or private.student_has_access(auth.uid()));

create policy resource_spec_points_tutor_write on public.resource_spec_points
  for all using (private.is_tutor()) with check (private.is_tutor());

-- ── Homework ─────────────────────────────────────────────────────────────────

create policy assignments_select on public.homework_assignments
  for select using (
    private.is_tutor()
    or (student_id = auth.uid() and private.student_has_access(auth.uid()))
  );

create policy assignments_tutor_write on public.homework_assignments
  for all using (private.is_tutor()) with check (private.is_tutor());

create policy submissions_select on public.homework_submissions
  for select using (student_id = auth.uid() or private.is_tutor());

-- A student may submit, but only against an assignment that is actually theirs.
create policy submissions_insert_own on public.homework_submissions
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.homework_assignments a
      where a.id = assignment_id and a.student_id = auth.uid()
    )
  );

-- Students may amend their own work only while it is UNMARKED. Once a mark
-- exists, editing the submission out from under it would leave feedback
-- attached to work that no longer says the same thing.
create policy submissions_update_own on public.homework_submissions
  for update using (student_id = auth.uid() and graded_at is null)
  with check (student_id = auth.uid() and graded_at is null);

create policy submissions_tutor_all on public.homework_submissions
  for all using (private.is_tutor()) with check (private.is_tutor());

create policy hw_questions_select on public.homework_questions
  for select to authenticated
  using (private.is_tutor() or private.student_has_access(auth.uid()));
create policy hw_questions_tutor_write on public.homework_questions
  for all using (private.is_tutor()) with check (private.is_tutor());

create policy hw_answers_select on public.homework_answers
  for select using (
    private.is_tutor()
    or exists (
      select 1 from public.homework_submissions s
      where s.id = submission_id and s.student_id = auth.uid()
    )
  );

create policy hw_answers_write_own on public.homework_answers
  for insert to authenticated
  with check (exists (
    select 1 from public.homework_submissions s
    where s.id = submission_id and s.student_id = auth.uid() and s.graded_at is null
  ));

create policy hw_answers_tutor_all on public.homework_answers
  for all using (private.is_tutor()) with check (private.is_tutor());

-- ── The student's own study data ─────────────────────────────────────────────
-- Confidence, cards, the review ledger and plans are ABOUT the student, so they
-- are never paywalled: a lapsed student can still see their own progress, and
-- the first-login confidence sort happens before any subscription exists.

create policy topic_conf_own on public.student_topic_confidence
  for all using (student_id = auth.uid() or private.is_tutor())
  with check (student_id = auth.uid() or private.is_tutor());

create policy point_conf_own on public.student_spec_point_confidence
  for all using (student_id = auth.uid() or private.is_tutor())
  with check (student_id = auth.uid() or private.is_tutor());

create policy schedule_own on public.student_spec_point_schedule
  for all using (student_id = auth.uid() or private.is_tutor())
  with check (student_id = auth.uid() or private.is_tutor());

-- The ledger is append-only from the app's point of view: no UPDATE or DELETE
-- policy exists, so history cannot be rewritten to game the schedule.
create policy reviews_select on public.student_spec_point_reviews
  for select using (student_id = auth.uid() or private.is_tutor());
create policy reviews_insert on public.student_spec_point_reviews
  for insert to authenticated
  with check (student_id = auth.uid() or private.is_tutor());

create policy weekly_plans_own on public.student_weekly_plans
  for all using (student_id = auth.uid() or private.is_tutor())
  with check (student_id = auth.uid() or private.is_tutor());

create policy weekly_plan_points_own on public.student_weekly_plan_points
  for all using (exists (
    select 1 from public.student_weekly_plans p
    where p.id = plan_id and (p.student_id = auth.uid() or private.is_tutor())
  ))
  with check (exists (
    select 1 from public.student_weekly_plans p
    where p.id = plan_id and (p.student_id = auth.uid() or private.is_tutor())
  ));

-- ── Messaging ────────────────────────────────────────────────────────────────

create policy threads_own on public.chat_threads
  for all using (student_id = auth.uid() or private.is_tutor())
  with check (student_id = auth.uid() or private.is_tutor());

create policy messages_select on public.chat_messages
  for select using (exists (
    select 1 from public.chat_threads t
    where t.id = thread_id and (t.student_id = auth.uid() or private.is_tutor())
  ));

create policy messages_insert on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and (t.student_id = auth.uid() or private.is_tutor())
    )
  );

-- ── Billing (read-only to the student; written by the Stripe webhook) ────────
-- The webhook uses the service-role key, which bypasses RLS entirely — so there
-- is intentionally no INSERT/UPDATE policy for anyone here.

create policy stripe_customers_select on public.stripe_customers
  for select using (student_id = auth.uid() or private.is_tutor());

create policy subscriptions_select on public.subscriptions
  for select using (student_id = auth.uid() or private.is_tutor());
