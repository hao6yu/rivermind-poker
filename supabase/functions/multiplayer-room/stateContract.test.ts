import { describe, expect, it } from 'vitest';

import { seededRandom } from '../../../src/domain/poker/cards';
import {
  MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION,
} from '../../../src/domain/multiplayer/contracts';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
  defaultMultiplayerRoomConfig,
} from '../../../src/domain/multiplayer/coordinator';
import type {
  MultiplayerCoordinatorState,
  MultiplayerRoomCommand,
} from '../../../src/domain/multiplayer/contracts';
import { createMultiplayerPublicSnapshot, createMultiplayerViewerProjection } from '../../../src/domain/multiplayer/projection';
import { parseMultiplayerRoomEnvelope } from '../../../src/services/multiplayerContract';
import {
  normalizeMultiplayerCanonicalState,
  parseJoinableMultiplayerRoom,
} from './stateContract';

const hostUserId = 'user-host';
const guestUserId = 'user-guest';

function completeLegacyRoom(): MultiplayerCoordinatorState {
  const random = seededRandom(901);
  let sequence = 0;
  let state = createMultiplayerRoom({
    config: { ...defaultMultiplayerRoomConfig, handTarget: 5, seatCount: 2 },
    hostDisplayName: 'Kai',
    hostPlayerId: 'player-host',
    hostUserId,
    roomCode: '724826',
    roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }, { nowMs: 1_000, random });
  const send = (input: Omit<MultiplayerRoomCommand, 'commandId' | 'expectedVersion'>) => {
    state = applyMultiplayerCommand(state, {
      ...input,
      commandId: `legacy-${sequence += 1}`,
      expectedVersion: state.version,
    } as MultiplayerRoomCommand, { nowMs: 1_000 + sequence * 100, random }).state;
  };
  send({
    actorUserId: guestUserId,
    displayName: 'Mina',
    playerId: 'player-guest',
    seat: 1,
    type: 'join',
  });
  send({ actorUserId: hostUserId, ready: true, type: 'set-ready' });
  send({ actorUserId: guestUserId, ready: true, type: 'set-ready' });
  send({ actorUserId: hostUserId, type: 'start' });
  const actor = state.hand?.toAct;
  const actorUserId = actor === 'player-host' ? hostUserId : guestUserId;
  send({ action: { type: 'fold' }, actorUserId, type: 'action' });
  if (!state.hand?.outcome) throw new Error('The legacy fixture did not settle.');
  state.hand.handNumber = 5;
  state.status = 'complete';
  return state;
}

describe('multiplayer canonical rolling-deploy contract', () => {
  it('defaults a legacy active room to session one with no completion reason', () => {
    const legacy = createMultiplayerRoom({
      config: defaultMultiplayerRoomConfig,
      hostDisplayName: 'Kai',
      hostPlayerId: 'player-host',
      hostUserId,
      roomCode: '724826',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }, { nowMs: 1_000 });
    const raw = { ...legacy } as Partial<MultiplayerCoordinatorState>;
    delete raw.completionReason;
    delete raw.sessionNumber;

    expect(normalizeMultiplayerCanonicalState(raw)).toMatchObject({
      completionReason: null,
      sessionNumber: 1,
      status: 'lobby',
    });
  });

  it('infers a legacy completed room and rematches without a NaN session', () => {
    const legacy = completeLegacyRoom();
    const raw = JSON.parse(JSON.stringify(legacy)) as Partial<MultiplayerCoordinatorState>;
    delete raw.completionReason;
    delete raw.sessionNumber;
    const normalized = normalizeMultiplayerCanonicalState(raw);
    if (!normalized) throw new Error('The legacy completed room was rejected.');
    expect(normalized).toMatchObject({ completionReason: 'hand-limit', sessionNumber: 1 });

    const rematch = applyMultiplayerCommand(normalized, {
      actorUserId: hostUserId,
      commandId: 'legacy-rematch',
      expectedVersion: normalized.version,
      type: 'rematch',
    }, { nowMs: 9_000 }).state;
    expect(rematch.sessionNumber).toBe(2);
    expect(Number.isNaN(rematch.sessionNumber)).toBe(false);
  });

  it('normalizes a legacy room found by a valid invite hash lookup', () => {
    const legacy = createMultiplayerRoom({
      config: defaultMultiplayerRoomConfig,
      hostDisplayName: 'Kai',
      hostPlayerId: 'player-host',
      hostUserId,
      roomCode: '724826',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }, { nowMs: 1_000 });
    const raw = { ...legacy } as Partial<MultiplayerCoordinatorState>;
    delete raw.completionReason;
    delete raw.sessionNumber;

    expect(parseJoinableMultiplayerRoom({
      canonicalState: raw,
      roomId: legacy.roomId,
    })?.canonicalState).toMatchObject({ sessionNumber: 1 });
  });
});

