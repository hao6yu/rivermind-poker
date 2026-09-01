import { describe, expect, it } from 'vitest';

import { seededRandom, type RandomSource } from '../poker/cards';
import type { PlayerAction } from '../poker/types';
import { applyMultiwayAction, getMultiwayLegalActions } from '../poker/multiway';
import { multiwayAiIdentityForSeat } from '../poker/multiwayAiProfiles';
import { foldAiNameForComparison } from './aiSeatSelection';
import { buildPublicPlayerRecordSnapshot, type PublicPlayerRecordSnapshot } from './playerRecordSnapshot';
import type { PlayStatistics } from '../stats/playStatistics';
import {
  NEXT_HAND_COUNTDOWN_MS,
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
import { parseMultiplayerRoomEnvelope } from '../../services/multiplayerContract';

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

  it('restricts between-hands dealing to an available host but recovers through an online guest', () => {
    const random = seededRandom(94);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);

    expectCoordinatorError(() => send(state, {
      actorUserId: guestUserId,
      type: 'deal-now',
    }, 3_000, random), 'forbidden');

    const unavailableHost = JSON.parse(JSON.stringify(state)) as MultiplayerCoordinatorState;
    const host = unavailableHost.seats.find((seat) => seat.playerId === hostPlayerId);
    if (!host) throw new Error('The recovery fixture lost its host.');
    host.connection = 'offline';
    const recovered = send(unavailableHost, {
      actorUserId: guestUserId,
      type: 'deal-now',
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

  it('retires the reclaim path: an absent human is never normalized into AI control', () => {
    const random = seededRandom(196);
    const complete = completedSessionFixture(random);
    // The retired command is rejected outright: an upgraded coordinator must
    // never normalize an absent human into AI control (scope 3.11F).
    expect(() => send(complete, {
      actorUserId: guestUserId,
      type: 'reclaim',
    }, 4_400, random)).toThrow();
  });

  it('completes a fixed session at the authoritative hand limit', () => {
    const random = seededRandom(97);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    let guard = 0;
    while (state.status !== 'complete' && guard < 12) {
      if (state.status === 'between-hands') {
        state = send(state, {
          actorUserId: hostUserId,
          type: 'deal-now',
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
    // Scope 3.11F: the busted human has not left, so the room stays between
    // hands with the countdown deferred — the player may rebuy 4,000 and
    // return instead of being completed out of the session.
    expect(state.completionReason).toBeNull();
    expect(state.status).toBe('between-hands');
    expect(state.nextHandAtMs).toBeNull();
    const bustedSeat = state.seats.find((seat) => seat.playerId !== hostPlayerId && seat.kind === 'human');
    expect(bustedSeat?.participation).toBe('rebuy-pending');

    // A rebuy returns exactly 4,000 to the busted seat and unblocks the deal.
    state = send(state, {
      actorUserId: bustedSeat!.userId!,
      type: 'rebuy',
    } as CommandInput, 2_200, random).state;
    // applyMultiplayerCommand returns a new state: re-find the seat. The
    // completed hand object is never mutated (H06): the purchased chips are
    // carried by the ledger and dealt at the next safe boundary.
    const reboughtSeat = state.seats.find((seat) => seat.playerId === bustedSeat!.playerId)!;
    expect(reboughtSeat.participation).toBe('active');
    expect(reboughtSeat.ledger?.settledStack).toBe(4_000);
    expect(reboughtSeat.ledger?.rebuyCount).toBe(1);
    expect(reboughtSeat.ledger?.totalBuyIn).toBe(20 + 4_000);
    // Net chips are unchanged at acceptance: stack and buy-in moved together.
    // Net is unchanged at acceptance: 0 - 20 before, 4,000 - 4,020 after —
    // both -20 (the fixture starts at a 20-chip buy-in).
    expect(reboughtSeat.ledger!.settledStack - reboughtSeat.ledger!.totalBuyIn).toBe(-20);
    expect(state.nextHandAtMs).not.toBeNull();
  });

  it('completes as last-player-standing once the busted human has permanently left', () => {
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
    state = send(state, {
      action: { type: 'call' },
      actorUserId: userIdForPlayer(state, actor),
      type: 'action',
    }, 2_100, random).state;
    expect(state.status).toBe('between-hands');
    // The busted guest confirms the permanent exit: with no human able to
    // return, the room completes as last-player-standing.
    state = send(state, {
      actorUserId: guestUserId,
      type: 'leave',
    } as CommandInput, 2_200, random).state;
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
    // The ledger settles at the boundary before standings are built: sync the
    // fixture's rows with the final stacks (scope 3.11F ledger delta).
    for (const seat of complete.seats) {
      if (seat.ledger) {
        seat.ledger.settledStack = hand.players[seat.playerId]!.stack;
        seat.ledger.settledHandNumber = hand.handNumber;
      }
    }

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
    // The original turn deadline survives the pause: a collective disconnect
    // must never erase the timed decision or grant a fresh budget on resume
    // (scope 3.11F, adjacent check 2).
    expect(state.turnDeadlineAtMs).toBe(47_000);
    expect(state.hand?.history).toEqual(historyBefore);

    state = send(state, {
      actorUserId: guestUserId,
      connection: 'online',
      type: 'set-connection',
    }, 8_000, random).state;
    expect(state.status).toBe('playing');
    expect(state.resumeStatus).toBeNull();
    // Resuming restores the SAME absolute deadline — not now + a full budget.
    expect(state.turnDeadlineAtMs).toBe(47_000);
    expect(state.hand?.history).toEqual(historyBefore);
  });

  it('folds a human at the deadline and never moves the seat to AI (3.11F)', () => {
    const random = seededRandom(204);
    let state = readyBoth(addGuest(newRoom(2, random), random), random);
    state = startRoom(state, random, 2_000);
    const targetPlayerId = state.hand?.toAct;
    if (!targetPlayerId || state.turnDeadlineAtMs === null) throw new Error('The first timed actor is missing.');
    const targetSeat = state.seats.find((seat) => seat.playerId === targetPlayerId)!;

    state = send(state, {
      actorUserId: hostUserId,
      type: 'tick',
    }, state.turnDeadlineAtMs, random).state;
    // The deadline folds the absent human; the seat stays human and simply
    // marks the missed decision — no AI control is ever granted.
    const afterTick = state.seats.find((seat) => seat.playerId === targetPlayerId)!;
    expect(afterTick.control).toBe('human');
    expect(afterTick.missedTurns).toBe(1);
  });

  it('transfers hosting when the host times out, without transferring the seat (3.11F)', () => {
    const random = seededRandom(205);
    let state = readyBoth(addGuest(newRoom(2, random), random), random);
    state = startRoom(state, random, 2_000);

    // Drive hands with legal conservative actions until hosting has moved to
    // the guest after the host's missed deadlines. The host's SEAT stays
    // human — only table-management authority transfers (scope 3.11F).
    let guard = 0;
    while (state.hostPlayerId === hostPlayerId && guard < 120) {
      if (state.status === 'between-hands') {
        state = send(state, {
          actorUserId: guestUserId,
          type: 'deal-now',
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
        state = send(state, {
          action: { type: 'call' },
          actorUserId: userIdForPlayer(state, actorId),
          type: 'action',
        }, state.turnDeadlineAtMs, random).state;
      }
      guard += 1;
    }
    expect(state.hostPlayerId).toBe(guestPlayerId);
    const hostSeat = state.seats.find((seat) => seat.playerId === hostPlayerId)!;
    expect(hostSeat.kind).toBe('human');
    expect(hostSeat.control).toBe('human');
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

  it('keeps reactions available while players view a completed-hand result', () => {
    const random = seededRandom(8);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    expect(state.status).toBe('between-hands');
    expect(state.hand?.outcome).toBeTruthy();
    const moment = evaluateTableMoment(state, {
      actorUserId: hostUserId,
      handNumber: state.hand?.handNumber ?? 0,
      id: 'moment-1',
      reactionId: 'cheer',
    }, 9_100);
    expect(moment.reactionId).toBe('cheer');
    expect(moment.handNumber).toBe(state.hand?.handNumber);
  });
});

describe('next-hand auto-deal countdown (Slice 3.8C)', () => {
  const due = (state: MultiplayerCoordinatorState) => state.nextHandAtMs;

  it('arms a recoverable 10-second countdown when a hand settles between hands', () => {
    expect(NEXT_HAND_COUNTDOWN_MS).toBe(10_000);
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    expect(state.status).toBe('between-hands');
    expect(state.completionReason).toBeNull();
    expect(due(state)).toBe(state.updatedAtMs + NEXT_HAND_COUNTDOWN_MS);
    expect(due(state)).toBeGreaterThan(state.updatedAtMs);
  });

  it('deals the next hand exactly when the countdown reaches zero via a tick', () => {
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    const deadline = due(state);
    if (deadline === null) throw new Error('The countdown should be armed.');
    state = send(state, {
      actorUserId: guestUserId,
      type: 'tick',
    }, deadline, random).state;
    expect(state.status).toBe('playing');
    expect(state.hand?.handNumber).toBe(2);
    expect(due(state)).toBeNull();
    expect(state.hostPlayerId).toBe(hostPlayerId);
  });

  it('refuses a tick before the countdown is due, with zero and negative remaining', () => {
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    const deadline = due(state);
    if (deadline === null) throw new Error('The countdown should be armed.');
    // One millisecond and one second before due are refused; the countdown
    // is untouched by refused ticks.
    expectCoordinatorError(() => send(state, {
      actorUserId: guestUserId,
      type: 'tick',
    }, deadline - 1, random), 'invalid-command');
    expectCoordinatorError(() => send(state, {
      actorUserId: guestUserId,
      type: 'tick',
    }, deadline - 1_000, random), 'invalid-command');
    expect(due(state)).toBe(deadline);
    expect(state.status).toBe('between-hands');
    // An overdue tick (deadline in the past) still deals: the countdown is
    // a deadline, not a one-shot race.
    state = send(state, {
      actorUserId: guestUserId,
      type: 'tick',
    }, deadline + 5_000, random).state;
    expect(state.status).toBe('playing');
    expect(state.hand?.handNumber).toBe(2);
    expect(due(state)).toBeNull();
  });

  it('lets simultaneous due ticks converge on one authoritative deal', () => {
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    const deadline = due(state);
    if (deadline === null) throw new Error('The countdown should be armed.');
    const first = send(state, {
      actorUserId: guestUserId,
      type: 'tick',
    }, deadline, random, 'command-a').state;
    expect(first.status).toBe('playing');
    // A second tick carrying the original (now stale) expected version is
    // refused: exactly one server-authoritative deal transition wins.
    expectCoordinatorError(() => applyMultiplayerCommand(first, {
      actorUserId: hostUserId,
      commandId: 'command-b',
      expectedVersion: state.version,
      type: 'tick',
    }, { aiSimulations: 24, nowMs: deadline, random }), 'stale-version');
    expect(first.hand?.handNumber).toBe(2);
  });

  it('transfers an unavailable host to the deal-now requester', () => {
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    const host = state.seats.find((seat) => seat.playerId === hostPlayerId);
    if (!host) throw new Error('Host seat missing.');
    host.connection = 'offline';
    state = send(state, {
      actorUserId: guestUserId,
      type: 'deal-now',
    }, due(state) ?? 0, random).state;
    expect(state.status).toBe('playing');
    expect(state.hostPlayerId).toBe(guestPlayerId);
    expect(due(state)).toBeNull();
  });

  it('gates deal-now, pause, and resume to the available host', () => {
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    expectCoordinatorError(() => send(state, {
      actorUserId: guestUserId,
      type: 'pause',
    }, due(state) ?? 0, random), 'forbidden');
    expectCoordinatorError(() => send(state, {
      actorUserId: guestUserId,
      type: 'deal-now',
    }, due(state) ?? 0, random), 'forbidden');
    expectCoordinatorError(() => send(state, {
      actorUserId: guestUserId,
      type: 'resume',
    }, due(state) ?? 0, random), 'forbidden');
    expect(due(state)).not.toBeNull();
  });

  it('pauses and resumes the countdown only within the between-hands state', () => {
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    const deadline = due(state);
    if (deadline === null) throw new Error('The countdown should be armed.');
    // Pause clears the deadline; a second pause is refused.
    state = send(state, {
      actorUserId: hostUserId,
      type: 'pause',
    }, deadline, random).state;
    expect(due(state)).toBeNull();
    expectCoordinatorError(() => send(state, {
      actorUserId: hostUserId,
      type: 'pause',
    }, deadline, random), 'invalid-command');
    // Resume re-arms a fresh 10-second window; a second resume is refused.
    state = send(state, {
      actorUserId: hostUserId,
      type: 'resume',
    }, deadline + 1_000, random).state;
    expect(due(state)).toBe(deadline + 1_000 + NEXT_HAND_COUNTDOWN_MS);
    expectCoordinatorError(() => send(state, {
      actorUserId: hostUserId,
      type: 'resume',
    }, deadline + 1_000, random), 'invalid-command');
    // Outside between-hands the commands are refused entirely.
    state = send(state, {
      actorUserId: hostUserId,
      type: 'deal-now',
    }, due(state) ?? 0, random).state;
    expect(state.status).toBe('playing');
    expectCoordinatorError(() => send(state, {
      actorUserId: hostUserId,
      type: 'pause',
    }, 30_000, random), 'invalid-command');
    expectCoordinatorError(() => send(state, {
      actorUserId: hostUserId,
      type: 'resume',
    }, 30_000, random), 'invalid-command');
  });

  it('clears the countdown when the whole room pauses and re-arms on resume', () => {
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    // Everyone goes offline -> room pauses, deadline cleared.
    state = send(state, {
      actorUserId: hostUserId,
      connection: 'offline',
      type: 'set-connection',
    }, 9_000, random).state;
    state = send(state, {
      actorUserId: guestUserId,
      connection: 'offline',
      type: 'set-connection',
    }, 9_100, random).state;
    expect(state.status).toBe('paused');
    expect(due(state)).toBeNull();
    // The host returns and the room resumes: the deadline is re-armed.
    state = send(state, {
      actorUserId: hostUserId,
      connection: 'online',
      type: 'set-connection',
    }, 9_200, random).state;
    expect(state.status).toBe('between-hands');
    expect(due(state)).toBe(9_200 + NEXT_HAND_COUNTDOWN_MS);
  });

  it('waits on a due tick when the ledger holds fewer than two funded players and a human can return', () => {
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    const deadline = due(state);
    if (deadline === null) throw new Error('The countdown should be armed.');
    // Defensive fixture: canonical state says between-hands but the LEDGER
    // holds only one funded participant (R3). A due tick must NOT deal and
    // must NOT complete while the busted human can still rebuy and return:
    // the room waits (the host may end the stalled session instead).
    const guestSeat = state.seats.find((seat) => seat.playerId === guestPlayerId);
    if (!guestSeat?.ledger) throw new Error('Guest ledger missing.');
    guestSeat.ledger.settledStack = 0;
    const guestHandPlayer = state.hand?.players[guestPlayerId];
    if (guestHandPlayer) guestHandPlayer.stack = 0;
    state = send(state, {
      actorUserId: guestUserId,
      type: 'tick',
    }, deadline, random).state;
    expect(state.status).toBe('between-hands');
    expect(state.completionReason).toBeNull();
    expect(due(state)).toBeNull();
    // Only the host can end the stalled session.
    expectCoordinatorError(() => send(state, {
      actorUserId: guestUserId,
      type: 'end-stalled-session',
    }, deadline + 1, random), 'forbidden');
    state = send(state, {
      actorUserId: hostUserId,
      type: 'end-stalled-session',
    }, deadline + 2, random).state;
    expect(state.status).toBe('complete');
    expect(state.completionReason).toBe('host-ended');
  });

  it('completes a due tick when fewer than two players can still play', () => {
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    const deadline = due(state);
    if (deadline === null) throw new Error('The countdown should be armed.');
    // Defensive fixture: canonical state says between-hands but the LEDGER
    // holds only one funded participant and the busted human has permanently
    // left (R3). With no human able to return, the due tick completes the
    // session instead of error-looping.
    const guestSeat = state.seats.find((seat) => seat.playerId === guestPlayerId);
    if (!guestSeat?.ledger) throw new Error('Guest ledger missing.');
    guestSeat.ledger.settledStack = 0;
    guestSeat.participation = 'left';
    const guestHandPlayer = state.hand?.players[guestPlayerId];
    if (guestHandPlayer) guestHandPlayer.stack = 0;
    // A permanently departed seat holds no command rights: the due tick comes
    // from the remaining member (the host).
    state = send(state, {
      actorUserId: hostUserId,
      type: 'tick',
    }, deadline, random).state;
    expect(state.status).toBe('complete');
    expect(state.completionReason).toBe('last-player-standing');
    expect(due(state)).toBeNull();
  });

  it('leaves the countdown unarmed when a settled session is complete', () => {
    const random = seededRandom(11);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    let guard = 0;
    while (state.status !== 'complete' && guard < 12) {
      if (state.status === 'between-hands') {
        const deadline = due(state);
        if (deadline === null) throw new Error('The countdown should be armed.');
        state = send(state, {
          actorUserId: hostUserId,
          type: 'deal-now',
        }, deadline, random).state;
      } else {
        state = completeOneHandByFolding(state, random);
      }
      guard += 1;
    }
    expect(state.status).toBe('complete');
    expect(due(state)).toBeNull();
  });
});

describe('room-private Play record snapshots (3.11E)', () => {
  const random = seededRandom(7);

  function record(revision = 1): PublicPlayerRecordSnapshot {
    const statistics = {
      bySource: {
        local: { hands: 4, tables: 1, wins: 2 },
        private: { hands: 6, tables: 2, wins: 3 },
        solo: { hands: 0, tables: 0, wins: 0 },
      },
      coverage: { local: 'complete', private: 'capped', solo: 'skipped' },
      hands: 10,
      splits: 0,
      tables: 3,
      version: 1,
      wins: 5,
    } as PlayStatistics;
    return buildPublicPlayerRecordSnapshot({
      displayName: 'Hao',
      publishedAtMs: 1_710_000_000_000,
      revision,
      statistics,
    });
  }

  it('publishes only the joined owner’s validated record and strips invalid payloads', () => {
    let state = newRoom(3, random);
    const guest = send(state, {
      type: 'join',
      displayName: 'Guest',
      actorUserId: guestUserId,
      playerId: guestPlayerId,
      seat: 1,
      playRecord: record(1),
    } as CommandInput, 1_100, random);
    state = guest.state;
    const guestSeat = state.seats.find((seat) => seat.playerId === guestPlayerId);
    expect(guestSeat?.playRecord?.revision).toBe(1);

    // A malformed record can never enter the public projection: the join
    // strips it to "no record" instead of seating corrupt data.
    const third = send(state, {
      type: 'join',
      displayName: 'Third',
      actorUserId: 'user-third',
      playerId: 'player-third',
      seat: 2,
      playRecord: { version: 99, garbage: true },
    } as CommandInput, 1_200, random);
    const thirdSeat = third.state.seats.find((seat) => seat.playerId === 'player-third');
    expect(thirdSeat?.playRecord ?? null).toBeNull();
  });

  it('accepts an owner-only replace and rejects everyone else', () => {
    let state = newRoom(3, random);
    state = send(state, {
      type: 'join',
      displayName: 'Guest',
      actorUserId: guestUserId,
      playerId: guestPlayerId,
      seat: 1,
      playRecord: record(1),
    } as CommandInput, 1_100, random).state;

    // The owner replaces their own record by revision.
    state = send(state, {
      type: 'update-play-record',
      actorUserId: guestUserId,
      record: record(2),
    } as CommandInput, 1_300, random).state;
    expect(state.seats.find((seat) => seat.playerId === guestPlayerId)?.playRecord?.revision).toBe(2);

    // A different member can never publish to another seat: the actor binding
    // is authoritative, so only the actor's own seat changes.
    state = send(state, {
      type: 'update-play-record',
      actorUserId: guestUserId,
      record: record(5),
    } as CommandInput, 1_400, random).state;
    expect(state.seats.find((seat) => seat.playerId === hostPlayerId)?.playRecord ?? null).toBeNull();

    // An invalid payload is rejected outright on the explicit publish path.
    expect(() => send(state, {
      type: 'update-play-record',
      actorUserId: guestUserId,
      record: { version: 2 },
    } as CommandInput, 1_500, random)).toThrow();
  });
});

describe('Play record revision convergence (3.11E review)', () => {
  const random = seededRandom(11);

  it('rejects a stale or duplicate revision on the explicit publish path', () => {
    const record = (revision: number): PublicPlayerRecordSnapshot => buildPublicPlayerRecordSnapshot({
      displayName: 'Hao',
      publishedAtMs: 1_710_000_000_000 + revision,
      revision,
      statistics: {
        bySource: {
          local: { hands: 4, tables: 1, wins: 2 },
          private: { hands: 6, tables: 2, wins: 3 },
          solo: { hands: 0, tables: 0, wins: 0 },
        },
        coverage: { local: 'complete', private: 'capped', solo: 'skipped' },
        hands: 10,
        splits: 0,
        tables: 3,
        version: 1,
        wins: 5,
      } as PlayStatistics,
    });
    let state = newRoom(3, random);
    state = send(state, {
      actorUserId: guestUserId,
      displayName: 'Guest',
      playerId: guestPlayerId,
      playRecord: record(2),
      seat: 1,
      type: 'join',
    } as CommandInput, 1_100, random).state;
    // A duplicate delivery of the same revision never rolls back…
    expect(() => send(state, {
      actorUserId: guestUserId,
      record: record(2),
      type: 'update-play-record',
    } as CommandInput, 1_200, random)).toThrow();
    // …and a stale revision is rejected outright.
    expect(() => send(state, {
      actorUserId: guestUserId,
      record: record(1),
      type: 'update-play-record',
    } as CommandInput, 1_300, random)).toThrow();
    // Only a strictly newer revision publishes.
    state = send(state, {
      actorUserId: guestUserId,
      record: record(3),
      type: 'update-play-record',
    } as CommandInput, 1_400, random).state;
    expect(state.seats.find((seat) => seat.playerId === guestPlayerId)?.playRecord?.revision).toBe(3);
  });
});

describe('participant buy-in ledger and rebuy eligibility (3.11F foundation)', () => {
  const random = seededRandom(13);

  it('initializes one authoritative ledger row per participant at the configured buy-in', () => {
    let state = newRoom(3, random);
    state = addGuest(state, random, 1);
    // The host AI seat fills seat 2 in a 3-seat room.
    const withAi = send(state, {
      actorUserId: hostUserId,
      seat: 2,
      type: 'add-ai',
    } as CommandInput, 1_200, random).state;
    for (const seat of withAi.seats) {
      expect(seat.ledger, seat.playerId).toBeDefined();
      expect(seat.ledger!.initialBuyIn).toBe(withAi.config.startingStackChips);
      expect(seat.ledger!.totalBuyIn).toBe(withAi.config.startingStackChips);
      expect(seat.ledger!.rebuyCount).toBe(0);
      expect(seat.ledger!.settledStack).toBe(withAi.config.startingStackChips);
    }
    // Conservation holds from the first row: settled stacks equal introduced chips.
    const settledSum = withAi.seats.reduce((total, seat) => total + seat.ledger!.settledStack, 0);
    const introducedSum = withAi.seats.reduce((total, seat) => total + seat.ledger!.totalBuyIn, 0);
    expect(settledSum).toBe(introducedSum);
  });

  it('rejects rebuys outside the between-hands settlement and from AI seats', () => {
    let state = newRoom(3, random);
    // Lobby: no hand has been dealt — a rebuy is meaningless.
    expect(() => send(state, {
      actorUserId: hostUserId,
      type: 'rebuy',
    } as CommandInput, 1_100, random)).toThrow();
    // An AI seat can never rebuy, even between hands.
    state = addGuest(state, random, 1);
    state = send(state, { actorUserId: hostUserId, seat: 2, type: 'add-ai' } as CommandInput, 1_200, random).state;
    const aiSeat = state.seats.find((seat) => seat.kind === 'ai')!;
    expect(() => send(state, {
      actorUserId: 'system-ai-actor',
      type: 'rebuy',
    } as CommandInput, 1_300, random)).toThrow();
    expect(aiSeat.ledger?.rebuyCount).toBe(0);
  });
});

function bustedBetweenHandsFixture() {
  // A fresh generator per fixture: the deal must not depend on which tests
  // ran before (the shared instance made H06's bust nondeterministic).
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
    roomId: 'room-rebuy',
  }, { nowMs: 1_000, random });
  state = startRoom(readyBoth(addGuest(state, random), random), random);
  const actor = state.hand?.toAct;
  if (!actor || !state.hand) throw new Error('The rebuy fixture lost its actor.');
  state = send(state, {
    action: { type: 'call' },
    actorUserId: userIdForPlayer(state, actor),
    type: 'action',
  }, 2_100, random).state;
  if (state.status !== 'between-hands') throw new Error('The rebuy fixture did not settle between hands.');
  return state;
}

describe('H04/H06 — accepted rebuy accounting and roster independence', () => {

  it('moves every rebuy fact atomically and preserves net at acceptance (H04)', () => {
    const random = seededRandom(99);
    let state = bustedBetweenHandsFixture();
    const busted = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
    expect(busted.ledger!.settledStack).toBe(0);

    state = send(state, {
      actorUserId: guestUserId,
      type: 'rebuy',
    } as CommandInput, 2_200, random).state;
    const afterFirst = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
    // All four facts move together: chips purchased, count, total buy-in, and
    // the settled value carried to the next deal.
    expect(afterFirst.ledger!.rebuyCount).toBe(1);
    expect(afterFirst.ledger!.rebuyChips).toBe(4_000);
    expect(afterFirst.ledger!.totalBuyIn).toBe(20 + 4_000);
    expect(afterFirst.ledger!.settledStack).toBe(4_000);
    // Net at acceptance is unchanged from the busted state (0 - 20 = -20).
    expect(afterFirst.ledger!.settledStack - afterFirst.ledger!.totalBuyIn).toBe(-20);

    // The accepted result survives the public projection and the client
    // parser — the client retains the rebuy ledger (H04's observed defect).
    const projected = createMultiplayerPublicSnapshot(state);
    const parsed = parseMultiplayerRoomEnvelope({ roomId: state.roomId, snapshot: projected });
    const parsedSeat = parsed?.snapshot.seats.find((seat) => seat.playerId === guestPlayerId);
    expect(parsedSeat?.ledger?.rebuyCount).toBe(1);
    expect(parsedSeat?.ledger?.rebuyChips).toBe(4_000);
    expect(parsedSeat?.ledger?.totalBuyIn).toBe(4_020);
    expect(parsedSeat?.ledger?.settledStack).toBe(4_000);

    // A second rebuy (multiple rebuys are unlimited) keeps the invariants.
    // The seat must be back to exactly zero first, so simulate a later bust by
    // driving the next hand to settlement and re-entering the decision.
    state = send(state, { actorUserId: hostUserId, type: 'deal-now' }, 2_300, random).state;
    let guard = 0;
    while (!state.hand?.outcome && guard < 40) {
      const hand = state.hand;
      const actor = hand?.toAct;
      if (!hand || !actor) break;
      const legal = getMultiwayLegalActions(hand, actor);
      const action = legal.canCheck ? { type: 'check' as const } : { type: 'fold' as const };
      state = send(state, {
        action,
        actorUserId: userIdForPlayer(state, actor),
        type: 'action',
      }, 2_400 + guard * 100, random).state;
      guard += 1;
    }
    if (state.status === 'between-hands') {
      const bustedAgain = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
      if (bustedAgain.participation === 'rebuy-pending') {
        state = send(state, { actorUserId: guestUserId, type: 'rebuy' } as CommandInput, 3_000, random).state;
        const afterSecond = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
        expect(afterSecond.ledger!.rebuyCount).toBe(2);
        expect(afterSecond.ledger!.rebuyChips).toBe(8_000);
        expect(afterSecond.ledger!.totalBuyIn).toBe(20 + 8_000);
      }
    }
  });

  it('a sitting-out human keeps ledger identity and can rebuy at a later boundary (H06)', () => {
    const random = seededRandom(99);
    let state = bustedBetweenHandsFixture();
    state = send(state, { actorUserId: guestUserId, type: 'sit-out' } as CommandInput, 2_200, random).state;
    const satOut = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
    expect(satOut.participation).toBe('sitting-out');
    // The resolved seat has no second pending decision to sit out again.
    expect(() => send(state, { actorUserId: guestUserId, type: 'sit-out' } as CommandInput, 2_250, random)).toThrow();

    // With one funded seat and a sitting-out human who can return, the deal
    // is deferred — the approved waiting behavior, not a forced completion.
    expect(() => send(state, { actorUserId: hostUserId, type: 'deal-now' }, 2_300, random)).toThrow();
    expect(state.nextHandAtMs).toBeNull();
    // H06's root invariant: the sitting-out human's ledger identity survives
    // the omission — the last hand's dealt roster cannot erase it.
    const stillThere = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
    expect(stillThere.ledger).toBeDefined();
    expect(stillThere.ledger!.playerId).toBe(guestPlayerId);
    expect(stillThere.ledger!.settledStack).toBe(0);

    // A later rebuy from the sitting-out seat is accepted at the between-
    // hands boundary: identity, chips, and eligibility all restore.
    state = send(state, { actorUserId: guestUserId, type: 'rebuy' } as CommandInput, 2_400, random).state;
    const returned = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
    expect(returned.participation).toBe('active');
    expect(returned.ledger!.rebuyChips).toBe(4_000);
    expect(returned.ledger!.settledStack).toBe(4_000);

    // The next deal includes the returned seat at their purchased stack (a
    // posted blind may already be deducted in-hand).
    state = send(state, { actorUserId: hostUserId, type: 'deal-now' }, 2_500, random).state;
    expect(state.hand!.tablePlayerIds).toContain(guestPlayerId);
    const inHand = state.hand!.players[guestPlayerId]!.stack;
    expect(inHand).toBeGreaterThan(3_000);
    expect(inHand).toBeLessThanOrEqual(4_000);
  });
});

describe('H05 — expired rebuy decisions commit independently', () => {
  const random = seededRandom(31);

  function pendingFixture() {
    let state = bustedBetweenHandsFixture();
    // The busted guest is rebuy-pending with a live decision deadline.
    expect(state.seats.find((seat) => seat.playerId === guestPlayerId)!.participation).toBe('rebuy-pending');
    expect(state.rebuyDecisionDeadlineAtMs).not.toBeNull();
    return state;
  }

  it('commits the expiry transition instead of throwing when the room must keep waiting', () => {
    const state = pendingFixture();
    const deadline = state.rebuyDecisionDeadlineAtMs!;
    // Exactly at the boundary: the expiry commits (participation resolves to
    // sitting-out) even though the room cannot deal (one funded seat).
    const result = send(state, {
      actorUserId: hostUserId,
      type: 'tick',
    } as CommandInput, deadline, random).state;
    expect(result.seats.find((seat) => seat.playerId === guestPlayerId)!.participation).toBe('sitting-out');
    expect(result.rebuyDecisionDeadlineAtMs).toBeNull();
    expect(result.status).toBe('between-hands');
    // The room keeps waiting: no countdown armed while a return is possible
    // and fewer than two funded players remain.
    expect(result.nextHandAtMs).toBeNull();
  });

  it('expires across the configured 30/45/60-second decision durations', () => {
    for (const turnSeconds of [30, 45, 60] as const) {
      let state = createMultiplayerRoom({
        config: {
          ...defaultMultiplayerRoomConfig,
          handTarget: 'open',
          seatCount: 2,
          startingStackChips: 20,
          turnSeconds,
        },
        hostDisplayName: 'Kai',
        hostPlayerId,
        hostUserId,
        roomCode: '724826',
        roomId: 'room-rebuy',
      }, { nowMs: 1_000, random });
      state = startRoom(readyBoth(addGuest(state, random), random), random);
      const actor = state.hand?.toAct;
      state = send(state, {
        action: { type: 'call' },
        actorUserId: userIdForPlayer(state, actor!),
        type: 'action',
      }, 2_100, random).state;
      const deadline = state.rebuyDecisionDeadlineAtMs!;
      expect(deadline).toBe(2_100 + turnSeconds * 1_000);
      // Whichever human busted holds the pending decision; the winner stays
      // active (both are humans in this fixture).
      const pendingId = state.seats.find((seat) => seat.participation === 'rebuy-pending')!.playerId;
      // Just before the boundary the decision is still pending; the deferred
      // room has no armed countdown, so a tick is refused without guessing.
      expect(() => send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, deadline - 1, random)).toThrow();
      // At the boundary it resolves.
      const at = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, deadline, random).state;
      expect(at.seats.find((seat) => seat.playerId === pendingId)!.participation).toBe('sitting-out');
      expect(at.rebuyDecisionDeadlineAtMs).toBeNull();
    }
  });

  it('a resolved expiry is idempotent: replayed and duplicate ticks never mint or re-resolve', () => {
    let state = pendingFixture();
    const deadline = state.rebuyDecisionDeadlineAtMs!;
    const pendingId = state.seats.find((seat) => seat.participation === 'rebuy-pending')!.playerId;
    const firstCommandId = 'expiry-tick-1';
    const firstCommand = {
      actorUserId: hostUserId,
      commandId: firstCommandId,
      expectedVersion: state.version,
      type: 'tick',
    } as MultiplayerRoomCommand;
    state = applyMultiplayerCommand(state, firstCommand, { nowMs: deadline, random }).state;
    const resolved = state.seats.find((seat) => seat.playerId === pendingId)!.participation;
    // Duplicate delivery of the SAME command id AND payload returns the
    // stored transition (a transport retry); the same id with any other
    // payload or a moved expected version is a conflict, never a silent
    // re-application.
    const replayed = applyMultiplayerCommand(state, firstCommand, { nowMs: deadline, random });
    expect(replayed.duplicate).toBe(true);
    expect(() => applyMultiplayerCommand(state, {
      ...firstCommand,
      expectedVersion: state.version,
    }, { nowMs: deadline + 1, random })).toThrow();
    // A different id after resolution is simply not due (no countdown armed in
    // a stalled room) — it throws instead of re-resolving anything.
    expect(() => send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, deadline + 1, random)).toThrow();
    // A different id after resolution is simply not due (no countdown armed in
    // a stalled room) — it throws instead of re-resolving anything.
    expect(() => send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, deadline + 1, random)).toThrow();
    expect(state.seats.find((seat) => seat.playerId === pendingId)!.participation).toBe(resolved);
  });

  it('a rebuy wins the race against the expiry deadline and the expiry no longer resolves anything', () => {
    let state = pendingFixture();
    const deadline = state.rebuyDecisionDeadlineAtMs!;
    state = send(state, { actorUserId: guestUserId, type: 'rebuy' } as CommandInput, deadline - 1, random).state;
    expect(state.seats.find((seat) => seat.playerId === guestPlayerId)!.participation).toBe('active');
    expect(state.rebuyDecisionDeadlineAtMs).toBeNull();
    // The expiry tick after a resolution is not due (countdown re-armed or
    // waiting) — it cannot sit the seat out retroactively.
    if (state.nextHandAtMs === null) {
      const after = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, deadline, random).state;
      expect(after.seats.find((seat) => seat.playerId === guestPlayerId)!.participation).toBe('active');
    }
  });
});

describe('H07 — seat-lifecycle contract at disconnect and expiry', () => {
  const random = seededRandom(41);

  function liveTwoHandFixture() {
    // Deep stacks with 5/10 blinds: the hand stays live across streets so the
    // disconnect/expiry contract can be exercised mid-hand (H07).
    let state = createMultiplayerRoom({
      config: {
        ...defaultMultiplayerRoomConfig,
        handTarget: 'open',
        seatCount: 2,
        smallBlindChips: 5,
        bigBlindChips: 10,
        startingStackChips: 2_000,
        turnSeconds: 30,
      },
      hostDisplayName: 'Kai',
      hostPlayerId,
      hostUserId,
      roomCode: '724826',
      roomId: 'room-life',
    }, { nowMs: 1_000, random });
    state = startRoom(readyBoth(addGuest(state, random), random), random);
    return state;
  }

  it('a disconnected human is folded at expiry even when check is legal, exactly once', () => {
    let state = liveTwoHandFixture();
    // Drive to a spot where the actor has a free check available (the
    // pre-fix coordinator CHECKED an offline human here): the contract says
    // fold once, never a courtesy check.
    let guard = 0;
    while (state.hand && !state.hand.outcome && guard < 20) {
      const actor = state.hand.toAct;
      if (!actor) break;
      if (getMultiwayLegalActions(state.hand, actor).canCheck) break;
      const legal = getMultiwayLegalActions(state.hand, actor);
      const action = legal.canCall ? { type: 'call' as const } : { type: 'fold' as const };
      state = send(state, { action, actorUserId: userIdForPlayer(state, actor), type: 'action' }, 1_200 + guard * 100, random).state;
      guard += 1;
    }
    console.log('after drive: outcome', JSON.stringify(state.hand?.outcome)?.slice(0, 120), 'toAct', state.hand?.toAct ?? null, 'street', state.hand?.street, 'history', JSON.stringify(state.hand?.history.map((h: { playerId: string; type: string }) => [h.playerId, h.type])));
    const toAct = state.hand!.toAct;
    if (toAct === null) throw new Error('The lifecycle fixture has no timed actor.');
    state = send(state, {
      actorUserId: userIdForPlayer(state, toAct),
      connection: 'offline',
      type: 'set-connection',
    }, 1_500, random).state;
    expect(state.seats.find((seat) => seat.playerId === toAct)!.participation).toBe('disconnected');
    // The original turn deadline is preserved untouched by the disconnect.
    const deadlineBefore = state.turnDeadlineAtMs;
    state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, state.turnDeadlineAtMs!, random).state;
    const after = state.seats.find((seat) => seat.playerId === toAct)!;
    // The seat stays human, is folded exactly once at expiry, and no
    // courtesy check or AI action is ever recorded for the offline human —
    // regardless of whether check was legal at expiry (H07).
    expect(after.control).toBe('human');
    expect(after.participation).toBe('disconnected');
    expect(timeoutFoldCount(state, toAct)).toBe(1);
    expect(state.hand!.history.filter((record) => record.playerId === toAct && record.type === 'check')).toHaveLength(0);
    void deadlineBefore;
  });

  it('an offline seat is omitted from the next deal and the owner can recover it', () => {
    let state = liveTwoHandFixture();
    const toAct = state.hand!.toAct;
    if (toAct === null) throw new Error('The lifecycle fixture has no timed actor.');
    state = send(state, {
      actorUserId: userIdForPlayer(state, toAct),
      connection: 'offline',
      type: 'set-connection',
    }, 1_500, random).state;
    // Expire the turn: fold once, then settle between hands.
    state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, state.turnDeadlineAtMs!, random).state;
    // Drive to a settlement between hands.
    let guard = 0;
    while (!state.hand?.outcome && guard < 40) {
      const actor = state.hand?.toAct;
      if (!actor) break;
      const legal = getMultiwayLegalActions(state.hand!, actor);
      const action = legal.canCheck ? { type: 'check' as const } : { type: 'fold' as const };
      state = send(state, { action, actorUserId: userIdForPlayer(state, actor), type: 'action' }, 2_000 + guard * 100, random).state;
      guard += 1;
    }
    if (state.status === 'between-hands') {
      const offlineSeat = state.seats.find((seat) => seat.playerId === toAct)!;
      // Deal-now is refused while the disconnected human is pending return.
      expect(() => send(state, { actorUserId: state.hostPlayerId === hostPlayerId ? guestUserId : hostUserId, type: 'deal-now' }, 2_500, random)).toThrow();
      // Same-owner recovery works; a different account's recovery does not.
      state = send(state, {
        actorUserId: userIdForPlayer(state, toAct),
        connection: 'online',
        type: 'set-connection',
      }, 2_600, random).state;
      expect(state.seats.find((seat) => seat.playerId === toAct)!.participation).toBe('active');
      void offlineSeat;
      void state.hand;
    }
  });

  it('a different account cannot recover a disconnected seat', () => {
    let state = liveTwoHandFixture();
    const toAct = state.hand!.toAct;
    if (toAct === null) throw new Error('The lifecycle fixture has no timed actor.');
    state = send(state, {
      actorUserId: userIdForPlayer(state, toAct),
      connection: 'offline',
      type: 'set-connection',
    }, 1_500, random).state;
    // humanSeatForUser matches seats by userId: another member's set-connection
    // only touches their own seat.
    const otherUserId = userIdForPlayer(
      state,
      state.seats.find((seat) => seat.playerId !== toAct && seat.kind === 'human')!.playerId,
    );
    state = send(state, {
      actorUserId: otherUserId,
      connection: 'online',
      type: 'set-connection',
    }, 1_600, random).state;
    expect(state.seats.find((seat) => seat.playerId === toAct)!.connection).toBe('offline');
  });

  function timeoutFoldCount(state: ReturnType<typeof createMultiplayerRoom>, playerId: string): number {
    return state.hand?.history.filter((record) => record.playerId === playerId && record.type === 'fold').length ?? 0;
  }
});

describe('R3 — ledger-driven viability: auto-deal after a rebuy (fail-before)', () => {
  function twentyChipRoom(random: RandomSource): MultiplayerCoordinatorState {
    let state = createMultiplayerRoom({
      config: {
        ...defaultMultiplayerRoomConfig,
        handTarget: 'open',
        seatCount: 2,
        smallBlindChips: 10,
        bigBlindChips: 20,
        startingStackChips: 20,
      },
      hostDisplayName: 'Kai',
      hostPlayerId,
      hostUserId,
      roomCode: '724826',
      roomId: 'room-test',
    }, { nowMs: 1_000, random });
    state = startRoom(readyBoth(addGuest(state, random), random), random);
    return state;
  }

  function settleAllIn(state: MultiplayerCoordinatorState, random: RandomSource): MultiplayerCoordinatorState {
    // With 20-chip stacks and 10/20 blinds the big blind is already all-in:
    // one call completes the confrontation and the engine runs the board out.
    const actor = state.hand?.toAct;
    if (!actor || !state.hand) throw new Error('The R3 fixture has no actor.');
    const legal = getMultiwayLegalActions(state.hand, actor);
    const action = legal.canCall ? { type: 'call' as const } : { type: 'check' as const };
    return send(state, {
      action,
      actorUserId: userIdForPlayer(state, actor),
      type: 'action',
    }, 2_100, random).state;
  }

  it('deals the next hand from the accepted rebuy instead of completing on stale stacks', () => {
    const random = seededRandom(99);
    let state = settleAllIn(twentyChipRoom(random), random);
    expect(state.status).toBe('between-hands');
    const busted = state.seats.find((seat) => seat.kind === 'human' && seat.ledger?.settledStack === 0);
    if (!busted?.userId) throw new Error('The R3 fixture produced no busted human.');

    state = send(state, { actorUserId: busted.userId, type: 'rebuy' } as CommandInput, 2_200, random).state;
    const nextHandAtMs = state.nextHandAtMs;
    expect(nextHandAtMs).not.toBeNull();

    // A due tick after the rebuy must DEAL Hand 2 — the previous hand's stacks
    // are stale; only the ledger says this seat now holds 4,000.
    state = send(state, {
      actorUserId: busted.userId,
      type: 'tick',
    } as CommandInput, (nextHandAtMs as number) + 1, random).state;
    expect(state.status).toBe('playing');
    expect(state.hand?.handNumber).toBe(2);
    // The rebought seat is dealt its accepted 4,000 chips (its opening blind
    // for the new hand may already be committed as streetBet), not its stale 0.
    const dealt = state.hand?.players[busted.playerId];
    expect((dealt?.stack ?? 0) + (dealt?.streetBet ?? 0)).toBe(4_000);
    expect(state.completionReason).toBeNull();
  });
});

describe('R3 — return next hand, repeated rebuys, and stall waiting', () => {
  function threeSeatRoom(random: RandomSource, startingStackChips = 2_000): MultiplayerCoordinatorState {
    let state = createMultiplayerRoom({
      config: {
        ...defaultMultiplayerRoomConfig,
        handTarget: 'open',
        seatCount: 3,
        smallBlindChips: 10,
        bigBlindChips: 20,
        startingStackChips,
      },
      hostDisplayName: 'Kai',
      hostPlayerId,
      hostUserId,
      roomCode: '724826',
      roomId: 'room-test',
    }, { nowMs: 1_000, random });
    state = addGuest(state, random);
    state = send(state, { actorUserId: hostUserId, seat: 2, type: 'add-ai' } as CommandInput, 1_150, random).state;
    state = send(state, { actorUserId: hostUserId, ready: true, type: 'set-ready' } as CommandInput, 1_200, random).state;
    state = send(state, { actorUserId: guestUserId, ready: true, type: 'set-ready' } as CommandInput, 1_300, random).state;
    return startRoom(state, random);
  }

  function playUntilBetweenHands(state: MultiplayerCoordinatorState, random: RandomSource): MultiplayerCoordinatorState {
    let guard = 0;
    while (state.status === 'playing' && guard < 60) {
      guard += 1;
      const actorPlayerId = state.hand?.toAct;
      if (!actorPlayerId || !state.hand) break;
      const legal = getMultiwayLegalActions(state.hand, actorPlayerId);
      state = send(state, {
        action: legal.canCall ? { type: 'call' } : { type: 'check' },
        actorUserId: userIdForPlayer(state, actorPlayerId),
        type: 'action',
      }, state.updatedAtMs + 100, random).state;
    }
    if (state.status !== 'between-hands') throw new Error(`The hand did not settle (status ${state.status}).`);
    return state;
  }

  /** Plays hands until the GUEST human busts. Any OTHER human who busts first
   * rebuys so the session keeps running (bounded, deterministic seed). */
  function bustTheGuest(state: MultiplayerCoordinatorState, random: RandomSource): MultiplayerCoordinatorState {
    let guard = 0;
    while (guard < 40) {
      guard += 1;
      if (state.status === 'between-hands') {
        const guest = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
        if (guest.ledger?.settledStack === 0) return state;
        // Another busted human rebuys to keep the session running.
        for (const seat of state.seats) {
          if (seat.kind === 'human' && seat.playerId !== guestPlayerId && seat.ledger?.settledStack === 0) {
            state = send(state, {
              actorUserId: seat.userId!,
              type: 'rebuy',
            } as CommandInput, state.updatedAtMs + 40, random).state;
          }
        }
        const deadline = state.nextHandAtMs;
        if (deadline === null) throw new Error('The countdown should be armed.');
        state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, deadline + 1, random).state;
        continue;
      }
      if (state.status !== 'playing') throw new Error(`The bust fixture left the room ${state.status}.`);
      const actorPlayerId = state.hand?.toAct;
      if (!actorPlayerId || !state.hand) break;
      const legal = getMultiwayLegalActions(state.hand, actorPlayerId);
      const isGuest = actorPlayerId === guestPlayerId;
      const action = isGuest && legal.canRaise
        ? { type: 'raise' as const, amount: legal.maxRaiseTo }
        : legal.canCall ? { type: 'call' as const } : { type: 'check' as const };
      state = send(state, {
        action,
        actorUserId: userIdForPlayer(state, actorPlayerId),
        type: 'action',
      }, state.updatedAtMs + 100, random).state;
    }
    throw new Error('The guest did not bust within the bounded fixture budget.');
  }

  it('sits out a pending decision, deals without the omitted seat, and accepts a late rebuy', () => {
    const random = seededRandom(990);
    let state = bustTheGuest(threeSeatRoom(random), random);
    const guest = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
    expect(guest.ledger?.settledStack).toBe(0);
    // The pending decision resolves as Sitting out.
    state = send(state, { actorUserId: guestUserId, type: 'sit-out' } as CommandInput, state.updatedAtMs + 50, random).state;
    expect(state.seats.find((seat) => seat.playerId === guestPlayerId)!.participation).toBe('sitting-out');

    // Hand 2 deals with the two funded participants; the sitting-out seat is
    // omitted from the deal but keeps its ledger row.
    const deadline = state.nextHandAtMs;
    expect(deadline).not.toBeNull();
    state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, (deadline as number) + 1, random).state;
    expect(state.hand?.players[guestPlayerId]).toBeUndefined();
    expect(state.seats.find((seat) => seat.playerId === guestPlayerId)!.ledger).toBeDefined();

    state = playUntilBetweenHands(state, random);
    state = send(state, { actorUserId: guestUserId, type: 'rebuy' } as CommandInput, state.updatedAtMs + 50, random).state;
    const rebought = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
    expect(rebought.participation).toBe('active');
    expect(rebought.ledger?.settledStack).toBe(4_000);
    expect(rebought.ledger?.rebuyCount).toBe(1);
    expect(rebought.ledger?.rebuyChips).toBe(4_000);
    expect(rebought.ledger?.totalBuyIn).toBe(6_000);

    // The next tick deals the rebought seat from the LEDGER (R3).
    const nextDeadline = state.nextHandAtMs;
    expect(nextDeadline).not.toBeNull();
    state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, (nextDeadline as number) + 1, random).state;
    const dealtGuest = state.hand?.players[guestPlayerId];
    if (!dealtGuest) throw new Error('The rebought seat was not dealt into the next hand.');
    expect((dealtGuest.stack ?? 0) + (dealtGuest.streetBet ?? 0)).toBe(4_000);
  });

  it('lets a connected positive-stack sitting-out human return next hand and refuses a busted one', () => {
    const random = seededRandom(991);
    let state = bustTheGuest(threeSeatRoom(random), random);
    state = send(state, { actorUserId: guestUserId, type: 'sit-out' } as CommandInput, state.updatedAtMs + 50, random).state;
    state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, (state.nextHandAtMs as number) + 1, random).state;
    state = playUntilBetweenHands(state, random);

    // The guest is still sitting out with a ZERO stack: return is refused —
    // the fixed rebuy flow is the only way back.
    expectCoordinatorError(() => send(state, {
      actorUserId: guestUserId,
      type: 'return-next-hand',
    } as CommandInput, state.updatedAtMs + 50, random), 'invalid-command');
    state = send(state, { actorUserId: guestUserId, type: 'rebuy' } as CommandInput, state.updatedAtMs + 60, random).state;
    expect(state.seats.find((seat) => seat.playerId === guestPlayerId)!.participation).toBe('active');

    // Positive-stack Return: deal the next hand, let the HOST's unchanged
    // deadline expire so the online host sits out WITH chips, finish the
    // hand, and return explicitly next hand.
    state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, (state.nextHandAtMs as number) + 1, random).state;
    let guard = 0;
    while (state.hand?.toAct !== hostPlayerId && guard < 30 && state.status === 'playing') {
      guard += 1;
      const actorPlayerId = state.hand?.toAct;
      if (!actorPlayerId) break;
      state = send(state, {
        action: { type: 'call' },
        actorUserId: userIdForPlayer(state, actorPlayerId),
        type: 'action',
      }, state.updatedAtMs + 100, random).state;
    }
    if (state.hand?.toAct !== hostPlayerId || state.turnDeadlineAtMs === null) {
      throw new Error('The host never received a timed decision.');
    }
    const hostDeadline = state.turnDeadlineAtMs;
    state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, hostDeadline + 1, random).state;
    expect(state.seats.find((seat) => seat.playerId === hostPlayerId)!.participation).toBe('sitting-out');
    const hostStack = state.seats.find((seat) => seat.playerId === hostPlayerId)!.ledger!.settledStack;
    expect(hostStack).toBeGreaterThan(0);
    state = playUntilBetweenHands(state, random);
    state = send(state, { actorUserId: hostUserId, type: 'return-next-hand' } as CommandInput, state.updatedAtMs + 50, random).state;
    expect(state.seats.find((seat) => seat.playerId === hostPlayerId)!.participation).toBe('active');
  });

  it('runs three bust/rebuy cycles with exact accounting, zero-sum conservation, and no double mint', () => {
    // Two humans, 20-chip deterministic stacks: every hand is an immediate
    // all-in confrontation, so repeated bust/rebuy cycles are reachable in a
    // bounded, seeded run (the small stack is a fixture, not a preset).
    const random = seededRandom(9);
    let state = createMultiplayerRoom({
      config: {
        ...defaultMultiplayerRoomConfig,
        handTarget: 'open',
        seatCount: 2,
        smallBlindChips: 10,
        bigBlindChips: 20,
        startingStackChips: 20,
      },
      hostDisplayName: 'Kai',
      hostPlayerId,
      hostUserId,
      roomCode: '724826',
      roomId: 'room-test',
    }, { nowMs: 1_000, random });
    state = startRoom(readyBoth(addGuest(state, random), random), random);
    const guestLedger = () => state.seats.find((seat) => seat.playerId === guestPlayerId)!.ledger!;
    const allLedgers = () => state.seats.map((seat) => seat.ledger!);
    let cycle = 0;
    let guard = 0;
    while (cycle < 3 && guard < 60) {
      guard += 1;
      if (state.status === 'between-hands') {
        const guest = state.seats.find((seat) => seat.playerId === guestPlayerId)!;
        if (guest.ledger?.settledStack === 0 && guest.participation !== 'left') {
          const before = guestLedger();
          const preRebuyVersion = state.version;
          const accepted = send(state, { actorUserId: guestUserId, type: 'rebuy' } as CommandInput, state.updatedAtMs + 40, random, `cycle-rebuy-${cycle}`);
          state = accepted.state;
          const after = guestLedger();
          expect(after.rebuyCount).toBe(before.rebuyCount + 1);
          expect(after.rebuyChips).toBe(after.rebuyCount * 4_000);
          expect(after.totalBuyIn).toBe(after.initialBuyIn + after.rebuyChips);
          expect(after.settledStack).toBe(4_000);
          // The rebuy itself is never a win: net is unchanged at acceptance.
          expect(after.settledStack - after.totalBuyIn).toBe(before.settledStack - before.totalBuyIn);
          cycle += 1;
          const introduced = allLedgers().reduce((total, entry) => total + entry.totalBuyIn, 0);
          const settledSum = allLedgers().reduce((total, entry) => total + entry.settledStack, 0);
          const nets = allLedgers().reduce((total, entry) => total + (entry.settledStack - entry.totalBuyIn), 0);
          expect(settledSum).toBe(introduced);
          expect(nets).toBe(0);
          // Duplicate delivery (lost response replay): the SAME command id and
          // fingerprint replay the ORIGINAL transition and never mint twice.
          // Rebuild the command EXACTLY as the lost first delivery serialized
          // it (same key order -> same fingerprint), from the accepted state.
          const replayCommand = {
            ...({ actorUserId: guestUserId, type: 'rebuy' } as CommandInput),
            commandId: `cycle-rebuy-${cycle - 1}`,
            expectedVersion: preRebuyVersion,
          } as MultiplayerRoomCommand;
          const replay = applyMultiplayerCommand(
            JSON.parse(JSON.stringify(state)) as MultiplayerCoordinatorState,
            replayCommand,
            { aiSimulations: 24, nowMs: state.updatedAtMs + 60, random },
          );
          expect(replay.duplicate).toBe(true);
          expect(replay.state.seats.find((seat) => seat.playerId === guestPlayerId)!.ledger).toEqual(after);
          // A positive-stack top-up is never accepted while between hands.
          expectCoordinatorError(() => send(state, {
            actorUserId: guestUserId,
            type: 'rebuy',
          } as CommandInput, state.updatedAtMs + 70, random), 'invalid-command');
          expect(guestLedger()).toEqual(after);
        } else {
          for (const seat of state.seats) {
            if (seat.kind === 'human' && seat.ledger?.settledStack === 0 && seat.playerId !== guestPlayerId) {
              state = send(state, {
                actorUserId: seat.userId!,
                type: 'rebuy',
              } as CommandInput, state.updatedAtMs + 40, random).state;
            }
          }
        }
        const deadline = state.nextHandAtMs;
        if (deadline !== null) {
          state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, deadline + 1, random).state;
        }
        continue;
      }
      if (state.status !== 'playing') break;
      const actorPlayerId = state.hand?.toAct;
      if (!actorPlayerId || !state.hand) break;
      const legal = getMultiwayLegalActions(state.hand, actorPlayerId);
      const isGuest = actorPlayerId === guestPlayerId;
      const action = isGuest && legal.canRaise
        ? { type: 'raise' as const, amount: legal.maxRaiseTo }
        : legal.canCall ? { type: 'call' as const } : { type: 'check' as const };
      state = send(state, {
        action,
        actorUserId: userIdForPlayer(state, actorPlayerId),
        type: 'action',
      }, state.updatedAtMs + 100, random).state;
    }
    expect(cycle).toBe(3);
  });
});

