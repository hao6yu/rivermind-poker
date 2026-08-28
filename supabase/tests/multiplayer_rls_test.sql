BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(73);

SELECT has_table('public', 'multiplayer_rooms', 'public rooms table exists');
SELECT has_table('private', 'multiplayer_game_states', 'private canonical state table exists');
SELECT has_table('private', 'multiplayer_hand_archives', 'private viewer-specific archive table exists');
SELECT hasnt_column('public', 'multiplayer_rooms', 'room_code_hash', 'room code hashes are not public columns');
SELECT has_column('public', 'multiplayer_rooms', 'session_number', 'rooms identify the rematch session');
SELECT has_column('public', 'multiplayer_actions', 'session_number', 'actions identify the rematch session');
SELECT has_index(
  'private', 'multiplayer_hand_archives', 'multiplayer_hand_archives_completed_at_idx',
  'archive retention cleanup has a completed-at index'
);
SELECT has_index(
  'private', 'multiplayer_request_limits', 'multiplayer_request_limits_bucket_start_idx',
  'request-limit cleanup has a bucket-start index'
);

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
  private.multiplayer_archive_is_redacted(
    'player-host',
    '{
      "deck":[],
      "handNumber":1,
      "history":[{"decisionContext":{"toCall":0},"playerId":"player-host"}],
      "outcome":{"showdown":false},
      "pending":[],
      "players":{"player-host":{"folded":false,"holeCards":[{"rank":14},{"rank":13}]}},
      "street":"complete",
      "toAct":null
    }'::jsonb
  ),
  'a viewer-only completed archive is accepted'
);
SELECT ok(
  not private.multiplayer_archive_is_redacted(
    'player-host',
    '{
      "deck":[],"history":[],"outcome":{"showdown":true},"pending":[],
      "players":{
        "player-host":{"folded":false,"holeCards":[]},
        "player-folded":{"folded":true,"holeCards":[{"rank":2},{"rank":3}]}
      },
      "street":"complete","toAct":null
    }'::jsonb
  ),
  'a folded opponent card leak is rejected from an archive'
);
SELECT ok(
  not private.multiplayer_archive_is_redacted(
    'player-host',
    '{
      "deck":[],
      "history":[{"decisionContext":{"estimatedEquity":0.9},"playerId":"player-other"}],
      "outcome":{"showdown":false},"pending":[],
      "players":{"player-host":{"folded":false,"holeCards":[]}},
      "street":"complete","toAct":null
    }'::jsonb
  ),
  'another player decision context is rejected from an archive'
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
SELECT ok(
  not has_function_privilege(
    'authenticated',
    'public.multiplayer_commit_transition_v2(uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'execute'
  ),
  'authenticated clients cannot execute the archive transition RPC'
);
SELECT ok(
  not has_function_privilege(
    'authenticated',
    'public.multiplayer_claim_request_slot(uuid,text,integer,integer)',
    'execute'
  ),
  'authenticated clients cannot claim their own abuse-limit slot'
);
SELECT ok(
  not has_function_privilege(
    'authenticated',
    'public.multiplayer_load_hand_archives(uuid,uuid,integer,integer)',
    'execute'
  ),
  'authenticated clients cannot bypass viewer-specific archive loading'
);
SELECT ok(
  not has_function_privilege(
    'authenticated',
    'public.multiplayer_delete_hand_archives(uuid)',
    'execute'
  ),
  'authenticated clients cannot delete arbitrary multiplayer archives'
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
SELECT is(
  (
    SELECT secret.code_expires_at
    FROM private.multiplayer_room_secrets as secret
    WHERE secret.room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    SELECT room.expires_at
    FROM public.multiplayer_rooms as room
    WHERE room.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'the displayed room code remains valid for the active room lifecycle'
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
SELECT throws_ok(
  $$ SELECT * FROM private.multiplayer_hand_archives $$,
  '42501',
  'permission denied for table multiplayer_hand_archives',
  'authenticated clients cannot select private multiplayer archives'
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
UPDATE public.multiplayer_seats
set connection_state = 'offline'
where room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and player_id = 'player-host';
SELECT is(
  public.multiplayer_load_resumable_room(
    '11111111-1111-4111-8111-111111111111'
  )->>'roomId',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'an authenticated offline member can recover the canonical room'
);
UPDATE public.multiplayer_seats
set control_state = 'ai'
where room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and player_id = 'player-host';
SELECT is(
  public.multiplayer_load_resumable_room(
    '11111111-1111-4111-8111-111111111111'
  ),
  null::jsonb,
  'an explicit offline AI-controlled leave tombstone is not auto-resumed'
);
UPDATE public.multiplayer_seats
set connection_state = 'online', control_state = 'human'
where room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and player_id = 'player-host';

UPDATE public.multiplayer_rooms
set status = 'playing'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE private.multiplayer_game_states
set canonical_state = jsonb_set(canonical_state, '{status}', '"playing"'::jsonb)
where room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT is(
  public.multiplayer_load_joinable_room(repeat('a', 64))#>>'{canonicalState,status}',
  'playing',
  'a valid active invite resolves enough state for Edge to return room_started'
);
UPDATE public.multiplayer_rooms
set status = 'lobby'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE private.multiplayer_game_states
set canonical_state = jsonb_set(canonical_state, '{status}', '"lobby"'::jsonb)
where room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

SELECT ok(
  public.multiplayer_claim_request_slot(
    '11111111-1111-4111-8111-111111111111', 'join', 2, 60
  ),
  'the first bounded join attempt is allowed'
);
SELECT ok(
  public.multiplayer_claim_request_slot(
    '11111111-1111-4111-8111-111111111111', 'join', 2, 60
  ),
  'the second bounded join attempt is allowed'
);
SELECT ok(
  not public.multiplayer_claim_request_slot(
    '11111111-1111-4111-8111-111111111111', 'join', 2, 60
  ),
  'a join attempt beyond the bounded window is rejected'
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

SELECT is(
  public.multiplayer_commit_transition_v2(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    1,
    '{
      "completionReason":null,
      "config":{"startingStackChips":2000},
      "hand":{
        "handNumber":1,
        "outcome":{"showdown":false},
        "players":{"player-host":{"stack":2020}}
      },
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
      "sessionNumber":1,
      "status":"between-hands",
      "turnDeadlineAtMs":null,
      "version":2
    }'::jsonb,
    '{
      "completionReason":null,
      "hand":{"deck":[],"players":{"player-host":{"holeCards":[]}}},
      "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "seats":[{"playerId":"player-host"}],
      "sessionNumber":1,
      "status":"between-hands",
      "version":2
    }'::jsonb,
    '[{
      "amount":0,"playerId":"player-host","potAfter":20,
      "street":"preflop","type":"check"
    }]'::jsonb,
    '{"actionBatch":[],"kind":"action","version":2}'::jsonb,
    '[{
      "completedAtMs":2000000002000,
      "completionReason":null,
      "hand":{
        "deck":[],
        "handNumber":1,
        "history":[{
          "decisionContext":{"toCall":0},"playerId":"player-host"
        }],
        "outcome":{"showdown":false},
        "pending":[],
        "players":{"player-host":{"folded":false,"holeCards":[
          {"rank":14,"suit":"spades"},{"rank":13,"suit":"spades"}
        ]}},
        "street":"complete",
        "toAct":null
      },
      "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "sessionNumber":1,
      "userId":"11111111-1111-4111-8111-111111111111",
      "viewerPlayerId":"player-host"
    }]'::jsonb
  ),
  2::bigint,
  'the v2 transition atomically persists a viewer archive'
);
SELECT is(
  (
    SELECT session_number
    FROM public.multiplayer_actions
    WHERE room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    ORDER BY id desc
    LIMIT 1
  ),
  1,
  'public actions are unambiguous within a rematch session'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_hand_archives
    WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ),
  1::bigint,
  'one private archive exists for the viewer'
);

