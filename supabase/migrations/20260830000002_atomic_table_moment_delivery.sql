-- Atomic table-moment delivery (Slice 3.10).
--
-- The sender path used to run two separate service-role RPCs: the claim
-- committed its ledger row (and burst buckets) in one transaction, and the
-- broadcast ran in a second one. A broadcast failure therefore left the claim
-- committed, so the sender's inevitable retry hit payload-id deduplication,
-- was answered moment_duplicate, and the client — correctly treating a
-- duplicate as "already delivered" — showed nothing, because nothing had ever
-- been delivered. The reaction disappeared.
--
-- multiplayer_send_table_moment closes that gap by running the claim and the
-- broadcast inside ONE transaction (both are plain in-database function calls,
-- not separate RPC round trips). realtime.send delivers by logical replication
-- of realtime.messages, so an inserted message is only ever published on
-- commit: if the broadcast step fails — the redaction guard, payload shape, or
-- realtime.send itself — the whole statement aborts and the claim, the
-- cooldown and burst buckets, and the not-yet-published message all roll back
-- together. The sender's retry then finds no claim and succeeds.
--
-- Delivery semantics are unchanged: a duplicate payload id still returns
-- 'duplicate' before anything is sent, so a retry after a successful broadcast
-- whose HTTP response was lost never rebroadcasts, and the sender falls back
-- to the accepted local-display outcome it already implements. Normal delivery
-- broadcasts exactly once and records exactly one claim.

-- Creates the one service-role entry point for sender moments. The claim and
-- broadcast functions keep their own grants and tests; the send wrapper is the
-- only function the Edge Function calls for user moments.
create or replace function public.multiplayer_send_table_moment(
  p_room_id uuid,
  p_user_id uuid,
  p_hand_number integer,
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
  -- The claim runs in this same transaction: its advisory lock is
  -- transaction-scoped, its ledger row and bucket consumption only commit
  -- with the broadcast below.
  claim_result := public.multiplayer_claim_moment_slot(
    p_room_id, p_user_id, p_hand_number, p_payload_id, p_now_ms
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

revoke execute on function public.multiplayer_send_table_moment(uuid, uuid, integer, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.multiplayer_send_table_moment(uuid, uuid, integer, text, bigint, jsonb)
  to service_role;
