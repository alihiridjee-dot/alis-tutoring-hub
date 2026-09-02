-- ─────────────────────────────────────────────────────────────────────────────
-- 0004 — The spaced-repetition engine
--
-- This is the IP. Ported from the running schema it replaces, with one change:
-- 'mcq' is gone from the allowed review sources, because quizzes are not part
-- of this product. Homework marks and confidence self-ratings are the only two
-- signals that move a card.
--
-- Everything else — the ledger's dedupe key, the single-transaction RPC, the
-- NULL-source_id trick — is reproduced exactly. Do not "simplify" any of it
-- without reading the comments; each piece is load-bearing.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Confidence ───────────────────────────────────────────────────────────────
-- What the student says about themselves. Captured once on first login by the
-- one-page sort, and editable afterwards. Confidence anchors mastery, so these
-- rows matter well beyond the first week.

create table public.student_topic_confidence (
  student_id uuid not null references auth.users(id) on delete cascade,
  topic_id   uuid not null references public.topics(id) on delete cascade,
  confidence smallint not null check (confidence >= 0 and confidence <= 100),
  -- Manual ordering within a confidence band, from the drag-sort UI.
  sort_index integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (student_id, topic_id)
);

create table public.student_spec_point_confidence (
  student_id    uuid not null references auth.users(id) on delete cascade,
  spec_point_id uuid not null references public.spec_points(id) on delete cascade,
  confidence smallint not null check (confidence >= 0 and confidence <= 100),
  updated_at timestamptz not null default now(),
  primary key (student_id, spec_point_id)
);

-- ── Cards ────────────────────────────────────────────────────────────────────
-- One FSRS card per (student, spec point). `card` is the library's own state
-- blob — stability, difficulty, lapses, state, due. `due` is lifted out as a
-- real column purely so the planner can index and order on it.

create table public.student_spec_point_schedule (
  student_id    uuid not null references auth.users(id) on delete cascade,
  spec_point_id uuid not null references public.spec_points(id) on delete cascade,
  card jsonb not null,
  due timestamptz not null,
  last_review timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, spec_point_id)
);

create index ssps_student_due_idx on public.student_spec_point_schedule (student_id, due);
create index ssps_spec_point_idx  on public.student_spec_point_schedule (spec_point_id);

-- ── Review ledger ────────────────────────────────────────────────────────────
-- Append-only. Every graded event that has ever moved a card.

create table public.student_spec_point_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id    uuid not null references auth.users(id) on delete cascade,
  spec_point_id uuid not null references public.spec_points(id) on delete cascade,
  -- FSRS grade: 1 Again, 2 Hard, 3 Good, 4 Easy.
  rating smallint not null check (rating >= 1 and rating <= 4),
  source text not null check (source in ('homework', 'confidence')),
  score_pct smallint check (score_pct is null or (score_pct >= 0 and score_pct <= 100)),
  -- The homework submission this came from. NULL for confidence self-ratings.
  source_id text,
  reviewed_at timestamptz not null default now()
);

-- The idempotency key, and the single most important index here.
--
-- A homework result carries its submission id, so replaying the sync a hundred
-- times applies that mark exactly once and a card can never be advanced twice
-- for the same piece of work.
--
-- A confidence rating carries source_id = NULL, and Postgres treats NULLs as
-- distinct in a unique index — so those ALWAYS insert. That is intentional, not
-- an oversight: a student re-rating how they feel is genuinely a new event
-- every time, and it must move the card every time. Adding NULLS NOT DISTINCT
-- here would silently break the confidence sort.
create unique index sspr_dedupe_idx
  on public.student_spec_point_reviews (student_id, spec_point_id, source, source_id);

create index sspr_student_point_idx
  on public.student_spec_point_reviews (student_id, spec_point_id, reviewed_at);
create index sspr_spec_point_idx
  on public.student_spec_point_reviews (spec_point_id);

-- ── The atomic write ─────────────────────────────────────────────────────────

create or replace function public.record_reviews_atomic(_reviews jsonb)
returns uuid[]
language plpgsql
set search_path to 'public'
as $$
declare
  r jsonb;
  inserted_id uuid;
  applied uuid[] := '{}';
begin
  if jsonb_typeof(_reviews) <> 'array' or jsonb_array_length(_reviews) > 500 then
    raise exception 'reviews must be an array of at most 500 items';
  end if;

  for r in select * from jsonb_array_elements(_reviews) loop
    insert into student_spec_point_reviews
      (student_id, spec_point_id, rating, source, score_pct, source_id, reviewed_at)
    values (
      (r->>'student_id')::uuid,
      (r->>'spec_point_id')::uuid,
      (r->>'rating')::smallint,
      r->>'source',
      (r->>'score_pct')::smallint,
      r->>'source_id',
      (r->>'reviewed_at')::timestamptz
    )
    on conflict (student_id, spec_point_id, source, source_id) do nothing
    returning id into inserted_id;

    if inserted_id is null then
      continue; -- already applied; the card must not advance twice
    end if;

    insert into student_spec_point_schedule
      (student_id, spec_point_id, card, due, last_review, updated_at)
    values (
      (r->>'student_id')::uuid,
      (r->>'spec_point_id')::uuid,
      r->'card',
      (r->>'due')::timestamptz,
      (r->>'reviewed_at')::timestamptz,
      now()
    )
    on conflict (student_id, spec_point_id) do update
      set card = excluded.card,
          due = excluded.due,
          last_review = excluded.last_review,
          updated_at = excluded.updated_at;

    applied := applied || (r->>'spec_point_id')::uuid;
  end loop;

  return applied;
end $$;

comment on function public.record_reviews_atomic(jsonb) is
  'Ledger insert + card upsert in ONE transaction. Never split this into two '
  'client-side calls: an interruption between them would strand a ledger row '
  'whose card never advanced, and the dedupe key would then skip that mark '
  'forever. Callers fold the FSRS replay in memory and send the batch here.';
