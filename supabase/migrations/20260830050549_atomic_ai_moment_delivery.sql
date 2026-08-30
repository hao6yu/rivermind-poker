-- Atomic AI table-moment delivery (Slice 3.10 follow-up).
--
-- AI moments ran the same two-RPC shape the sender path used before
-- multiplayer_send_table_moment: multiplayer_claim_ai_moment_slot committed the
-- AI ledger row (room cooldown, per-hand cap, per-seat limit, burst bucket) in
-- one transaction, and multiplayer_broadcast_table_moment ran in a second. A
-- failed broadcast therefore consumed the room's cooldown and the hand's AI
-- slot while delivering nothing — the table's reserved AI personality went
-- silent for the rest of the cooldown for no visible reason.
--
-- multiplayer_send_ai_table_moment runs the claim and the broadcast inside ONE
-- transaction. realtime.send publishes only committed realtime.messages rows
-- (logical replication), so a broadcast failure aborts the statement and rolls
-- the claim, the cooldown and burst consumption, and the unpublished message
-- back together; the coordinator's next transition can then spend the slot on
-- a moment that actually arrives. Refusal reasons pass through unchanged and
-- nothing is sent for them.

-- The one service-role entry point for AI moments. The AI claim and broadcast
-- functions keep their own grants and tests; the Edge Function's AI pipeline
-- calls only this wrapper.
create or replace function public.multiplayer_send_ai_table_moment(
  p_room_id uuid,
  p_hand_number integer,
  p_seat integer,
  p_payload_id text,
  p_now_ms bigint,
  p_payload jsonb
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  claim_result text;
begin
  -- Same-transaction claim: its advisory lock is transaction-scoped and its
  -- ledger row and bucket consumption only commit with the broadcast below.
  claim_result := public.multiplayer_claim_ai_moment_slot(
    p_room_id, p_hand_number, p_seat, p_payload_id, p_now_ms
  );
  if claim_result <> 'accepted' then
    return claim_result;
  end if;
  -- The broadcast wrapper revalidates the server-derived payload (room match,
  -- size, redaction) and publishes on the private room topic. Any failure here
  -- raises, aborting the statement: the claim above rolls back with it.
  perform public.multiplayer_broadcast_table_moment(p_room_id, p_payload);
  return 'accepted';
end;
$$;

revoke execute on function public.multiplayer_send_ai_table_moment(uuid, integer, integer, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.multiplayer_send_ai_table_moment(uuid, integer, integer, text, bigint, jsonb)
  to service_role;
