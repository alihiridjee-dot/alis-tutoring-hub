-- ─────────────────────────────────────────────────────────────────────────────
-- 0009 — Week notes
--
-- One row per (student, subject, week): whether the week is done, and a comment
-- from each side. The plan grid already has a row per week, so this is the
-- natural place to hang "did this happen, and what did we each think of it".
--
-- Distinct from `student_tutor_notes`, which is ONE private scratchpad per
-- student that the student never sees. These are dated, per-subject, and both
-- parties read them.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.student_week_notes (
  student_id      uuid not null references auth.users(id) on delete cascade,
  subject         public.subject not null,
  -- Monday of the week, matching the date keys the pacing engine works in.
  week_start      date not null,
  completed       boolean not null default false,
  tutor_comment   text not null default '',
  student_comment text not null default '',
  updated_at      timestamptz not null default now(),
  primary key (student_id, subject, week_start)
);

alter table public.student_week_notes enable row level security;

-- Same shape as the rest of the schema: a student reaches their own rows, the
-- tutor reaches everything. Ownership and role, never a hardcoded identity.
create policy student_week_notes_select on public.student_week_notes
  for select using (student_id = auth.uid() or private.is_tutor());

create policy student_week_notes_insert on public.student_week_notes
  for insert with check (student_id = auth.uid() or private.is_tutor());

create policy student_week_notes_update on public.student_week_notes
  for update using (student_id = auth.uid() or private.is_tutor())
  with check (student_id = auth.uid() or private.is_tutor());

create policy student_week_notes_delete on public.student_week_notes
  for delete using (private.is_tutor());

-- AUTHORSHIP GUARD.
--
-- Both parties can update the same row — the student to tick the week off and
-- write their side, the tutor to write theirs — so the policies above have to
-- allow each of them to UPDATE it. A WITH CHECK cannot express "this column did
-- not change": it only ever sees the new row. Without this trigger a student
-- could PATCH /student_week_notes straight against PostgREST and write words
-- into their tutor's column, which would then be shown to them as the tutor's.
--
-- Column-level REVOKE is deliberately NOT used here: a table-level grant beats
-- it silently, so the protection would look present and do nothing.
--
-- Each side owns its own column. Neither may write the other's — including the
-- tutor, because a comment attributed to the student that the student did not
-- write is a lie about them, not a convenience.
create or replace function public.guard_week_note_authorship()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if private.is_tutor() then
    if TG_OP = 'UPDATE' and new.student_comment is distinct from old.student_comment then
      raise exception 'the student comment may only be written by the student';
    end if;
    if TG_OP = 'INSERT' and new.student_comment <> '' then
      raise exception 'the student comment may only be written by the student';
    end if;
    return new;
  end if;

  if TG_OP = 'UPDATE' and new.tutor_comment is distinct from old.tutor_comment then
    raise exception 'the tutor comment may only be written by the tutor';
  end if;
  if TG_OP = 'INSERT' and new.tutor_comment <> '' then
    raise exception 'the tutor comment may only be written by the tutor';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_week_note_authorship on public.student_week_notes;
create trigger guard_week_note_authorship
  before insert or update on public.student_week_notes
  for each row execute function public.guard_week_note_authorship();

-- THE WRITER.
--
-- The caller never names a column: the server picks it from who they are, so
-- "writing into the other person's column" is not an operation that can be
-- expressed. The trigger above stays as defence for anyone going straight at
-- PostgREST, but through this function there is nothing for it to catch.
--
-- SECURITY INVOKER, so RLS still applies and the guard still sees the real caller.
create or replace function public.set_week_note(
  _student_id uuid,
  _subject    public.subject,
  _week_start date,
  _completed  boolean default null,
  _comment    text default null
) returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  as_tutor boolean := private.is_tutor();
begin
  if _student_id <> auth.uid() and not as_tutor then
    raise exception 'not your plan';
  end if;

  insert into public.student_week_notes as n
    (student_id, subject, week_start, completed, tutor_comment, student_comment, updated_at)
  values (
    _student_id, _subject, _week_start,
    coalesce(_completed, false),
    case when as_tutor then coalesce(_comment, '') else '' end,
    case when as_tutor then '' else coalesce(_comment, '') end,
    now()
  )
  -- Only the columns we actually mean. Naming every column here would set the
  -- other side's comment back to the value read at page load.
  on conflict (student_id, subject, week_start) do update set
    completed       = coalesce(_completed, n.completed),
    tutor_comment   = case when as_tutor     and _comment is not null then _comment else n.tutor_comment end,
    student_comment = case when not as_tutor and _comment is not null then _comment else n.student_comment end,
    updated_at      = now();
end;
$$;

revoke all on function public.set_week_note(uuid, public.subject, date, boolean, text) from public;
grant execute on function public.set_week_note(uuid, public.subject, date, boolean, text) to authenticated;

create index if not exists student_week_notes_student_subject_idx
  on public.student_week_notes (student_id, subject, week_start);