describe('nine-seat canonical state contract', () => {
  it('normalizes a nine-seat room and keeps the removed-AI seat memory', () => {
    const random = seededRandom(911);
    let sequence = 0;
    let state = createMultiplayerRoom({
      config: { ...defaultMultiplayerRoomConfig, handTarget: 5, seatCount: 9 },
      hostDisplayName: 'Kai',
      hostPlayerId: 'player-host',
      hostUserId,
      roomCode: '724826',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }, { nowMs: 1_000, random });
    const send = (input: Omit<MultiplayerRoomCommand, 'commandId' | 'expectedVersion'>) => {
      state = applyMultiplayerCommand(state, {
        ...input,
        commandId: `nine-${sequence += 1}`,
        expectedVersion: state.version,
      } as MultiplayerRoomCommand, { nowMs: 1_000 + sequence * 100, random }).state;
    };
    for (let seat = 1; seat < 9; seat += 1) {
      send({ actorUserId: hostUserId, seat, type: 'add-ai' });
    }
    send({ actorUserId: hostUserId, seat: 8, type: 'remove-ai' });

    const normalized = normalizeMultiplayerCanonicalState(state);
    if (!normalized) throw new Error('The nine-seat room was rejected by the state contract.');
    expect(normalized.config.seatCount).toBe(9);
    expect(normalized.seats).toHaveLength(8);
    expect(normalized.removedAiProfileIdBySeat[8]).toMatch(/^[a-z-]+$/);

    // Legacy canonical states without the field normalize to an empty map.
    const legacy = JSON.parse(JSON.stringify(normalized)) as Partial<MultiplayerCoordinatorState>;
    delete legacy.removedAiProfileIdBySeat;
    const legacyNormalized = normalizeMultiplayerCanonicalState(legacy);
    expect(legacyNormalized?.removedAiProfileIdBySeat).toEqual({});
  });
});

