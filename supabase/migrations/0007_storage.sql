-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — Private file storage
--
-- One private bucket. Nothing is ever public: worksheets, mark schemes and
-- student submissions are all reached through short-lived signed URLs minted by
-- a server function, never by a public object URL.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('resources', 'resources', false)
on conflict (id) do nothing;

-- Path conventions, enforced by the policies below:
--   tutor/<resource_id>/<filename>            worksheets, mark schemes, videos
--   submissions/<student_id>/<assignment_id>/<filename>
--
-- The student's own id is the SECOND path segment of a submission, which is
-- what lets a policy check ownership without a table lookup.

create policy resources_tutor_all on storage.objects
  for all to authenticated
  using (bucket_id = 'resources' and private.is_tutor())
  with check (bucket_id = 'resources' and private.is_tutor());

-- Students read tutor-uploaded material only while they have content access.
create policy resources_student_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resources'
    and (storage.foldername(name))[1] = 'tutor'
    and private.student_has_access(auth.uid())
  );

-- Students upload only into their own submission folder.
create policy submissions_student_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resources'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy submissions_student_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resources'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
