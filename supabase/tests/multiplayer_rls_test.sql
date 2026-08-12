BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(31);

SELECT has_table('public', 'multiplayer_rooms', 'public rooms table exists');
SELECT has_table('private', 'multiplayer_game_states', 'private canonical state table exists');
SELECT hasnt_column('public', 'multiplayer_rooms', 'room_code_hash', 'room code hashes are not public columns');

SELECT ok(
  private.multiplayer_snapshot_is_redacted(
    '{"deck":[],"players":{"p":{"holeCards":[]}}}'::jsonb
  ),
  'empty private-card collections are safe for public snapshots'
);
SELECT ok(
  not private.multiplayer_snapshot_is_redacted('{"deck":[{"rank":14}]}'::jsonb),
  'a public deck leak is rejected'
);
SELECT ok(
  not private.multiplayer_snapshot_is_redacted(
    '{"players":{"p":{"holeCards":[{"rank":14}]}}}'::jsonb
  ),
  'a public hole-card leak is rejected'
);
SELECT ok(
  not private.multiplayer_snapshot_is_redacted('{"roomCode":"724826"}'::jsonb),
  'a plaintext room code is rejected from public snapshots'
);
SELECT ok(
  not private.multiplayer_snapshot_is_redacted('{"seats":[{"userId":"11111111-1111-4111-8111-111111111111"}]}'::jsonb),
  'an auth user id is rejected from public snapshots'
);

SELECT ok(
  not has_function_privilege(
    'authenticated',
    'public.multiplayer_create_room(uuid,text,uuid,text,text,smallint,jsonb,jsonb,jsonb,timestamp with time zone)',
    'execute'
  ),
  'authenticated clients cannot execute room creation RPC'
);
SELECT ok(
  not has_function_privilege(
    'authenticated',
    'public.multiplayer_load_private_room(uuid)',
    'execute'
  ),
  'authenticated clients cannot load canonical state'
);
SELECT ok(
  not has_function_privilege(
    'authenticated',
    'public.multiplayer_commit_transition(uuid,bigint,jsonb,jsonb,jsonb,jsonb)',
    'execute'
  ),
  'authenticated clients cannot execute the atomic transition RPC'
);

INSERT INTO auth.users (id, is_anonymous)
VALUES
  ('11111111-1111-4111-8111-111111111111', true),
  ('22222222-2222-4222-8222-222222222222', true);

SET LOCAL ROLE service_role;
SELECT public.multiplayer_create_room(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('a', 64),
  '11111111-1111-4111-8111-111111111111',
  'player-host',
  'Kai',
  0::smallint,
  '{
    "aiDifficulty":"club",
    "bigBlindChips":20,
    "handTarget":10,
    "seatCount":3,
    "smallBlindChips":10,
    "startingStackChips":2000,
    "turnSeconds":45
  }'::jsonb,
  '{
    "config":{"startingStackChips":2000},
    "createdAtMs":2000000000000,
    "hand":{"deck":[{"rank":14,"suit":"spades"}],"players":{}},
    "hostPlayerId":"player-host",
    "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "seats":[{
      "aiProfileId":null,
      "connection":"online",
      "control":"human",
      "displayName":"Kai",
      "joinedAtMs":2000000000000,
      "kind":"human",
      "missedTurns":0,
      "playerId":"player-host",
      "ready":false,
      "seat":0,
      "userId":"11111111-1111-4111-8111-111111111111"
    }],
    "status":"lobby",
    "turnDeadlineAtMs":null,
    "version":0
  }'::jsonb,
  '{
    "hand":null,
    "hostPlayerId":"player-host",
    "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "seats":[{"playerId":"player-host"}],
    "status":"lobby",
    "version":0
  }'::jsonb,
  now() + interval '1 hour'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