describe('table moments never enter canonical state', () => {
  it('normalizes a missing next-hand deadline to null, never undefined', () => {
    const state = createMultiplayerRoom({
      config: { ...defaultMultiplayerRoomConfig, seatCount: 2 },
      hostDisplayName: 'Kai',
      hostPlayerId: 'player-host',
      hostUserId: 'user-host',
      roomCode: '724826',
      roomId: 'room-test',
    }, { nowMs: 1_000 });
    const legacy = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    // A room persisted before Slice 3.8C has no nextHandAtMs key at all;
    // the normalizer must materialize null so the coordinator never treats
    // undefined as "due" and strict clients never reject the snapshot.
    delete legacy.nextHandAtMs;
    const normalized = normalizeMultiplayerCanonicalState(legacy);
    expect(normalized).not.toBeNull();
    expect((normalized as Record<string, unknown>).nextHandAtMs).toBeNull();
    expect(normalizeMultiplayerCanonicalState(poisonedLegacyFixture())?.nextHandAtMs).toBeNull();
  });


function poisonedLegacyFixture(): Record<string, unknown> {
  const state = createMultiplayerRoom({
    config: { ...defaultMultiplayerRoomConfig, seatCount: 2 },
    hostDisplayName: 'Kai',
    hostPlayerId: 'player-host',
    hostUserId: 'user-host',
    roomCode: '724826',
    roomId: 'room-test',
  }, { nowMs: 1_000 });
  const copy = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  delete copy.nextHandAtMs;
  return copy;
}

  it('strips moment-shaped data from a poisoned canonical state', () => {
    const state = createMultiplayerRoom({
      config: { ...defaultMultiplayerRoomConfig, seatCount: 2 },
      hostDisplayName: 'Kai',
      hostPlayerId: 'player-host',
      hostUserId: 'user-host',
      roomCode: '724826',
      roomId: 'room-test',
    }, { nowMs: 1_000 });
    const poisoned = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    // A future or malicious producer appends moment content to the canonical
    // row; the rolling-deploy normalizer must never carry it into the
    // coordinator state, and it must not be confused for a known field.
    poisoned.tableMoments = [{ reactionId: 'cheer', phrase: 'Nice hand!' }];
    poisoned.reaction = 'cheer';
    const normalized = normalizeMultiplayerCanonicalState(poisoned);
    expect(normalized).not.toBeNull();
    expect('tableMoments' in (normalized as Record<string, unknown>)).toBe(false);
    expect('reaction' in (normalized as Record<string, unknown>)).toBe(false);
    // The canonical snapshot the coordinator would persist is untouched by
    // moment data as well.
    const snapshot = createMultiplayerPublicSnapshot(normalized!);
    expect('tableMoments' in snapshot).toBe(false);
    expect('reaction' in snapshot).toBe(false);
  });
});

