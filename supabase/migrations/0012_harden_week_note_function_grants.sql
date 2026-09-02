-- ─────────────────────────────────────────────────────────────────────────────
-- 0012 — Re-apply the 0008 grant hardening to the week-note functions
--
-- 0008 revoked EXECUTE from public/anon/authenticated on every trigger function
-- and gated the callable ones to `authenticated`. 0009 and 0010 then added two
-- more functions and did not repeat the step, so Postgres' default grant to
-- PUBLIC stood and both were exposed at /rest/v1/rpc/<name>.
--
-- Neither is exploitable today: PostgREST will not invoke a function returning
-- `trigger`, and set_week_note is SECURITY INVOKER, so RLS still evaluates
-- against the caller and an anonymous one matches no row. This is closing the
-- hole in the pattern rather than a live leak — but the pattern is the thing
-- that will be copied by the next migration.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.guard_week_note_authorship() from public, anon, authenticated;

-- Called by the app, and only ever by a signed-in student or tutor.
revoke all on function public.set_week_note(uuid, public.subject, date, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_week_note(uuid, public.subject, date, boolean, text)
  to authenticated;
