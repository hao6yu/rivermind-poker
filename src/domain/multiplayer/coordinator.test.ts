import { describe, expect, it } from 'vitest';

import { seededRandom, type RandomSource } from '../poker/cards';
import { applyMultiwayAction, getMultiwayLegalActions } from '../poker/multiway';
import { multiwayAiIdentityForSeat } from '../poker/multiwayAiProfiles';
import { foldAiNameForComparison } from './aiSeatSelection';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
  defaultMultiplayerRoomConfig,
  evaluateTableMoment,
  multiplayerAiIdentityMap,
  MultiplayerCoordinatorError,
} from './coordinator';
import {
  TABLE_MOMENT_MAX_PAYLOAD_ID_LENGTH,
  TABLE_MOMENT_REACTION_IDS,
  type TableMomentReactionId,
} from './tableMoments';
import type {
  MultiplayerCoordinatorState,
  MultiplayerRoomCommand,
} from './contracts';
import {
  createMultiplayerPublicSnapshot,
  createMultiplayerPublicTransition,
  createMultiplayerViewerHandArchive,
  createMultiplayerViewerProjection,
} from './projection';
import {
  multiplayerHandBecameArchivable,
  parseMultiplayerHandArchive,
} from './archive';
import { buildMultiplayerSessionSummary } from './sessionSummary';

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
  seatCount: 2 | 3 | 6 | 9 = 2,
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

function completeOneHandByFolding(
  state: MultiplayerCoordinatorState,
  random: RandomSource,
): MultiplayerCoordinatorState {
  const actorPlayerId = state.hand?.toAct;
  if (!actorPlayerId) throw new Error('The completion fixture has no actor.');
  return send(state, {
    action: { type: 'fold' },
    actorUserId: userIdForPlayer(state, actorPlayerId),
    type: 'action',
  }, state.updatedAtMs + 100, random).state;
}

function completedSessionFixture(random: RandomSource): MultiplayerCoordinatorState {
  let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
  state = completeOneHandByFolding(state, random);
  if (!state.hand?.outcome) throw new Error('The completion fixture did not settle.');
  state.status = 'complete';
  state.completionReason = 'hand-limit';
  return state;
}

