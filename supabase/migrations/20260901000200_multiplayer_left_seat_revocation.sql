-- Slice 3.11 integration hardening (R5): permanent departure revokes
-- current-room authority in the persisted membership model.
--
-- Defects:
-- 1. `multiplayer_commit_transition_v2` rebuilt `private.multiplayer_room_members`
--    for EVERY human seat, including seats whose participation is `left`.
--    Membership is the authorization source for room/seats/actions RLS, the
--    private Realtime topic, and resume — so a permanently departed player
--    kept read/recovery authority for the running session.
-- 2. The hand-archive validation checked the membership table, which would
--    make a departed member's own final-hand archive (built at settlement,
--    persisted by the same transition that retires them) fail the commit.
--
-- Fix:
-- 1. Skip the membership insert for seats with participation = 'left'. The
--    departed participant's seat row and ledger identity remain in
--    `multiplayer_seats` and the canonical state for Table stats, standings,
--    and settlement; only their live authorization is revoked. Disconnect
--    recovery is untouched: a disconnected seat keeps its membership and can
--    be resumed only by its original owner (the legacy AI-takeover tombstone
--    filter in `multiplayer_load_resumable_room` is unchanged).
-- 2. Archive validation now verifies the viewer seat in the SUBMITTED
--    canonical state (human seat, matching user id and viewer player id) —
--    the same guarantee, without depending on the membership rebuild order.
--
-- Deployment ordering: apply before (or together with) the worker build that
-- flips departed seats to participation 'left'; the previous worker never
-- persisted that value, so this RPC is backward compatible.

