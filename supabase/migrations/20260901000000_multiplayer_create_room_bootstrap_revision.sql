-- Slice 3.11 integration hardening (R2): the room bootstrap revision must
-- agree with the canonical state the worker submits.
--
-- Defect: `multiplayer_create_room` hardcoded `state_version = 0` for both
-- `multiplayer_rooms` and `private.multiplayer_game_states`. When the host
-- publishes a Play record during create, the worker runs the owner-only
-- `update-play-record` command BEFORE this RPC, so the submitted canonical
-- state (and its public snapshot) already carry version 1 while the persisted
-- revision columns say 0. The first join then loaded canonical version 1,
-- submitted `p_expected_version = 1`, and the commit RPC compared it against
-- the persisted 0 — every create-with-record room answered 409 `room_stale`
-- before any guest could sit down.
--
-- Fix: initialize both revision columns from the submitted canonical state's
-- own version, so canonical JSON, persisted revisions, the public snapshot,
-- and the first expected-version check all agree atomically. A create-time
-- canonical state can only be version 0 (no host record) or version 1 (host
-- record published pre-create); anything else is refused as garbage rather
-- than persisted as a bogus revision.
--
-- Deployment ordering: apply this migration BEFORE (or together with) the
-- worker build that publishes the host record during create. The old worker
-- never submitted a nonzero create version, so this RPC is backward
-- compatible; the new worker against the old RPC reproduces the 409.

create or replace function public.multiplayer_create_room(
  p_room_id uuid,
  p_room_code_hash text,
  p_host_user_id uuid,
  p_host_player_id text,
  p_host_display_name text,
  p_host_seat smallint,
  p_config jsonb,
  p_canonical_state jsonb,
  p_public_snapshot jsonb,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_room public.multiplayer_rooms;
  joined_at timestamptz := to_timestamp((p_canonical_state->>'createdAtMs')::double precision / 1000.0);
  bootstrap_version bigint;
begin
  -- The submitted canonical version is the single source of truth for the
  -- bootstrap revision. A create payload that does not carry a safe
  -- non-negative version is refused instead of persisted as revision 0.
  if p_canonical_state ? 'version'
    and jsonb_typeof(p_canonical_state->'version') = 'number'
    and (p_canonical_state->>'version')::text ~ '^\d+$' then
    bootstrap_version := (p_canonical_state->>'version')::bigint;
  else
    raise exception using errcode = '22023',
      message = 'Canonical create state must carry a non-negative integer version.';
  end if;
  if bootstrap_version > 1 then
    raise exception using errcode = '22023',
      message = 'Canonical create state version must be 0 (no host record) or 1 (host record published).';
  end if;

  if p_host_seat < 0 or p_host_seat >= (p_config->>'seatCount')::smallint then
    raise exception using errcode = '22023', message = 'Host seat is outside the room.';
  end if;

  insert into public.multiplayer_rooms (
    id,
    host_player_id,
    status,
    seat_count,
    starting_stack_chips,
    small_blind_chips,
    big_blind_chips,
    hand_target,
    turn_seconds,
    ai_difficulty,
    state_version,
    public_snapshot,
    expires_at
  ) values (
    p_room_id,
    p_host_player_id,
    'lobby',
    (p_config->>'seatCount')::smallint,
    (p_config->>'startingStackChips')::integer,
    (p_config->>'smallBlindChips')::integer,
    (p_config->>'bigBlindChips')::integer,
    p_config->>'handTarget',
    (p_config->>'turnSeconds')::smallint,
    p_config->>'aiDifficulty',
    bootstrap_version,
    p_public_snapshot,
    p_expires_at
  ) returning * into created_room;

  insert into public.multiplayer_seats (
    room_id,
    seat_index,
    player_id,
    occupant_kind,
    display_name,
    ready,
    connection_state,
    control_state,
    missed_turns,
    stack_chips,
    joined_at
  ) values (
    p_room_id,
    p_host_seat,
    p_host_player_id,
    'human',
    trim(p_host_display_name),
    false,
    'online',
    'human',
    0,
    (p_config->>'startingStackChips')::integer,
    joined_at
  );

  insert into private.multiplayer_room_members (room_id, user_id, player_id, joined_at)
  values (p_room_id, p_host_user_id, p_host_player_id, joined_at);

  insert into private.multiplayer_room_secrets (room_id, room_code_hash, code_expires_at)
  values (p_room_id, p_room_code_hash, least(p_expires_at, now() + interval '30 minutes'));

  insert into private.multiplayer_game_states (room_id, state_version, canonical_state)
  values (p_room_id, bootstrap_version, p_canonical_state);

  return to_jsonb(created_room);
end;
$$;
