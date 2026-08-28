-- Let players react to the current hand while it is live and to the
-- just-settled hand while its result remains on screen. The hand number must
-- still match the canonical state, and a non-playing state is accepted only
-- when the hand is genuinely complete and carries an outcome.
create or replace function public.multiplayer_claim_moment_slot(
  p_room_id uuid,
  p_user_id uuid,
  p_hand_number integer,
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
    raise exception using errcode = '22023', message = 'Invalid moment hand number.';
  end if;
  if p_payload_id is null or char_length(p_payload_id) < 1 or char_length(p_payload_id) > 80 then
    raise exception using errcode = '22023', message = 'Invalid moment payload id.';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(p_room_id::text || ':' || p_user_id::text, 0)
  );
  if not exists (
    select 1
    from private.multiplayer_game_states as game_state
    where game_state.room_id = p_room_id
      and game_state.canonical_state->'hand'->>'handNumber' ~ '^[0-9]{1,9}$'
      and (game_state.canonical_state->'hand'->>'handNumber')::integer = p_hand_number
      and (
        game_state.canonical_state->>'status' = 'playing'
        or (
          game_state.canonical_state->>'status' in ('between-hands', 'complete')
          and game_state.canonical_state->'hand'->>'street' = 'complete'
          and jsonb_typeof(game_state.canonical_state->'hand'->'outcome') = 'object'
        )
      )
  ) then
    return 'stale-hand';
  end if;
  if exists (
    select 1
    from private.multiplayer_moment_ledger
    where room_id = p_room_id
      and user_id = p_user_id
      and at_ms > p_now_ms - 3000
    limit 1
  ) then
    return 'cooldown';
  end if;
  if exists (
    select 1
    from private.multiplayer_moment_ledger
    where room_id = p_room_id
      and user_id = p_user_id
      and payload_id = p_payload_id
    limit 1
  ) then
    return 'duplicate';
  end if;
  begin
    insert into private.multiplayer_moment_ledger (
      room_id, user_id, hand_number, payload_id, at_ms
    ) values (
      p_room_id, p_user_id, p_hand_number, p_payload_id, p_now_ms
    );
  exception
    when unique_violation then
      return 'duplicate';
  end;
  return 'accepted';
end;
$$;

revoke execute on function public.multiplayer_claim_moment_slot(uuid, uuid, integer, text, bigint)
  from public, anon, authenticated;
grant execute on function public.multiplayer_claim_moment_slot(uuid, uuid, integer, text, bigint)
  to service_role;
