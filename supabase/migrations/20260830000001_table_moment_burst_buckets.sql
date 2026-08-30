-- Slice 3.10C: replace the visible fixed sender cooldown with rolling,
-- server-authoritative token buckets. Bucket rows contain only authority
-- counters, never reaction content, and cascade with their private room.

create table private.multiplayer_moment_buckets (
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  bucket_kind text not null check (bucket_kind in ('room', 'sender')),
  subject_id uuid not null,
  tokens numeric not null check (tokens >= 0),
  refilled_at_ms bigint not null check (refilled_at_ms > 0),
  primary key (room_id, bucket_kind, subject_id),
  check (bucket_kind <> 'room' or subject_id = room_id)
);

alter table private.multiplayer_moment_buckets enable row level security;
revoke all on table private.multiplayer_moment_buckets from public, anon, authenticated;
grant select, insert, update, delete on table private.multiplayer_moment_buckets to service_role;

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
declare
  sender_capacity constant numeric := 8;
  sender_refill_per_second constant numeric := 4;
  room_capacity constant numeric := 24;
  room_refill_per_second constant numeric := 8;
  sender_tokens numeric;
  sender_refilled_at_ms bigint;
  room_tokens numeric;
  room_refilled_at_ms bigint;
  sender_retry_ms integer := 0;
  room_retry_ms integer := 0;
begin
  if p_hand_number is null or p_hand_number < 0 then
    raise exception using errcode = '22023', message = 'Invalid moment hand number.';
  end if;
  if p_payload_id is null or char_length(p_payload_id) < 1 or char_length(p_payload_id) > 80 then
    raise exception using errcode = '22023', message = 'Invalid moment payload id.';
  end if;
  if p_now_ms is null or p_now_ms <= 0 then
    raise exception using errcode = '22023', message = 'Invalid moment timestamp.';
  end if;

  -- A room-scoped lock serializes both the shared room bucket and each sender
  -- bucket. Distinct rooms remain independent.
  perform pg_advisory_xact_lock(hashtextextended(p_room_id::text || ':moments', 0));

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
      and payload_id = p_payload_id
    limit 1
  ) then
    return 'duplicate';
  end if;

  select bucket.tokens, bucket.refilled_at_ms
  into sender_tokens, sender_refilled_at_ms
  from private.multiplayer_moment_buckets as bucket
  where bucket.room_id = p_room_id
    and bucket.bucket_kind = 'sender'
    and bucket.subject_id = p_user_id;
  if not found then
    sender_tokens := sender_capacity;
    sender_refilled_at_ms := p_now_ms;
  else
    sender_tokens := least(
      sender_capacity,
      sender_tokens + greatest(0, p_now_ms - sender_refilled_at_ms) * sender_refill_per_second / 1000.0
    );
  end if;

  select bucket.tokens, bucket.refilled_at_ms
  into room_tokens, room_refilled_at_ms
  from private.multiplayer_moment_buckets as bucket
  where bucket.room_id = p_room_id
    and bucket.bucket_kind = 'room'
    and bucket.subject_id = p_room_id;
  if not found then
    room_tokens := room_capacity;
    room_refilled_at_ms := p_now_ms;
  else
    room_tokens := least(
      room_capacity,
      room_tokens + greatest(0, p_now_ms - room_refilled_at_ms) * room_refill_per_second / 1000.0
    );
  end if;

  if sender_tokens < 1 then
    sender_retry_ms := ceil((1 - sender_tokens) * 1000 / sender_refill_per_second);
  end if;
  if room_tokens < 1 then
    room_retry_ms := ceil((1 - room_tokens) * 1000 / room_refill_per_second);
  end if;
  if sender_retry_ms > 0 or room_retry_ms > 0 then
    return 'burst:' || greatest(1, sender_retry_ms, room_retry_ms)::text;
  end if;

  insert into private.multiplayer_moment_buckets (
    room_id, bucket_kind, subject_id, tokens, refilled_at_ms
  ) values (
    p_room_id, 'sender', p_user_id, sender_tokens - 1, p_now_ms
  ) on conflict (room_id, bucket_kind, subject_id) do update
  set tokens = excluded.tokens,
      refilled_at_ms = excluded.refilled_at_ms;

  insert into private.multiplayer_moment_buckets (
    room_id, bucket_kind, subject_id, tokens, refilled_at_ms
  ) values (
    p_room_id, 'room', p_room_id, room_tokens - 1, p_now_ms
  ) on conflict (room_id, bucket_kind, subject_id) do update
  set tokens = excluded.tokens,
      refilled_at_ms = excluded.refilled_at_ms;

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

-- AI moments keep their sparse four-second/two-per-hand policy and also
-- consume the same room bucket, so the 24-at-8/sec ceiling covers every
-- sender class. AI does not consume a human sender bucket.
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
declare
  room_capacity constant numeric := 24;
  room_refill_per_second constant numeric := 8;
  room_tokens numeric;
  room_refilled_at_ms bigint;
begin
  if p_hand_number is null or p_hand_number < 0 then
    raise exception using errcode = '22023', message = 'Invalid AI moment hand number.';
  end if;
  if p_seat is null or p_seat < 0 or p_seat > 8 then
    raise exception using errcode = '22023', message = 'Invalid AI moment seat.';
  end if;
  if p_payload_id is null or char_length(p_payload_id) < 1 or char_length(p_payload_id) > 80 then
    raise exception using errcode = '22023', message = 'Invalid AI moment payload id.';
  end if;
  if p_now_ms is null or p_now_ms <= 0 then
    raise exception using errcode = '22023', message = 'Invalid AI moment timestamp.';
  end if;
  if not exists (
    select 1
    from private.multiplayer_game_states as game_state
    where game_state.room_id = p_room_id
      and game_state.canonical_state->'config'->>'seatCount' ~ '^[0-9]{1,2}$'
      and p_seat < (game_state.canonical_state->'config'->>'seatCount')::integer
  ) then
    return 'seat-out-of-range';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_room_id::text || ':moments', 0));

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

  select bucket.tokens, bucket.refilled_at_ms
  into room_tokens, room_refilled_at_ms
  from private.multiplayer_moment_buckets as bucket
  where bucket.room_id = p_room_id
    and bucket.bucket_kind = 'room'
    and bucket.subject_id = p_room_id;
  if not found then
    room_tokens := room_capacity;
  else
    room_tokens := least(
      room_capacity,
      room_tokens + greatest(0, p_now_ms - room_refilled_at_ms) * room_refill_per_second / 1000.0
    );
  end if;
  if room_tokens < 1 then
    return 'room-burst';
  end if;

  insert into private.multiplayer_moment_buckets (
    room_id, bucket_kind, subject_id, tokens, refilled_at_ms
  ) values (
    p_room_id, 'room', p_room_id, room_tokens - 1, p_now_ms
  ) on conflict (room_id, bucket_kind, subject_id) do update
  set tokens = excluded.tokens,
      refilled_at_ms = excluded.refilled_at_ms;

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
