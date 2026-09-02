-- ─────────────────────────────────────────────────────────────────────────────
-- 0001 — Foundation: enums, profiles, roles, helpers
--
-- Written fresh rather than copied from the previous product's migration
-- history, which had drifted from its own live schema. Everything here was
-- checked against the running database it replaces, then trimmed to what this
-- app actually needs: two roles, no parents, no quizzes, no demo mode.
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists private;

-- ── Enums ────────────────────────────────────────────────────────────────────

-- Only two identities exist here. The previous product carried a parent role
-- and a read-only portal for it; this one is a private practice, so a student
-- and the tutor are the whole cast.
create type public.app_role as enum ('student', 'tutor');

create type public.subject as enum ('biology', 'chemistry', 'physics');
create type public.board   as enum ('edexcel', 'aqa', 'ocr');

-- International GCSE is a LEVEL, not a board: every board runs one, and its
-- specification is a different qualification from the domestic GCSE. Modelling
-- it as a level is what keeps the two apart, since topics, resources and plans
-- are all keyed by (level, board, subject) — so an iGCSE student never sees
-- GCSE material on the same board and subject.
create type public.level as enum ('gcse', 'gcse_trilogy', 'igcse', 'alevel'); -- 'gcse_trilogy' removed in 0011

-- Where a student came from. Drives two things: the Stripe exemption (anyone
-- not 'independent' is invoiced by their agency and must never meet a paywall)
-- and simple reporting on which referral routes are actually producing work.
create type public.student_source as enum (
  'independent',
  'dulwich',
  'ivy',
  'bonas',
  'referral',
  'other'
);

create type public.resource_kind as enum ('homework', 'video', 'download');

-- assigned → submitted → marked. 'overdue' is deliberately NOT a stored value:
-- it is derived from due_at vs now(), so it can never go stale the way a status
-- column updated by a cron job does.
create type public.assignment_status as enum ('assigned', 'submitted', 'marked');

-- ── Profiles ─────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text,
  source public.student_source not null default 'independent',
  -- Shared across a student's subjects; the exam board is per-subject and lives
  -- on student_enrolments, because a student can sit AQA Biology and OCR Physics.
  level public.level,
  -- Non-null once the one-page confidence sort has been completed. This is the
  -- entire gate: a student sees that screen exactly once, on first login, and
  -- never again. Nullable rather than a boolean so it doubles as "when".
  confidence_seeded_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.profiles.source is
  'Agency/referral students are invoiced off-platform and are exempt from the '
  'subscription paywall. Only ''independent'' is gated on Stripe.';

-- The tutor's private notes on a student live in their OWN table, not as a
-- column on profiles.
--
-- That is deliberate. A student must be able to read their own profile row, and
-- Postgres gives no reliable way to hide one column from them: a column-level
-- REVOKE is silently overridden by any table-level grant, so a "tutor only"
-- column on a student-readable table is a false sense of security. A separate
-- table gets an ordinary RLS policy — tutor only, no student policy at all —
-- which is enforceable and obvious.
create table public.student_tutor_notes (
  student_id uuid primary key references auth.users(id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

-- ── Roles ────────────────────────────────────────────────────────────────────
-- Roles live in their own table rather than on profiles so that a role can
-- never be changed by the same UPDATE that a student is allowed to run against
-- their own profile row.

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  primary key (user_id, role)
);

-- SECURITY DEFINER so it can read user_roles without the caller needing a
-- policy on it — that is what stops the RLS policies below from recursing
-- through the very table they are protecting.
create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- "Is the caller the tutor?" — the check most policies actually want.
create or replace function private.is_tutor()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'tutor'::public.app_role
  );
$$;

-- RLS policies call these functions, and a policy is evaluated with the
-- CALLER's privileges — SECURITY DEFINER changes what the function body may do,
-- not who is allowed to invoke it. A newly created schema grants USAGE to its
-- owner only, so without these two lines every policy below fails with
-- "permission denied for schema private" and the whole app 403s.
grant usage on schema private to authenticated;
grant execute on function private.is_tutor() to authenticated;
grant execute on function private.has_role(uuid, public.app_role) to authenticated;

-- ── New-user hook ────────────────────────────────────────────────────────────
-- Accounts are created by the tutor in the Supabase dashboard, so there is no
-- signup form to collect a display name. This mirrors whatever metadata was
-- supplied and defaults every new account to 'student' — the tutor role is
-- granted by hand, never by this trigger.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, display_name, email, source, level)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'source')::public.student_source, 'independent'),
    (new.raw_user_meta_data->>'level')::public.level
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'student'::public.app_role)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
