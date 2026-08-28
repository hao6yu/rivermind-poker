-- =============================================================================
-- Remove the owner's hosted avatar objects during account deletion.
--
-- The anonymous-account deletion trigger (20260816011440) already cascades every
-- owner-scoped RiverMind table before the `auth.users` row disappears. Uploaded
-- avatars live in the private 'avatars' storage bucket at the owner-scoped path
-- `${auth.uid()}/${avatarId}`, so the same must be true there: the objects are
-- deleted before the auth user is removed, so no avatar bytes survive a deletion
-- the client can no longer reach (its token is invalidated by the deletion).
--
-- This `create or replace`s the trigger function so the avatar purge is added
-- without re-stating the (already tested) multiplayer cascade below it.
--
-- Hosted avatar bytes are removed EXCLUSIVELY through the Storage API, never by
-- SQL: Supabase documents that deleting `storage.objects` rows directly removes
-- only metadata and orphans the underlying stored bytes. The two API-driven
-- paths are:
--   1. the `delete-account` Edge Function — the in-app path, which lists and
--      removes the user's objects through the Storage API (metadata row AND
--      stored bytes) before deleting the Auth user;
--   2. the `avatar-cleanup` Edge Function — the out-of-band path: after a
--      dashboard/Admin-API deletion, it lists every avatar object, finds owner
--      folders whose auth user no longer exists, and removes those objects
--      through the Storage API in bounded batches.
-- This trigger therefore does NOT touch `storage.objects`: out-of-band deletion
-- must leave the metadata rows intact so `avatar-cleanup` can discover the
-- orphaned objects by their owner folder and remove them with the Storage API.
-- =============================================================================
create or replace function private.delete_account_linked_multiplayer_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_room_ids uuid[];
begin
  select coalesce(array_agg(candidate.room_id), array[]::uuid[])
  into affected_room_ids
  from (
    select member.room_id
    from private.multiplayer_room_members as member
    where member.user_id = old.id

    union

    select archive.room_id
    from private.multiplayer_hand_archives as archive
    where archive.user_id = old.id

    union

    -- Membership is authoritative, but include the private coordinator state
    -- as a fail-closed recovery path for any partially written legacy room.
    select state.room_id
    from private.multiplayer_game_states as state
    where jsonb_path_exists(
      state.canonical_state,
      '$.**.userId ? (@ == $user_id)'::jsonpath,
      jsonb_build_object('user_id', to_jsonb(old.id::text))
    )
  ) as candidate;

  delete from private.multiplayer_hand_archives as archive
  where archive.user_id = old.id
    or archive.room_id = any(affected_room_ids);

  delete from public.multiplayer_rooms as room
  where room.id = any(affected_room_ids);

  return old;
end;
$$;
