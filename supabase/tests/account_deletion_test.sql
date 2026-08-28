BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(25);

SELECT has_function(
  'private',
  'delete_account_linked_multiplayer_data',
  ARRAY[]::text[],
  'auth deletion has a private multiplayer privacy cleanup trigger function'
);
SELECT has_trigger(
  'auth',
  'users',
  'before_rivermind_auth_user_delete',
  'auth users run RiverMind cleanup before deletion'
);
SELECT is(
  (
    select position(
      'storage.objects' in pg_get_functiondef(
        'private.delete_account_linked_multiplayer_data()'::regprocedure
      )
    ) = 0
  ),
  true,
  'the deletion trigger never deletes storage.objects rows: SQL deletion removes only metadata and orphans the stored bytes, so avatar bytes are removed exclusively through the Storage API (delete-account / avatar-cleanup)'
);
SELECT ok(
  not has_function_privilege(
    'authenticated',
    'private.delete_account_linked_multiplayer_data()',
    'execute'
  ),
  'authenticated clients cannot invoke account cleanup directly'
);
SELECT is(
  (
    select count(*)
    from pg_constraint as constraint_record
    join pg_class as relation on relation.oid = constraint_record.conrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where constraint_record.contype = 'f'
      and constraint_record.confrelid = 'auth.users'::regclass
      and constraint_record.confdeltype = 'c'
      and (namespace.nspname, relation.relname) in (
        ('public', 'practice_sessions'),
        ('public', 'practice_hands'),
        ('public', 'hand_reviews'),
        ('public', 'learning_progress'),
        ('public', 'coach_daily_usage'),
        ('public', 'beta_feedback'),
        ('public', 'daily_challenge_results'),
        ('private', 'multiplayer_room_members'),
        ('private', 'multiplayer_hand_archives'),
        ('private', 'multiplayer_request_limits')
      )
  ),
  10::bigint,
  'every current owner-scoped RiverMind table cascades from auth users'
);

INSERT INTO auth.users (id, is_anonymous)
VALUES
  ('11111111-1111-4111-8111-111111111111', true),
  ('22222222-2222-4222-8222-222222222222', true);

INSERT INTO public.learning_progress (
  user_id, activity_id, activity_type, status, attempts, updated_at
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'lesson-delete', 'lesson', 'started', 1, now()),
  ('22222222-2222-4222-8222-222222222222', 'lesson-keep', 'lesson', 'started', 1, now());
INSERT INTO public.daily_challenge_results (
  user_id, challenge_date, challenge_version, best_score, best_place,
  best_hands, attempts, completed_at
) VALUES (
  '11111111-1111-4111-8111-111111111111', current_date, 99, 100, 1,
  2, 1, now()
);
INSERT INTO public.beta_feedback (
  user_id, category, message, screen, app_version, platform
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'bug', 'Delete this feedback',
  'profile', '1.0.0', 'ios'
);
INSERT INTO public.coach_daily_usage (user_id, request_count)
VALUES ('11111111-1111-4111-8111-111111111111', 1);
INSERT INTO private.multiplayer_request_limits (
  user_id, operation, bucket_start, request_count
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'create', now(), 1),
  ('22222222-2222-4222-8222-222222222222', 'create', now(), 1);

INSERT INTO public.multiplayer_rooms (
  id, status, seat_count, starting_stack_chips, small_blind_chips,
  big_blind_chips, hand_target, turn_seconds, ai_difficulty,
  public_snapshot, expires_at
) VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'playing', 2, 2000, 10,
    20, '10', 45, 'club', '{}'::jsonb, now() + interval '1 hour'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'playing', 2, 2000, 10,
    20, '10', 45, 'club', '{}'::jsonb, now() + interval '1 hour'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'playing', 2, 2000, 10,
    20, '10', 45, 'club', '{}'::jsonb, now() + interval '1 hour'
  );

INSERT INTO private.multiplayer_room_members (room_id, user_id, player_id, joined_at)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'player-delete', now()
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    'player-keep-shared', now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'player-keep', now()
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'player-stale-member', now()
  );

INSERT INTO private.multiplayer_game_states (room_id, state_version, canonical_state)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1,
    '{"seats":[{"userId":"11111111-1111-4111-8111-111111111111"},{"userId":"22222222-2222-4222-8222-222222222222"}]}'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1,
    '{"seats":[{"userId":"22222222-2222-4222-8222-222222222222"}]}'::jsonb
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
    '{"seats":[{"userId":"11111111-1111-4111-8111-111111111111"}]}'::jsonb
  );
