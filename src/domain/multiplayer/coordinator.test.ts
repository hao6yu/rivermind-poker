import { describe, expect, it } from 'vitest';

import { seededRandom, type RandomSource } from '../poker/cards';
import { getMultiwayLegalActions } from '../poker/multiway';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
  defaultMultiplayerRoomConfig,
  MultiplayerCoordinatorError,
} from './coordinator';
import type {
  MultiplayerCoordinatorState,
  MultiplayerRoomCommand,
} from './contracts';
import {
  createMultiplayerPublicSnapshot,
  createMultiplayerViewerProjection,
} from './projection';

type CommandInput = MultiplayerRoomCommand extends infer Command
  ? Command extends MultiplayerRoomCommand
    ? Omit<Command, 'commandId' | 'expectedVersion'>
    : never
  : never;

const hostUserId = 'user-host';
const guestUserId = 'user-guest';
const hostPlayerId = 'player-host';
const guestPlayerId = 'player-guest';

function newRoom(
  seatCount: 2 | 3 | 6 = 2,
  random: RandomSource = seededRandom(91),
): MultiplayerCoordinatorState {
  return createMultiplayerRoom({
    config: { ...defaultMultiplayerRoomConfig, handTarget: 5, seatCount },
    hostDisplayName: 'Kai',
    hostPlayerId,
    hostUserId,
    roomCode: '724826',
    roomId: 'room-test',
  }, { nowMs: 1_000, random });
}

let commandSequence = 0;

function send(
  state: MultiplayerCoordinatorState,
  input: CommandInput,
  nowMs: number,
  random: RandomSource,
  commandId = `command-${commandSequence += 1}`,
) {
  const command = {
    ...input,
    commandId,
    expectedVersion: state.version,
  } as MultiplayerRoomCommand;
  return applyMultiplayerCommand(state, command, { aiSimulations: 24, nowMs, random });
}

function addGuest(
  state: MultiplayerCoordinatorState,
  random: RandomSource,
  seat = 1,
): MultiplayerCoordinatorState {
  return send(state, {
    actorUserId: guestUserId,
    displayName: 'Mina',
    playerId: guestPlayerId,
    seat,
    type: 'join',
  }, 1_100, random).state;
}

function readyBoth(
  state: MultiplayerCoordinatorState,
  random: RandomSource,
): MultiplayerCoordinatorState {
  let next = send(state, {
    actorUserId: hostUserId,
    ready: true,
    type: 'set-ready',
  }, 1_200, random).state;
  next = send(next, {
    actorUserId: guestUserId,
    ready: true,
    type: 'set-ready',
  }, 1_300, random).state;
  return next;
}

function startRoom(
  state: MultiplayerCoordinatorState,
  random: RandomSource,
  nowMs = 2_000,
): MultiplayerCoordinatorState {
  return send(state, {
    actorUserId: hostUserId,
    type: 'start',
  }, nowMs, random).state;
}

function userIdForPlayer(state: MultiplayerCoordinatorState, playerId: string): string {
  const userId = state.seats.find((seat) => seat.playerId === playerId)?.userId;
  if (!userId) throw new Error(`No human user owns ${playerId}.`);
  return userId;
}

function expectCoordinatorError(
  run: () => unknown,
  code: MultiplayerCoordinatorError['code'],
): void {
  try {
    run();
    throw new Error('Expected a coordinator error.');
  } catch (error) {
    expect(error).toBeInstanceOf(MultiplayerCoordinatorError);
    expect((error as MultiplayerCoordinatorError).code).toBe(code);
  }
}

describe('multiplayer coordinator contracts', () => {
  it('creates a chip-based private room with a numeric room code', () => {
    const state = newRoom(3);
    expect(state.roomCode).toBe('724826');
    expect(state.config.startingStackChips).toBe(2_000);
    expect(state.config.turnSeconds).toBe(45);
    expect(state.seats).toEqual([
      expect.objectContaining({
        control: 'human',
        displayName: 'Kai',
        isHost: true,
        playerId: hostPlayerId,
        seat: 0,
        userId: hostUserId,
      }),
    ]);
  });

  it('rejects non-numeric room codes before any room state exists', () => {
    expectCoordinatorError(() => createMultiplayerRoom({
      config: defaultMultiplayerRoomConfig,
      hostDisplayName: 'Kai',
      hostPlayerId,
      hostUserId,
      roomCode: 'RMK724',
      roomId: 'room-invalid',
    }, { nowMs: 1_000 }), 'invalid-command');
  });

  it('returns an exact idempotent transition and rejects stale or conflicting commands', () => {
    const random = seededRandom(92);
    const state = newRoom(2, random);
    const command: MultiplayerRoomCommand = {
      actorUserId: hostUserId,
      commandId: 'ready-once',
      expectedVersion: 0,
      ready: true,
      type: 'set-ready',
    };
    const accepted = applyMultiplayerCommand(state, command, { nowMs: 1_100, random });
    const duplicate = applyMultiplayerCommand(accepted.state, command, { nowMs: 9_999, random });

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.transition).toEqual(accepted.transition);
    expect(duplicate.state.version).toBe(1);

    expectCoordinatorError(() => applyMultiplayerCommand(accepted.state, {
      ...command,
      commandId: 'stale-command',
      ready: false,
    }, { nowMs: 1_200, random }), 'stale-version');
    expectCoordinatorError(() => applyMultiplayerCommand(accepted.state, {
      ...command,
      ready: false,
    }, { nowMs: 1_200, random }), 'command-conflict');
  });
});