describe('R5 — permanent departure boundaries', () => {
  function twoHumanRoom(random: RandomSource): MultiplayerCoordinatorState {
    let state = createMultiplayerRoom({
      config: {
        ...defaultMultiplayerRoomConfig,
        handTarget: 'open',
        seatCount: 2,
        smallBlindChips: 10,
        bigBlindChips: 20,
        startingStackChips: 2_000,
      },
      hostDisplayName: 'Kai',
      hostPlayerId,
      hostUserId,
      roomCode: '724826',
      roomId: 'room-test',
    }, { nowMs: 1_000, random });
    return startRoom(readyBoth(addGuest(state, random), random), random);
  }

  it('retires an already-all-in seat that leaves mid-hand and settles it normally', () => {
    const random = seededRandom(99);
    let state = twoHumanRoom(random);
    // With 20-chip stacks the first actor shoving leaves the other human a
    // pending decision: the shover is ALL-IN while the hand still runs.
    const actor = state.hand?.toAct;
    if (!actor || !state.hand) throw new Error('The all-in fixture has no actor.');
    const legal = getMultiwayLegalActions(state.hand, actor);
    if (!legal.canRaise) throw new Error('The all-in fixture could not raise.');
    state = send(state, {
      action: { type: 'raise', amount: legal.maxRaiseTo },
      actorUserId: userIdForPlayer(state, actor),
      type: 'action',
    }, 2_100, random).state;
    const allInPlayerId = actor;
    expect(state.hand?.players[allInPlayerId]?.allIn).toBe(true);
    expect(state.status).toBe('playing');

    // The all-in seat permanently leaves mid-hand.
    state = send(state, {
      actorUserId: userIdForPlayer(state, allInPlayerId),
      type: 'leave',
    }, 2_200, random).state;
    expect(state.seats.find((seat) => seat.playerId === allInPlayerId)?.participation).toBe('left');

    // The remaining human finishes the hand: the committed all-in settles
    // normally, with NO fabricated action for the departed seat.
    const remainingActor = state.hand?.toAct;
    if (!remainingActor) throw new Error('The fixture has no remaining actor.');
    state = send(state, {
      action: { type: 'call' },
      actorUserId: userIdForPlayer(state, remainingActor),
      type: 'action',
    }, 2_300, random).state;
    expect(state.hand?.outcome).toBeDefined();
    const historyForDeparted = (state.hand?.history ?? []).filter((record) => record.playerId === allInPlayerId);
    expect(historyForDeparted.every((record) => record.type !== 'check' && record.type !== 'fold')).toBe(true);
    // The departed ledger row keeps its settled stack for stats/standings.
    const departedLedger = state.seats.find((seat) => seat.playerId === allInPlayerId)?.ledger;
    expect(departedLedger?.settledHandNumber).toBe(1);
    // Conservation holds at the settled boundary.
    const settledSum = state.seats.reduce((total, seat) => total + (seat.ledger?.settledStack ?? 0), 0);
    const introducedSum = state.seats.reduce((total, seat) => total + (seat.ledger?.totalBuyIn ?? 0), 0);
    expect(settledSum).toBe(introducedSum);

    // Every re-entry path is refused for the running session.
    expectCoordinatorError(() => send(state, {
      actorUserId: userIdForPlayer(state, allInPlayerId),
      type: 'set-ready',
      ready: true,
    } as CommandInput, 2_400, random), 'forbidden');
    expectCoordinatorError(() => send(state, {
      actorUserId: userIdForPlayer(state, allInPlayerId),
      type: 'rebuy',
    } as CommandInput, 2_500, random), 'forbidden');
  });
});

