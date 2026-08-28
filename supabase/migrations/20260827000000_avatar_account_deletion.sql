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
-- The PRIMARY hosted-object purge is the `delete-account` Edge Function, which
-- removes the user's objects through the Storage API (deleting both the
-- metadata row and the stored bytes) before the Auth user is deleted. This
-- trigger is the fail-closed backstop for out-of-band deletions (dashboard,
-- admin API): it removes any surviving owner-scoped `storage.objects` rows so
-- no avatar metadata outlives the account. Storage's `protect_delete` trigger
-- (supabase/storage tenant migration 0055) refuses statement-level deletes
-- unless `storage.allow_delete_query` is set, so this security-definer
-- function sets it transaction-locally, and only inside this boundary.
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
  -- Delete the owner's hosted avatar object rows first. `storage.foldername`
  -- returns the path segments excluding the final one, so `[1]` of the
  -- object's `name` is the owner id that every upload path is scoped under.
  -- Only this definer function reaches here, and it targets exactly the
  -- deleting user's objects.
  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.objects as object
  where object.bucket_id = 'avatars'
    and (storage.foldername(object.name))[1] = old.id::text;

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