describe('multiplayer coordinator contracts', () => {
  it('creates a chip-based private room with a numeric room code', () => {
    const state = newRoom(3);
    expect(state.roomCode).toBe('724826');
    expect(state.config.startingStackChips).toBe(2_000);
    expect(state.config.turnSeconds).toBe(45);
    expect(state.completionReason).toBeNull();
    expect(state.sessionNumber).toBe(1);
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

  it('restricts next-hand dealing to an available host but recovers through an online guest', () => {
    const random = seededRandom(94);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);

    expectCoordinatorError(() => send(state, {
      actorUserId: guestUserId,
      type: 'next-hand',
    }, 3_000, random), 'forbidden');

    const unavailableHost = JSON.parse(JSON.stringify(state)) as MultiplayerCoordinatorState;
    const host = unavailableHost.seats.find((seat) => seat.playerId === hostPlayerId);
    if (!host) throw new Error('The recovery fixture lost its host.');
    host.connection = 'offline';
    const recovered = send(unavailableHost, {
      actorUserId: guestUserId,
      type: 'next-hand',
    }, 3_100, random).state;

    expect(recovered.status).toBe('playing');
    expect(recovered.hostPlayerId).toBe(guestPlayerId);
    expect(recovered.seats.find((seat) => seat.playerId === guestPlayerId)?.isHost).toBe(true);
  });

  it('keeps an available host in control of rematches and lets a guest recover an unavailable host', () => {
    const random = seededRandom(95);
    const complete = completedSessionFixture(random);

    expectCoordinatorError(() => send(complete, {
      actorUserId: guestUserId,
      type: 'rematch',
    }, 4_000, random), 'forbidden');

    const unavailableHost = JSON.parse(JSON.stringify(complete)) as MultiplayerCoordinatorState;
    const host = unavailableHost.seats.find((seat) => seat.playerId === hostPlayerId);
    if (!host) throw new Error('The rematch fixture lost its host.');
    host.connection = 'offline';
    const rematch = send(unavailableHost, {
      actorUserId: guestUserId,
      type: 'rematch',
    }, 4_100, random).state;

    expect(rematch).toMatchObject({
      completionReason: null,
      hand: null,
      hostPlayerId: guestPlayerId,
      roomCode: '724826',
      roomId: 'room-test',
      sessionNumber: 2,
      status: 'lobby',
    });
    expect(rematch.seats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        connection: 'offline',
        control: 'human',
        playerId: hostPlayerId,
        ready: false,
      }),
      expect.objectContaining({
        connection: 'online',
        isHost: true,
        playerId: guestPlayerId,
        ready: false,
      }),
    ]));
  });

  it('rejects rematches from an AI-controlled or non-member guest seat', () => {
    const random = seededRandom(96);
    const complete = completedSessionFixture(random);
    const aiControlled = JSON.parse(JSON.stringify(complete)) as MultiplayerCoordinatorState;
    const guest = aiControlled.seats.find((seat) => seat.playerId === guestPlayerId);
    const host = aiControlled.seats.find((seat) => seat.playerId === hostPlayerId);
    if (!guest || !host) throw new Error('The guest rejection fixture lost a seat.');
    host.connection = 'offline';
    guest.control = 'ai';

    expectCoordinatorError(() => send(aiControlled, {
      actorUserId: guestUserId,
      type: 'rematch',
    }, 4_200, random), 'forbidden');
    expectCoordinatorError(() => send(complete, {
      actorUserId: 'not-a-member',
      type: 'rematch',
    }, 4_300, random), 'forbidden');
  });

  it('lets an online human reclaim after completion before recovering an unavailable host', () => {
    const random = seededRandom(196);
    let complete = completedSessionFixture(random);
    const guest = complete.seats.find((seat) => seat.playerId === guestPlayerId);
    const host = complete.seats.find((seat) => seat.playerId === hostPlayerId);
    if (!guest || !host) throw new Error('The completed reclaim fixture lost a seat.');
    host.connection = 'offline';
    host.control = 'ai';
    guest.control = 'ai';

    complete = send(complete, {
      actorUserId: guestUserId,
      type: 'reclaim',
    }, 4_400, random).state;
    expect(complete.seats.find((seat) => seat.playerId === guestPlayerId)).toMatchObject({
      control: 'human',
      missedTurns: 0,
    });

    const rematch = send(complete, {
      actorUserId: guestUserId,
      type: 'rematch',
    }, 4_500, random).state;
    expect(rematch).toMatchObject({
      hostPlayerId: guestPlayerId,
      sessionNumber: 2,
      status: 'lobby',
    });
  });

  it('completes a fixed session at the authoritative hand limit', () => {
    const random = seededRandom(97);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    let guard = 0;
    while (state.status !== 'complete' && guard < 12) {
      if (state.status === 'between-hands') {
        state = send(state, {
          actorUserId: hostUserId,
          type: 'next-hand',
        }, 5_000 + guard, random).state;
      } else {
        state = completeOneHandByFolding(state, random);
      }
      guard += 1;
    }

    expect(guard).toBeLessThan(12);
    expect(state.hand?.handNumber).toBe(5);
    expect(state.completionReason).toBe('hand-limit');
    expect(state.status).toBe('complete');
  });

  it('completes an open session when one stack remains', () => {
    const random = seededRandom(99);
    let state = createMultiplayerRoom({
      config: {
        ...defaultMultiplayerRoomConfig,
        handTarget: 'open',
        seatCount: 2,
        startingStackChips: 20,
      },
      hostDisplayName: 'Kai',
      hostPlayerId,
      hostUserId,
      roomCode: '724826',
      roomId: 'room-test',
    }, { nowMs: 1_000, random });
    state = startRoom(readyBoth(addGuest(state, random), random), random);
    const actor = state.hand?.toAct;
    if (!actor || !state.hand) throw new Error('The elimination fixture has no actor.');
    expect(getMultiwayLegalActions(state.hand, actor).canCall).toBe(true);
    state = send(state, {
      action: { type: 'call' },
      actorUserId: userIdForPlayer(state, actor),
      type: 'action',
    }, 2_100, random).state;

    expect(state.hand?.outcome).toBeDefined();
    expect(state.completionReason).toBe('last-player-standing');
    expect(state.status).toBe('complete');
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

  it('prefers an online human successor when the host leaves', () => {
    const random = seededRandom(93);
    let state = addGuest(newRoom(3, random), random, 1);
    state = send(state, {
      actorUserId: 'user-third',
      displayName: 'Nora',
      playerId: 'player-third',
      seat: 2,
      type: 'join',
    }, 1_150, random).state;
    state = send(state, {
      actorUserId: guestUserId,
      connection: 'offline',
      type: 'set-connection',
    }, 1_200, random).state;

    state = send(state, {
      actorUserId: hostUserId,
      type: 'leave',
    }, 1_300, random).state;

    expect(state.hostPlayerId).toBe('player-third');
    expect(state.seats.find((seat) => seat.playerId === 'player-third')?.isHost).toBe(true);
    expect(state.seats.find((seat) => seat.playerId === guestPlayerId)?.isHost).toBe(false);
  });

  it.each(['club', 'sharp'] as const)(
    'maps every AI-controlled %s seat while leaving live humans on the generic range',
    (difficulty) => {
      const random = seededRandom(difficulty === 'club' ? 931 : 932);
      let state = addGuest(newRoom(3, random), random, 1);
      state.config.aiDifficulty = difficulty;
      state = send(state, {
        actorUserId: hostUserId,
        seat: 2,
        type: 'add-ai',
      }, 1_150, random).state;

      const initialMap = multiplayerAiIdentityMap(state);
      const aiSeat = state.seats.find((seat) => seat.kind === 'ai');
      if (!aiSeat) throw new Error('The mixed-table identity fixture lost its AI seat.');
      expect(Object.keys(initialMap)).toEqual([aiSeat.playerId]);
      expect(initialMap[hostPlayerId]).toBeUndefined();
      expect(initialMap[guestPlayerId]).toBeUndefined();
      expect(initialMap[aiSeat.playerId]?.id).toBe(aiSeat.aiProfileId);

      const takeover = structuredClone(state);
      const guest = takeover.seats.find((seat) => seat.playerId === guestPlayerId);
      if (!guest) throw new Error('The mixed-table identity fixture lost its guest seat.');
      guest.displayName = 'Lena';
      guest.control = 'ai';
      const takeoverMap = multiplayerAiIdentityMap(takeover);
      expect(Object.keys(takeoverMap).sort()).toEqual([aiSeat.playerId, guestPlayerId].sort());
      expect(takeoverMap[hostPlayerId]).toBeUndefined();
      expect(takeoverMap[guestPlayerId]?.level).toBe(difficulty);
      expect(takeoverMap[guestPlayerId]?.id).toBe(
        multiwayAiIdentityForSeat(guest.seat, difficulty).id,
      );
    },
  );

  it('keeps a six-seat cross-street AI batch chronological and returns control only to the acting human', () => {
    const random = seededRandom(1);
    let state = newRoom(6, random);
    for (let seat = 1; seat < 6; seat += 1) {
      state = send(state, {
        actorUserId: hostUserId,
        seat,
        type: 'add-ai',
      }, 1_100 + seat, random).state;
    }
    state = send(state, {
      actorUserId: hostUserId,
      ready: true,
      type: 'set-ready',
    }, 1_200, random).state;
    state = send(state, {
      actorUserId: hostUserId,
      type: 'start',
    }, 2_000, random).state;

    const startingHand = state.hand;
    if (!startingHand) throw new Error('The six-seat room did not deal a hand.');
    expect(state.seats).toHaveLength(6);
    expect(state.seats.filter((seat) => seat.control === 'human')).toHaveLength(1);
    expect(startingHand.toAct).toBe(hostPlayerId);
    expect(getMultiwayLegalActions(startingHand, hostPlayerId).canCall).toBe(true);

    // This is the canonical intermediate state immediately after the human call,
    // before the coordinator drains the following AI turns into one transition.
    const afterHumanOnly = applyMultiwayAction(startingHand, hostPlayerId, { type: 'call' });
    expect(afterHumanOnly.toAct).toMatch(/^ai:/);
    expectCoordinatorError(() => send({ ...state, hand: afterHumanOnly }, {
      action: { type: 'check' },
      actorUserId: hostUserId,
      type: 'action',
    }, 2_100, random), 'invalid-command');

    const historyLengthBefore = startingHand.history.length;
    const result = send(state, {
      action: { type: 'call' },
      actorUserId: hostUserId,
      type: 'action',
    }, 2_200, random);
    const batch = result.transition.actionBatch;
    const finalHand = result.state.hand;
    if (!finalHand) throw new Error('The cross-street transition lost its hand.');

    expect(batch[0]).toMatchObject({
      playerId: hostPlayerId,
      street: 'preflop',
      type: 'call',
    });
    expect(new Set(batch.map((action) => action.street))).toEqual(new Set(['preflop', 'flop']));

    const streetOrder = { complete: 4, flop: 1, preflop: 0, river: 3, turn: 2 } as const;
    batch.slice(1).forEach((action, index) => {
      const previous = batch[index];
      if (!previous) throw new Error('The action batch lost its preceding action.');
      expect(streetOrder[action.street]).toBeGreaterThanOrEqual(streetOrder[previous.street]);
    });

    const aiStreets = new Map<string, Set<string>>();
    batch.forEach((action) => {
      if (!action.playerId.startsWith('ai:')) return;
      const seen = aiStreets.get(action.playerId) ?? new Set<string>();
      seen.add(action.street);
      aiStreets.set(action.playerId, seen);
    });
    expect([...aiStreets.values()].some((streets) => (
      streets.has('preflop') && streets.has('flop')
    ))).toBe(true);

    expect(batch).toEqual(finalHand.history.slice(historyLengthBefore).map((record) => ({
      amount: record.amount,
      playerId: record.playerId,
      potAfter: record.potAfter,
      street: record.street,
      type: record.type,
    })));
    expect(finalHand.street).toBe('flop');
    expect(finalHand.toAct).toBe(hostPlayerId);

    const viewer = createMultiplayerViewerProjection(result.state, hostUserId);
    expect(viewer.viewerPlayerId).toBe(hostPlayerId);
    expect(viewer.hand?.toAct).toBe(hostPlayerId);
    expect(viewer.legalActions).toEqual(getMultiwayLegalActions(finalHand, hostPlayerId));
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
    expect(broadcast.roomCode).toBe('');
    expect(host.roomCode).toBe('724826');
    expect(broadcast.seats.every((seat) => seat.userId === null)).toBe(true);
    expect(host.seats.every((seat) => seat.userId === null)).toBe(true);
    expect(host.hand?.players[hostPlayerId]?.holeCards).toHaveLength(2);
    expect(host.hand?.players[guestPlayerId]?.holeCards).toEqual([]);
    expect(guest.hand?.players[guestPlayerId]?.holeCards).toHaveLength(2);
    expect(guest.hand?.players[hostPlayerId]?.holeCards).toEqual([]);
    expect(Object.values(broadcast.hand?.players ?? {}).every((player) => player.holeCards.length === 0)).toBe(true);
    expect(host.legalActions === null || host.viewerPlayerId === state.hand?.toAct).toBe(true);
  });

  it('exposes legal actions only to the online human whose live turn is playing', () => {
    const random = seededRandom(104);
    const state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    const actorPlayerId = state.hand?.toAct;
    if (!actorPlayerId || !state.hand) throw new Error('The projection test has no current actor.');
    const actorUserId = userIdForPlayer(state, actorPlayerId);
    const waitingUserId = actorUserId === hostUserId ? guestUserId : hostUserId;

    expect(createMultiplayerViewerProjection(state, actorUserId).legalActions)
      .toEqual(getMultiwayLegalActions(state.hand, actorPlayerId));
    expect(createMultiplayerViewerProjection(state, waitingUserId).legalActions).toBeNull();

    const paused = JSON.parse(JSON.stringify(state)) as MultiplayerCoordinatorState;
    paused.status = 'paused';
    paused.resumeStatus = 'playing';
    expect(createMultiplayerViewerProjection(paused, actorUserId).legalActions).toBeNull();

    const offline = JSON.parse(JSON.stringify(state)) as MultiplayerCoordinatorState;
    const offlineSeat = offline.seats.find((seat) => seat.playerId === actorPlayerId);
    if (!offlineSeat) throw new Error('The projection test lost the acting seat.');
    offlineSeat.connection = 'offline';
    expect(createMultiplayerViewerProjection(offline, actorUserId).legalActions).toBeNull();

    const aiControlled = JSON.parse(JSON.stringify(state)) as MultiplayerCoordinatorState;
    const aiControlledSeat = aiControlled.seats.find((seat) => seat.playerId === actorPlayerId);
    if (!aiControlledSeat) throw new Error('The projection test lost the acting seat.');
    aiControlledSeat.control = 'ai';
    expect(createMultiplayerViewerProjection(aiControlled, actorUserId).legalActions).toBeNull();
  });

  it('removes the actor auth id from public transitions', () => {
    const random = seededRandom(102);
    const transition = send(newRoom(2), {
      actorUserId: hostUserId,
      ready: true,
      type: 'set-ready',
    }, 1_100, random).transition;
    expect(createMultiplayerPublicTransition(transition)).not.toHaveProperty('actorUserId');
  });

  it('keeps public showdown snapshots card-free while revealing shown cards to members', () => {
    const random = seededRandom(103);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    let guard = 0;
    while (state.status === 'playing' && guard < 20) {
      const playerId = state.hand?.toAct;
      if (!playerId || !state.hand) throw new Error('The showdown test has no actor.');
      const legal = getMultiwayLegalActions(state.hand, playerId);
      state = send(state, {
        action: { type: legal.canCheck ? 'check' : 'call' },
        actorUserId: userIdForPlayer(state, playerId),
        type: 'action',
      }, 2_000 + guard, random).state;
      guard += 1;
    }
    expect(state.hand?.outcome?.showdown).toBe(true);
    const broadcast = createMultiplayerPublicSnapshot(state);
    const host = createMultiplayerViewerProjection(state, hostUserId);
    const archive = createMultiplayerViewerHandArchive(state, hostUserId);
    expect(Object.values(broadcast.hand?.players ?? {}).every((player) => player.holeCards.length === 0)).toBe(true);
    expect(Object.values(host.hand?.players ?? {}).every((player) => player.holeCards.length === 2)).toBe(true);
    expect(archive).not.toBeNull();
    expect(Object.values(archive?.hand.players ?? {}).every((player) => player.holeCards.length === 2)).toBe(true);
    expect(parseMultiplayerHandArchive(archive)).toEqual(archive);
  });

  it('refuses to create a personalized projection for a non-member', () => {
    expect(() => createMultiplayerViewerProjection(newRoom(2), 'stranger')).toThrow(/not a member/i);
  });

  it('archives only the viewer cards and viewer decision context after a fold', () => {
    const random = seededRandom(105);
    const playing = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    const completed = completeOneHandByFolding(playing, random);
    const foldingPlayerId = completed.hand?.history.at(-1)?.playerId;
    if (!foldingPlayerId || !completed.hand?.outcome) {
      throw new Error('The archive fixture did not settle by a fold.');
    }
    const foldingUserId = userIdForPlayer(completed, foldingPlayerId);
    const winnerUserId = foldingUserId === hostUserId ? guestUserId : hostUserId;
    const foldingArchive = createMultiplayerViewerHandArchive(completed, foldingUserId);
    const winnerArchive = createMultiplayerViewerHandArchive(completed, winnerUserId);
    if (!foldingArchive || !winnerArchive) throw new Error('The archive fixture was not created.');

    expect(foldingArchive.hand.deck).toEqual([]);
    expect(foldingArchive.hand.pending).toEqual([]);
    expect(foldingArchive.hand.toAct).toBeNull();
    expect(foldingArchive.hand.players[foldingPlayerId]?.holeCards).toHaveLength(2);
    expect(winnerArchive.hand.players[foldingPlayerId]?.holeCards).toEqual([]);
    expect(foldingArchive.hand.history.at(-1)?.decisionContext).toBeDefined();
    expect(winnerArchive.hand.history.at(-1)?.decisionContext).toBeUndefined();
    expect(parseMultiplayerHandArchive(foldingArchive)).toEqual(foldingArchive);
    expect(parseMultiplayerHandArchive(winnerArchive)).toEqual(winnerArchive);
  });

  it('rejects archived folded-card and opponent decision-context leaks client-side', () => {
    const random = seededRandom(106);
    const playing = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    const completed = completeOneHandByFolding(playing, random);
    const archive = createMultiplayerViewerHandArchive(completed, hostUserId);
    if (!archive) throw new Error('The privacy fixture was not archived.');
    const opponentId = archive.hand.tablePlayerIds.find((id) => id !== archive.viewerPlayerId);
    if (!opponentId) throw new Error('The privacy fixture has no opponent.');

    const foldedCardLeak = JSON.parse(JSON.stringify(archive)) as typeof archive;
    foldedCardLeak.hand.players[opponentId]!.folded = true;
    foldedCardLeak.hand.players[opponentId]!.holeCards = [
      { rank: 2, suit: 'clubs' },
      { rank: 3, suit: 'clubs' },
    ];
    expect(parseMultiplayerHandArchive(foldedCardLeak)).toBeNull();

    const contextLeak = JSON.parse(JSON.stringify(archive)) as typeof archive;
    const opponentAction = contextLeak.hand.history.find((action) => (
      action.playerId !== archive.viewerPlayerId
    ));
    if (!opponentAction) {
      contextLeak.hand.history.push({
        amount: 0,
        decisionContext: archive.hand.history[0]?.decisionContext,
        playerId: opponentId,
        potAfter: contextLeak.hand.pot,
        street: 'preflop',
        type: 'fold',
      });
    } else {
      opponentAction.decisionContext = archive.hand.history[0]?.decisionContext;
    }
    expect(parseMultiplayerHandArchive(contextLeak)).toBeNull();
  });

  it('marks only the first settlement transition as archive-worthy', () => {
    const random = seededRandom(107);
    const playing = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    const completed = completeOneHandByFolding(playing, random);
    const laterConnectionUpdate = JSON.parse(JSON.stringify(completed)) as MultiplayerCoordinatorState;
    laterConnectionUpdate.updatedAtMs += 5_000;
    laterConnectionUpdate.version += 1;

    expect(multiplayerHandBecameArchivable(playing, completed)).toBe(true);
    expect(multiplayerHandBecameArchivable(completed, laterConnectionUpdate)).toBe(false);
  });
});