SELECT is(
  public.multiplayer_commit_transition_v2(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    2,
    '{
      "completionReason":null,
      "config":{"startingStackChips":2000},
      "hand":{"handNumber":1,"outcome":{"showdown":false},"players":{"player-host":{"stack":2020}}},
      "hostPlayerId":"player-host",
      "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "seats":[{
        "aiProfileId":null,"connection":"online","control":"human",
        "displayName":"Kai","joinedAtMs":2000000000000,"kind":"human",
        "missedTurns":0,"playerId":"player-host","ready":true,"seat":0,
        "userId":"11111111-1111-4111-8111-111111111111"
      }],
      "sessionNumber":1,"status":"between-hands","turnDeadlineAtMs":null,"version":3
    }'::jsonb,
    '{
      "completionReason":null,"hand":{"deck":[],"players":{"player-host":{"holeCards":[]}}},
      "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","seats":[{"playerId":"player-host"}],
      "sessionNumber":1,"status":"between-hands","version":3
    }'::jsonb,
    '[]'::jsonb,
    '{"actionBatch":[],"kind":"set-connection","version":3}'::jsonb,
    '[{
      "completedAtMs":2000000099999,"completionReason":null,
      "hand":{
        "deck":[],"handNumber":1,
        "history":[{"decisionContext":{"toCall":0},"playerId":"player-host"}],
        "outcome":{"showdown":false},"pending":[],
        "players":{"player-host":{"folded":false,"holeCards":[
          {"rank":14,"suit":"spades"},{"rank":13,"suit":"spades"}
        ]}},"street":"complete","toAct":null
      },
      "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","sessionNumber":1,
      "userId":"11111111-1111-4111-8111-111111111111","viewerPlayerId":"player-host"
    }]'::jsonb
  ),
  3::bigint,
  'a repeat post-settlement transition remains idempotent'
);
SELECT is(
  (
    SELECT floor(extract(epoch from completed_at))::bigint
    FROM private.multiplayer_hand_archives
    WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ),
  2000000002::bigint,
  'repeat persistence cannot drift the original completion time'
);
SELECT throws_ok(
  $$
    INSERT INTO private.multiplayer_hand_archives (
      room_id,user_id,viewer_player_id,session_number,hand_number,
      completed_at,completion_reason,redacted_hand
    ) VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111','player-host',2,1,now(),null,
      '{
        "deck":[],"history":[],"outcome":{"showdown":true},"pending":[],
        "players":{
          "player-host":{"folded":false,"holeCards":[]},
          "player-folded":{"folded":true,"holeCards":[{"rank":2},{"rank":3}]}
        },"street":"complete","toAct":null
      }'::jsonb
    )
  $$,
  '23514',
  'new row for relation "multiplayer_hand_archives" violates check constraint "multiplayer_hand_archives_redacted"',
  'database constraints reject folded-card archive leaks'
);
SELECT is(
  jsonb_array_length(public.multiplayer_load_hand_archives(
    '22222222-2222-4222-8222-222222222222'
  )),
  0,
  'another authenticated user receives no viewer archive'
);
SELECT is(
  jsonb_array_length(public.multiplayer_load_hand_archives(
    '11111111-1111-4111-8111-111111111111'
  )),
  1,
  'the archive owner can load their redacted hand through the service RPC'
);
SELECT is(
  public.multiplayer_delete_hand_archives('22222222-2222-4222-8222-222222222222'),
  0,
  'deleting another user history cannot affect the owner archive'
);
SELECT is(
  public.multiplayer_delete_hand_archives('11111111-1111-4111-8111-111111111111'),
  1,
  'the owner-scoped deletion removes their multiplayer history'
);
SELECT is(
  (
    SELECT count(*)
    FROM private.multiplayer_hand_archives
    WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ),
  0::bigint,
  'no multiplayer archives remain for the owner after deletion'
);