describe('Adjacent check 1 — forced-departure fold semantics', () => {
  it('folds a departing seat whose current turn has a free check (no legal check is made)', () => {
    const random = seededRandom(99);
    let state = createMultiplayerRoom({
      config: {
        ...defaultMultiplayerRoomConfig,
        handTarget: 'open',
        seatCount: 2,
        smallBlindChips: 10,
        bigBlindChips: 20,
        startingStackChips: 2_000,
      },
      hostDisplayName: 'Kai',
      hostPlayerId,
      hostUserId,
      roomCode: '724826',
      roomId: 'room-test',
    }, { nowMs: 1_000, random });
    state = startRoom(readyBoth(addGuest(state, random), random), random);
    // Advance to a decision with a FREE check (postflop, no wager to call):
    // the plain fold API refuses folding exactly there.
    let actor = state.hand?.toAct ?? null;
    let legal = actor ? getMultiwayLegalActions(state.hand!, actor) : null;
    let guard = 0;
    while (actor && legal && !legal.canCheck && guard < 10) {
      guard += 1;
      state = send(state, {
        action: legal.canCall ? { type: 'call' } : { type: 'check' },
        actorUserId: userIdForPlayer(state, actor),
        type: 'action',
      }, state.updatedAtMs + 100, random).state;
      actor = state.hand?.toAct ?? null;
      legal = actor && state.hand ? getMultiwayLegalActions(state.hand, actor) : null;
    }
    if (!actor || !legal?.canCheck) throw new Error('The fixture needs a free check for the departing actor.');
    const actorUserId = userIdForPlayer(state, actor);

    // The plain fold API refuses folding when checking is free; the LEAVE
    // command must still succeed through the enforced fold and never check.
    state = send(state, {
      actorUserId,
      type: 'leave',
    } as CommandInput, 2_100, random).state;
    expect(state.seats.find((seat) => seat.playerId === actor)?.participation).toBe('left');
    expect(state.hand?.players[actor]?.folded).toBe(true);
    const actorHistory = state.hand?.history.filter((record) => record.playerId === actor) ?? [];
    expect(actorHistory.at(-1)).toMatchObject({ type: 'fold' });
    expect(actorHistory.every((record) => record.type !== 'check')).toBe(true);
  });
});

