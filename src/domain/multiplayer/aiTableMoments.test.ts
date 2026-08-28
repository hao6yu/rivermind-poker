import { describe, expect, it } from 'vitest';

import { seededRandom, type RandomSource } from '../poker/cards';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
  defaultMultiplayerRoomConfig,
} from './coordinator';
import type { MultiplayerCoordinatorState } from './contracts';
import {
  AI_BAD_BEAT_COMMIT_RATIO,
  AI_TABLE_MOMENT_HAND_CAP,
  AI_TABLE_MOMENT_PER_AI_PER_HAND_LIMIT,
  AI_TABLE_MOMENT_PROBABILITY,
  AI_TABLE_MOMENT_ROOM_COOLDOWN_MS,
  classifyAiMomentTriggers,
  selectAiTableMoments,
} from './aiTableMoments';

function roomWithAis(seatCount: 3): MultiplayerCoordinatorState {
  let state = createMultiplayerRoom({
    config: { ...defaultMultiplayerRoomConfig, seatCount },
    hostDisplayName: 'Kai',
    hostPlayerId: 'player-0',
    hostUserId: 'user-0',
    roomCode: '724826',
    roomId: 'room-test',
  }, { nowMs: 1_000, random: seededRandom(1) });
  state = applyMultiplayerCommand(state, {
    actorUserId: 'user-0',
    commandId: 'add-ai-1',
    expectedVersion: state.version,
    seat: 1,
    type: 'add-ai',
  }, { nowMs: 1_100, random: seededRandom(1) }).state;
  return applyMultiplayerCommand(state, {
    actorUserId: 'user-0',
    commandId: 'add-ai-2',
    expectedVersion: state.version,
    seat: 2,
    type: 'add-ai',
  }, { nowMs: 1_200, random: seededRandom(1) }).state;
}

const OUTCOME = (overrides: Record<string, unknown> = {}): MultiwayHandOutcomeFixture => ({
  awards: [],
  showdown: true,
  totalPot: 2_000,
  winnerPlayerIds: ['player-0'],
  ...overrides,
});

interface MultiwayHandOutcomeFixture {
  awards: never[];
  showdown: boolean;
  totalPot: number;
  winnerPlayerIds: string[];
}