describe('multiplayer private-state projections', () => {
  it('keeps the deck and every other live hand out of viewer and Broadcast snapshots', () => {
    const random = seededRandom(101);
    let state = addGuest(newRoom(3, random), random);
    state = send(state, {
      actorUserId: hostUserId,
      seat: 2,
      type: 'add-ai',
    }, 1_150, random).state;
    state = readyBoth(state, random);
    state = startRoom(state, random);

    const host = createMultiplayerViewerProjection(state, hostUserId);
    const guest = createMultiplayerViewerProjection(state, guestUserId);
    const broadcast = createMultiplayerPublicSnapshot(state);

    expect(state.hand?.deck.length).toBeGreaterThan(0);
    expect(host.hand?.deck).toEqual([]);
    expect(guest.hand?.deck).toEqual([]);
    expect(broadcast.hand?.deck).toEqual([]);
    expect(host.hand?.players[hostPlayerId]?.holeCards).toHaveLength(2);
    expect(host.hand?.players[guestPlayerId]?.holeCards).toEqual([]);
    expect(guest.hand?.players[guestPlayerId]?.holeCards).toHaveLength(2);
    expect(guest.hand?.players[hostPlayerId]?.holeCards).toEqual([]);
    expect(Object.values(broadcast.hand?.players ?? {}).every((player) => player.holeCards.length === 0)).toBe(true);
    expect(host.legalActions === null || host.viewerPlayerId === state.hand?.toAct).toBe(true);
  });

  it('refuses to create a personalized projection for a non-member', () => {
    expect(() => createMultiplayerViewerProjection(newRoom(2), 'stranger')).toThrow(/not a member/i);
  });
});