create or replace function public.multiplayer_commit_transition_v2(
  p_room_id uuid,
  p_expected_version bigint,
  p_canonical_state jsonb,
  p_public_snapshot jsonb,
  p_public_actions jsonb,
  p_public_transition jsonb,
  p_hand_archives jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  action jsonb;
  action_index integer := 0;
  archive jsonb;
  archive_user_id uuid;
  current_session_number integer;
  current_version bigint;
  new_version bigint := (p_canonical_state->>'version')::bigint;
  room_hand_number integer := coalesce((p_canonical_state->'hand'->>'handNumber')::integer, 0);
  room_session_number integer := (p_canonical_state->>'sessionNumber')::integer;
  room_status text := p_canonical_state->>'status';
  seat jsonb;
  seat_stack integer;
begin
  if jsonb_typeof(p_public_actions) <> 'array'
    or jsonb_typeof(p_hand_archives) <> 'array'
    or jsonb_array_length(p_hand_archives) > 6 then
    raise exception using errcode = '22023', message = 'Invalid multiplayer transition collections.';
  end if;
  if new_version <> p_expected_version + 1 then
    raise exception using errcode = '22023', message = 'Canonical state version is not the next expected version.';
  end if;
  if room_session_number is null or room_session_number < 1 then
    raise exception using errcode = '22023', message = 'Canonical session number is invalid.';
  end if;

  select room.state_version, room.session_number
    into current_version, current_session_number
  from public.multiplayer_rooms as room
  where room.id = p_room_id
  for update;

  if current_version is null then
    raise exception using errcode = 'P0002', message = 'Multiplayer room was not found.';
  end if;
  if current_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Multiplayer room version is stale.';
  end if;
  if room_session_number < current_session_number
    or room_session_number > current_session_number + 1 then
    raise exception using errcode = '22023', message = 'Canonical session number is stale or invalid.';
  end if;

  update public.multiplayer_rooms
  set host_player_id = nullif(p_canonical_state->>'hostPlayerId', ''),
      status = room_status,
      hand_number = room_hand_number,
      session_number = room_session_number,
      completion_reason = nullif(p_canonical_state->>'completionReason', ''),
      state_version = new_version,
      public_snapshot = p_public_snapshot,
      turn_deadline_at = case
        when p_canonical_state->>'turnDeadlineAtMs' is null then null
        else to_timestamp((p_canonical_state->>'turnDeadlineAtMs')::double precision / 1000.0)
      end,
      updated_at = now()
  where id = p_room_id;

  update private.multiplayer_game_states
  set state_version = new_version,
      canonical_state = p_canonical_state,
      updated_at = now()
  where room_id = p_room_id;

  delete from public.multiplayer_seats where room_id = p_room_id;
  delete from private.multiplayer_room_members where room_id = p_room_id;

  for seat in select value from jsonb_array_elements(p_canonical_state->'seats')
  loop
    seat_stack := coalesce(
      (p_canonical_state->'hand'->'players'->(seat->>'playerId')->>'stack')::integer,
      (p_canonical_state->'config'->>'startingStackChips')::integer
    );

    insert into public.multiplayer_seats (
      room_id, seat_index, player_id, occupant_kind, ai_profile_id,
      display_name, ready, connection_state, control_state, missed_turns,
      stack_chips, joined_at, updated_at
    ) values (
      p_room_id,
      (seat->>'seat')::smallint,
      seat->>'playerId',
      seat->>'kind',
      nullif(seat->>'aiProfileId', ''),
      seat->>'displayName',
      (seat->>'ready')::boolean,
      seat->>'connection',
      seat->>'control',
      (seat->>'missedTurns')::smallint,
      seat_stack,
      to_timestamp((seat->>'joinedAtMs')::double precision / 1000.0),
      now()
    );

    -- R5: a permanently departed seat keeps its seat row and ledger identity
    -- but regains NO membership — room RLS reads, the private Realtime topic,
    -- and resume all key off membership, so this single omission revokes the
    -- departed account's current-room authority for this running session.
    if seat->>'kind' = 'human'
      and seat->>'userId' is not null
      and coalesce(seat->>'participation', '') <> 'left' then
      insert into private.multiplayer_room_members (room_id, user_id, player_id, joined_at)
      values (
        p_room_id,
        (seat->>'userId')::uuid,
        seat->>'playerId',
        to_timestamp((seat->>'joinedAtMs')::double precision / 1000.0)
      );
    end if;
  end loop;

  for action in select value from jsonb_array_elements(p_public_actions)
  loop
    action_index := action_index + 1;
    insert into public.multiplayer_actions (
      room_id, state_version, action_sequence, session_number, hand_number,
      player_id, street, action_type, amount, pot_after
    ) values (
      p_room_id,
      new_version,
      action_index,
      room_session_number,
      room_hand_number,
      action->>'playerId',
      action->>'street',
      action->>'type',
      (action->>'amount')::integer,
      (action->>'potAfter')::integer
    );
  end loop;

  for archive in select value from jsonb_array_elements(p_hand_archives)
  loop
    archive_user_id := (archive->>'userId')::uuid;
    -- R5: archives are authorized against the submitted canonical state's own
    -- seats (human seat with the matching user id and viewer player id) — not
    -- against the membership table, which the same transition may have just
    -- revoked for a departed member whose final hand settles here.
    if archive->>'roomId' <> p_room_id::text
      or (archive->>'sessionNumber')::integer <> room_session_number
      or (archive->'hand'->>'handNumber')::integer <> room_hand_number
      or coalesce(archive->>'completionReason', '')
        <> coalesce(p_canonical_state->>'completionReason', '')
      or not exists (
        select 1
        from jsonb_array_elements(p_canonical_state->'seats') as archive_seat(value)
        where archive_seat.value->>'kind' = 'human'
          and archive_seat.value->>'userId' = archive->>'userId'
          and archive_seat.value->>'playerId' = archive->>'viewerPlayerId'
      )
      or not private.multiplayer_archive_is_redacted(
        archive->>'viewerPlayerId', archive->'hand'
      ) then
      raise exception using errcode = '22023', message = 'Invalid multiplayer hand archive.';
    end if;

    insert into private.multiplayer_hand_archives (
      room_id, user_id, viewer_player_id, session_number, hand_number,
      completed_at, completion_reason, redacted_hand
    ) values (
      p_room_id,
      archive_user_id,
      archive->>'viewerPlayerId',
      (archive->>'sessionNumber')::integer,
      (archive->'hand'->>'handNumber')::integer,
      to_timestamp((archive->>'completedAtMs')::double precision / 1000.0),
      nullif(archive->>'completionReason', ''),
      archive->'hand'
    )
    on conflict (user_id, room_id, session_number, hand_number)
    do nothing;
  end loop;

  perform realtime.send(
    p_public_transition #- '{transition,actorUserId}',
    'transition',
    'room:' || p_room_id::text,
    true
  );

  return new_version;
end;
$$;