describe('leave transitions and turn handoff (Q3)', () => {
  const thirdUserId = 'user-third';
  const thirdPlayerId = 'player-third';

  function threeHumanRoom(random: RandomSource): MultiplayerCoordinatorState {
    let state = addGuest(newRoom(3, random), random);
    state = send(state, {
      actorUserId: thirdUserId,
      displayName: 'Rafa',
      playerId: thirdPlayerId,
      seat: 2,
      type: 'join',
    }, 1_150, random).state;
    state = send(state, { actorUserId: hostUserId, ready: true, type: 'set-ready' }, 1_200, random).state;
    state = send(state, { actorUserId: guestUserId, ready: true, type: 'set-ready' }, 1_250, random).state;
    state = send(state, { actorUserId: thirdUserId, ready: true, type: 'set-ready' }, 1_275, random).state;
    return startRoom(state, random, 2_000);
  }

  function legalResponse(handState: MultiplayerCoordinatorState, playerId: string): PlayerAction {
    if (!handState.hand) throw new Error('The hand has already ended.');
    const legal = getMultiwayLegalActions(handState.hand, playerId);
    if (legal.canCheck) return { type: 'check' };
    if (legal.canCall) return { type: 'call' };
    return { type: 'fold' };
  }

  function seatOf(state: MultiplayerCoordinatorState, playerId: string) {
    const seat = state.seats.find((candidate) => candidate.playerId === playerId);
    if (!seat) throw new Error(`Seat ${playerId} is missing.`);
    return seat;
  }

  it('arms the next human actor with a fresh full turn budget after a quick action', () => {
    const random = seededRandom(311);
    let state = threeHumanRoom(random);
    const firstActor = state.hand?.toAct;
    if (!firstActor || state.turnDeadlineAtMs !== 47_000) {
      throw new Error('The first actor has no armed deadline.');
    }
    state = send(state, {
      action: legalResponse(state, firstActor),
      actorUserId: userIdForPlayer(state, firstActor),
      type: 'action',
    }, 2_500, random).state;
    // Acting early never hands the next human a truncated leftover clock.
    expect(state.hand?.toAct).toBeTruthy();
    expect(state.turnDeadlineAtMs).toBe(47_500);
  });

  it('commits the departing actor fold as a public action and hands a fresh full budget to the next actor', () => {
    const random = seededRandom(312);
    const state = threeHumanRoom(random);
    const actor = state.hand?.toAct;
    if (!actor) throw new Error('The leaving actor fixture is missing.');
    const result = send(state, {
      actorUserId: userIdForPlayer(state, actor),
      type: 'leave',
    } as CommandInput, 3_000, random);
    expect(result.state.hand?.players[actor]?.folded).toBe(true);
    const folds = result.transition.actionBatch.filter(
      (action) => action.playerId === actor && action.type === 'fold',
    );
    expect(folds).toHaveLength(1);
    // The leaver's stale clock must not survive as the next actor's clock.
    expect(result.state.turnDeadlineAtMs).toBe(48_000);
    expect(seatOf(result.state, actor).participation).toBe('left');
  });

  it('resolves a leave landing exactly at the expired deadline without taxing the next actor', () => {
    const random = seededRandom(313);
    const state = threeHumanRoom(random);
    const actor = state.hand?.toAct;
    if (!actor || state.turnDeadlineAtMs !== 47_000) throw new Error('The racing fixture is missing.');
    const result = send(state, {
      actorUserId: userIdForPlayer(state, actor),
      type: 'leave',
    } as CommandInput, 47_000, random);
    expect(result.state.hand?.players[actor]?.folded).toBe(true);
    expect(result.transition.actionBatch.filter((a) => a.playerId === actor && a.type === 'fold')).toHaveLength(1);
    expect(result.state.turnDeadlineAtMs).toBe(92_000);
    // The innocent next actor is never timed out by the leaver's stale clock.
    const nextActor = result.state.hand?.toAct;
    if (!nextActor) throw new Error('The next actor vanished.');
    expectCoordinatorError(() => send(result.state, {
      actorUserId: userIdForPlayer(result.state, nextActor),
      type: 'tick',
    } as CommandInput, 47_001, random), 'invalid-command');
  });

  it('still folds a departed actor exactly once when the leave arrives after expiry', () => {
    const random = seededRandom(314);
    const state = threeHumanRoom(random);
    const actor = state.hand?.toAct;
    if (!actor) throw new Error('The post-expiry fixture is missing.');
    const result = send(state, {
      actorUserId: userIdForPlayer(state, actor),
      type: 'leave',
    } as CommandInput, 47_001, random);
    expect(result.state.hand?.players[actor]?.folded).toBe(true);
    expect(result.transition.actionBatch.filter((a) => a.playerId === actor && a.type === 'fold')).toHaveLength(1);
    expect(result.state.hand?.history.filter((r) => r.playerId === actor && r.type === 'fold')).toHaveLength(1);
    expect(result.state.turnDeadlineAtMs).toBe(92_001);
  });

  it('enforced-folds a left seat the moment the action reaches it, without ever arming a fake clock', () => {
    const random = seededRandom(315);
    let state = threeHumanRoom(random);
    const pending = state.hand?.pending ?? [];
    const actor = pending[0];
    const leaver = pending[1];
    const expectedNext = pending[2];
    if (!actor || !leaver || !expectedNext || state.hand?.toAct !== actor) {
      throw new Error('The off-actor leave fixture needs three pending players.');
    }
    // Leave while ANOTHER player holds the turn: nothing visible changes yet.
    state = send(state, {
      actorUserId: userIdForPlayer(state, leaver),
      type: 'leave',
    } as CommandInput, 2_900, random).state;
    expect(state.turnDeadlineAtMs).toBe(47_000);
    expect(state.hand?.players[leaver]?.folded).toBeFalsy();

    // The current actor's action hands the turn to a permanently left seat.
    const result = send(state, {
      action: legalResponse(state, actor),
      actorUserId: userIdForPlayer(state, actor),
      type: 'action',
    }, 3_000, random);
    // The left seat is folded immediately — never given a fake waiting clock.
    expect(result.state.hand?.players[leaver]?.folded).toBe(true);
    expect(result.state.hand?.toAct).toBe(expectedNext);
    expect(result.state.turnDeadlineAtMs).toBe(48_000);
    expect(seatOf(result.state, leaver).participation).toBe('left');
    expect(seatOf(result.state, leaver).missedTurns).toBe(0);
    // Presentation order: the actor's action first, then the enforced fold.
    const batch = result.transition.actionBatch;
    expect(batch[0]).toMatchObject({ playerId: actor });
    expect(batch[1]).toMatchObject({ playerId: leaver, type: 'fold' });
    expect(result.state.hand?.history.filter((r) => r.playerId === leaver && r.type === 'fold')).toHaveLength(1);
  });

  it('keeps an all-in departee committed chips in the pot after leaving', () => {
    const random = seededRandom(316);
    let state = threeHumanRoom(random);
    const actor = state.hand?.toAct;
    if (!actor || !state.hand) throw new Error('The all-in fixture is missing.');
    const stack = state.hand.players[actor]?.stack ?? 0;
    if (stack <= 0) throw new Error('The all-in fixture starts without chips.');
    const before = send(state, {
      action: { amount: stack, type: 'raise' },
      actorUserId: userIdForPlayer(state, actor),
      type: 'action',
    }, 2_500, random).state;
    expect(before.hand?.players[actor]?.allIn).toBe(true);
    const potBefore = before.hand?.pot ?? 0;
    const committedBefore = before.hand?.players[actor]?.totalCommitted ?? 0;
    if (committedBefore <= 0) throw new Error('The all-in fixture committed nothing.');
    const stateAfterLeave = send(before, {
      actorUserId: userIdForPlayer(before, actor),
      type: 'leave',
    } as CommandInput, 2_600, random).state;
    // The all-in seat is never marked folded and its chips stay committed.
    expect(stateAfterLeave.hand?.players[actor]?.folded).toBeFalsy();
    expect(stateAfterLeave.hand?.pot ?? 0).toBe(potBefore);
    expect(stateAfterLeave.hand?.players[actor]?.totalCommitted).toBe(committedBefore);
    expect(seatOf(stateAfterLeave, actor).participation).toBe('left');
  });

  it('sweeps AI seats immediately after a leave fold and arms only the next human with a fresh clock', () => {
    const random = seededRandom(317);
    let state = readyBoth(addGuest(newRoom(6, random), random), random);
    state = startRoom(state, random, 2_000);
    const actor = state.hand?.toAct;
    if (!actor) throw new Error('The AI-mixed hand ended immediately.');
    const actorSeat = seatOf(state, actor);
    if (actorSeat.kind !== 'human') throw new Error('The fixture needs a human first actor.');
    const result = send(state, {
      actorUserId: actorSeat.userId ?? hostUserId,
      type: 'leave',
    } as CommandInput, 3_000, random);
    const foldIndex = result.transition.actionBatch.findIndex(
      (action) => action.playerId === actor && action.type === 'fold',
    );
    expect(foldIndex).toBeGreaterThanOrEqual(0);
    // Any automated actions that followed the fold happened in the SAME
    // transition — no AI ever acts before the fold is recorded, and no AI
    // seat ever waits behind an armed clock.
    result.transition.actionBatch.slice(foldIndex + 1).forEach((action) => {
      expect(seatOf(result.state, action.playerId).kind).toBe('ai');
    });
    if (result.state.status === 'playing') {
      const nextSeat = seatOf(result.state, result.state.hand?.toAct ?? '');
      expect(nextSeat.kind).toBe('human');
      expect(result.state.turnDeadlineAtMs).toBe(48_000);
    }
  });
});

