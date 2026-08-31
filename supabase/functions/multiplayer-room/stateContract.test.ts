import { describe, expect, it } from 'vitest';

import { seededRandom } from '../../../src/domain/poker/cards';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
  defaultMultiplayerRoomConfig,
} from '../../../src/domain/multiplayer/coordinator';
import type {
  MultiplayerCoordinatorState,
  MultiplayerRoomCommand,
} from '../../../src/domain/multiplayer/contracts';
import { createMultiplayerPublicSnapshot } from '../../../src/domain/multiplayer/projection';
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

  it('upgrades a legacy pre-3.11F room: protocol 2, ledger init, participation defaults', () => {
    const state = normalizeMultiplayerCanonicalState(legacyRoom().canonicalState);
    expect(state).not.toBeNull();
    // Legacy rooms predate the protocol field: they normalize to protocol 2
    // (the pre-lifecycle wire) and upgrade on the next coordinator mutation.
    expect(state!.protocolVersion).toBe(2);
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
