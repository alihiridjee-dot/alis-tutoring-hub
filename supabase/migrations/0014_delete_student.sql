-- ─────────────────────────────────────────────────────────────────────────────
-- 0014 — Deleting a student
--
-- Every student-owned table hangs off auth.users(id) ON DELETE CASCADE, not off
-- profiles — so removing the profile row alone would strand the schedule,
-- reviews, plans, homework and chat, and the account could still sign in and
-- have a blank profile re-created for it. The only honest delete is the auth
-- user, and the anon key cannot touch auth.users.
--
-- Rather than ship a service-role key to an edge function, this is a SECURITY
-- DEFINER function gated on private.is_tutor(): the tutor is already allowed to
-- read and write every one of the rows it cascades to, so nothing new is
-- granted — only the auth row is now reachable, and only for a student.
--
-- The tutor guard is not cosmetic. Without it the principal tutor could delete
-- their own account (or a second tutor's) from a screen meant for students, and
-- there is no way back from it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.delete_student(target uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not private.is_tutor() then
    raise exception 'only the tutor may delete a student';
  end if;

  if target = auth.uid() then
    raise exception 'you cannot delete your own account';
  end if;

  if exists (select 1 from public.user_roles where user_id = target and role = 'tutor') then
    raise exception 'tutor accounts cannot be deleted from the students screen';
  end if;

  if not exists (select 1 from auth.users where id = target) then
    raise exception 'no such account';
  end if;

  -- Everything else goes with it: profiles, enrolments, confidence, schedule,
  -- reviews, weekly plans, homework, chat and notes all cascade from here.
  delete from auth.users where id = target;
end;
$$;

-- Same hardening as 0008/0012: PUBLIC's default execute grant is removed and
-- only signed-in callers may reach it. The tutor check above is what actually
-- authorises; this keeps the RPC off the anonymous surface entirely.
revoke all on function public.delete_student(uuid) from public, anon, authenticated;
grant execute on function public.delete_student(uuid) to authenticated;