SELECT is((SELECT count(*) FROM public.multiplayer_rooms), 1::bigint, 'a member can read their room');
SELECT is((SELECT count(*) FROM public.multiplayer_seats), 1::bigint, 'a member can read room seats');
SELECT ok(
  private.is_multiplayer_room_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'membership helper recognizes the authenticated room member'
);
SELECT ok(
  private.can_receive_multiplayer_topic('room:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'a member can receive their private room topic'
);
SELECT ok(
  not private.can_receive_multiplayer_topic('room:not-a-uuid'),
  'malformed private topics are rejected without a cast error'
);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT is((SELECT count(*) FROM public.multiplayer_rooms), 0::bigint, 'a non-member cannot read the room');
SELECT is((SELECT count(*) FROM public.multiplayer_seats), 0::bigint, 'a non-member cannot read room seats');
SELECT ok(
  not private.can_receive_multiplayer_topic('room:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'a non-member cannot receive the private room topic'
);
SELECT throws_ok(
  $$
    INSERT INTO public.multiplayer_rooms (
      id, status, seat_count, starting_stack_chips, small_blind_chips,
      big_blind_chips, hand_target, turn_seconds, ai_difficulty,
      public_snapshot, expires_at
    ) VALUES (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'lobby', 2, 2000, 10,
      20, '10', 45, 'club', '{}'::jsonb, now() + interval '1 hour'
    )
  $$,
  '42501',
  'permission denied for table multiplayer_rooms',
  'authenticated clients cannot insert rooms directly'
);
SELECT throws_ok(
  $$ SELECT * FROM private.multiplayer_game_states $$,
  '42501',
  'permission denied for table multiplayer_game_states',
  'authenticated clients cannot select canonical state'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT * FROM public.multiplayer_rooms $$,
  '42501',
  'permission denied for table multiplayer_rooms',
  'anonymous callers cannot select multiplayer rooms'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT ok(
  jsonb_path_exists(
    public.multiplayer_load_private_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    '$.hand.deck[*]'
  ),
  'service-only canonical load retains the private deck'
);
SELECT is(
  public.multiplayer_load_joinable_room(repeat('a', 64))->>'roomId',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'service-only code hash lookup finds a joinable room'
);
SELECT is(
  public.multiplayer_commit_transition(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    0,
    '{
      "config":{"startingStackChips":2000},
      "hand":null,
      "hostPlayerId":"player-host",
      "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "seats":[{
        "aiProfileId":null,
        "connection":"online",
        "control":"human",
        "displayName":"Kai",
        "joinedAtMs":2000000000000,
        "kind":"human",
        "missedTurns":0,
        "playerId":"player-host",
        "ready":true,
        "seat":0,
        "userId":"11111111-1111-4111-8111-111111111111"
      }],
      "status":"lobby",
      "turnDeadlineAtMs":null,
      "version":1
    }'::jsonb,
    '{
      "hand":null,
      "hostPlayerId":"player-host",
      "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "seats":[{"playerId":"player-host","ready":true}],
      "status":"lobby",
      "version":1
    }'::jsonb,
    '[]'::jsonb,
    '{"actionBatch":[],"kind":"set-ready","version":1}'::jsonb
  ),
  1::bigint,
  'service role commits the next state version atomically'
);
SELECT is(
  (SELECT state_version FROM public.multiplayer_rooms WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1::bigint,
  'public room and canonical state advance to version one'
);
SELECT throws_ok(
  $$
    SELECT public.multiplayer_commit_transition(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      0,
      '{"version":1}'::jsonb,
      '{}'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb
    )
  $$,
  '40001',
  'Multiplayer room version is stale.',
  'an atomic transition rejects a stale expected version'
);
SELECT ok(
  private.multiplayer_snapshot_is_redacted(
    (SELECT public_snapshot FROM public.multiplayer_rooms WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  ),
  'committed public room state remains redacted'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('multiplayer_rooms', 'multiplayer_seats', 'multiplayer_actions')
      AND rowsecurity
  ),
  3::bigint,
  'RLS is enabled on every public multiplayer table'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_tables
    WHERE schemaname = 'private'
      AND tablename IN ('multiplayer_room_members', 'multiplayer_room_secrets', 'multiplayer_game_states')
      AND rowsecurity
  ),
  3::bigint,
  'RLS is enabled on every private multiplayer table'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'Room members can receive multiplayer broadcasts'
      AND cmd = 'SELECT'
  ),
  1::bigint,
  'Realtime has one member-scoped receive policy for multiplayer rooms'
);

SELECT * FROM finish();
ROLLBACK;
