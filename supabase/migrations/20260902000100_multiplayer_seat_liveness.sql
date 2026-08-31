-- Q4 (Slice 3.11 follow-up): server-authoritative seat liveness.
--
-- The coordinator has no ground truth for "is this client actually alive":
-- seat.connection is app state the CLIENT declares, and the production flow
-- never sends an offline signal on real transport loss. Expired turns for a
-- killed or backgrounded client therefore resolved with the ONLINE courtesy
-- rule (automatic check whenever checking is free) and the seat stayed
-- 'online' forever. This migration adds the server-observed contact record
-- that deadline enforcement reads instead. Design:
-- docs/PHASE_16_SLICE_3_11_Q4_LIVENESS_DESIGN.md.
--
-- Liveness is written ONLY by the edge worker (service_role) from its own
-- verified JWT subject; renewed_at_ms is the WORKER clock (same clock the
-- coordinator compares against), so Postgres/Edge clock skew can neither
-- fake liveness nor manufacture staleness. Updates are greatest()-monotonic,
-- so out-of-order or replayed renewals can never move a seat backwards.
-- Retention is bounded inside the renew RPC: rows for expired rooms and
-- rows older than three days are pruned on every renewal, and room deletion
-- cascades the rows away.

create table private.multiplayer_seat_liveness (
  room_id uuid not null references public.multiplayer_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  renewed_at_ms bigint not null check (renewed_at_ms > 0),
  primary key (room_id, user_id)
);

comment on table private.multiplayer_seat_liveness is
  'Server-observed contact stamps per room seat owner. Service role only; clients reach it exclusively through the multiplayer-room edge function.';

revoke all on table private.multiplayer_seat_liveness from public, anon, authenticated;
grant select, insert, update, delete on table private.multiplayer_seat_liveness to service_role;

create or replace function public.multiplayer_renew_seat_liveness(
  p_room_id uuid,
  p_user_id uuid,
  p_renewed_at_ms bigint
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  room_seats jsonb;
  owns_seat boolean;
begin
  if p_room_id is null or p_user_id is null
    or p_renewed_at_ms is null or p_renewed_at_ms <= 0
  then
    raise exception 'Invalid seat liveness renewal.' using errcode = '22023';
  end if;

  -- The room must exist and still be live. The seats come from the
  -- DATABASE's canonical state — never from any client payload.
  select state.canonical_state -> 'seats' into room_seats
  from private.multiplayer_game_states as state
  join public.multiplayer_rooms as room
    on room.id = state.room_id
  where state.room_id = p_room_id
    and room.expires_at > now();
  if not found then
    raise exception 'Multiplayer room was not found.' using errcode = 'P0002';
  end if;

  -- Ownership is proven against the authoritative state: a human seat that
  -- has not permanently left. A departed ('left') seat can never refresh
  -- liveness; disconnected/sitting-out/rebuy-pending humans can (liveness
  -- is transport contact, not participation).
  if jsonb_typeof(room_seats) is distinct from 'array' then
    owns_seat := false;
  else
    select exists (
      select 1
      from jsonb_array_elements(room_seats) as seat
      where seat ->> 'userId' = p_user_id::text
        and seat ->> 'kind' = 'human'
        and seat ->> 'participation' <> 'left'
    ) into owns_seat;
  end if;
  if not owns_seat then
    raise exception 'Only a seated human may renew seat liveness.' using errcode = '42501';
  end if;

  insert into private.multiplayer_seat_liveness (room_id, user_id, renewed_at_ms)
  values (p_room_id, p_user_id, p_renewed_at_ms)
  on conflict (room_id, user_id) do update
  set renewed_at_ms = greatest(
    private.multiplayer_seat_liveness.renewed_at_ms,
    excluded.renewed_at_ms
  );

  -- Bounded retention (runs in the same transaction as the upsert): rows
  -- for expired rooms and stamps that are already three days old can never
  -- matter again — drop them. The table is tiny (human seats of live rooms),
  -- so this join stays cheap by construction.
  delete from private.multiplayer_seat_liveness as stale
  using public.multiplayer_rooms as room
  where room.id = stale.room_id
    and (
      room.expires_at <= now()
      or to_timestamp(stale.renewed_at_ms / 1000.0) < now() - interval '3 days'
    );

  return true;
end;
$$;

comment on function public.multiplayer_renew_seat_liveness(uuid, uuid, bigint) is
  'Service-role-only monotonic liveness renewal validated against the database canonical state; 42501 for non-owners, P0002 for unknown/expired rooms.';

create or replace function public.multiplayer_load_seat_liveness(p_room_id uuid)
returns table (user_id uuid, renewed_at_ms bigint)
language sql
security invoker
set search_path = ''
as $$
  select liveness.user_id, liveness.renewed_at_ms
  from private.multiplayer_seat_liveness as liveness
  where liveness.room_id = p_room_id;
$$;

comment on function public.multiplayer_load_seat_liveness(uuid) is
  'Service-role-only liveness row read for coordinator tick enforcement.';

revoke execute on function public.multiplayer_renew_seat_liveness(uuid, uuid, bigint)
  from public, anon, authenticated;
revoke execute on function public.multiplayer_load_seat_liveness(uuid)
  from public, anon, authenticated;

grant execute on function public.multiplayer_renew_seat_liveness(uuid, uuid, bigint)
  to service_role;
grant execute on function public.multiplayer_load_seat_liveness(uuid)
  to service_role;
