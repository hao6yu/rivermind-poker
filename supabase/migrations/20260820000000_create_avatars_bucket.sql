-- =============================================================================
-- Private, owner-scoped avatar upload bucket.
--
-- Uploaded avatars are stored at the *owner-scoped*, flat path
-- `${auth.uid()}/${avatarId}` inside the private 'avatars' bucket and are read
-- EXCLUSIVELY through the `avatar-access` worker. The object path therefore
-- embeds the owner (`auth.uid()`), so an unguessable `avatarId` is never, by
-- itself, authorization: a caller can only write objects inside their own
-- owner folder at exactly one folder segment deep with a bounded avatar-id
-- filename (see `private.avatar_object_owned`), and every read goes through
-- the room-authorized worker.
--
-- Schema facts (supabase/storage migrations/tenant/0002 + 0008):
--   * `storage.buckets` is keyed by `id` (text) with a `public` boolean
--     (default false); a private bucket is simply `public = false`.
--   * `storage.objects` stores the in-bucket path in `name`;
--     `storage.foldername(name)` returns the path segments excluding the
--     final one, so `(storage.foldername(name))[1]` is the owner folder and
--     `array_length(..., 1) = 1` proves the flat `owner/avatarId` shape;
--     `storage.filename(name)` returns the final segment.
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

-- Create the private bucket through storage.buckets, enforcing its security
-- and content bounds on EVERY run: `on conflict do update` repairs a bucket
-- created by an earlier attempt (or by the dashboard) that is public,
-- unbounded, or accepts arbitrary MIME types, instead of leaving it untouched
-- like `do nothing` would. The limits mirror the client pipeline exactly:
--   * `public = false` — the bucket stays private; every read goes through the
--     room-authorized `avatar-access` worker;
--   * `file_size_limit = 8388608` (8 MiB) — the same ceiling as
--     `MAX_UPLOAD_BYTES` in `src/domain/avatarProcessing.ts`, so an
--     authenticated client cannot bypass the app and upload oversized bytes;
--   * `allowed_mime_types` — only the formats the client can actually produce
--     after re-encoding (AVIF input becomes WebP), so non-image or exotic
--     content is rejected by the Storage API itself.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']::text[];

-- Drop/create so the migration is re-appliable and the policy text stays the
-- single reviewed source of truth.

-- The shared, reviewed owner predicate for every avatar bucket policy. It
-- bounds the object path *shape*, not just the owner folder: exactly one
-- folder segment (the owner), and a filename matching the bounded avatar-id
-- format the client generates (`BOUNDED_AVATAR_ID` in
-- `src/domain/playerProfile.ts` — lowercase alphanumeric, 8-96 chars, in
-- practice 16 hex chars). A deeper `owner/nested/file` path — which neither
-- `delete-account` nor `avatar-cleanup` models as a removable object and which
-- could otherwise be uploaded through the first-segment-only check — is
-- refused at every verb. `storage.foldername(name)` returns the path segments
-- excluding the final one; `storage.filename(name)` returns the final segment.
create or replace function private.avatar_object_owned(name text, uid text)
returns boolean
language sql
immutable
as $$
  select
    coalesce(array_length(storage.foldername(name), 1), 0) = 1
    and coalesce((storage.foldername(name))[1], '') = uid
    and coalesce(storage.filename(name), '') ~ '^[a-z0-9]{8,96}$'
$$;
grant execute on function private.avatar_object_owned(text, text) to authenticated;

-- The `avatars` bucket is private: only its owner may write, and only at the
-- flat `${owner}/{avatarId}` shape the client produces (see the predicate
-- above).
drop policy if exists "avatars::upload::owner" on storage.objects;
create policy "avatars::upload::owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and private.avatar_object_owned(name, auth.uid()::text)
  );

-- Re-uploading (a new version of the same avatar) is an update to the same
-- owner-scoped object, so it is gated identically to the upload. `USING` gates
-- the existing row, `WITH CHECK` the replacement — both must be the caller's
-- own flat, bounded-shape object.
drop policy if exists "avatars::replace::owner" on storage.objects;
create policy "avatars::replace::owner"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and private.avatar_object_owned(name, auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and private.avatar_object_owned(name, auth.uid()::text)
  );

-- A user may only delete their own hosted avatar objects.
drop policy if exists "avatars::delete::owner" on storage.objects;
create policy "avatars::delete::owner"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and private.avatar_object_owned(name, auth.uid()::text)
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
    and private.avatar_object_owned(name, auth.uid()::text)
  );
