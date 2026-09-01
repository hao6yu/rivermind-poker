import { describe, expect, it } from 'vitest';

import { seededRandom, type RandomSource } from '../poker/cards';
import { getMultiwayLegalActions } from '../poker/multiway';
import type { PlayerAction } from '../poker/types';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
  defaultMultiplayerRoomConfig,
} from './coordinator';
import type { MultiplayerCoordinatorState, MultiplayerRoomCommand } from './contracts';
import { multiplayerHandBecameArchivable, multiplayerPersistenceHandArchives } from './archive';

type CommandInput = MultiplayerRoomCommand extends infer Command
  ? Command extends MultiplayerRoomCommand
    ? Omit<Command, 'commandId' | 'expectedVersion'>
    : never
  : never;

const seatUserIds = ['user-a', 'user-b', 'user-c', 'user-d'];
const seatPlayerIds = ['player-a', 'player-b', 'player-c', 'player-d'];

let commandSequence = 0;

function send(
  state: MultiplayerCoordinatorState,
  input: CommandInput,
  nowMs: number,
  random: RandomSource,
) {
  const command = {
    ...input,
    commandId: `command-${commandSequence += 1}`,
    expectedVersion: state.version,
  } as MultiplayerRoomCommand;
  return applyMultiplayerCommand(state, command, { aiSimulations: 24, nowMs, random });
}

/** `count` humans seated, ready, and started with hand 1 live. */
function startedHumans(count: number, random: RandomSource): MultiplayerCoordinatorState {
  let state = createMultiplayerRoom({
    config: { ...defaultMultiplayerRoomConfig, handTarget: 'open', seatCount: 6 },
    hostDisplayName: 'Ava',
    hostPlayerId: seatPlayerIds[0]!,
    hostUserId: seatUserIds[0]!,
    roomCode: '4724826',
    roomId: 'room-archive',
  }, { nowMs: 1_000, random });
  for (let index = 1; index < count; index += 1) {
    state = send(state, {
      actorUserId: seatUserIds[index]!,
      displayName: `Guest ${index}`,
      playerId: seatPlayerIds[index]!,
      seat: index,
      type: 'join',
    }, 1_100 + index * 100, random).state;
  }
  for (let index = 0; index < count; index += 1) {
    state = send(state, { actorUserId: seatUserIds[index]!, ready: true, type: 'set-ready' }, 1_500 + index * 100, random).state;
  }
  return send(state, { actorUserId: seatUserIds[0]!, type: 'start' }, 2_000, random).state;
}

function actorAction(
  state: MultiplayerCoordinatorState,
  passivePlayerId: string,
): { action: PlayerAction; actorUserId: string } {
  const hand = state.hand!;
  const actorPlayerId = hand.toAct!;
  const actorSeat = state.seats.find((seat) => seat.playerId === actorPlayerId);
  if (!actorSeat?.userId) throw new Error('The acting seat has no bound identity.');
  const legal = getMultiwayLegalActions(hand, actorPlayerId);
  const action = actorPlayerId === passivePlayerId
    ? legal.canCheck ? ({ type: 'check' } as const) : legal.canCall ? ({ type: 'call' } as const) : ({ type: 'fold' } as const)
    : legal.canFold ? ({ type: 'fold' } as const)
      : legal.canCheck ? ({ type: 'check' } as const)
        : legal.canCall ? ({ type: 'call' } as const)
          : (() => { throw new Error('No legal action for the acting seat.'); })();
  return { action, actorUserId: actorSeat.userId };
}

/**
 * Drives the live hand to a deterministic settle. The passive seat always
 * checks/calls; other seats fold whenever the engine permits it (folding is
 * illegal while checking is free, so those seats check through to the seeded
 * showdown). The archive assertions never depend on who wins.
 */
function foldOut(
  state: MultiplayerCoordinatorState,
  passivePlayerId: string,
  nowMs: number,
  random: RandomSource,
): MultiplayerCoordinatorState {
  let current = state;
  let guard = 0;
  while (current.status === 'playing' && current.hand?.toAct && !current.hand.outcome) {
    guard += 1;
    if (guard > 140) throw new Error('The hand did not converge within its action budget.');
    const { action, actorUserId } = actorAction(current, passivePlayerId);
    current = send(current, { actorUserId, action, type: 'action' }, nowMs, random).state;
  }
  expect(current.hand?.outcome, 'the hand must settle').toBeTruthy();
  return current;
}

function dealtIds(state: MultiplayerCoordinatorState): string[] {
  return Object.keys(state.hand?.players ?? {});
}

function humanSeatIds(state: MultiplayerCoordinatorState): string[] {
  return state.seats.filter((seat) => seat.kind === 'human').map((seat) => seat.playerId);
}

