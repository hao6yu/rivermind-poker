BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(15);

-- Q4 seat-liveness RPC guards, monotonic stamps, and bounded retention.
-- Fixtures are synthetic (design: docs/PHASE_16_SLICE_3_11_Q4_LIVENESS_DESIGN.md).

INSERT INTO auth.users (id, is_anonymous)
VALUES
  ('11111111-1111-4111-8111-111111111111', true),
  ('22222222-2222-4222-8222-222222222222', true),
  ('33333333-3333-4333-8333-333333333333', true);

INSERT INTO public.multiplayer_rooms (
  id, status, seat_count, starting_stack_chips, small_blind_chips,
  big_blind_chips, hand_target, turn_seconds, ai_difficulty,
  public_snapshot, expires_at
) VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'playing', 3, 2000, 10,
    20, '10', 45, 'club', '{}'::jsonb, now() + interval '1 hour'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'playing', 2, 2000, 10,
    20, '10', 45, 'club', '{}'::jsonb, now() + interval '1 hour'
  );

-- The expired room predates its own creation window: created_at must stay
-- strictly before expires_at (multiplayer_rooms_expiry_after_creation).
INSERT INTO public.multiplayer_rooms (
  id, created_at, status, seat_count, starting_stack_chips, small_blind_chips,
  big_blind_chips, hand_target, turn_seconds, ai_difficulty,
  public_snapshot, expires_at
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now() - interval '2 hours', 'playing',
  2, 2000, 10, 20, '10', 45, 'club', '{}'::jsonb, now() - interval '1 hour'
);

INSERT INTO private.multiplayer_game_states (room_id, state_version, canonical_state)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1,
    '{"seats": [
      {"userId": "11111111-1111-4111-8111-111111111111", "kind": "human", "participation": "active", "playerId": "player-one", "seat": 0},
      {"userId": "22222222-2222-4222-8222-222222222222", "kind": "human", "participation": "left", "playerId": "player-two", "seat": 1},
      {"userId": "33333333-3333-4333-8333-333333333333", "kind": "ai", "participation": "active", "playerId": "player-three", "seat": 2}
    ]}'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1,
    '{"seats": [
      {"userId": "11111111-1111-4111-8111-111111111111", "kind": "human", "participation": "active", "playerId": "player-one", "seat": 0}
    ]}'::jsonb
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
    '{"seats": {"not": "an-array"}}'::jsonb
  );

SELECT throws_ok(
  $t$ SELECT public.multiplayer_renew_seat_liveness(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111',
    (extract(epoch from now()) * 1000)::bigint
  ) $t$,
  'P0002',
  'Multiplayer room was not found.',
  'renewing an unknown room reports the same stable not-found error as every other room path'
);

SELECT throws_ok(
  $t$ SELECT public.multiplayer_renew_seat_liveness(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    0
  ) $t$,
  '22023',
  'Invalid seat liveness renewal.',
  'a non-positive or missing stamp is refused as invalid input'
);

SELECT throws_ok(
  $t$ SELECT public.multiplayer_renew_seat_liveness(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    (extract(epoch from now()) * 1000)::bigint
  ) $t$,
  'P0002',
  'Multiplayer room was not found.',
  'an expired room can never be renewed'
);

SELECT throws_ok(
  $t$ SELECT public.multiplayer_renew_seat_liveness(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '44444444-4444-4444-8444-444444444444',
    (extract(epoch from now()) * 1000)::bigint
  ) $t$,
  '42501',
  'Only a seated human may renew seat liveness.',
  'a user without a human seat is refused before anything is written'
);

SELECT throws_ok(
  $t$ SELECT public.multiplayer_renew_seat_liveness(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    (extract(epoch from now()) * 1000)::bigint
  ) $t$,
  '42501',
  'Only a seated human may renew seat liveness.',
  'a permanently departed (left) seat can never refresh liveness'
);

SELECT throws_ok(
  $t$ SELECT public.multiplayer_renew_seat_liveness(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333',
    (extract(epoch from now()) * 1000)::bigint
  ) $t$,
  '42501',
  'Only a seated human may renew seat liveness.',
  'an AI-owned seat id is never a liveness subject'
);

SELECT throws_ok(
  $t$ SELECT public.multiplayer_renew_seat_liveness(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    (extract(epoch from now()) * 1000)::bigint
  ) $t$,
  '42501',
  'Only a seated human may renew seat liveness.',
  'a canonical state without a seats array proves no seat (fail-closed)'
);

SELECT is(
  public.multiplayer_renew_seat_liveness(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    (extract(epoch from now()) * 1000)::bigint
  ),
  true,
  'the seated human owner renews successfully'
);

SELECT is(
  (
    SELECT renewed_at_ms > 0
    FROM private.multiplayer_seat_liveness
    WHERE room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND user_id = '11111111-1111-4111-8111-111111111111'
  ),
  true,
  'the renewal persisted a positive worker-clock stamp'
);

-- Monotonic stamps: an out-of-order (older) renewal can never move the row
-- backwards; a later renewal advances it.
SELECT multiplayer_renew_seat_liveness(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  1_900_000_000_000
);

SELECT multiplayer_renew_seat_liveness(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  1_800_000_000_000
);

SELECT is(
  (
    SELECT renewed_at_ms
    FROM private.multiplayer_seat_liveness
    WHERE room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND user_id = '11111111-1111-4111-8111-111111111111'
  ),
  1_900_000_000_000,
  'greatest()-monotonic upsert: an older replayed renewal never rewinds the stamp'
);

SELECT is(
  public.multiplayer_renew_seat_liveness(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    2_000_000_000_000
  ),
  true,
  'a fresher renewal is accepted'
);

SELECT is(
  (
    SELECT renewed_at_ms
    FROM private.multiplayer_seat_liveness
    WHERE room_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND user_id = '11111111-1111-4111-8111-111111111111'
  ),
  2_000_000_000_000,
  'a fresher renewal moves the stamp forward'
);

SELECT is(
  (SELECT count(*) FROM public.multiplayer_load_seat_liveness(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )),
  1::bigint,
  'the load function returns exactly the room''s liveness rows'
);

-- Bounded retention: a renewal prunes three-day-old stamps and stamps whose
-- room has already expired, while keeping the live room's fresh rows.
INSERT INTO private.multiplayer_seat_liveness (room_id, user_id, renewed_at_ms)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333',
    ((extract(epoch from now()) - 4 * 86400) * 1000)::bigint
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    (extract(epoch from now()) * 1000)::bigint
  );

SELECT is(
  public.multiplayer_renew_seat_liveness(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    (extract(epoch from now()) * 1000)::bigint
  ),
  true,
  'a renewal after seeding retention fixtures still succeeds'
);

SELECT is(
  (SELECT count(*) FROM private.multiplayer_seat_liveness),
  1::bigint,
  'the renewal pruned the aged stamp and the expired room''s stamp, leaving only the live row'
);

ROLLBACK;
