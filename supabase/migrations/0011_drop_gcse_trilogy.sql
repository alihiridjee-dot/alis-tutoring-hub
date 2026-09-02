-- Drop 'gcse_trilogy' from public.level.
--
-- Combined Science (Edexcel 1SC0, AQA 8464, OCR J250) is not taught here, so
-- the value only ever offered tutors a dead option in the level pickers. No
-- row in any of the four level-typed columns used it.
--
-- Postgres cannot remove a value from an enum, so the type is rebuilt: rename
-- the old one aside, create the new one, re-type every column that uses it,
-- then drop the old type. Any row still holding 'gcse_trilogy' would fail the
-- cast, which is the check we want — this migration must not silently discard
-- a level.

alter type public.level rename to level_old;

create type public.level as enum ('gcse', 'igcse', 'alevel');

alter table public.profiles
  alter column level type public.level using level::text::public.level;
alter table public.resources
  alter column level type public.level using level::text::public.level;
alter table public.student_weekly_plans
  alter column level type public.level using level::text::public.level;
alter table public.topics
  alter column level type public.level using level::text::public.level;

drop type public.level_old;