INSERT INTO private.multiplayer_room_secrets (room_id, room_code_hash, code_expires_at)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('a', 64), now() + interval '1 hour'
);
INSERT INTO public.multiplayer_seats (
  room_id, seat_index, player_id, occupant_kind, display_name, ready,
  connection_state, control_state, stack_chips, joined_at
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 'player-delete', 'human',
  'River', true, 'online', 'human', 2000, now()
);
INSERT INTO public.multiplayer_actions (
  room_id, state_version, action_sequence, hand_number, player_id,
  street, action_type, amount, pot_after
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 1, 1, 'player-delete',
  'preflop', 'fold', 0, 30
);

INSERT INTO private.multiplayer_hand_archives (
  room_id, user_id, viewer_player_id, session_number, hand_number,
  completed_at, redacted_hand
) VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'player-delete', 1, 1, now(),
    '{"deck":[],"handNumber":1,"history":[],"outcome":{"showdown":false},"pending":[],"players":{"player-delete":{"folded":false,"holeCards":[]}},"street":"complete","toAct":null}'::jsonb
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    'player-keep-shared', 1, 1, now(),
    '{"deck":[],"handNumber":1,"history":[],"outcome":{"showdown":false},"pending":[],"players":{"player-keep-shared":{"folded":false,"holeCards":[]}},"street":"complete","toAct":null}'::jsonb
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '11111111-1111-4111-8111-111111111111',
    'player-delete', 1, 1, now(),
    '{"deck":[],"handNumber":1,"history":[],"outcome":{"showdown":false},"pending":[],"players":{"player-delete":{"folded":false,"holeCards":[]}},"street":"complete","toAct":null}'::jsonb
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '22222222-2222-4222-8222-222222222222',
    'player-keep-history', 1, 1, now(),
    '{"deck":[],"handNumber":1,"history":[],"outcome":{"showdown":false},"pending":[],"players":{"player-keep-history":{"folded":false,"holeCards":[]}},"street":"complete","toAct":null}'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'player-keep', 1, 1, now(),
    '{"deck":[],"handNumber":1,"history":[],"outcome":{"showdown":false},"pending":[],"players":{"player-keep":{"folded":false,"holeCards":[]}},"street":"complete","toAct":null}'::jsonb
  );

DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111';

SELECT is((SELECT count(*) FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'the anonymous auth user is deleted');
SELECT is((SELECT count(*) FROM auth.users WHERE id = '22222222-2222-4222-8222-222222222222'), 1::bigint, 'unrelated auth users remain');
SELECT is((SELECT count(*) FROM public.multiplayer_rooms WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'a shared active room is closed');
SELECT is((SELECT count(*) FROM public.multiplayer_rooms WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 0::bigint, 'a stale canonical user id still closes the affected room');
SELECT is((SELECT count(*) FROM public.multiplayer_rooms WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1::bigint, 'an unrelated active room remains');
SELECT is((SELECT count(*) FROM public.multiplayer_seats WHERE room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'shared room seats cascade');
SELECT is((SELECT count(*) FROM public.multiplayer_actions WHERE room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'shared room actions cascade');
SELECT is((SELECT count(*) FROM private.multiplayer_room_members WHERE room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'all shared room memberships cascade');
SELECT is((SELECT count(*) FROM private.multiplayer_room_secrets WHERE room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'shared room invite secrets cascade');
SELECT is((SELECT count(*) FROM private.multiplayer_game_states WHERE room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'shared private game state cascades');
SELECT is((SELECT count(*) FROM private.multiplayer_hand_archives WHERE room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'all viewer copies of shared active history are deleted');
SELECT is((SELECT count(*) FROM private.multiplayer_hand_archives WHERE room_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 0::bigint, 'all viewer copies of shared historical hands are deleted');
SELECT is((SELECT count(*) FROM private.multiplayer_hand_archives WHERE room_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1::bigint, 'unrelated multiplayer history remains');
SELECT is((SELECT count(*) FROM public.learning_progress WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'learning progress cascades');
SELECT is((SELECT count(*) FROM public.learning_progress WHERE user_id = '22222222-2222-4222-8222-222222222222'), 1::bigint, 'another user learning progress remains');
SELECT is((SELECT count(*) FROM public.daily_challenge_results WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'Daily Challenge progress cascades');
SELECT is((SELECT count(*) FROM public.beta_feedback WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'submitted feedback cascades');
SELECT is((SELECT count(*) FROM public.coach_daily_usage WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'AI coach usage metadata cascades');
SELECT is((SELECT count(*) FROM private.multiplayer_request_limits WHERE user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'multiplayer request metadata cascades');
SELECT is((SELECT count(*) FROM private.multiplayer_request_limits WHERE user_id = '22222222-2222-4222-8222-222222222222'), 1::bigint, 'another user request metadata remains');

SELECT * FROM finish();
ROLLBACK;