describe('3.11F hardening — legacy room normalization and new-field persistence (H03/H08)', () => {
  function legacyRoom(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      canonicalState: {
        completionReason: null,
        config: {
          aiDifficulty: 'club',
          bigBlindChips: 20,
          handTarget: 10,
          seatCount: 2,
          smallBlindChips: 10,
          startingStackChips: 2_000,
          turnSeconds: 30,
        },
        createdAtMs: 1_000,
        hand: null,
        hostPlayerId: 'player-host',
        nextHandAtMs: null,
        processedCommands: [],
        removedAiProfileIdBySeat: {},
        resumeStatus: null,
        roomCode: '724826',
        roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        seats: [
          {
            aiProfileId: null,
            avatar: null,
            connection: 'online',
            control: 'human',
            displayName: 'Kai',
            isHost: true,
            joinedAtMs: 1_000,
            kind: 'human',
            missedTurns: 0,
            playerId: 'player-host',
            ready: true,
            seat: 0,
            userId: 'user-1',
          },
        ],
        sessionNumber: 1,
        status: 'between-hands',
        turnDeadlineAtMs: null,
        updatedAtMs: 2_000,
        version: 7,
      },
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ...overrides,
    };
  }

  it('upgrades a legacy pre-3.11F room: current protocol, provable ledger init, participation defaults', () => {
    const state = normalizeMultiplayerCanonicalState(legacyRoom().canonicalState);
    expect(state).not.toBeNull();
    // An accepted legacy room is upgraded to the current lifecycle protocol as
    // part of its provable conversion (R4).
    expect(state!.protocolVersion).toBe(3);
    const host = state!.seats[0]!;
    // The ledger row is initialized from the configured opening buy-in —
    // no rebuy history is ever manufactured for legacy seats.
    expect(host.ledger).toMatchObject({
      initialBuyIn: 2_000,
      totalBuyIn: 2_000,
      rebuyChips: 0,
      rebuyCount: 0,
      settledStack: 2_000,
    });
    expect(host.participation).toBe('active');
  });

  it('coerces a legacy human-AI-control seat to human control + disconnected', () => {
    const room = legacyRoom();
    (room.canonicalState as Record<string, unknown>).seats = [
      {
        aiProfileId: null,
        avatar: null,
        connection: 'offline',
        // The pre-3.11F coordinator handed this human seat to AI after
        // missed turns: the upgraded normalizer must never let that state
        // reach AI decision logic (scope 3.11F).
        control: 'ai',
        displayName: 'Kai',
        isHost: true,
        joinedAtMs: 1_000,
        kind: 'human',
        missedTurns: 2,
        playerId: 'player-host',
        ready: false,
        seat: 0,
        userId: 'user-1',
      },
    ];
    const state = normalizeMultiplayerCanonicalState(room.canonicalState);
    const seat = state!.seats[0]!;
    expect(seat.kind).toBe('human');
    expect(seat.control).toBe('human');
    expect(seat.participation).toBe('disconnected');
  });

  it('preserves a pending rebuy-decision deadline exactly across a reload', () => {
    const room = legacyRoom();
    // A current-format (3.11F) room carries the protocol field and full
    // ledger rows; only its deadline persistence is under test here.
    (room.canonicalState as Record<string, unknown>).protocolVersion = 3;
    (room.canonicalState as Record<string, unknown>).rebuyDecisionDeadlineAtMs = 1_710_123_456_789;
    (room.canonicalState as Record<string, unknown>).seats = [
      {
        aiProfileId: null,
        avatar: null,
        connection: 'online',
        control: 'human',
        displayName: 'Kai',
        isHost: true,
        joinedAtMs: 1_000,
        kind: 'human',
        ledger: {
          initialBuyIn: 2_000,
          playerId: 'player-host',
          rebuyChips: 0,
          rebuyCount: 0,
          settledAtMs: 1_500,
          settledHandNumber: 1,
          settledStack: 0,
          totalBuyIn: 2_000,
        },
        missedTurns: 0,
        participation: 'rebuy-pending',
        playerId: 'player-host',
        ready: true,
        seat: 0,
        userId: 'user-1',
      },
      {
        aiProfileId: null,
        avatar: null,
        connection: 'online',
        control: 'human',
        displayName: 'Mina',
        isHost: false,
        joinedAtMs: 1_100,
        kind: 'human',
        ledger: {
          initialBuyIn: 2_000,
          playerId: 'player-guest',
          rebuyChips: 0,
          rebuyCount: 0,
          settledAtMs: 1_500,
          settledHandNumber: 1,
          settledStack: 4_000,
          totalBuyIn: 2_000,
        },
        missedTurns: 0,
        participation: 'active',
        playerId: 'player-guest',
        ready: true,
        seat: 1,
        userId: 'user-2',
      },
    ];
    const state = normalizeMultiplayerCanonicalState(room.canonicalState);
    // The deadline survives exactly — the client schedules the expiry from
    // this published value (H03/H05).
    expect(state!.rebuyDecisionDeadlineAtMs).toBe(1_710_123_456_789);
    expect(state!.seats[0]!.participation).toBe('rebuy-pending');
    expect(state!.seats[0]!.ledger?.settledStack).toBe(0);
  });

  it('accepts a host-ended completion reason through a reload', () => {
    const room = legacyRoom();
    (room.canonicalState as Record<string, unknown>).completionReason = 'host-ended';
    (room.canonicalState as Record<string, unknown>).status = 'complete';
    const state = normalizeMultiplayerCanonicalState(room.canonicalState);
    expect(state!.completionReason).toBe('host-ended');
    expect(state!.status).toBe('complete');
  });

  it('keeps the pre-hardening refusal for unknown completion reasons', () => {
    const room = legacyRoom();
    (room.canonicalState as Record<string, unknown>).completionReason = 'dealers-choice';
    expect(normalizeMultiplayerCanonicalState(room.canonicalState)).toBeNull();
  });
});