describe('server-authoritative multiplayer timing', () => {
  it('auto-folds at the deadline when the player is facing chips', () => {
    const random = seededRandom(201);
    let state = readyBoth(addGuest(newRoom(2, random), random), random);
    state = startRoom(state, random, 2_000);
    const timedPlayerId = state.hand?.toAct;
    expect(timedPlayerId).toBeTruthy();
    expect(state.turnDeadlineAtMs).toBe(47_000);
    if (!timedPlayerId || state.turnDeadlineAtMs === null) return;
    expect(getMultiwayLegalActions(state.hand!, timedPlayerId).canFold).toBe(true);

    const result = send(state, {
      actorUserId: hostUserId,
      type: 'tick',
    }, state.turnDeadlineAtMs, random);

    expect(result.transition.timeout).toEqual({
      action: 'fold',
      aiTookOver: false,
      missedTurns: 1,
      playerId: timedPlayerId,
    });
    expect(result.transition.actionBatch.at(-1)).toMatchObject({ playerId: timedPlayerId, type: 'fold' });
    expect(result.state.status).toBe('between-hands');
  });

  it('auto-checks when checking is legal and rejects an early tick', () => {
    const random = seededRandom(202);
    let state = readyBoth(addGuest(newRoom(2, random), random), random);
    state = startRoom(state, random, 2_000);
    const callerId = state.hand?.toAct;
    if (!callerId) throw new Error('The heads-up hand has no first actor.');
    const callerUserId = userIdForPlayer(state, callerId);
    state = send(state, {
      action: { type: 'call' },
      actorUserId: callerUserId,
      type: 'action',
    }, 3_000, random).state;
    const checkingPlayerId = state.hand?.toAct;
    const deadline = state.turnDeadlineAtMs;
    if (!checkingPlayerId || deadline === null) throw new Error('The big blind has no timed decision.');
    expect(getMultiwayLegalActions(state.hand!, checkingPlayerId).canCheck).toBe(true);

    expectCoordinatorError(() => send(state, {
      actorUserId: hostUserId,
      type: 'tick',
    }, deadline - 1, random), 'invalid-command');

    const result = send(state, {
      actorUserId: hostUserId,
      type: 'tick',
    }, deadline, random);
    expect(result.transition.timeout).toMatchObject({
      action: 'check',
      playerId: checkingPlayerId,
    });
    expect(result.transition.actionBatch[0]).toMatchObject({ playerId: checkingPlayerId, type: 'check' });
  });

  it('pauses when every human is offline and resumes from the canonical hand', () => {
    const random = seededRandom(203);
    let state = readyBoth(addGuest(newRoom(2, random), random), random);
    state = startRoom(state, random, 2_000);
    const historyBefore = state.hand?.history ?? [];
    state = send(state, {
      actorUserId: hostUserId,
      connection: 'offline',
      type: 'set-connection',
    }, 3_000, random).state;
    expect(state.status).toBe('playing');
    state = send(state, {
      actorUserId: guestUserId,
      connection: 'offline',
      type: 'set-connection',
    }, 3_100, random).state;

    expect(state.status).toBe('paused');
    expect(state.resumeStatus).toBe('playing');
    expect(state.turnDeadlineAtMs).toBeNull();
    expect(state.hand?.history).toEqual(historyBefore);

    state = send(state, {
      actorUserId: guestUserId,
      connection: 'online',
      type: 'set-connection',
    }, 8_000, random).state;
    expect(state.status).toBe('playing');
    expect(state.resumeStatus).toBeNull();
    expect(state.turnDeadlineAtMs).toBe(53_000);
    expect(state.hand?.history).toEqual(historyBefore);
  });

  it('moves a human seat to AI after two missed decisions and allows reclaim only between hands', () => {
    const random = seededRandom(204);
    let state = readyBoth(addGuest(newRoom(2, random), random), random);
    state = startRoom(state, random, 2_000);
    const targetPlayerId = state.hand?.toAct;
    if (!targetPlayerId || state.turnDeadlineAtMs === null) throw new Error('The first timed actor is missing.');
    const targetUserId = userIdForPlayer(state, targetPlayerId);

    state = send(state, {
      actorUserId: hostUserId,
      type: 'tick',
    }, state.turnDeadlineAtMs, random).state;
    expect(state.status).toBe('between-hands');
    state = send(state, {
      actorUserId: hostUserId,
      type: 'next-hand',
    }, 50_000, random).state;

    const otherPlayerId = state.hand?.toAct;
    if (!otherPlayerId) throw new Error('The next hand has no first actor.');
    expect(otherPlayerId).not.toBe(targetPlayerId);
    state = send(state, {
      action: { type: 'call' },
      actorUserId: userIdForPlayer(state, otherPlayerId),
      type: 'action',
    }, 51_000, random).state;
    expect(state.hand?.toAct).toBe(targetPlayerId);
    if (state.turnDeadlineAtMs === null) throw new Error('The target player has no second deadline.');

    const secondTimeout = send(state, {
      actorUserId: otherPlayerId === hostPlayerId ? hostUserId : guestUserId,
      type: 'tick',
    }, state.turnDeadlineAtMs, random);
    state = secondTimeout.state;
    expect(secondTimeout.transition.timeout).toMatchObject({
      aiTookOver: true,
      missedTurns: 2,
      playerId: targetPlayerId,
    });
    expect(state.seats.find((seat) => seat.playerId === targetPlayerId)?.control).toBe('ai');
    expectCoordinatorError(() => send(state, {
      actorUserId: targetUserId,
      type: 'reclaim',
    }, 100_000, random), 'invalid-command');

    let guard = 0;
    while (state.status === 'playing' && guard < 60) {
      const playerId = state.hand?.toAct;
      if (!playerId) throw new Error('The running hand has no actor.');
      const seat = state.seats.find((candidate) => candidate.playerId === playerId);
      if (seat?.control !== 'human' || !seat.userId) {
        throw new Error('The coordinator should resolve AI turns before returning.');
      }
      const legal = getMultiwayLegalActions(state.hand!, playerId);
      const action = legal.canCheck ? { type: 'check' as const } : { type: 'fold' as const };
      state = send(state, {
        action,
        actorUserId: seat.userId,
        type: 'action',
      }, 101_000 + guard, random).state;
      guard += 1;
    }
    expect(state.status).toBe('between-hands');

    state = send(state, {
      actorUserId: targetUserId,
      type: 'reclaim',
    }, 110_000, random).state;
    expect(state.seats.find((seat) => seat.playerId === targetPlayerId)).toMatchObject({
      control: 'human',
      missedTurns: 0,
    });
  });
});
