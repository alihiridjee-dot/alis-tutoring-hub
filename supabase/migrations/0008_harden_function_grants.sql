-- ─────────────────────────────────────────────────────────────────────────────
-- 0008 — Lock down function EXECUTE grants
--
-- Added after the first security-advisor run on the live project flagged every
-- one of these as reachable over the REST API.
--
-- Trigger functions are invoked BY their trigger, in the table owner's context.
-- Nothing should call them over REST — but Postgres grants EXECUTE to PUBLIC on
-- every new function by default, so PostgREST exposed each at
-- /rest/v1/rpc/<name>. A bare call would fail ("can only be called as a
-- trigger"), but an endpoint that exists and errors is still an endpoint.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_assignment_status() from public, anon, authenticated;
revoke all on function public.touch_thread() from public, anon, authenticated;
revoke all on function public.guard_protected_profile_fields() from public, anon, authenticated;

-- Meant to be called by the app, but only once signed in. A logged-out visitor
-- asking "do I have content access?" should not get an answer.
revoke all on function public.viewer_has_content_access() from public, anon;
grant execute on function public.viewer_has_content_access() to authenticated;

-- The private helpers: `authenticated` needs them because RLS policies call
-- them (policies run with the caller's privileges); `anon` never does.
revoke all on function private.is_tutor() from public, anon;
revoke all on function private.has_role(uuid, public.app_role) from public, anon;
revoke all on function private.student_has_access(uuid) from public, anon;
grant execute on function private.is_tutor() to authenticated;
grant execute on function private.has_role(uuid, public.app_role) to authenticated;
grant execute on function private.student_has_access(uuid) to authenticated;

-- record_reviews_atomic deliberately has no SECURITY DEFINER, so it runs as the
-- caller and RLS still applies to every row it writes. Signed-in users only.
revoke all on function public.record_reviews_atomic(jsonb) from public, anon;
grant execute on function public.record_reviews_atomic(jsonb) to authenticated;