describe('R4 — safe legacy ledger policy: no invented balances or history', () => {
  const config = {
    aiDifficulty: 'club',
    bigBlindChips: 20,
    handTarget: 10,
    seatCount: 3,
    smallBlindChips: 10,
    startingStackChips: 2_000,
    turnSeconds: 30,
  };

  /** A legacy (pre-3.11F) room with real seats but NO ledger rows. */
  function legacyRoomFixture(overrides: {
    hand?: Record<string, unknown> | null;
    seats?: Array<Record<string, unknown>>;
    protocolVersion?: number;
    status?: string;
  } = {}): Record<string, unknown> {
    return {
      completionReason: null,
      config,
      createdAtMs: 1_000,
      hand: null,
      hostPlayerId: 'player-host',
      nextHandAtMs: null,
      processedCommands: [],
      protocolVersion: overrides.protocolVersion,
      removedAiProfileIdBySeat: {},
      resumeStatus: null,
      roomCode: '724826',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      seats: overrides.seats ?? [
        {
          aiProfileId: null, avatar: null, connection: 'online', control: 'human',
          displayName: 'Kai', isHost: true, joinedAtMs: 1_000, kind: 'human',
          missedTurns: 0, playerId: 'player-host', ready: true, seat: 0, userId: 'user-1',
        },
        {
          aiProfileId: null, avatar: null, connection: 'online', control: 'human',
          displayName: 'Mina', isHost: false, joinedAtMs: 1_100, kind: 'human',
          missedTurns: 0, playerId: 'player-guest', ready: true, seat: 1, userId: 'user-2',
        },
        {
          aiProfileId: 'mara-balanced', avatar: null, connection: 'online', control: 'ai',
          displayName: 'Mara', isHost: false, joinedAtMs: 1_200, kind: 'ai',
          missedTurns: 0, playerId: 'ai:seat-2', ready: true, seat: 2, userId: null,
        },
      ],
      sessionNumber: 1,
      status: overrides.status ?? 'between-hands',
      turnDeadlineAtMs: null,
      updatedAtMs: 2_000,
      version: 7,
      ...(overrides.hand === undefined ? {} : { hand: overrides.hand }),
    };
  }

  // Hand player names must match the seats' display names: the client parser
  // cross-checks them (R4 round-trip goes all the way to the real parser).
  const seatDisplayNames: Record<string, string> = {
    'ai:seat-2': 'Mara',
    'player-guest': 'Mina',
    'player-host': 'Kai',
  };

  function settledHand(stacks: Record<string, number>, handNumber = 3): Record<string, unknown> {
    return {
      actedAtBet: Object.fromEntries(Object.keys(stacks).map((playerId) => [playerId, null])),
      dealOrder: Object.keys(stacks),
      preflopActionOrder: Object.keys(stacks),
      postflopActionOrder: Object.keys(stacks),
      activePlayerIds: Object.keys(stacks),
      bigBlind: 20,
      bigBlindPlayerId: 'player-guest',
      board: [],
      buttonPlayerId: 'player-host',
      buttonSeat: 0,
      currentBet: 0,
      deck: [],
      handNumber,
      history: [],
      lastFullRaise: 20,
      outcome: {
        awards: [],
        showdown: false,
        totalPot: 0,
        winnerPlayerIds: [Object.keys(stacks)[0]!],
      },
      pending: [],
      players: Object.fromEntries(Object.entries(stacks).map(([playerId, stack]) => [playerId, {
        allIn: false,
        folded: false,
        holeCards: [],
        id: playerId,
        name: seatDisplayNames[playerId] ?? playerId,
        seat: 0,
        stack,
        streetBet: 0,
        totalCommitted: 0,
      }])),
      pot: 0,
      smallBlind: 10,
      smallBlindPlayerId: 'player-host',
      street: 'complete',
      tablePlayerIds: Object.keys(stacks),
      toAct: null,
    };
  }

  it('preserves actual uneven settled balances in a legacy settled room', () => {
    // The documented R4 failure: stacks [4000, 2000, 0] became [2000, 2000,
    // 2000], erasing real gains/losses and reviving the busted seat.
    const room = legacyRoomFixture({
      hand: settledHand({ 'player-host': 4_000, 'player-guest': 2_000, 'ai:seat-2': 0 }),
      status: 'complete',
    });
    const state = normalizeMultiplayerCanonicalState(room);
    expect(state).not.toBeNull();
    expect(state!.seats.map((seat) => seat.ledger?.settledStack)).toEqual([4_000, 2_000, 0]);
    expect(state!.seats.every((seat) => seat.ledger?.rebuyCount === 0)).toBe(true);
    expect(state!.seats.every((seat) => seat.ledger?.totalBuyIn === 2_000)).toBe(true);
    // Room-level conservation holds after the conversion.
    const settledSum = state!.seats.reduce((total, seat) => total + (seat.ledger?.settledStack ?? 0), 0);
    const introducedSum = state!.seats.reduce((total, seat) => total + (seat.ledger?.totalBuyIn ?? 0), 0);
    expect(settledSum).toBe(introducedSum);
  });

  it('refuses a legacy settled room whose conservation is violated', () => {
    const room = legacyRoomFixture({
      hand: settledHand({ 'player-host': 6_000, 'player-guest': 1_000, 'ai:seat-2': 0 }),
      status: 'complete',
    });
    expect(normalizeMultiplayerCanonicalState(room)).toBeNull();
  });

  it('refuses a legacy settled room missing a participant from the hand', () => {
    const room = legacyRoomFixture({
      hand: settledHand({ 'player-host': 4_000, 'player-guest': 2_000 }),
      status: 'complete',
    });
    expect(normalizeMultiplayerCanonicalState(room)).toBeNull();
  });

  it('refuses a legacy room mid-hand past hand 1 (previous settlement unrecoverable)', () => {
    const hand = settledHand({ 'player-host': 1_500, 'player-guest': 2_300, 'ai:seat-2': 2_200 }, 4);
    delete (hand as Record<string, unknown>).outcome;
    (hand as Record<string, unknown>).street = 'flop';
    const room = legacyRoomFixture({ hand, status: 'playing' });
    expect(normalizeMultiplayerCanonicalState(room)).toBeNull();
  });

  it('converts a legacy first hand in progress at opening stacks (provably unsettled)', () => {
    const hand = settledHand({ 'player-host': 1_990, 'player-guest': 1_980, 'ai:seat-2': 2_000 }, 1);
    delete (hand as Record<string, unknown>).outcome;
    (hand as Record<string, unknown>).street = 'flop';
    const room = legacyRoomFixture({ hand, status: 'playing' });
    const state = normalizeMultiplayerCanonicalState(room);
    expect(state).not.toBeNull();
    for (const seat of state!.seats) {
      expect(seat.ledger).toMatchObject({ settledStack: 2_000, settledHandNumber: 0, totalBuyIn: 2_000 });
    }
  });

  it('converts a legacy lobby room with no hand at opening stacks', () => {
    const state = normalizeMultiplayerCanonicalState(legacyRoomFixture({ status: 'lobby' }));
    expect(state).not.toBeNull();
    for (const seat of state!.seats) {
      expect(seat.ledger).toMatchObject({ settledStack: 2_000, totalBuyIn: 2_000, rebuyCount: 0 });
    }
  });

  it('refuses a legacy room where any seat already carries a ledger row', () => {
    const room = legacyRoomFixture();
    (room.seats as Array<Record<string, unknown>>)[0]!.ledger = {
      initialBuyIn: 2_000, playerId: 'player-host', rebuyChips: 0, rebuyCount: 0,
      settledAtMs: 0, settledHandNumber: 0, settledStack: 2_000, totalBuyIn: 2_000,
    };
    expect(normalizeMultiplayerCanonicalState(room)).toBeNull();
  });

  it('refuses corrupt CURRENT-format data instead of applying a legacy default', () => {
    const base = legacyRoomFixture({ protocolVersion: 3 });
    // One seat missing its ledger row in a current-format room.
    const missing = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    delete ((missing.seats as Array<Record<string, unknown>>)[1] as Record<string, unknown>).ledger;
    missing.seats = (missing.seats as Array<Record<string, unknown>>).map((seat) => ({
      ...seat,
      ledger: seat.ledger ?? {
        initialBuyIn: 2_000, playerId: seat.playerId, rebuyChips: 0, rebuyCount: 0,
        settledAtMs: 0, settledHandNumber: 0, settledStack: 2_000, totalBuyIn: 2_000,
      },
    }));
    delete ((missing.seats as Array<Record<string, unknown>>)[1] as Record<string, unknown>).ledger;
    expect(normalizeMultiplayerCanonicalState(missing)).toBeNull();

    // Inconsistent accounting: rebuyChips does not equal rebuyCount x 4,000.
    const inconsistent = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    (inconsistent.seats as Array<Record<string, unknown>>)[0]!.ledger = {
      initialBuyIn: 2_000, playerId: 'player-host', rebuyChips: 1_000, rebuyCount: 1,
      settledAtMs: 0, settledHandNumber: 1, settledStack: 6_000, totalBuyIn: 3_000,
    };
    (inconsistent.seats as Array<Record<string, unknown>>)[1]!.ledger = {
      initialBuyIn: 2_000, playerId: 'player-guest', rebuyChips: 0, rebuyCount: 0,
      settledAtMs: 0, settledHandNumber: 1, settledStack: 1_000, totalBuyIn: 2_000,
    };
    (inconsistent.seats as Array<Record<string, unknown>>)[2]!.ledger = {
      initialBuyIn: 2_000, playerId: 'ai:seat-2', rebuyChips: 0, rebuyCount: 0,
      settledAtMs: 0, settledHandNumber: 1, settledStack: 2_000, totalBuyIn: 2_000,
    };
    expect(normalizeMultiplayerCanonicalState(inconsistent)).toBeNull();

    // Room-level conservation violation between otherwise valid rows.
    const violating = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    (violating.seats as Array<Record<string, unknown>>)[0]!.ledger = {
      initialBuyIn: 2_000, playerId: 'player-host', rebuyChips: 0, rebuyCount: 0,
      settledAtMs: 0, settledHandNumber: 1, settledStack: 5_000, totalBuyIn: 2_000,
    };
    (violating.seats as Array<Record<string, unknown>>)[1]!.ledger = {
      initialBuyIn: 2_000, playerId: 'player-guest', rebuyChips: 0, rebuyCount: 0,
      settledAtMs: 0, settledHandNumber: 1, settledStack: 1_000, totalBuyIn: 2_000,
    };
    (violating.seats as Array<Record<string, unknown>>)[2]!.ledger = {
      initialBuyIn: 2_000, playerId: 'ai:seat-2', rebuyChips: 0, rebuyCount: 0,
      settledAtMs: 0, settledHandNumber: 1, settledStack: 2_000, totalBuyIn: 2_000,
    };
    expect(normalizeMultiplayerCanonicalState(violating)).toBeNull();
  });

  it('accepts a fully valid current-format ledger unchanged', () => {
    const base = legacyRoomFixture({ protocolVersion: 3 });
    // Chips introduced: 3 x 2,000 buy-ins + one 4,000 rebuy = 10,000, so the
    // settled stacks must sum to exactly that (host net +2,000, guest -2,000).
    (base.seats as Array<Record<string, unknown>>).forEach((seat, index) => {
      seat.ledger = {
        initialBuyIn: 2_000,
        playerId: seat.playerId,
        rebuyChips: index === 0 ? 4_000 : 0,
        rebuyCount: index === 0 ? 1 : 0,
        settledAtMs: 1_500,
        settledHandNumber: 1,
        settledStack: index === 0 ? 8_000 : index === 1 ? 0 : 2_000,
        totalBuyIn: index === 0 ? 6_000 : 2_000,
      };
    });
    const state = normalizeMultiplayerCanonicalState(base);
    expect(state).not.toBeNull();
    expect(state!.seats.map((seat) => seat.ledger?.settledStack)).toEqual([8_000, 0, 2_000]);
    expect(state!.seats.map((seat) => seat.ledger?.totalBuyIn)).toEqual([6_000, 2_000, 2_000]);
  });

  it('refuses unknown lifecycle enums, future protocols, and current-format takeover rows', () => {
    const unknownParticipation = legacyRoomFixture({ protocolVersion: 3 });
    (unknownParticipation.seats as Array<Record<string, unknown>>)[0]!.participation = 'quantum';
    (unknownParticipation.seats as Array<Record<string, unknown>>).forEach((seat) => {
      seat.ledger = {
        initialBuyIn: 2_000, playerId: seat.playerId, rebuyChips: 0, rebuyCount: 0,
        settledAtMs: 0, settledHandNumber: 0, settledStack: 2_000, totalBuyIn: 2_000,
      };
    });
    expect(normalizeMultiplayerCanonicalState(unknownParticipation)).toBeNull();

    const futureProtocol = legacyRoomFixture({ protocolVersion: MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION + 1 });
    expect(normalizeMultiplayerCanonicalState(futureProtocol)).toBeNull();

    // A CURRENT-format room with a human seat handed to AI is corrupt: only a
    // legacy row may be coerced back to its human owner.
    const takeover = legacyRoomFixture({ protocolVersion: 3 });
    (takeover.seats as Array<Record<string, unknown>>)[0]!.control = 'ai';
    expect(normalizeMultiplayerCanonicalState(takeover)).toBeNull();
  });

  it('round-trips a converted legacy room through coordinator, projection, and client parser', () => {
    const legacy = legacyRoomFixture({
      hand: settledHand({ 'player-host': 4_000, 'player-guest': 2_000, 'ai:seat-2': 0 }),
      status: 'complete',
    });
    legacy.completionReason = 'last-player-standing';
    const normalized = normalizeMultiplayerCanonicalState(legacy);
    if (!normalized) throw new Error('The provable legacy conversion was refused.');

    // The client parser must accept the converted room's own projection with
    // the preserved uneven balances — normalization → projection → parse.
    const projection = createMultiplayerViewerProjection(normalized, 'user-1');
    const envelope = parseMultiplayerRoomEnvelope({ roomId: normalized.roomId, snapshot: projection });
    expect(envelope).not.toBeNull();
    const parsedSeats = envelope!.snapshot.seats;
    expect(parsedSeats.map((seat) => seat.ledger?.settledStack)).toEqual([4_000, 2_000, 0]);
    expect(parsedSeats.every((seat) => seat.ledger?.rebuyChips === 0)).toBe(true);

    // A coordinator mutation on the converted state persists cleanly and the
    // rematch's fresh session ledger parses on the client with zero rebuys.
    const rematch = applyMultiplayerCommand(normalized, {
      actorUserId: 'user-1',
      commandId: 'r4-rematch',
      expectedVersion: normalized.version,
      type: 'rematch',
    }, { nowMs: 9_000 }).state;
    expect(rematch.sessionNumber).toBe(2);
    const rematchProjection = createMultiplayerViewerProjection(rematch, 'user-1');
    const rematchEnvelope = parseMultiplayerRoomEnvelope({ roomId: rematch.roomId, snapshot: rematchProjection });
    expect(rematchEnvelope).not.toBeNull();
    expect(rematchEnvelope!.snapshot.seats.every((seat) => (
      seat.ledger?.totalBuyIn === 2_000 && seat.ledger?.rebuyCount === 0
    ))).toBe(true);
  });
});