SELECT is(
  public.multiplayer_commit_transition_v2(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    3,
    '{
      "completionReason":null,
      "config":{"startingStackChips":2000},
      "hand":null,
      "hostPlayerId":"player-host",
      "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "seats":[{
        "aiProfileId":null,"connection":"online","control":"human",
        "displayName":"Kai","joinedAtMs":2000000000000,"kind":"human",
        "missedTurns":0,"playerId":"player-host","ready":false,"seat":0,
        "userId":"11111111-1111-4111-8111-111111111111"
      }],
      "sessionNumber":2,"status":"lobby","turnDeadlineAtMs":null,"version":4
    }'::jsonb,
    '{
      "completionReason":null,"hand":null,
      "roomId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "seats":[{"playerId":"player-host"}],
      "sessionNumber":2,"status":"lobby","version":4
    }'::jsonb,
    '[]'::jsonb,
    '{"actionBatch":[],"kind":"rematch","version":4}'::jsonb,
    '[]'::jsonb
  ),
  4::bigint,
  'the atomic transition advances a rematch to the next session'
);

INSERT INTO public.multiplayer_rooms (
  id, status, seat_count, starting_stack_chips, small_blind_chips,
  big_blind_chips, hand_target, turn_seconds, ai_difficulty,
  public_snapshot, expires_at, created_at
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'complete', 2, 2000, 10,
  20, '5', 45, 'club', '{}'::jsonb,
  now() - interval '1 hour', now() - interval '2 hours'
);
INSERT INTO public.multiplayer_seats (
  room_id,seat_index,player_id,occupant_kind,display_name,control_state,joined_at
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0,'cleanup-player','human','Kai','human',
  now() - interval '2 hours'
);
INSERT INTO private.multiplayer_room_members (room_id,user_id,player_id,joined_at)
VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111','cleanup-player',now() - interval '2 hours'
);
INSERT INTO private.multiplayer_room_secrets (
  room_id,room_code_hash,code_expires_at,created_at
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',repeat('b',64),now(),now() - interval '2 hours'
);
INSERT INTO private.multiplayer_game_states (room_id,state_version,canonical_state)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0,'{}'::jsonb);
INSERT INTO private.multiplayer_hand_archives (
  room_id,user_id,viewer_player_id,session_number,hand_number,
  completed_at,completion_reason,redacted_hand
) VALUES
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111','cleanup-player',1,1,
    now() - interval '1 day',null,
    '{
      "deck":[],"handNumber":1,"history":[],"outcome":{"showdown":false},
      "pending":[],"players":{"cleanup-player":{"folded":false,"holeCards":[]}},
      "street":"complete","toAct":null
    }'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111','cleanup-player',2,1,
    now() - interval '91 days',null,
    '{
      "deck":[],"handNumber":1,"history":[],"outcome":{"showdown":false},
      "pending":[],"players":{"cleanup-player":{"folded":false,"holeCards":[]}},
      "street":"complete","toAct":null
    }'::jsonb
  );
