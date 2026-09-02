-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — Weekly plans, messaging, and billing
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Weekly plans ─────────────────────────────────────────────────────────────
-- The scheduler picks what a week should lead with; this is where that choice
-- is persisted so it stays stable for the student across the week rather than
-- re-deriving (and re-ordering) on every page load.

create table public.student_weekly_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  subject public.subject not null,
  board   public.board   not null,
  level   public.level   not null,
  -- Monday of the week this plan covers. Date, not timestamp: a plan belongs to
  -- a week, and storing an instant invites timezone drift at the boundary.
  week_start date not null,
  -- Who set it: the scheduler, or the tutor overriding it.
  source text not null default 'scheduler' check (source in ('scheduler', 'tutor')),
  created_at timestamptz not null default now(),
  unique (student_id, subject, week_start)
);

create index student_weekly_plans_student_idx
  on public.student_weekly_plans (student_id, week_start desc);

create table public.student_weekly_plan_points (
  plan_id uuid not null references public.student_weekly_plans(id) on delete cascade,
  spec_point_id uuid not null references public.spec_points(id) on delete cascade,
  -- 'core' is first contact — material the student has never met, which is
  -- teaching. 'focus' is a point coming back round, which is revision. The
  -- distinction comes from whether an FSRS card exists at all; getting it wrong
  -- tells a student they're "revisiting" something they were never taught.
  lane text not null default 'core' check (lane in ('core', 'focus')),
  origin text not null default 'planned' check (origin in ('planned', 'carried_over')),
  sort_order integer not null default 0,
  primary key (plan_id, spec_point_id)
);

-- ── Messaging ────────────────────────────────────────────────────────────────
-- Threads are pinned to a spec point or a homework assignment, so a question is
-- always attached to the thing it is about.

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  subject text not null default '',
  spec_point_id uuid references public.spec_points(id) on delete set null,
  assignment_id uuid references public.homework_assignments(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index chat_threads_student_idx on public.chat_threads (student_id, last_message_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

create or replace function public.touch_thread()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.chat_threads
     set last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end;
$$;

create trigger chat_message_touches_thread
  after insert on public.chat_messages
  for each row execute function public.touch_thread();

-- ── Billing ──────────────────────────────────────────────────────────────────

create table public.stripe_customers (
  student_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text not null unique,
  status text not null,
  -- Read from the subscription OR from items[0] — depending on the account's
  -- Stripe API version, the period end may only be present on the item.
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_student_idx on public.subscriptions (student_id, status);

-- ── Content access ───────────────────────────────────────────────────────────

create or replace function private.student_has_access(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private'
as $$
  select
    -- The exemption is checked FIRST and short-circuits.
    --
    -- Agency and referral students are invoiced by the agency, off-platform.
    -- They will never have a Stripe subscription, so any check that looked at
    -- subscriptions first would paywall exactly the students who are already
    -- paying. Only 'independent' students are gated.
    coalesce(
      (select p.source <> 'independent'::public.student_source
         from public.profiles p where p.id = p_student_id),
      false
    )
    or exists (
      select 1 from public.subscriptions s
      where s.student_id = p_student_id
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
    );
$$;

-- Public wrapper so the client can ask "can I see paid content?" without being
-- able to ask it about anybody else.
create or replace function public.viewer_has_content_access()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private'
as $$
  select private.student_has_access(auth.uid());
$$;

-- Needed for the same reason as the grants in 0001: the content policies in
-- 0006 call student_has_access, and policies run with the caller's privileges.
grant execute on function private.student_has_access(uuid) to authenticated;
grant execute on function public.viewer_has_content_access() to authenticated;
