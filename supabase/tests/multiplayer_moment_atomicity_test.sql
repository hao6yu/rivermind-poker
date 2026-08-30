-- Atomic table-moment delivery: the database-level proof.
--
-- These tests drive multiplayer_send_table_moment (the one service-role entry
-- point the Edge Function calls for sender moments) against real ledger,
-- bucket, and realtime.message rows, and observe what a failed broadcast step
-- leaves behind. Everything runs inside one transaction that rolls back, so
-- the local stack is untouched.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(39);

-- Fixture: a playing room on hand 1, the state the claim revalidates against.
INSERT INTO public.multiplayer_rooms (
  id, status, seat_count, starting_stack_chips, small_blind_chips,
  big_blind_chips, hand_target, turn_seconds, ai_difficulty,
  public_snapshot, expires_at
) VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'playing', 9, 2000, 10,
  20, '5', 45, 'club', '{}'::jsonb, now() + interval '1 hour'
);
INSERT INTO private.multiplayer_game_states (room_id, state_version, canonical_state)
VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 1,
  '{"status":"playing","hand":{"handNumber":1}}'::jsonb
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_game_states
    WHERE room_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ),
  1::bigint,
  'the fixture room is playing hand 1'
);
SELECT is(
  (SELECT count(*) FROM realtime.messages WHERE topic = 'room:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  0::bigint,
  'the room topic is quiet before any moment is sent'
);
SELECT (extract(epoch from now()) * 1000)::bigint AS moment_now \gset

SET LOCAL ROLE service_role;

-- Normal delivery: the claim and the broadcast commit together.
SELECT is(
  public.multiplayer_send_table_moment(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111',
    1, 'atomic-a', :moment_now + 1000,
    jsonb_build_object(
      'moment', jsonb_build_object(
        'atMs', :moment_now + 1000, 'handNumber', 1, 'id', 'atomic-a',
        'playerId', 'player-one', 'protocolVersion', 1, 'reactionId', 'cheer',
        'roomId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'seat', 0
      ),
      'roomId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    )
  ),
  'accepted',
  'a valid sender moment is accepted'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_moment_ledger
    WHERE room_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      AND payload_id = 'atomic-a'
  ),
  1::bigint,
  'normal delivery records exactly one claim'
);
SELECT is(
  (SELECT count(*) FROM realtime.messages WHERE topic = 'room:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  1::bigint,
  'normal delivery broadcasts exactly once'
);

-- A retry after a successful broadcast whose HTTP response was lost must not
-- rebroadcast: the duplicate answer is the already-delivered signal.
SELECT is(
  public.multiplayer_send_table_moment(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111',
    1, 'atomic-a', :moment_now + 5000,
    jsonb_build_object(
      'moment', jsonb_build_object(
        'atMs', :moment_now + 5000, 'handNumber', 1, 'id', 'atomic-a',
        'playerId', 'player-one', 'protocolVersion', 1, 'reactionId', 'cheer',
        'roomId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'seat', 0
      ),
      'roomId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    )
  ),
  'duplicate',
  'a retry after a successful broadcast is refused as a duplicate'
);
SELECT is(
  (SELECT count(*) FROM realtime.messages WHERE topic = 'room:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  1::bigint,
  'a duplicate retry never rebroadcasts'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_moment_ledger
    WHERE room_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ),
  1::bigint,
  'a duplicate retry consumes no additional claim'
);

-- The atomicity proof: the claim succeeds, then the broadcast step fails (the
-- redaction guard refuses a deck leak). The whole statement aborts, so the
-- ledger row, the cooldown/burst token consumption, and the unpublished
-- message all roll back together.
SELECT throws_ok(
  format(
    'SELECT public.multiplayer_send_table_moment(%L, %L, 1, %L, %s, %L::jsonb)',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111',
    'atomic-b',
    :moment_now + 9000,
    $json${"moment":{"deck":[{"rank":14}],"id":"atomic-b","roomId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"},"roomId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}$json$
  ),
  '22023',
  'Invalid table moment broadcast.',
  'a broadcast that fails the redaction guard aborts the whole send'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_moment_ledger
    WHERE room_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      AND payload_id = 'atomic-b'
  ),
  0::bigint,
  'a failed broadcast commits no dedup claim'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_moment_ledger
    WHERE room_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ),
  1::bigint,
  'a failed broadcast consumes no rate-limit token either'
);
SELECT is(
  (SELECT count(*) FROM realtime.messages WHERE topic = 'room:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  1::bigint,
  'a failed broadcast publishes nothing'
);
SELECT is(
  (
    SELECT tokens
    FROM private.multiplayer_moment_buckets
    WHERE room_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      AND bucket_kind = 'sender'
      AND subject_id = '11111111-1111-4111-8111-111111111111'
  ),
  7::numeric,
  'the failed send leaves the sender bucket exactly as the first delivery left it'
);
SELECT is(
  (
    SELECT refilled_at_ms
    FROM private.multiplayer_moment_buckets
    WHERE room_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      AND bucket_kind = 'sender'
      AND subject_id = '11111111-1111-4111-8111-111111111111'
  ),
  (:moment_now + 1000)::bigint,
  'the failed send did not refill or restamp the sender bucket'
);
SELECT is(
  (
    SELECT refilled_at_ms
    FROM private.multiplayer_moment_buckets
    WHERE room_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      AND bucket_kind = 'room'
  ),
  (:moment_now + 1000)::bigint,
  'the failed send did not touch the shared room bucket'
);

-- Because nothing was consumed, retrying the same moment id now succeeds —
-- the reaction reaches the table instead of vanishing behind moment_duplicate.
SELECT is(
  public.multiplayer_send_table_moment(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111',
    1, 'atomic-b', :moment_now + 13000,
    jsonb_build_object(
      'moment', jsonb_build_object(
        'atMs', :moment_now + 13000, 'handNumber', 1, 'id', 'atomic-b',
        'playerId', 'player-one', 'protocolVersion', 1, 'reactionId', 'cheer',
        'roomId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'seat', 0
      ),
      'roomId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    )
  ),
  'accepted',
  'retrying the same moment id after the failed broadcast succeeds'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_moment_ledger
    WHERE room_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      AND payload_id = 'atomic-b'
  ),
  1::bigint,
  'the retried moment records its own single claim'
);
SELECT is(
  (SELECT count(*) FROM realtime.messages WHERE topic = 'room:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  2::bigint,
  'the retried moment is delivered exactly once'
);

-- The pre-fix flaw, reproduced at the database level: the legacy two-step
-- path (standalone claim RPC, then standalone broadcast RPC) commits the
-- claim even when the broadcast step then fails — which is exactly the state
-- that made a sender's retry hit moment_duplicate with nothing delivered.
SELECT is(
  public.multiplayer_claim_moment_slot(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111',
    1, 'legacy-c', :moment_now + 21000
  ),
  'accepted',
  'the legacy claim step accepts on its own'
);
SELECT throws_ok(
  format(
    'SELECT public.multiplayer_broadcast_table_moment(%L, %L::jsonb)',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    $json${"moment":{"deck":[{"rank":14}],"id":"legacy-c","roomId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"},"roomId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}$json$
  ),
  '22023',
  'Invalid table moment broadcast.',
  'the legacy broadcast step fails after the claim committed'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_moment_ledger
    WHERE room_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      AND payload_id = 'legacy-c'
  ),
  1::bigint,
  'the legacy path leaves the claim committed after the broadcast failed'
);

-- Authority boundaries: the send function stays service-role-only, invoker
-- rights, and the ledger stays invisible to clients.
SELECT is(
  has_function_privilege(
    'anon',
    'public.multiplayer_send_table_moment(uuid,uuid,integer,text,bigint,jsonb)',
    'EXECUTE'
  ),
  false,
  'anon clients cannot execute the atomic send'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.multiplayer_send_table_moment(uuid,uuid,integer,text,bigint,jsonb)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot execute the atomic send'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.multiplayer_send_table_moment(uuid,uuid,integer,text,bigint,jsonb)',
    'EXECUTE'
  ),
  true,
  'service_role executes the atomic send'
);
SELECT is(
  (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.multiplayer_send_table_moment(uuid,uuid,integer,text,bigint,jsonb)'::regprocedure
  ),
  false,
  'the atomic send keeps security invoker semantics'
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT * FROM private.multiplayer_moment_ledger $$,
  '42501',
  'permission denied for table multiplayer_moment_ledger',
  'authenticated clients cannot read the private moment ledger'
);
RESET ROLE;

-- Atomic AI moment delivery: the same proof for the coordinator's AI pipeline,
-- whose claim carries a seat instead of a user and whose ledger is room-scoped.
INSERT INTO public.multiplayer_rooms (
  id, status, seat_count, starting_stack_chips, small_blind_chips,
  big_blind_chips, hand_target, turn_seconds, ai_difficulty,
  public_snapshot, expires_at
) VALUES (
  'abababab-abab-4bab-8bab-abababababab', 'playing', 9, 2000, 10,
  20, '5', 45, 'club', '{}'::jsonb, now() + interval '1 hour'
);
INSERT INTO private.multiplayer_game_states (room_id, state_version, canonical_state)
VALUES (
  'abababab-abab-4bab-8bab-abababababab', 1,
  '{"status":"playing","config":{"seatCount":9},"hand":{"handNumber":1}}'::jsonb
);
SELECT (extract(epoch from now()) * 1000)::bigint AS ai_now \gset

SET LOCAL ROLE service_role;

SELECT is(
  public.multiplayer_send_ai_table_moment(
    'abababab-abab-4bab-8bab-abababababab', 1, 3, 'ai-atomic-a', :ai_now + 1000,
    jsonb_build_object(
      'moment', jsonb_build_object(
        'atMs', :ai_now + 1000, 'handNumber', 1, 'id', 'ai-atomic-a',
        'playerId', 'player-ai', 'protocolVersion', 1, 'reactionId', 'cheer',
        'roomId', 'abababab-abab-4bab-8bab-abababababab', 'seat', 3
      ),
      'roomId', 'abababab-abab-4bab-8bab-abababababab'
    )
  ),
  'accepted',
  'a valid AI moment is accepted atomically'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_ai_moment_ledger
    WHERE room_id = 'abababab-abab-4bab-8bab-abababababab'
      AND payload_id = 'ai-atomic-a'
  ),
  1::bigint,
  'normal AI delivery records exactly one claim'
);
SELECT is(
  (SELECT count(*) FROM realtime.messages WHERE topic = 'room:abababab-abab-4bab-8bab-abababababab'),
  1::bigint,
  'normal AI delivery broadcasts exactly once'
);

SELECT throws_ok(
  format(
    'SELECT public.multiplayer_send_ai_table_moment(%L, 1, 4, %L, %s, %L::jsonb)',
    'abababab-abab-4bab-8bab-abababababab',
    'ai-atomic-b',
    :ai_now + 9000,
    $json${"moment":{"deck":[{"rank":14}],"id":"ai-atomic-b","roomId":"abababab-abab-4bab-8bab-abababababab"},"roomId":"abababab-abab-4bab-8bab-abababababab"}$json$
  ),
  '22023',
  'Invalid table moment broadcast.',
  'an AI broadcast that fails the redaction guard aborts the whole send'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_ai_moment_ledger
    WHERE room_id = 'abababab-abab-4bab-8bab-abababababab'
      AND payload_id = 'ai-atomic-b'
  ),
  0::bigint,
  'a failed AI broadcast consumes no hand slot or cooldown'
);
SELECT is(
  (SELECT count(*) FROM realtime.messages WHERE topic = 'room:abababab-abab-4bab-8bab-abababababab'),
  1::bigint,
  'a failed AI broadcast publishes nothing'
);
SELECT is(
  (
    SELECT refilled_at_ms
    FROM private.multiplayer_moment_buckets
    WHERE room_id = 'abababab-abab-4bab-8bab-abababababab'
      AND bucket_kind = 'room'
  ),
  (:ai_now + 1000)::bigint,
  'the failed AI send did not touch the shared room bucket'
);

SELECT is(
  public.multiplayer_send_ai_table_moment(
    'abababab-abab-4bab-8bab-abababababab', 1, 4, 'ai-atomic-b', :ai_now + 13000,
    jsonb_build_object(
      'moment', jsonb_build_object(
        'atMs', :ai_now + 13000, 'handNumber', 1, 'id', 'ai-atomic-b',
        'playerId', 'player-ai-two', 'protocolVersion', 1, 'reactionId', 'cheer',
        'roomId', 'abababab-abab-4bab-8bab-abababababab', 'seat', 4
      ),
      'roomId', 'abababab-abab-4bab-8bab-abababababab'
    )
  ),
  'accepted',
  'retrying the AI moment after the failed broadcast succeeds'
);

SELECT is(
  public.multiplayer_send_ai_table_moment(
    'abababab-abab-4bab-8bab-abababababab', 1, 5, 'ai-atomic-c', :ai_now + 14000,
    jsonb_build_object(
      'moment', jsonb_build_object(
        'atMs', :ai_now + 14000, 'handNumber', 1, 'id', 'ai-atomic-c',
        'playerId', 'player-ai-three', 'protocolVersion', 1, 'reactionId', 'cheer',
        'roomId', 'abababab-abab-4bab-8bab-abababababab', 'seat', 5
      ),
      'roomId', 'abababab-abab-4bab-8bab-abababababab'
    )
  ),
  'room-cooldown',
  'a refused AI claim passes through unchanged and sends nothing'
);

-- Authority boundaries mirror the sender wrapper.
SELECT is(
  has_function_privilege(
    'anon',
    'public.multiplayer_send_ai_table_moment(uuid,integer,integer,text,bigint,jsonb)',
    'EXECUTE'
  ),
  false,
  'anon clients cannot execute the atomic AI send'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.multiplayer_send_ai_table_moment(uuid,integer,integer,text,bigint,jsonb)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot execute the atomic AI send'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.multiplayer_send_ai_table_moment(uuid,integer,integer,text,bigint,jsonb)',
    'EXECUTE'
  ),
  true,
  'service_role executes the atomic AI send'
);
SELECT is(
  (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.multiplayer_send_ai_table_moment(uuid,integer,integer,text,bigint,jsonb)'::regprocedure
  ),
  false,
  'the atomic AI send keeps security invoker semantics'
);

SELECT * FROM finish();

ROLLBACK;