INSERT INTO private.multiplayer_request_limits (
  user_id,operation,bucket_start,request_count,updated_at
) VALUES (
  '11111111-1111-4111-8111-111111111111','create',
  date_trunc('minute', now() - interval '2 days'),1,now() - interval '2 days'
);

CREATE TEMPORARY TABLE multiplayer_cleanup_result AS
SELECT private.cleanup_multiplayer_data(100) as result;
SELECT is(
  (SELECT result FROM multiplayer_cleanup_result),
  '{"deletedArchives":1,"deletedLimits":1,"deletedRooms":1}'::jsonb,
  'cleanup reports one expired room, old archive, and old rate bucket'
);
SELECT is(
  (
    SELECT count(*) FROM public.multiplayer_rooms
    WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  0::bigint,
  'cleanup removes the expired room'
);
SELECT is(
  (
    SELECT count(*) FROM public.multiplayer_seats
    WHERE room_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  0::bigint,
  'expired-room cleanup cascades public seats'
);
SELECT is(
  (
    (SELECT count(*) FROM private.multiplayer_room_members
      WHERE room_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    + (SELECT count(*) FROM private.multiplayer_room_secrets
      WHERE room_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    + (SELECT count(*) FROM private.multiplayer_game_states
      WHERE room_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  ),
  0::bigint,
  'expired-room cleanup cascades every private active-room record'
);
SELECT is(
  (
    SELECT count(*) FROM private.multiplayer_hand_archives
    WHERE room_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  1::bigint,
  'room cleanup retains the recent viewer archive but removes the archive older than 90 days'
);
SELECT is(
  (
    SELECT count(*) FROM private.multiplayer_request_limits
    WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ),
  1::bigint,
  'request-limit cleanup removes the old bucket and retains the current bucket'
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
      AND tablename IN (
        'multiplayer_room_members', 'multiplayer_room_secrets', 'multiplayer_game_states',
        'multiplayer_hand_archives', 'multiplayer_request_limits'
      )
      AND rowsecurity
  ),
  5::bigint,
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
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'rivermind-multiplayer-cleanup'
  ),
  1::bigint,
  'one bounded hourly multiplayer cleanup job is scheduled'
);

-- Nine-seat rooms are first-class private tables: the seat-count check admits
-- 9, creation persists it, members read the room, and oversized sizes fail.
SET LOCAL ROLE service_role;
SELECT public.multiplayer_create_room(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  repeat('c', 64),
  '11111111-1111-4111-8111-111111111111',
  'player-host-nine',
  'River',
  0::smallint,
  '{
    "aiDifficulty":"club",
    "bigBlindChips":20,
    "handTarget":10,
    "seatCount":9,
    "smallBlindChips":10,
    "startingStackChips":2000,
    "turnSeconds":45
  }'::jsonb,
  '{
    "config":{"startingStackChips":2000},
    "createdAtMs":2000000000000,
    "hand":{"deck":[],"players":{}},
    "hostPlayerId":"player-host-nine",
    "roomId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "seats":[{
      "aiProfileId":null,
      "connection":"online",
      "control":"human",
      "displayName":"River",
      "joinedAtMs":2000000000000,
      "kind":"human",
      "missedTurns":0,
      "playerId":"player-host-nine",
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
    "hostPlayerId":"player-host-nine",
    "roomId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "seats":[{"playerId":"player-host-nine"}],
    "status":"lobby",
    "version":0
  }'::jsonb,
  now() + interval '1 hour'
);
SELECT is(
  (
    SELECT seat_count
    FROM public.multiplayer_rooms
    WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  9::smallint,
  'nine-seat room creation persists the seat count'
);
SELECT throws_ok(
  $$
    INSERT INTO public.multiplayer_rooms (
      id, status, seat_count, starting_stack_chips, small_blind_chips,
      big_blind_chips, hand_target, turn_seconds, ai_difficulty,
      public_snapshot, expires_at
    ) VALUES (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'lobby', 10, 2000, 10,
      20, '10', 45, 'club', '{}'::jsonb, now() + interval '1 hour'
    )
  $$,
  '23514',
  'new row for relation "multiplayer_rooms" violates check constraint "multiplayer_rooms_seat_count_check"',
  'ten-seat rooms violate the seat-count check'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT is(
  (
    SELECT count(*)
    FROM public.multiplayer_rooms
    WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  1::bigint,
  'a member can read their nine-seat room'
);

SELECT * FROM finish();

ROLLBACK;
