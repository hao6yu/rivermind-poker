-- Sparse AI table moments: authority ledger and claim.
--
-- Slice 3.8B. AI moments are selected by the room coordinator against the
-- three authored trigger classes and broadcast on the same private topic as
-- human moments; clients never roll an AI reaction independently. Like the
-- human ledger, this table is NOT a moment store: it keeps only the authority
-- keys (room, hand, seat, payload id, timestamp) that enforce the room-level
-- cooldown, the per-hand room cap, and the per-AI per-hand limit across
-- stateless Edge invocations, and its rows expire within an hour via the
-- existing cleanup job.

create table private.multiplayer_ai_moment_ledger (
  room_id uuid not null,
  hand_number integer not null check (hand_number >= 0),
  seat smallint not null check (seat >= 0 and seat <= 8),
  payload_id text not null check (
    char_length(payload_id) between 1 and 80
  ),
  at_ms bigint not null check (at_ms > 0),
  primary key (room_id, hand_number, seat, payload_id)
);

create index multiplayer_ai_moment_ledger_room_at_idx
  on private.multiplayer_ai_moment_ledger (room_id, at_ms desc);
create index multiplayer_ai_moment_ledger_at_idx
  on private.multiplayer_ai_moment_ledger (at_ms);

alter table private.multiplayer_ai_moment_ledger enable row level security;
revoke all on table private.multiplayer_ai_moment_ledger from public, anon, authenticated;
-- UPDATE covers the cleanup job's row locking (`for update skip locked`).
grant select, insert, update, delete on table private.multiplayer_ai_moment_ledger to service_role;

-- One atomic claim for a coordinator-selected AI moment: serialized per room
-- with an advisory lock, revalidating the settled hand against the canonical
-- state and enforcing the ten-second room cooldown, the two-per-hand room
-- cap, and the one-per-AI-per-hand seat limit. Returns 'accepted' or the
-- single reason the moment was refused.
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
      and at_ms > p_now_ms - 10000
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

-- The hourly cleanup job also purges AI moment authority rows after an hour.
create or replace function private.cleanup_multiplayer_data(p_batch_size integer default 500)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  deleted_ai_moments integer := 0;
  deleted_archives integer := 0;
  deleted_limits integer := 0;
  deleted_moments integer := 0;
  deleted_rooms integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 10000 then
    raise exception using errcode = '22023', message = 'Invalid multiplayer cleanup batch size.';
  end if;

  with expired as (
    select id from public.multiplayer_rooms
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.multiplayer_rooms as room
  using expired
  where room.id = expired.id;
  get diagnostics deleted_rooms = row_count;

  with expired as (
    select id from private.multiplayer_hand_archives
    where completed_at < now() - interval '90 days'
    order by completed_at
    limit p_batch_size
    for update skip locked
  )
  delete from private.multiplayer_hand_archives as archive
  using expired
  where archive.id = expired.id;
  get diagnostics deleted_archives = row_count;

  with expired as (
    select user_id, operation, bucket_start
    from private.multiplayer_request_limits
    where bucket_start < now() - interval '1 day'
    order by bucket_start
    limit p_batch_size
    for update skip locked
  )
  delete from private.multiplayer_request_limits as request_limit
  using expired
  where request_limit.user_id = expired.user_id
    and request_limit.operation = expired.operation
    and request_limit.bucket_start = expired.bucket_start;
  get diagnostics deleted_limits = row_count;

  with expired as (
    select room_id, user_id, hand_number, payload_id
    from private.multiplayer_moment_ledger
    where at_ms < (extract(epoch from now()) * 1000)::bigint - 3600000
    order by at_ms
    limit p_batch_size
    for update skip locked
  )
  delete from private.multiplayer_moment_ledger as moment_ledger
  using expired
  where moment_ledger.room_id = expired.room_id
    and moment_ledger.user_id = expired.user_id
    and moment_ledger.hand_number = expired.hand_number
    and moment_ledger.payload_id = expired.payload_id;
  get diagnostics deleted_moments = row_count;

  with expired as (
    select room_id, hand_number, seat, payload_id
    from private.multiplayer_ai_moment_ledger
    where at_ms < (extract(epoch from now()) * 1000)::bigint - 3600000
    order by at_ms
    limit p_batch_size
    for update skip locked
  )
  delete from private.multiplayer_ai_moment_ledger as ai_moment_ledger
  using expired
  where ai_moment_ledger.room_id = expired.room_id
    and ai_moment_ledger.hand_number = expired.hand_number
    and ai_moment_ledger.seat = expired.seat
    and ai_moment_ledger.payload_id = expired.payload_id;
  get diagnostics deleted_ai_moments = row_count;

  return jsonb_build_object(
    'deletedAiMoments', deleted_ai_moments,
    'deletedArchives', deleted_archives,
    'deletedLimits', deleted_limits,
    'deletedMoments', deleted_moments,
    'deletedRooms', deleted_rooms
  );
end;
$$;
