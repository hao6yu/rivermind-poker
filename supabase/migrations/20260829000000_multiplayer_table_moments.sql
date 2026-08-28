-- Ephemeral table moments: contract, ledger, and broadcast.
--
-- Slice 3.8A. A table moment (reaction / quick phrase) travels only over the
-- existing private room Broadcast topic and is never persisted anywhere: no
-- moment table, no room-snapshot field, no archive field, no offline queue,
-- no transcript, no replay record, and no analytics event. The ledger below is
-- NOT a moment store: it keeps only the authority keys (room, sender, hand,
-- payload id, timestamp) needed to enforce the three-second cooldown, the
-- per-hand budget, and payload-id deduplication across stateless Edge
-- invocations, and its rows expire within an hour via the existing cleanup
-- job. Reconnecting and late-joining players intentionally receive no earlier
-- moments.

-- The ledger is service-role-only: members interact with it exclusively
-- through multiplayer_claim_moment_slot.
create table private.multiplayer_moment_ledger (
  room_id uuid not null,
  user_id uuid not null,
  hand_number integer not null check (hand_number >= 0),
  payload_id text not null check (
    char_length(payload_id) between 1 and 80
  ),
  at_ms bigint not null check (at_ms > 0),
  primary key (room_id, user_id, hand_number, payload_id)
);

create index multiplayer_moment_ledger_sender_at_idx
  on private.multiplayer_moment_ledger (room_id, user_id, at_ms desc);
create index multiplayer_moment_ledger_at_idx
  on private.multiplayer_moment_ledger (at_ms);

alter table private.multiplayer_moment_ledger enable row level security;
revoke all on table private.multiplayer_moment_ledger from public, anon, authenticated;
-- UPDATE covers the cleanup job's row locking (`for update skip locked`).
grant select, insert, update, delete on table private.multiplayer_moment_ledger to service_role;

-- One atomic claim enforces cooldown, per-hand budget, and payload-id
-- deduplication for a sender. The coordinator has already revalidated
-- membership, live-hand status, hand sequence, and the reaction id against the
-- authoritative room state before this function runs, so the claim only
-- enforces the sender limits. Returns 'accepted' or the single reason the
-- moment was refused.
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
  if (
    select count(*)
    from private.multiplayer_moment_ledger
    where room_id = p_room_id
      and user_id = p_user_id
      and hand_number = p_hand_number
  ) >= 4 then
    return 'budget';
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
  insert into private.multiplayer_moment_ledger (
    room_id, user_id, hand_number, payload_id, at_ms
  ) values (
    p_room_id, p_user_id, p_hand_number, p_payload_id, p_now_ms
  );
  return 'accepted';
end;
$$;

-- Broadcasts one moment on the room's private topic using the same
-- realtime.messages path as every snapshot, so the existing member-scoped
-- Realtime policy authorizes it without touching the locked realtime schema.
-- The payload is revalidated here (object shape, room match, size, and the
-- shared redaction guard) before anything is emitted.
create or replace function public.multiplayer_broadcast_table_moment(
  p_room_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_payload) <> 'object'
    or p_payload->>'roomId' <> p_room_id::text
    or jsonb_typeof(p_payload->'moment') <> 'object'
    or octet_length(p_payload::text) > 4000
    or not private.multiplayer_snapshot_is_redacted(p_payload)
  then
    raise exception using errcode = '22023', message = 'Invalid table moment broadcast.';
  end if;
  perform realtime.send(p_payload, 'table-moment', 'room:' || p_room_id::text, true);
end;
$$;

revoke execute on function public.multiplayer_claim_moment_slot(uuid, uuid, integer, text, bigint)
  from public, anon, authenticated;
grant execute on function public.multiplayer_claim_moment_slot(uuid, uuid, integer, text, bigint)
  to service_role;
revoke execute on function public.multiplayer_broadcast_table_moment(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.multiplayer_broadcast_table_moment(uuid, jsonb)
  to service_role;

-- The hourly cleanup job purges ledger authority rows after an hour: cooldown
-- and dedup windows are seconds long, so an hour of retained rows is far more
-- than any legitimate retry horizon and keeps the ledger bounded.
create or replace function private.cleanup_multiplayer_data(p_batch_size integer default 500)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
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

  return jsonb_build_object(
    'deletedArchives', deleted_archives,
    'deletedLimits', deleted_limits,
    'deletedMoments', deleted_moments,
    'deletedRooms', deleted_rooms
  );
end;
$$;