describe('multiplayer session standings', () => {
  it('builds deterministic chip deltas, ties, and viewer placement', () => {
    const random = seededRandom(108);
    const complete = completedSessionFixture(random);
    const hand = complete.hand;
    if (!hand) throw new Error('The standings fixture has no final hand.');
    hand.players[hostPlayerId]!.stack = 2_100;
    hand.players[guestPlayerId]!.stack = 2_100;

    expect(buildMultiplayerSessionSummary(
      createMultiplayerViewerProjection(complete, guestUserId),
      guestPlayerId,
    )).toEqual({
      completionReason: 'hand-limit',
      handsPlayed: hand.handNumber,
      rows: [
        expect.objectContaining({ delta: 100, isViewer: false, place: 1, playerId: hostPlayerId }),
        expect.objectContaining({ delta: 100, isViewer: true, place: 1, playerId: guestPlayerId }),
      ],
      sessionNumber: 1,
      viewerPlace: 1,
    });
  });

  it('does not summarize an unfinished room', () => {
    const room = newRoom(2, seededRandom(109));
    expect(buildMultiplayerSessionSummary(
      createMultiplayerViewerProjection(room, hostUserId),
      hostPlayerId,
    )).toBeNull();
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

  it('transfers hosting when the host times out into AI control so an online guest can deal', () => {
    const random = seededRandom(205);
    let state = readyBoth(addGuest(newRoom(2, random), random), random);
    state = startRoom(state, random, 2_000);

    // Drive hands with legal conservative actions until the host has missed
    // two decisions. A tick can be sent by any live member because the server
    // owns the deadline and acting-player check.
    let guard = 0;
    while (
      state.seats.find((seat) => seat.playerId === hostPlayerId)?.control === 'human'
      && guard < 120
    ) {
      if (state.status === 'between-hands') {
        state = send(state, {
          actorUserId: state.hostPlayerId === hostPlayerId ? hostUserId : guestUserId,
          type: 'next-hand',
        }, 10_000 + guard, random).state;
        guard += 1;
        continue;
      }
      const actorId = state.hand?.toAct;
      if (!actorId || state.turnDeadlineAtMs === null) {
        throw new Error('The host-transfer fixture lost its timed actor.');
      }
      if (actorId === hostPlayerId) {
        state = send(state, {
          actorUserId: guestUserId,
          type: 'tick',
        }, state.turnDeadlineAtMs, random).state;
      } else {
        const legal = getMultiwayLegalActions(state.hand!, actorId);
        state = send(state, {
          action: { type: legal.canCheck ? 'check' : 'fold' },
          actorUserId: guestUserId,
          type: 'action',
        }, 20_000 + guard, random).state;
      }
      guard += 1;
    }

    expect(guard).toBeLessThan(120);
    expect(state.seats.find((seat) => seat.playerId === hostPlayerId)?.control).toBe('ai');
    expect(state.hostPlayerId).toBe(guestPlayerId);
    expect(state.seats.find((seat) => seat.playerId === guestPlayerId)?.isHost).toBe(true);
    expect(state.seats.find((seat) => seat.playerId === hostPlayerId)?.isHost).toBe(false);

    if (state.status === 'playing') {
      const guestLegal = getMultiwayLegalActions(state.hand!, guestPlayerId);
      state = send(state, {
        action: { type: guestLegal.canCheck ? 'check' : 'fold' },
        actorUserId: guestUserId,
        type: 'action',
      }, 40_000, random).state;
    }
    expect(state.status).toBe('between-hands');
    expect(() => send(state, {
      actorUserId: guestUserId,
      type: 'next-hand',
    }, 50_000, random)).not.toThrow();
  });
});

describe('nine-seat rooms and randomized AI seat selection', () => {
  it('creates a nine-seat room and deals a nine-handed hand with truthful positions', () => {
    const random = seededRandom(501);
    let state = newRoom(9, random);
    expect(state.config.seatCount).toBe(9);
    for (let seat = 1; seat < 9; seat += 1) {
      state = send(state, {
        actorUserId: hostUserId,
        seat,
        type: 'add-ai',
      }, 1_100 + seat, random).state;
    }
    state = send(state, {
      actorUserId: hostUserId,
      ready: true,
      type: 'set-ready',
    }, 1_200, random).state;
    state = send(state, {
      actorUserId: hostUserId,
      type: 'start',
    }, 2_000, random).state;

    expect(state.seats).toHaveLength(9);
    expect(state.seats.filter((seat) => seat.kind === 'ai')).toHaveLength(8);
    const hand = state.hand;
    if (!hand) throw new Error('The nine-seat room did not deal a hand.');
    expect(hand.tablePlayerIds).toHaveLength(9);
    expect(hand.activePlayerIds).toHaveLength(9);
    expect(new Set(hand.tablePlayerIds.map((id) => hand.players[id]?.position)))
      .toEqual(new Set(['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO']));
    const dealtCards = hand.activePlayerIds.flatMap((id) => hand.players[id]?.holeCards ?? []);
    expect(dealtCards).toHaveLength(18);
    expect(new Set(dealtCards.map((card) => `${card.rank}${card.suit}`)).size).toBe(18);
  });

  it('selects AI identities from the shared randomized selector instead of seat order', () => {
    const random = seededRandom(502);
    let state = newRoom(9, random);
    for (let seat = 1; seat < 9; seat += 1) {
      state = send(state, {
        actorUserId: hostUserId,
        seat,
        type: 'add-ai',
      }, 1_100 + seat, random).state;
    }
    const seatedIds = state.seats
      .filter((seat) => seat.kind === 'ai')
      .map((seat) => seat.aiProfileId);
    expect(seatedIds).toHaveLength(8);
    expect(new Set(seatedIds).size).toBe(8);
    // A seat-index-hard-coded table would place exactly one profile per seat;
    // the selector must not simply mirror `multiwayAiIdentityForSeat`.
    const hardCoded = state.seats
      .filter((seat) => seat.kind === 'ai')
      .map((seat) => multiwayAiIdentityForSeat(seat.seat, 'club').id);
    expect(seatedIds).not.toEqual(hardCoded);
  });

  it('acts as a reroll: remove-and-re-add on a seat avoids the just-removed profile', () => {
    const random = seededRandom(503);
    let state = newRoom(9, random);
    for (let seat = 1; seat < 9; seat += 1) {
      state = send(state, {
        actorUserId: hostUserId,
        seat,
        type: 'add-ai',
      }, 1_100 + seat, random).state;
    }
    const seatOne = state.seats.find((seat) => seat.seat === 1);
    if (!seatOne || seatOne.kind !== 'ai' || !seatOne.aiProfileId) {
      throw new Error('Seat 1 must carry an AI profile.');
    }
    const removedProfileId = seatOne.aiProfileId;

    state = send(state, {
      actorUserId: hostUserId,
      seat: 1,
      type: 'remove-ai',
    }, 1_300, random).state;
    expect(state.removedAiProfileIdBySeat[1]).toBe(removedProfileId);
    expect(state.seats.find((seat) => seat.seat === 1)).toBeUndefined();

    state = send(state, {
      actorUserId: hostUserId,
      seat: 1,
      type: 'add-ai',
    }, 1_400, random).state;
    const replacement = state.seats.find((seat) => seat.seat === 1);
    if (!replacement || replacement.kind !== 'ai') throw new Error('Seat 1 was not re-seated.');
    // Eight other profiles remain seated, so the reroll must avoid the removed one.
    expect(replacement.aiProfileId).not.toBe(removedProfileId);
  });

  it('replaces or removes a seated AI when a later human join collides with its name', () => {
    const random = seededRandom(504);
    let state = newRoom(3, random);
    // The host is already named 'Kai', so the selector can never seat the club
    // profile 'kai-balanced' — the seated AI is whatever randomized profile the
    // selector chose for seat 1.
    state = send(state, {
      actorUserId: hostUserId,
      seat: 1,
      type: 'add-ai',
    }, 1_100, random).state;
    const seatedAi = state.seats.find((seat) => seat.seat === 1);
    if (!seatedAi || seatedAi.kind !== 'ai' || !seatedAi.aiProfileId) {
      throw new Error('Seat 1 must carry an AI.');
    }
    const collidingName = seatedAi.displayName.toLocaleUpperCase();

    // A guest joins with a case-insensitive collision on the AI's name. The AI
    // must be replaced with another eligible profile (or removed) — never left
    // sharing the human's identity.
    state = send(state, {
      actorUserId: guestUserId,
      displayName: collidingName,
      playerId: guestPlayerId,
      seat: 2,
      type: 'join',
    }, 1_200, random).state;

    const human = state.seats.find((seat) => seat.playerId === guestPlayerId);
    const remainingAi = state.seats.find((seat) => seat.seat === 1);
    expect(human?.displayName).toBe(collidingName);
    if (remainingAi) {
      expect(remainingAi.kind).toBe('ai');
      expect(remainingAi.aiProfileId).not.toBe(seatedAi.aiProfileId);
      expect(foldAiNameForComparison(remainingAi.displayName))
        .not.toBe(foldAiNameForComparison(collidingName));
    }
    const seatedProfiles = state.seats
      .filter((seat) => seat.kind === 'ai')
      .map((seat) => seat.aiProfileId);
    expect(new Set(seatedProfiles).size).toBe(seatedProfiles.length);
    // The colliding profile is remembered for that seat so a later re-add
    // rerolls away from it.
    expect(state.removedAiProfileIdBySeat[1]).toBe(seatedAi.aiProfileId);
  });

  it('never seats a duplicate or colliding profile even at maximum human blocking', () => {
    const random = seededRandom(505);
    const friendlyNames = [
      'Mara', 'Theo', 'Nova', 'June', 'Sol', 'Yoyo', 'Auntie Chi', 'Milo',
    ];
    let state = newRoom(9, random);
    state.config.aiDifficulty = 'friendly';
    // Seven guests plus the host block seven authored profiles by name
    // collision (the host name 'Kai' is not a friendly profile); with the
    // ten-profile friendly roster that still leaves three candidates, so a
    // fill must always succeed legally rather than loop or duplicate.
    friendlyNames.slice(0, 7).forEach((displayName, index) => {
      const userId = `user-guest-${index}`;
      state = send(state, {
        actorUserId: userId,
        displayName,
        playerId: `player-guest-${index}`,
        seat: index + 1,
        type: 'join',
      }, 1_100 + index, random).state;
    });
    expect(state.seats.filter((seat) => seat.kind === 'human')).toHaveLength(8);

    state = send(state, {
      actorUserId: hostUserId,
      seat: 8,
      type: 'add-ai',
    }, 1_200, random).state;
    const firstAi = state.seats.find((seat) => seat.seat === 8);
    if (!firstAi || firstAi.kind !== 'ai' || !firstAi.aiProfileId) {
      throw new Error('Seat 8 must carry an AI.');
    }

    // Remove-and-re-add now has only one profile left (the removed one is
    // excluded); it must seat that last legal candidate, never a collision.
    state = send(state, {
      actorUserId: hostUserId,
      seat: 8,
      type: 'remove-ai',
    }, 1_300, random).state;
    state = send(state, {
      actorUserId: hostUserId,
      seat: 8,
      type: 'add-ai',
    }, 1_400, random).state;
    const reseated = state.seats.find((seat) => seat.seat === 8);
    if (!reseated || reseated.kind !== 'ai') throw new Error('Seat 8 was not re-seated.');
    expect(reseated.aiProfileId).not.toBe(firstAi.aiProfileId);
    expect(friendlyNames.slice(0, 7).map((name) => name.toLocaleLowerCase()))
      .not.toContain(reseated.displayName.toLocaleLowerCase());
    const seatedProfiles = state.seats
      .filter((seat) => seat.kind === 'ai')
      .map((seat) => seat.aiProfileId);
    expect(new Set(seatedProfiles).size).toBe(seatedProfiles.length);
  });

  it('rerolls to the single remaining candidate without duplicating or looping', () => {
    const random = seededRandom(506);
    let state = newRoom(9, random);
    for (let seat = 1; seat < 9; seat += 1) {
      state = send(state, {
        actorUserId: hostUserId,
        seat,
        type: 'add-ai',
      }, 1_100 + seat, random).state;
    }
    const seatOne = state.seats.find((seat) => seat.seat === 1);
    const seatTwo = state.seats.find((seat) => seat.seat === 2);
    if (!seatOne || seatOne.kind !== 'ai' || !seatOne.aiProfileId) {
      throw new Error('Seat 1 must carry an AI profile.');
    }
    if (!seatTwo || seatTwo.kind !== 'ai' || !seatTwo.aiProfileId) {
      throw new Error('Seat 2 must carry an AI profile.');
    }
    state = send(state, {
      actorUserId: hostUserId,
      seat: 1,
      type: 'remove-ai',
    }, 1_300, random).state;
    state = send(state, {
      actorUserId: hostUserId,
      seat: 2,
      type: 'remove-ai',
    }, 1_400, random).state;
    // With seats 1 and 2 free, the removed-profile memories narrow both fills;
    // every seated profile must stay unique.
    state = send(state, {
      actorUserId: hostUserId,
      seat: 2,
      type: 'add-ai',
    }, 1_500, random).state;
    state = send(state, {
      actorUserId: hostUserId,
      seat: 1,
      type: 'add-ai',
    }, 1_600, random).state;
    const reseated = state.seats.find((seat) => seat.seat === 1);
    expect(reseated?.kind).toBe('ai');
    const profiles = state.seats
      .filter((seat) => seat.kind === 'ai')
      .map((seat) => seat.aiProfileId);
    expect(new Set(profiles).size).toBe(8);
  });
});

describe('ephemeral table moments', () => {
  it('derives the sender seat from the authenticated membership', () => {
    const random = seededRandom(3);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    if (!state.hand) throw new Error('The live-room fixture has no hand.');
    const handNumber = state.hand.handNumber;
    const versionBefore = state.version;
    const moment = evaluateTableMoment(state, {
      actorUserId: guestUserId,
      handNumber,
      id: 'moment:guest:1:cheer:1',
      reactionId: 'cheer',
    }, 5_000);
    expect(moment).toEqual({
      atMs: 5_000,
      handNumber,
      id: 'moment:guest:1:cheer:1',
      playerId: guestPlayerId,
      protocolVersion: 1,
      reactionId: 'cheer',
      roomId: 'room-test',
      seat: 1,
    });
    // Moments never mutate the authoritative state: no version bump, no new
    // processed command, no seat change, no durable trace.
    expect(state.version).toBe(versionBefore);
    expect(state.processedCommands).toHaveLength(4);
  });

  it('accepts every authored reaction id for a seated member', () => {
    const random = seededRandom(4);
    const state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    if (!state.hand) throw new Error('The live-room fixture has no hand.');
    for (const reactionId of TABLE_MOMENT_REACTION_IDS) {
      const moment = evaluateTableMoment(state, {
        actorUserId: hostUserId,
        handNumber: state.hand.handNumber,
        id: `moment:host:${reactionId}`,
        reactionId,
      }, 6_000);
      expect(moment.reactionId).toBe(reactionId);
      expect(moment.seat).toBe(0);
      expect(moment.playerId).toBe(hostPlayerId);
    }
  });

  it('rejects moments from non-members and non-live rooms', () => {
    const random = seededRandom(5);
    const state = newRoom(2, random);
    expectCoordinatorError(() => evaluateTableMoment(state, {
      actorUserId: 'someone-else',
      handNumber: 0,
      id: 'moment-1',
      reactionId: 'cheer',
    }, 2_000), 'forbidden');
    // Lobby: no live hand yet.
    expectCoordinatorError(() => evaluateTableMoment(state, {
      actorUserId: hostUserId,
      handNumber: 0,
      id: 'moment-1',
      reactionId: 'cheer',
    }, 2_000), 'invalid-command');
  });

  it('rejects stale and future hand sequences', () => {
    const random = seededRandom(6);
    const state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    if (!state.hand) throw new Error('The live-room fixture has no hand.');
    const handNumber = state.hand.handNumber;
    expectCoordinatorError(() => evaluateTableMoment(state, {
      actorUserId: hostUserId,
      handNumber: handNumber - 1,
      id: 'moment-1',
      reactionId: 'cheer',
    }, 5_000), 'invalid-command');
    expectCoordinatorError(() => evaluateTableMoment(state, {
      actorUserId: hostUserId,
      handNumber: handNumber + 1,
      id: 'moment-1',
      reactionId: 'cheer',
    }, 5_000), 'invalid-command');
  });

  it('rejects unknown reactions and unbounded payload ids', () => {
    const random = seededRandom(7);
    const state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    if (!state.hand) throw new Error('The live-room fixture has no hand.');
    expectCoordinatorError(() => evaluateTableMoment(state, {
      actorUserId: hostUserId,
      handNumber: state.hand?.handNumber ?? 0,
      id: 'moment-1',
      reactionId: 'banana' as TableMomentReactionId,
    }, 5_000), 'invalid-command');
    expectCoordinatorError(() => evaluateTableMoment(state, {
      actorUserId: hostUserId,
      handNumber: state.hand?.handNumber ?? 0,
      id: '',
      reactionId: 'cheer',
    }, 5_000), 'invalid-command');
    expectCoordinatorError(() => evaluateTableMoment(state, {
      actorUserId: hostUserId,
      handNumber: state.hand?.handNumber ?? 0,
      id: 'x'.repeat(TABLE_MOMENT_MAX_PAYLOAD_ID_LENGTH + 1),
      reactionId: 'cheer',
    }, 5_000), 'invalid-command');
  });

  it('requires a live hand: between-hands rooms reject moments', () => {
    const random = seededRandom(8);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    // The completed hand settles and the room moves between hands; moments
    // belong to live play only.
    expect(state.status).toBe('between-hands');
    expect(state.hand?.outcome).toBeTruthy();
    expectCoordinatorError(() => evaluateTableMoment(state, {
      actorUserId: hostUserId,
      handNumber: 0,
      id: 'moment-1',
      reactionId: 'cheer',
    }, 9_100), 'invalid-command');
  });
});