/** The Q2 rule: archives exist exactly for the humans dealt into the settled hand. */
function expectArchivesMatchDealtHumans(
  state: MultiplayerCoordinatorState,
): string[] {
  const dealtHumans = dealtIds(state).filter((playerId) => humanSeatIds(state).includes(playerId));
  const archives = multiplayerPersistenceHandArchives(state);
  expect(archives.map((archive) => archive.viewerPlayerId).sort()).toEqual([...dealtHumans].sort());
  return dealtHumans;
}

describe('multiplayer persistence-archive eligibility (Q2)', () => {
  it('produces exactly one archive per dealt human of the settled hand', () => {
    const random = seededRandom(1401);
    const state = foldOut(startedHumans(3, random), seatPlayerIds[0]!, 2_100, random);
    const archives = multiplayerPersistenceHandArchives(state);
    expect(archives.map((archive) => archive.viewerPlayerId).sort())
      .toEqual([seatPlayerIds[0], seatPlayerIds[1], seatPlayerIds[2]].sort());
    expect(archives.map((archive) => archive.userId).sort())
      .toEqual([seatUserIds[0], seatUserIds[1], seatUserIds[2]].sort());
    for (const archive of archives) {
      expect(archive.hand.players[archive.viewerPlayerId]?.holeCards).toHaveLength(2);
      expect(archive.hand.deck).toEqual([]);
      expect(archive.hand.pending).toEqual([]);
      expect(archive.hand.toAct).toBeNull();
    }
    expect(multiplayerHandBecameArchivable({ ...state, hand: null }, state)).toBe(true);
  });

  it('never fabricates archives for omitted participants across later hands', () => {
    const random = seededRandom(3131);
    // Hand 1: all four humans dealt, settled without busts.
    let state = foldOut(startedHumans(4, random), seatPlayerIds[0]!, 2_100, random);
    expectArchivesMatchDealtHumans(state);

    // B loses its transport (canonical disconnected) and is omitted from the
    // deal. Fail-before: the worker fabricated B's archive, the redaction
    // validation rejected the not-dealt viewer, and the commit failed 503.
    state = send(state, { actorUserId: seatUserIds[1]!, connection: 'offline', type: 'set-connection' }, 2_200, random).state;
    const hand2 = send(state, { actorUserId: seatUserIds[0]!, type: 'deal-now' }, 2_300, random).state;
    expect(hand2.hand?.handNumber).toBe(2);
    expect(dealtIds(hand2)).not.toContain(seatPlayerIds[1]);
    const settled2 = foldOut(hand2, seatPlayerIds[0]!, 2_400, random);
    expectArchivesMatchDealtHumans(settled2);

    // C permanently leaves between hands; hand 3 omits C from the deal AND
    // the archives, exactly like B.
    state = send(settled2, { actorUserId: seatUserIds[2]!, type: 'leave' }, 2_500, random).state;
    const hand3 = send(state, { actorUserId: seatUserIds[0]!, type: 'deal-now' }, 2_600, random).state;
    expect(hand3.hand?.handNumber).toBe(3);
    expect(dealtIds(hand3)).not.toContain(seatPlayerIds[2]);
    const settled3 = foldOut(hand3, seatPlayerIds[0]!, 2_700, random);
    const dealtHumans3 = expectArchivesMatchDealtHumans(settled3);
    expect(dealtHumans3).not.toContain(seatPlayerIds[1]);
    expect(dealtHumans3).not.toContain(seatPlayerIds[2]);
  });

  it('keeps the archive of a human who left DURING a hand they were dealt into', () => {
    const random = seededRandom(4141);
    const state = startedHumans(3, random);
    const actingPlayerId = state.hand!.toAct!;
    const actingSeat = state.seats.find((seat) => seat.playerId === actingPlayerId)!;
    // The acting human permanently exits mid-hand: the leave settles exactly
    // once, but the settlement still owes them their own hand archive.
    const left = send(state, { actorUserId: actingSeat.userId!, type: 'leave' }, 2_100, random).state;
    const nextActor = left.hand?.toAct;
    const winnerSeat = nextActor
      ? left.seats.find((seat) => seat.playerId === nextActor && seat.userId)!
      : left.seats.find((seat) => seat.playerId !== actingPlayerId && seat.userId)!;
    const settled = foldOut(left, winnerSeat.playerId, 2_200, random);
    const archives = multiplayerPersistenceHandArchives(settled);
    // R5 revokes live membership, not the archive for a hand actually dealt.
    expect(archives.map((archive) => archive.viewerPlayerId)).toContain(actingPlayerId);
    expect(archives.map((archive) => archive.userId)).toContain(actingSeat.userId);
    expect(
      settled.seats.find((seat) => seat.playerId === actingPlayerId)?.participation,
    ).toBe('left');
  });

  it('never emits two archives for one identity in one transition', () => {
    const random = seededRandom(5151);
    const state = foldOut(startedHumans(3, random), seatPlayerIds[0]!, 2_100, random);
    const archives = multiplayerPersistenceHandArchives(state);
    const userIds = archives.map((archive) => archive.userId);
    expect(new Set(userIds).size).toBe(userIds.length);
  });
});
