-- =============================================================================
-- Private, owner-scoped avatar upload bucket.
--
-- Uploaded avatars are stored at the *owner-scoped* path `${auth.uid()}/${avatarId}`
-- inside the private 'avatars' bucket and are read EXCLUSIVELY through the
-- `avatar-access` worker. The object path therefore embeds the owner
-- (`auth.uid()`), so an unguessable `avatarId` is never, by itself,
-- authorization: a caller can only write objects inside their own owner
-- folder, and every read goes through the room-authorized worker.
--
-- Schema facts (supabase/storage migrations/tenant/0002 + 0008):
--   * `storage.buckets` is keyed by `id` (text) with a `public` boolean
--     (default false); a private bucket is simply `public = false`.
--   * `storage.objects` stores the in-bucket path in `name`;
--     `storage.foldername(name)` returns the path segments excluding the
--     final one, so `(storage.foldername(name))[1]` is the owner folder.
--   * PostgreSQL requires `USING (...)` before `WITH CHECK (...)` in
--     `CREATE POLICY`.
--
-- Access is expressed with explicit `storage.objects` policies (not a bucket
-- level grant) so each verb has exactly the permission it needs:
--   * upload  (INSERT):  create only inside your own owner folder;
--   * replace (UPDATE):  overwrite only inside your own owner folder
--                        (the upsert path — USING gates the old row,
--                        WITH CHECK gates the new one);
--   * delete  (DELETE):  remove only inside your own owner folder;
--   * owner read (SELECT): owner folder only. This is NOT a room-member read:
--     the Storage API requires `select` alongside `insert`/`update`/`delete`
--     to gate upsert/update/remove (supabase-js 2.111.0 operation docs), and
--     an owner reading their OWN object is owner-scoped authorization, never
--     an unguessable-id grant. `anon` and every other authenticated user are
--     excluded by the folder predicate, so another room member can only ever
--     resolve an avatar through the `avatar-access` worker — which verifies
--     room membership and seat ownership via the service role before it ever
--     reads a byte.
-- =============================================================================

-- Create the private bucket through storage.buckets. Idempotent: re-running an
-- applied migration is a no-op instead of a "bucket already exists" error.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Drop/create so the migration is re-appliable and the policy text stays the
-- single reviewed source of truth.

-- The `avatars` bucket is private: only its owner (matched by the first path
-- segment, which `storage.foldername` returns for an `owner/id` path) may write.
drop policy if exists "avatars::upload::owner" on storage.objects;
create policy "avatars::upload::owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Re-uploading (a new version of the same avatar) is an update to the same
-- owner-scoped object, so it is gated identically to the upload. `USING` gates
-- the existing row, `WITH CHECK` the replacement — both must be in the
-- caller's own owner folder.
drop policy if exists "avatars::replace::owner" on storage.objects;
create policy "avatars::replace::owner"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A user may only delete their own hosted avatar objects.
drop policy if exists "avatars::delete::owner" on storage.objects;
create policy "avatars::delete::owner"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner-scoped read: the Storage API gates upsert/update/remove with a
-- `select` check on the object row, so the owner must be able to read their
-- OWN objects. No other role or user can read anything in this bucket —
-- roommate-side resolution happens only in the `avatar-access` worker.
drop policy if exists "avatars::read::owner" on storage.objects;
create policy "avatars::read::owner"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
