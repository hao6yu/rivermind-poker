-- =============================================================================
-- Private, owner-scoped avatar upload bucket.
--
-- Uploaded avatars are stored here as `storage.from('avatars').upload(avatarId,
-- bytes)` objects and are read EXCLUSIVELY through the `avatar-access` worker:
-- the worker is the only path that can download an object, it verifies the
-- caller's token, and it refuses (403) callers who are not room members. The
-- object path (`avatarId`) therefore never leaves the worker, and the client
-- only ever sees image bytes or a `403`.
--
-- The `avatarId` is a random 16-character hex id, so a different user cannot
-- guess another user's object to overwrite or delete it; combined with the
-- room-authorized read path (SELECT is intentionally NOT granted) and the
-- account-deletion cascade, this gives owner-scoped writes and room-scoped
-- reads without needing the worker to know the uploading user's id.
-- =============================================================================

do block
$$
  create storage bucket "avatars" with (private = true);
$$;

-- Writes only (upload / re-upload / delete). SELECT is intentionally omitted so
-- the bucket can never be read directly: only the `avatar-access` worker reads
-- via the service role, and it enforces room membership before returning bytes.
ALTER bucket "avatars"
  ALLOW (INSERT, UPDATE, DELETE)
  TO anon, authenticated;
