-- ─────────────────────────────────────────────────────────────────────────────
-- 0010 — Fix the week-note authorship guard for upserts
--
-- 0009's guard read the CURRENT row with a subquery and compared it to `new`,
-- for both INSERT and UPDATE. That is wrong for `INSERT ... ON CONFLICT DO
-- UPDATE`, which is what every write from the app is: Postgres fires the BEFORE
-- INSERT trigger on the *candidate* row before it detects the conflict, and on
-- that candidate the columns the client did not send hold their DEFAULTS. So a
-- student saving only `student_comment` arrived with `tutor_comment = ''`, the
-- guard compared it against the tutor's stored text, saw a change, and refused
-- the write with "the tutor comment may only be written by the tutor" — the one
-- thing the student had not touched.
--
-- The fix is to branch on TG_OP and use OLD, which is the row Postgres actually
-- has: on the conflict's UPDATE pass, columns absent from the payload are absent
-- from the SET list, so NEW holds OLD's values and the comparison is honest.
-- On a genuine INSERT there is no previous row, so the rule is simply that you
-- may not create one carrying the other side's words.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_week_note_authorship()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if private.is_tutor() then
    -- A comment attributed to the student that the student did not write is a
    -- lie about them, not a convenience — so this is guarded in both directions.
    if tg_op = 'UPDATE' and new.student_comment is distinct from old.student_comment then
      raise exception 'the student comment may only be written by the student';
    end if;
    if tg_op = 'INSERT' and coalesce(new.student_comment, '') <> '' then
      raise exception 'the student comment may only be written by the student';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.tutor_comment is distinct from old.tutor_comment then
    raise exception 'the tutor comment may only be written by the tutor';
  end if;
  if tg_op = 'INSERT' and coalesce(new.tutor_comment, '') <> '' then
    raise exception 'the tutor comment may only be written by the tutor';
  end if;
  return new;
end;
$$;