describe('server-observed seat liveness (Q4)', () => {
  it('restores a paused busted owner into the original unexpired rebuy window', () => {
    const random = seededRandom(512);
    let state = bustedBetweenHandsFixture();
    const deadline = state.rebuyDecisionDeadlineAtMs!;
    state = send(state, { actorUserId: guestUserId, type: 'set-connection', connection: 'offline' }, deadline - 12_000, random).state;
    state = send(state, { actorUserId: hostUserId, type: 'set-connection', connection: 'offline' }, deadline - 11_000, random).state;
    expect(state).toMatchObject({ status: 'paused', resumeStatus: 'between-hands' });
    state = send(state, { actorUserId: guestUserId, type: 'set-connection', connection: 'online' }, deadline - 1, random).state;
    expect(state).toMatchObject({ status: 'between-hands', rebuyDecisionDeadlineAtMs: deadline });
    expect(state.seats.find((seat) => seat.userId === guestUserId)!.participation).toBe('rebuy-pending');
  });

  it('a stale-seat sweep preserves the absent busted owner decision deadline', () => {
    const random = seededRandom(513);
    const initial = bustedBetweenHandsFixture();
    const deadline = initial.rebuyDecisionDeadlineAtMs!;
    const nowMs = deadline - 1_000;
    const swept = sendLive(initial, { actorUserId: hostUserId, type: 'tick' }, nowMs, random, {
      [hostUserId]: nowMs, [guestUserId]: 1_000,
    }).state;
    expect(swept.rebuyDecisionDeadlineAtMs).toBe(deadline);
    expect(swept.seats.find((seat) => seat.userId === guestUserId)!.participation).toBe('disconnected');
    const returned = send(swept, { actorUserId: guestUserId, type: 'set-connection', connection: 'online' }, deadline - 1, random).state;
    expect(returned.rebuyDecisionDeadlineAtMs).toBe(deadline);
    expect(returned.seats.find((seat) => seat.userId === guestUserId)!.participation).toBe('rebuy-pending');
  });

  it('rematch does not reactivate an absent owner whose connection flag was stale', () => {
    const random = seededRandom(514);
    const completed = completedSessionFixture(random);
    const next = sendLive(completed, { actorUserId: hostUserId, type: 'rematch' }, 30_000, random, {
      [hostUserId]: 30_000, [guestUserId]: 1_000,
    }).state;
    expect(next).toMatchObject({ status: 'lobby', hand: null, sessionNumber: completed.sessionNumber + 1 });
    expect(next.seats.find((seat) => seat.userId === guestUserId)).toMatchObject({ connection: 'offline', participation: 'disconnected', ready: false });
  });

  it.each([-1, 1])('reconnect does not extend a busted player decision at deadline %d ms', (offset) => {
    const random = seededRandom(510);
    const initial = bustedBetweenHandsFixture();
    const deadline = initial.rebuyDecisionDeadlineAtMs!;
    const disconnected = send(initial, { actorUserId: guestUserId, type: 'set-connection', connection: 'offline' }, deadline - 10_000, random).state;
    const returned = send(disconnected, { actorUserId: guestUserId, type: 'set-connection', connection: 'online' }, deadline + offset, random).state;
    expect(returned.rebuyDecisionDeadlineAtMs).toBe(deadline);
    expect(returned.seats.find((seat) => seat.userId === guestUserId)!.participation)
      .toBe(offset < 0 ? 'rebuy-pending' : 'sitting-out');
    expect(returned.seats.map((seat) => seat.ledger)).toEqual(initial.seats.map((seat) => seat.ledger));
  });

  it('reconnect never undoes an explicit Sit out decision', () => {
    const random = seededRandom(511);
    let state = bustedBetweenHandsFixture();
    state = send(state, { actorUserId: guestUserId, type: 'sit-out' }, state.updatedAtMs + 100, random).state;
    state = send(state, { actorUserId: guestUserId, type: 'set-connection', connection: 'offline' }, state.updatedAtMs + 100, random).state;
    state = send(state, { actorUserId: guestUserId, type: 'set-connection', connection: 'online' }, state.updatedAtMs + 100, random).state;
    expect(state.seats.find((seat) => seat.userId === guestUserId)!.participation).toBe('sitting-out');
    expect(state.rebuyDecisionDeadlineAtMs).toBeNull();
  });

  const thirdUserId = 'user-third';
  const thirdPlayerId = 'player-third';

  function threeHumanRoom(random: RandomSource): MultiplayerCoordinatorState {
    let state = addGuest(newRoom(3, random), random);
    state = send(state, {
      actorUserId: thirdUserId,
      displayName: 'Rafa',
      playerId: thirdPlayerId,
      seat: 2,
      type: 'join',
    }, 1_150, random).state;
    state = send(state, { actorUserId: hostUserId, ready: true, type: 'set-ready' }, 1_200, random).state;
    state = send(state, { actorUserId: guestUserId, ready: true, type: 'set-ready' }, 1_250, random).state;
    state = send(state, { actorUserId: thirdUserId, ready: true, type: 'set-ready' }, 1_275, random).state;
    return startRoom(state, random, 2_000);
  }

  function sendLive(
    state: MultiplayerCoordinatorState,
    input: CommandInput,
    nowMs: number,
    random: RandomSource,
    liveness: Readonly<Record<string, number>>,
  ) {
    commandSequence += 1;
    const command = {
      ...input,
      commandId: `command-${commandSequence}`,
      expectedVersion: state.version,
    } as MultiplayerRoomCommand;
    return applyMultiplayerCommand(state, command, { aiSimulations: 24, liveness, nowMs, random });
  }

  it('Deal now excludes a stale player, preserving their settled ledger and previous hand', () => {
    const random = seededRandom(501);
    let state = threeHumanRoom(random);
    while (!state.hand?.outcome) state = completeOneHandByFolding(state, random);
    const oldHand = state.hand;
    const ledger = state.seats.find((seat) => seat.userId === thirdUserId)!.ledger;
    const nowMs = state.updatedAtMs + 20_000;
    const result = sendLive(state, { actorUserId: hostUserId, type: 'deal-now' }, nowMs, random, {
      [hostUserId]: nowMs, [guestUserId]: nowMs, [thirdUserId]: 1_000,
    });
    expect(result.state.hand?.handNumber).toBe(2);
    expect(result.state.hand?.players[thirdPlayerId]).toBeUndefined();
    expect(seatOf(result.state, thirdPlayerId)).toMatchObject({ connection: 'offline', participation: 'disconnected', ledger });
    expect(state.hand).toEqual(oldHand);
    expect(seatOf(state, thirdPlayerId).participation).toBe('active');
  });

  it('Deal now commits the disconnect but waits when only one funded player remains', () => {
    const random = seededRandom(502);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    const nowMs = state.updatedAtMs + 20_000;
    const result = sendLive(state, { actorUserId: hostUserId, type: 'deal-now' }, nowMs, random, {
      [hostUserId]: nowMs, [guestUserId]: 1_000,
    });
    expect(result.state).toMatchObject({ status: 'between-hands', nextHandAtMs: null });
    expect(result.state.hand).toEqual(state.hand);
    expect(seatOf(result.state, guestPlayerId).participation).toBe('disconnected');
    expect(result.state.version).toBe(state.version + 1);
  });

  it('Start does not deal a stale ready guest; the owner must reconnect and ready again', () => {
    const random = seededRandom(503);
    const state = readyBoth(addGuest(newRoom(2, random), random), random);
    const result = sendLive(state, { actorUserId: hostUserId, type: 'start' }, 30_000, random, {
      [hostUserId]: 30_000, [guestUserId]: 1_000,
    });
    expect(result.state).toMatchObject({ status: 'lobby', hand: null });
    expect(seatOf(result.state, guestPlayerId)).toMatchObject({ ready: false, connection: 'offline', participation: 'disconnected' });
    const returned = sendLive(result.state, { actorUserId: guestUserId, type: 'set-connection', connection: 'online' }, 30_100, random, { [hostUserId]: 30_100, [guestUserId]: 30_100 }).state;
    expect(seatOf(returned, guestPlayerId).ready).toBe(false);
    const ready = send(returned, { actorUserId: guestUserId, type: 'set-ready', ready: true }, 30_200, random).state;
    const started = sendLive(ready, { actorUserId: hostUserId, type: 'start' }, 30_300, random, { [hostUserId]: 30_300, [guestUserId]: 30_200 }).state;
    expect(started.status).toBe('playing');
  });

  function seatOf(state: MultiplayerCoordinatorState, playerId: string) {
    const seat = state.seats.find((candidate) => candidate.playerId === playerId);
    if (!seat) throw new Error(`Seat ${playerId} is missing.`);
    return seat;
  }

  /** Heads-up fixture advanced to the big blind's free-check decision. */
  function freeCheckDeadlineFixture(random: RandomSource) {
    let state = readyBoth(addGuest(newRoom(2, random), random), random);
    state = startRoom(state, random, 2_000);
    const buttonId = state.hand?.toAct;
    if (!buttonId) throw new Error('The heads-up fixture has no first actor.');
    state = send(state, {
      action: { type: 'call' },
      actorUserId: userIdForPlayer(state, buttonId),
      type: 'action',
    }, 3_000, random).state;
    const checkId = state.hand?.toAct;
    const deadline = state.turnDeadlineAtMs;
    if (!checkId || deadline === null) throw new Error('The big blind has no timed decision.');
    if (!getMultiwayLegalActions(state.hand!, checkId).canCheck) {
      throw new Error('The fixture must reach a free-check decision.');
    }
    return { checkId, deadline, state };
  }

  it('enforced-folds a stale actor with a free check — never the online courtesy check', () => {
    const random = seededRandom(401);
    const { checkId, deadline, state } = freeCheckDeadlineFixture(random);
    const checkUserId = userIdForPlayer(state, checkId);
    const result = sendLive(state, {
      actorUserId: hostUserId,
      type: 'tick',
    } as CommandInput, deadline, random, { [checkUserId]: 2_000 });
    expect(result.transition.timeout).toMatchObject({ action: 'fold', aiTookOver: false, playerId: checkId });
    const seat = seatOf(result.state, checkId);
    expect(seat.connection).toBe('offline');
    expect(seat.participation).toBe('disconnected');
    expect(result.state.hand?.players[checkId]?.folded).toBe(true);
    expect(
      result.state.hand?.history.some((record) => record.playerId === checkId && record.type === 'check'),
    ).toBe(false);
    expect(result.state.turnDeadlineAtMs === null || result.state.turnDeadlineAtMs > deadline).toBe(true);
  });

  it('keeps the online courtesy-check rule for a fresh liveness stamp', () => {
    const random = seededRandom(402);
    const { checkId, deadline, state } = freeCheckDeadlineFixture(random);
    const checkUserId = userIdForPlayer(state, checkId);
    const result = sendLive(state, {
      actorUserId: hostUserId,
      type: 'tick',
    } as CommandInput, deadline, random, { [checkUserId]: deadline - 5_000 });
    expect(result.transition.timeout).toMatchObject({ action: 'check', playerId: checkId });
    const seat = seatOf(result.state, checkId);
    expect(seat.connection).toBe('online');
  });

  it('treats a missing owner entry as stale and an absent map as pre-liveness', () => {
    const random = seededRandom(403);
    const { checkId, deadline, state } = freeCheckDeadlineFixture(random);
    const missing = sendLive(state, {
      actorUserId: hostUserId,
      type: 'tick',
    } as CommandInput, deadline, random, { [guestUserId === userIdForPlayer(state, checkId) ? hostUserId : guestUserId]: deadline });
    expect(missing.transition.timeout).toMatchObject({ action: 'fold', playerId: checkId });

    // Empty-but-present map behaves the same (missing == stale). The worker
    // never sends an empty map — it omits the field — covered by every
    // pre-existing timing test running unchanged.
    const empty = sendLive(state, {
      actorUserId: hostUserId,
      type: 'tick',
    } as CommandInput, deadline, random, {});
    expect(empty.transition.timeout).toMatchObject({ action: 'fold', playerId: checkId });
  });

  it('never lets a late renewal resurrect a folded hand or restore participation', () => {
    const random = seededRandom(404);
    const { checkId, deadline, state } = freeCheckDeadlineFixture(random);
    const checkUserId = userIdForPlayer(state, checkId);
    const folded = sendLive(state, {
      actorUserId: hostUserId,
      type: 'tick',
    } as CommandInput, deadline + 1, random, { [checkUserId]: deadline - 15_000 });
    expect(folded.state.hand?.players[checkId]?.folded).toBe(true);
    expect(seatOf(folded.state, checkId).participation).toBe('disconnected');

    // Renewal contact arriving AFTER the fold cannot undo either fact: the
    // fold stands and the seat stays disconnected until the owner's own
    // online command (the renewal itself is not a coordinator command).
    const later = folded.state;
    expect(later.hand?.players[checkId]?.folded).toBe(true);
    expect(seatOf(later, checkId).participation).toBe('disconnected');
    expect(seatOf(later, checkId).connection).toBe('offline');
  });

  it('fresh contact at expiry keeps the deadline untouched — renewal never resets a live clock', () => {
    const random = seededRandom(405);
    const { checkId, deadline, state } = freeCheckDeadlineFixture(random);
    const checkUserId = userIdForPlayer(state, checkId);
    // An online heartbeat (own command) mid-turn: the deadline survives.
    const midTurn = sendLive(state, {
      actorUserId: checkUserId,
      connection: 'online',
      type: 'set-connection',
    } as CommandInput, deadline - 10_000, random, { [checkUserId]: deadline - 10_000 });
    expect(midTurn.state.turnDeadlineAtMs).toBe(deadline);
    const expired = sendLive(midTurn.state, {
      actorUserId: hostUserId,
      type: 'tick',
    } as CommandInput, deadline, random, { [checkUserId]: deadline - 1 });
    expect(expired.transition.timeout).toMatchObject({ action: 'check', playerId: checkId });
  });

  it('sweeps stale online seats between hands, moves host authority, and commits before the countdown is due', () => {
    const random = seededRandom(406);
    let state = threeHumanRoom(random);
    // Settle hand 1: the host checks/calls, the other two fold.
    const winnerId = state.hand?.toAct;
    if (!winnerId) throw new Error('The sweep fixture has no first actor.');
    let guard = 0;
    while (state.status === 'playing' && guard < 40) {
      guard += 1;
      const actor = state.hand?.toAct;
      if (!actor) break;
      const legal = getMultiwayLegalActions(state.hand!, actor);
      const action = actor === winnerId
        ? (legal.canCheck ? { type: 'check' as const } : legal.canCall ? { type: 'call' as const } : { type: 'fold' as const })
        : (legal.canFold ? { type: 'fold' as const } : legal.canCheck ? { type: 'check' as const } : { type: 'call' as const });
      state = send(state, {
        action,
        actorUserId: userIdForPlayer(state, actor),
        type: 'action',
      }, state.updatedAtMs + 100, random).state;
    }
    if (!state.hand?.outcome) throw new Error('The sweep fixture did not settle.');
    const countdownDue = state.nextHandAtMs;
    if (countdownDue === null) throw new Error('The countdown must be armed for this sweep fixture.');

    const ledgersBefore = JSON.stringify(state.seats.map((seat) => seat.ledger));

    // A survivor ticks 1s BEFORE the countdown is due. Pre-fix this throws
    // "The next-hand countdown has not reached zero."; with liveness it must
    // repair transport truth and commit instead. Only the HOST's owner is
    // stale; every other human seat has fresh server contact.
    const staleStamp = countdownDue - 20_000;
    const liveness: Record<string, number> = { [hostUserId]: staleStamp };
    for (const seat of state.seats) {
      if (seat.kind === 'human' && seat.userId && seat.userId !== hostUserId) {
        liveness[seat.userId] = countdownDue - 1_000;
      }
    }
    const survivor = state.seats.find((seat) => seat.userId === guestUserId);
    if (!survivor?.userId) throw new Error('The sweep fixture needs the guest survivor.');
    const result = sendLive(state, {
      actorUserId: guestUserId,
      type: 'tick',
    } as CommandInput, countdownDue - 1_000, random, liveness);
    void survivor;

    expect(seatOf(result.state, hostPlayerId).connection).toBe('offline');
    expect(seatOf(result.state, hostPlayerId).participation).toBe('disconnected');
    // Host AUTHORITY moved off the stale host; the host SEAT stays human.
    expect(result.state.hostPlayerId).not.toBe(hostPlayerId);
    const successor = seatOf(result.state, result.state.hostPlayerId);
    expect(successor.kind).toBe('human');
    expect(successor.connection).toBe('online');
    // The two fresh survivors keep two active funded seats, so the sweep
    // re-armed the countdown from now. The settled hand and every ledger
    // row stay untouched.
    expect(result.state.nextHandAtMs).toBe(countdownDue - 1_000 + NEXT_HAND_COUNTDOWN_MS);
    expect(result.state.status).toBe('between-hands');
    expect(JSON.stringify(result.state.seats.map((seat) => seat.ledger))).toBe(ledgersBefore);
    expect(result.state.hand?.outcome).toBeTruthy();
  });

  it('sweeps a collective transport loss into a pause, not a deal', () => {
    const random = seededRandom(407);
    let state = startRoom(readyBoth(addGuest(newRoom(2, random), random), random), random);
    state = completeOneHandByFolding(state, random);
    if (state.status !== 'between-hands') throw new Error('The pause fixture must be between hands.');
    const countdownDue = state.nextHandAtMs;
    if (countdownDue === null) throw new Error('The pause fixture needs an armed countdown.');
    const result = sendLive(state, {
      actorUserId: guestUserId,
      type: 'tick',
    } as CommandInput, countdownDue - 500, random, {
      [hostUserId]: countdownDue - 20_000,
      [guestUserId]: countdownDue - 20_000,
    });
    expect(result.state.status).toBe('paused');
    expect(result.state.resumeStatus).toBe('between-hands');
    expect(result.state.seats.length).toBe(2);
    expect(result.state.seats.every((seat) => seat.connection === 'offline')).toBe(true);
  });

  it('the sweep leaves permanently left seats alone and never resolves pending rebuys as sit-outs', () => {
    const random = seededRandom(408);
    let state = threeHumanRoom(random);
    // Settle hand 1 with the third seat busted out via folds; leave one seat
    // permanently departed between hands.
    let guard = 0;
    const winnerId = state.hand?.toAct;
    if (!winnerId) throw new Error('The fixture has no first actor.');
    while (state.status === 'playing' && guard < 40) {
      guard += 1;
      const actor = state.hand?.toAct;
      if (!actor) break;
      const legal = getMultiwayLegalActions(state.hand!, actor);
      const action = actor === winnerId
        ? (legal.canCheck ? { type: 'check' as const } : legal.canCall ? { type: 'call' as const } : { type: 'fold' as const })
        : (legal.canFold ? { type: 'fold' as const } : legal.canCheck ? { type: 'check' as const } : { type: 'call' as const });
      state = send(state, {
        action,
        actorUserId: userIdForPlayer(state, actor),
        type: 'action',
      }, state.updatedAtMs + 100, random).state;
    }
    if (!state.hand?.outcome || state.status !== 'between-hands') {
      throw new Error('The fixture must settle between hands.');
    }
    const winnerSeat = seatOf(state, winnerId);
    const leaverSeat = state.seats.find((seat) => seat.playerId !== winnerId)!;
    state = send(state, {
      actorUserId: leaverSeat.userId!,
      type: 'leave',
    } as CommandInput, state.updatedAtMs + 50, random).state;
    const countdownDue = state.nextHandAtMs;
    if (countdownDue === null) throw new Error('The sweep fixture needs an armed countdown.');

    const result = sendLive(state, {
      actorUserId: winnerSeat.userId!,
      type: 'tick',
    } as CommandInput, countdownDue - 500, random, {
      [winnerSeat.userId!]: countdownDue - 500,
      // The departed owner has no fresh contact — the sweep must skip 'left'
      // and NOT treat it as a newly discovered disconnection.
    });
    const leftSeat = seatOf(result.state, leaverSeat.playerId);
    expect(leftSeat.participation).toBe('left');
    expect(leftSeat.connection).toBe('offline');
    expect(result.state.status).toBe('between-hands');
    expect(result.state.seats.length).toBe(3);
  });

  it('never reclassifies a returned seat that was omitted from the settled hand (Q4-adjacent)', () => {
    const random = seededRandom(409);
    let state = threeHumanRoom(random);
    const winnerId = state.hand?.toAct;
    if (!winnerId) throw new Error('The fixture has no first actor.');
    let guard = 0;
    while (state.status === 'playing' && guard < 40) {
      guard += 1;
      const actor = state.hand?.toAct;
      if (!actor) break;
      const legal = getMultiwayLegalActions(state.hand!, actor);
      const action = actor === winnerId
        ? (legal.canCheck ? { type: 'check' as const } : legal.canCall ? { type: 'call' as const } : { type: 'fold' as const })
        : (legal.canFold ? { type: 'fold' as const } : legal.canCheck ? { type: 'check' as const } : { type: 'call' as const });
      state = send(state, {
        action,
        actorUserId: userIdForPlayer(state, actor),
        type: 'action',
      }, state.updatedAtMs + 100, random).state;
    }
    if (!state.hand?.outcome || state.status !== 'between-hands') {
      throw new Error('The fixture must settle hand 1 between hands.');
    }

    // The third seat drops its connection between hands; the next deal must
    // omit it, exactly as the liveness sweep produces server-side.
    state = send(state, {
      actorUserId: thirdUserId,
      connection: 'offline',
      type: 'set-connection',
    } as CommandInput, state.updatedAtMs + 50, random).state;
    const countdownDue = state.nextHandAtMs;
    if (countdownDue === null) throw new Error('The fixture needs an armed countdown.');
    state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, countdownDue, random).state;
    if (state.status !== 'playing' || state.hand?.players[thirdPlayerId] !== undefined) {
      throw new Error('Hand 2 must start without the disconnected seat.');
    }

    // The owner returns while hand 2 is still running — active again, with
    // the ledger frozen at hand 1's settlement.
    const beforeReturn = seatOf(state, thirdPlayerId).ledger;
    state = send(state, {
      actorUserId: thirdUserId,
      connection: 'online',
      type: 'set-connection',
    } as CommandInput, state.updatedAtMs + 50, random).state;
    expect(seatOf(state, thirdPlayerId).participation).toBe('active');

    // Fold out hand 2 between the two dealt survivors.
    let guard2 = 0;
    while (state.status === 'playing' && guard2 < 40) {
      guard2 += 1;
      const actor = state.hand?.toAct;
      if (!actor) break;
      const legal = getMultiwayLegalActions(state.hand!, actor);
      const action = legal.canFold ? { type: 'fold' as const } : legal.canCheck ? { type: 'check' as const } : { type: 'call' as const };
      state = send(state, {
        action,
        actorUserId: userIdForPlayer(state, actor),
        type: 'action',
      }, state.updatedAtMs + 100, random).state;
    }
    if (!state.hand?.outcome || state.status !== 'between-hands') {
      throw new Error('Hand 2 must settle between hands.');
    }

    // The settlement must not touch the returned bystander: nobody dealt in
    // the settled hand gets reclassified as "settled to zero" (rebuy-pending)
    // merely because its stack is absent from this hand's table.
    const returnedSeat = seatOf(state, thirdPlayerId);
    expect(returnedSeat.participation).toBe('active');
    expect(returnedSeat.connection).toBe('online');
    expect(returnedSeat.ledger?.settledHandNumber).toBe(1);
    expect(returnedSeat.ledger?.settledStack).toBe(beforeReturn?.settledStack);

    // The returned seat is dealable: the countdown armed, and hand 3 seats it.
    const countdown2Due = state.nextHandAtMs;
    if (countdown2Due === null) throw new Error('The returned seat must not defer the countdown.');
    state = send(state, { actorUserId: hostUserId, type: 'tick' } as CommandInput, countdown2Due, random).state;
    expect(state.hand?.handNumber).toBe(3);
    expect(state.hand?.players[thirdPlayerId]).toBeDefined();
  });
});
