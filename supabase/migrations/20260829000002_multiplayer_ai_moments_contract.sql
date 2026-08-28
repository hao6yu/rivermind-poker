-- Restore the approved AI-moment cadence (Slice 3.8B contract): the room
-- coordinator broadcasts AI reactions at the authored 25 percent probability
-- with a four-second room-wide cooldown, one per AI seat per hand. The claim
-- function is recreated verbatim except the cooldown window shrinks from the
-- interim ten seconds to the approved four, and the stale-hand guard now also
-- covers mid-hand accepted all-ins: the coordinator may classify an all-in
-- transition while the hand still runs (status 'playing') as well as the
-- just-settled hand ('between-hands'), and the canonical hand number must
-- still match either way.

create or replace function public.multiplayer_claim_ai_moment_slot(
  p_room_id uuid,
  p_hand_number integer,
  p_seat integer,
  p_payload_id text,
  p_now_ms bigint
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_hand_number is null or p_hand_number < 0 then
    raise exception using errcode = '22023', message = 'Invalid AI moment hand number.';
  end if;
  if p_seat is null or p_seat < 0 or p_seat > 8 then
    raise exception using errcode = '22023', message = 'Invalid AI moment seat.';
  end if;
  -- The seat must fit the room's own configuration, not just the global 0..8
  -- bound: refuse a seat the canonical room does not have. The bounded-digit
  -- pattern keeps a poisoned canonical row from crashing the claim.
  if not exists (
    select 1
    from private.multiplayer_game_states as game_state
    where game_state.room_id = p_room_id
      and game_state.canonical_state->'config'->>'seatCount' ~ '^[0-9]{1,2}$'
      and p_seat < (game_state.canonical_state->'config'->>'seatCount')::integer
  ) then
    return 'seat-out-of-range';
  end if;
  if p_payload_id is null or char_length(p_payload_id) < 1 or char_length(p_payload_id) > 80 then
    raise exception using errcode = '22023', message = 'Invalid AI moment payload id.';
  end if;
  -- Serialize per room so parallel command commits cannot over-emit.
  perform pg_advisory_xact_lock(
    hashtextextended('ai-moment:' || p_room_id::text, 0)
  );
  -- The settled hand must still be the canonical hand: moments react to the
  -- just-settled hand during 'between-hands' (or an immediately replayed
  -- transition), never to a hand that already moved on.
  if not exists (
    select 1
    from private.multiplayer_game_states as game_state
    where game_state.room_id = p_room_id
      and game_state.canonical_state->>'status' in ('playing', 'between-hands')
      and game_state.canonical_state->'hand'->>'handNumber' ~ '^[0-9]{1,9}$'
      and (game_state.canonical_state->'hand'->>'handNumber')::integer = p_hand_number
  ) then
    return 'stale-hand';
  end if;
  if exists (
    select 1
    from private.multiplayer_ai_moment_ledger
    where room_id = p_room_id
      and at_ms > p_now_ms - 4000
    limit 1
  ) then
    return 'room-cooldown';
  end if;
  if (
    select count(*)
    from private.multiplayer_ai_moment_ledger
    where room_id = p_room_id
      and hand_number = p_hand_number
  ) >= 2 then
    return 'hand-cap';
  end if;
  if exists (
    select 1
    from private.multiplayer_ai_moment_ledger
    where room_id = p_room_id
      and hand_number = p_hand_number
      and seat = p_seat
    limit 1
  ) then
    return 'seat-limit';
  end if;
  begin
    insert into private.multiplayer_ai_moment_ledger (
      room_id, hand_number, seat, payload_id, at_ms
    ) values (
      p_room_id, p_hand_number, p_seat, p_payload_id, p_now_ms
    );
  exception
    when unique_violation then
      return 'duplicate';
  end;
  return 'accepted';
end;
$$;

revoke execute on function public.multiplayer_claim_ai_moment_slot(uuid, integer, integer, text, bigint)
  from public, anon, authenticated;
grant execute on function public.multiplayer_claim_ai_moment_slot(uuid, integer, integer, text, bigint)
  to service_role;