describe('AI table moment triggers', () => {
  function handPlayers(
    state: MultiplayerCoordinatorState,
    commitBySeat: Record<number, number>,
  ): Record<string, { folded: boolean; totalCommitted: number }> {
    return Object.fromEntries(state.seats.map((seat) => [
      seat.playerId,
      { folded: false, totalCommitted: commitBySeat[seat.seat] ?? 500 },
    ]));
  }

  function withHand(
    state: MultiplayerCoordinatorState,
    players: Record<string, { folded: boolean; totalCommitted: number }>,
  ): MultiplayerCoordinatorState {
    return {
      ...state,
      hand: { handNumber: 1, players },
    } as unknown as MultiplayerCoordinatorState;
  }

  it('classifies showdown wins, scoops, and bad beats for AI seats only', () => {
    const state = roomWithAis(3);
    const players = handPlayers(state, { 1: 1_800, 2: 200 });
    const aiPlayerId = state.seats.find((seat) => seat.seat === 1)?.playerId;
    const hostPlayerId = state.seats.find((seat) => seat.seat === 0)?.playerId;
    if (!aiPlayerId || !hostPlayerId) throw new Error('The AI-room fixture is malformed.');
    let triggers = classifyAiMomentTriggers(
      withHand(state, players),
      OUTCOME({ showdown: true, winnerPlayerIds: [aiPlayerId] }) as never,
    );
    expect(triggers).toEqual([
      { class: 'showdown-win', playerId: aiPlayerId, reactionId: 'niceHand', seat: 1 },
    ]);
    triggers = classifyAiMomentTriggers(
      withHand(state, players),
      OUTCOME({ showdown: false, winnerPlayerIds: [aiPlayerId] }) as never,
    );
    expect(triggers).toEqual([
      { class: 'scoop', playerId: aiPlayerId, reactionId: 'cheer', seat: 1 },
    ]);
    // AI seat 1 committed 90% of the pot and lost at showdown: bad beat.
    triggers = classifyAiMomentTriggers(
      withHand(state, players),
      OUTCOME({ showdown: true, winnerPlayerIds: [hostPlayerId] }) as never,
    );
    expect(triggers).toEqual([
      { class: 'bad-beat', playerId: aiPlayerId, reactionId: 'disappointed', seat: 1 },
    ]);
    // A small-commit AI loss is not dramatic enough to trigger.
    const smallCommit = handPlayers(state, { 1: 200, 2: 200 });
    triggers = classifyAiMomentTriggers(
      withHand(state, smallCommit),
      OUTCOME({ showdown: true, winnerPlayerIds: [hostPlayerId] }) as never,
    );
    expect(triggers).toEqual([]);
  });

  it('never triggers for folded or human seats', () => {
    const state = roomWithAis(3);
    const aiPlayerId = state.seats.find((seat) => seat.seat === 1)?.playerId;
    if (!aiPlayerId) throw new Error('The AI-room fixture is malformed.');
    const players = Object.fromEntries(state.seats.map((seat) => [
      seat.playerId,
      { folded: seat.seat === 1, totalCommitted: seat.seat === 1 ? 1_800 : 200 },
    ]));
    const triggers = classifyAiMomentTriggers(
      withHand(state, players),
      OUTCOME({ winnerPlayerIds: [aiPlayerId] }) as never,
    );
    expect(triggers).toEqual([]);
  });

  it('uses the authored probability, room cooldown, hand cap, and per-AI limit', () => {
    const state = roomWithAis(3);
    const hostPlayerId = state.seats.find((seat) => seat.seat === 0)?.playerId;
    if (!hostPlayerId) throw new Error('The AI-room fixture is malformed.');
    const players = handPlayers(state, { 1: 1_800, 2: 1_800 });
    const triggers = classifyAiMomentTriggers(
      withHand(state, players),
      OUTCOME({ winnerPlayerIds: [hostPlayerId] }) as never,
    );
    expect(triggers).toHaveLength(2);

    // A deterministic RNG that always rolls under the probability selects both
    // AI seats, capped by the hand cap.
    const alwaysRoll = (): number => 0;
    const moments = selectAiTableMoments({
      aiMomentsThisHand: 0,
      nowMs: 5_000,
      random: alwaysRoll,
      roomLastAiMomentAtMs: null,
      state,
      triggers,
    });
    expect(moments).toHaveLength(AI_TABLE_MOMENT_HAND_CAP);
    expect(moments.every((moment) => moment.playerId !== hostPlayerId)).toBe(true);
    expect(new Set(moments.map((moment) => moment.reactionId))).toEqual(
      new Set(['disappointed']),
    );

    // A never-rolling RNG selects nothing.
    expect(selectAiTableMoments({
      aiMomentsThisHand: 0,
      nowMs: 5_000,
      random: (): number => 1,
      roomLastAiMomentAtMs: null,
      state,
      triggers,
    })).toEqual([]);

    // The room cooldown suppresses everything.
    expect(selectAiTableMoments({
      aiMomentsThisHand: 0,
      nowMs: 5_000,
      random: alwaysRoll,
      roomLastAiMomentAtMs: 5_000 - AI_TABLE_MOMENT_ROOM_COOLDOWN_MS + 1,
      state,
      triggers,
    })).toEqual([]);

    // The per-AI hand limit and the hand cap are enforced together.
    const limited = selectAiTableMoments({
      aiMomentsThisHand: 0,
      nowMs: 5_000,
      random: alwaysRoll,
      roomLastAiMomentAtMs: null,
      state,
      triggers,
    });
    for (const seat of limited) {
      expect(limited.filter((m) => m.seat === seat.seat)).toHaveLength(
        AI_TABLE_MOMENT_PER_AI_PER_HAND_LIMIT,
      );
    }
    expect(selectAiTableMoments({
      aiMomentsThisHand: AI_TABLE_MOMENT_HAND_CAP,
      nowMs: 5_000,
      random: alwaysRoll,
      roomLastAiMomentAtMs: null,
      state,
      triggers,
    })).toEqual([]);
  });

  it('produces deterministic envelopes under the injected RNG and clock', () => {
    const state = roomWithAis(3);
    const hostPlayerId = state.seats.find((seat) => seat.seat === 0)?.playerId;
    if (!hostPlayerId) throw new Error('The AI-room fixture is malformed.');
    const players = handPlayers(state, { 1: 1_800, 2: 200 });
    const triggers = classifyAiMomentTriggers(
      withHand(state, players),
      OUTCOME({ winnerPlayerIds: [hostPlayerId] }) as never,
    );
    const handState = withHand(state, players);
    const first = selectAiTableMoments({
      aiMomentsThisHand: 0,
      nowMs: 7_000,
      random: seededRandom(9),
      roomLastAiMomentAtMs: null,
      state: handState,
      triggers,
    });
    const second = selectAiTableMoments({
      aiMomentsThisHand: 0,
      nowMs: 7_000,
      random: seededRandom(9),
      roomLastAiMomentAtMs: null,
      state: handState,
      triggers,
    });
    expect(first).toEqual(second);
    // With a roll that always lands under the probability, the envelope
    // carries the coordinator clock, hand, and room verbatim.
    const certain = selectAiTableMoments({
      aiMomentsThisHand: 0,
      nowMs: 7_000,
      random: (): number => 0,
      roomLastAiMomentAtMs: null,
      state: handState,
      triggers,
    });
    if (!certain[0]) throw new Error('The always-roll selection produced no moment.');
    expect(certain[0].atMs).toBe(7_000);
    expect(certain[0].handNumber).toBe(1);
    expect(certain[0].roomId).toBe('room-test');
    expect(certain[0].id).toMatch(/^ai:room-test:1:[12]:bad-beat$/);
  });

  it('matches the probability constant the tests rely on', () => {
    expect(AI_TABLE_MOMENT_PROBABILITY).toBe(0.5);
    expect(AI_BAD_BEAT_COMMIT_RATIO).toBe(0.4);
    expect(AI_TABLE_MOMENT_ROOM_COOLDOWN_MS).toBe(10_000);
    expect(AI_TABLE_MOMENT_HAND_CAP).toBe(2);
  });
});
