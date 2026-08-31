BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(11);

-- Q1: the hand-archive bound must admit the approved nine-human table, keep
-- the roster bound, refuse duplicate viewer identities, and preserve every
-- pre-existing guard. A nonexistent room lets the collection guards run up to
-- the room lookup, which answers P0002 — reaching that lookup PROVES the
-- batch passed the collection validation.

-- Seven, eight, and nine distinct human archives (against a nine-human
-- canonical roster) pass validation. Fail-before: at the six-archive bound
-- these raised 22023 'Invalid multiplayer transition collections.'
SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 0::bigint,
    jsonb_build_object('version', 1, 'sessionNumber', 1, 'status', 'between-hands',
      'seats', (select jsonb_agg(jsonb_build_object('kind', 'human',
        'userId', gen_random_uuid()::text, 'playerId', 'p' || i))
        from generate_series(1, 9) i)),
    '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
    (select jsonb_agg(jsonb_build_object('userId', gen_random_uuid()::text))
      from generate_series(1, 7) i))$q$,
  'P0002', 'Multiplayer room was not found.',
  'seven human archives reach the room lookup (capacity admits them)');

SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 0::bigint,
    jsonb_build_object('version', 1, 'sessionNumber', 1, 'status', 'between-hands',
      'seats', (select jsonb_agg(jsonb_build_object('kind', 'human',
        'userId', gen_random_uuid()::text, 'playerId', 'p' || i))
        from generate_series(1, 9) i)),
    '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
    (select jsonb_agg(jsonb_build_object('userId', gen_random_uuid()::text))
      from generate_series(1, 8) i))$q$,
  'P0002', 'Multiplayer room was not found.',
  'eight human archives reach the room lookup (capacity admits them)');

SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 0::bigint,
    jsonb_build_object('version', 1, 'sessionNumber', 1, 'status', 'between-hands',
      'seats', (select jsonb_agg(jsonb_build_object('kind', 'human',
        'userId', gen_random_uuid()::text, 'playerId', 'p' || i))
        from generate_series(1, 9) i)),
    '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
    (select jsonb_agg(jsonb_build_object('userId', gen_random_uuid()::text))
      from generate_series(1, 9) i))$q$,
  'P0002', 'Multiplayer room was not found.',
  'nine human archives reach the room lookup (capacity admits them)');

-- Ten archives exceed the approved table maximum and stay refused.
SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 0::bigint,
    jsonb_build_object('version', 1, 'sessionNumber', 1, 'status', 'between-hands',
      'seats', (select jsonb_agg(jsonb_build_object('kind', 'human',
        'userId', gen_random_uuid()::text, 'playerId', 'p' || i))
        from generate_series(1, 9) i)),
    '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
    (select jsonb_agg(jsonb_build_object('userId', gen_random_uuid()::text))
      from generate_series(1, 10) i))$q$,
  '22023', 'Invalid multiplayer transition collections.',
  'ten archives exceed the nine-seat maximum');

-- Archives may not outnumber the human seats of the submitted canonical state.
SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 0::bigint,
    jsonb_build_object('version', 1, 'sessionNumber', 1, 'status', 'between-hands',
      'seats', (select jsonb_agg(jsonb_build_object('kind', 'human',
        'userId', gen_random_uuid()::text, 'playerId', 'p' || i))
        from generate_series(1, 3) i)),
    '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
    (select jsonb_agg(jsonb_build_object('userId', gen_random_uuid()::text))
      from generate_series(1, 4) i))$q$,
  '22023', 'Invalid multiplayer transition collections.',
  'archives cannot outnumber the submitted human roster');

-- Duplicate viewer identities inside one transition are refused.
SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 0::bigint,
    jsonb_build_object('version', 1, 'sessionNumber', 1, 'status', 'between-hands',
      'seats', (select jsonb_agg(jsonb_build_object('kind', 'human',
        'userId', gen_random_uuid()::text, 'playerId', 'p' || i))
        from generate_series(1, 9) i)),
    '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('userId', '22222222-2222-4222-8222-222222222222'),
      jsonb_build_object('userId', '22222222-2222-4222-8222-222222222222')))$q$,
  '22023', 'Invalid multiplayer transition collections.',
  'duplicate viewer identities in one transition are refused');

-- A canonical state without a human roster can own no archives.
SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 0::bigint,
    jsonb_build_object('version', 1, 'sessionNumber', 1, 'status', 'between-hands'),
    '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'userId', '22222222-2222-4222-8222-222222222222')))$q$,
  '22023', 'Invalid multiplayer transition collections.',
  'archives without a submitted human roster are refused');

-- Non-array collections keep failing closed.
SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 0::bigint,
    jsonb_build_object('version', 1, 'sessionNumber', 1, 'status', 'between-hands',
      'seats', '[]'::jsonb),
    '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 'null'::jsonb)$q$,
  '22023', 'Invalid multiplayer transition collections.',
  'a non-array archive payload is refused');

-- Pre-existing guards are preserved exactly.
SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 5::bigint,
    jsonb_build_object('version', 9, 'sessionNumber', 1, 'status', 'between-hands',
      'seats', '[]'::jsonb),
    '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb)$q$,
  '22023', 'Canonical state version is not the next expected version.',
  'the optimistic-version guard survives the capacity change');

SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 0::bigint,
    jsonb_build_object('version', 1, 'sessionNumber', 0, 'status', 'between-hands',
      'seats', '[]'::jsonb),
    '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb)$q$,
  '22023', 'Canonical session number is invalid.',
  'the session-number guard survives the capacity change');

SELECT throws_ok(
  $q$select public.multiplayer_commit_transition_v2(
    '00000000-0000-4000-8000-000000000001'::uuid, 0::bigint,
    jsonb_build_object('version', 1, 'sessionNumber', 1, 'status', 'between-hands',
      'seats', '[]'::jsonb),
    '{}'::jsonb, to_jsonb('not-an-array'::text), '{}'::jsonb, '[]'::jsonb)$q$,
  '22023', 'Invalid multiplayer transition collections.',
  'a non-array public-actions payload still fails closed');

SELECT * FROM finish();
ROLLBACK;
