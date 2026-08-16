-- Auth deletion already cascades every owner-scoped RiverMind table. Private
-- multiplayer rooms need one additional boundary: user ids and display names
-- also live inside the canonical room document, while completed hands are
-- copied once per viewer. Remove the whole shared room/history set before the
-- auth row disappears so no participant retains another deleted account's
-- private-table identity.
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

revoke all on function private.delete_account_linked_multiplayer_data()
  from public, anon, authenticated;

create trigger before_rivermind_auth_user_delete
before delete on auth.users
for each row execute function private.delete_account_linked_multiplayer_data();
