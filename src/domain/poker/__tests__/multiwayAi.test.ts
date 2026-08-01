import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { decideMultiwayAiAction, selectMultiwayAiActionForEquity } from '../multiwayAi';
import {
  MULTIWAY_AI_IDENTITIES,
  multiwayAiIdentityAt,
  multiwayAiIdentityForSeat,
} from '../multiwayAiProfiles';
import { simulateMultiwayAiTable } from '../multiwayAiSimulation';
import { estimateMultiwayEquity, inferMultiwayRangeStrength } from '../multiwayEquity';
import {
  applyMultiwayAction,
  createMultiwayHand,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type TablePlayerConfig,
} from '../multiway';
import type { Card, Rank, Suit } from '../types';

function players(count: number): TablePlayerConfig[] {
  return Array.from({ length: count }, (_, seat) => ({
    id: seat === 0 ? 'hero' : `ai-${seat}`,
    name: seat === 0 ? 'You' : multiwayAiIdentityForSeat(seat).name,
    seat,
    stack: 1_000,
    isHero: seat === 0,
  }));
}

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function stateFacingRaise(): MultiwayHandState {
  const initial = createMultiwayHand({ players: players(3), buttonSeat: 0, random: seededRandom(401) });
  return applyMultiwayAction(initial, 'hero', { type: 'raise', amount: 80 });
}

function stateCheckedToAi(): MultiwayHandState {
  let state = createMultiwayHand({ players: players(3), buttonSeat: 0, random: seededRandom(402) });
  state = applyMultiwayAction(state, 'hero', { type: 'call' });
  state = applyMultiwayAction(state, 'ai-1', { type: 'call' });
  state = applyMultiwayAction(state, 'ai-2', { type: 'check' });
  state.board = [card(14, 'spades'), card(8, 'hearts'), card(2, 'clubs')];
  return state;
}

describe('multiway AI identities and decisions', () => {
  it('assigns five stable, understandable opponent identities', () => {
    expect(MULTIWAY_AI_IDENTITIES).toHaveLength(5);
    expect(new Set(MULTIWAY_AI_IDENTITIES.map((identity) => identity.id)).size).toBe(5);
    expect(new Set(MULTIWAY_AI_IDENTITIES.map((identity) => identity.name)).size).toBe(5);
    expect(new Set(MULTIWAY_AI_IDENTITIES.map((identity) => identity.style)).size).toBe(5);
    expect(multiwayAiIdentityAt(0)).toBe(multiwayAiIdentityAt(5));
    expect(multiwayAiIdentityForSeat(3).name).toBe('June');
  });

  it('never uses another seat hidden cards to estimate or choose an action', () => {
    const state = stateFacingRaise();
    const changedHiddenCards: MultiwayHandState = {
      ...state,
      players: {
        ...state.players,
        hero: { ...state.players.hero!, holeCards: [card(14, 'hearts'), card(14, 'diamonds')] },
        'ai-2': { ...state.players['ai-2']!, holeCards: [card(13, 'clubs'), card(13, 'spades')] },
      },
    };
    const identity = multiwayAiIdentityForSeat(1);
    const original = decideMultiwayAiAction(state, 'ai-1', {
      identity,
      simulations: 90,
      random: seededRandom(7001),
    });
    const changed = decideMultiwayAiAction(changedHiddenCards, 'ai-1', {
      identity,
      simulations: 90,
      random: seededRandom(7001),
    });

    expect(changed).toEqual(original);
  });

  it('prices the same premium hand lower as more live ranges enter the pot', () => {
    const headsUp = createMultiwayHand({ players: players(2), buttonSeat: 0, random: seededRandom(403) });
    const sixHanded = createMultiwayHand({ players: players(6), buttonSeat: 0, random: seededRandom(404) });
    headsUp.players.hero!.holeCards = [card(14, 'spades'), card(14, 'hearts')];
    sixHanded.players.hero!.holeCards = [card(14, 'spades'), card(14, 'hearts')];

    const headsUpEquity = estimateMultiwayEquity(headsUp, 'hero', {
      simulations: 700,
      random: seededRandom(8001),
    });
    const sixHandedEquity = estimateMultiwayEquity(sixHanded, 'hero', {
      simulations: 700,
      random: seededRandom(8002),
    });

    expect(headsUpEquity).toBeGreaterThan(0.75);
    expect(sixHandedEquity).toBeLessThan(0.62);
    expect(sixHandedEquity).toBeLessThan(headsUpEquity - 0.18);
  });

  it('tightens a public range after raises without looking at hole cards', () => {
    const state = createMultiwayHand({ players: players(3), buttonSeat: 0, random: seededRandom(405) });
    const identity = multiwayAiIdentityForSeat(1);
    const unopenedStrength = inferMultiwayRangeStrength(state, 'ai-1', identity);
    const raisedState: MultiwayHandState = {
      ...state,
      history: [{ playerId: 'ai-1', type: 'raise', amount: 80, street: 'preflop', potAfter: 110 }],
    };

    expect(inferMultiwayRangeStrength(raisedState, 'ai-1', identity)).toBeGreaterThan(
      unopenedStrength + 0.14,
    );
  });

  it('lets a sticky identity continue where a patient identity folds', () => {
    const state = stateFacingRaise();
    const sticky = selectMultiwayAiActionForEquity(
      state,
      'ai-1',
      0.34,
      'club',
      multiwayAiIdentityAt(3),
      0.8,
    );
    const patient = selectMultiwayAiActionForEquity(
      state,
      'ai-1',
      0.34,
      'club',
      multiwayAiIdentityAt(1),
      0.8,
    );

    expect(sticky.action.type).toBe('call');
    expect(patient.action.type).toBe('fold');
    expect(sticky.playersBehind).toBe(1);
    expect(sticky.opponentCount).toBe(2);
  });

  it('gives Sharp selective pressure that Friendly declines on a dry board', () => {
    const state = stateCheckedToAi();
    const pressure = multiwayAiIdentityAt(2);
    const friendly = selectMultiwayAiActionForEquity(state, 'ai-1', 0.05, 'friendly', pressure, 0.03);
    const sharp = selectMultiwayAiActionForEquity(state, 'ai-1', 0.05, 'sharp', pressure, 0.03);

    expect(friendly.action.type).toBe('check');
    expect(sharp.action.type).toBe('raise');
    expect(sharp.style).toBe('bluff');
  });

  it('uses larger Sharp value sizing while keeping both raises legal', () => {
    const state = stateFacingRaise();
    const pressure = multiwayAiIdentityAt(2);
    const friendly = selectMultiwayAiActionForEquity(state, 'ai-1', 0.92, 'friendly', pressure, 0.5);
    const sharp = selectMultiwayAiActionForEquity(state, 'ai-1', 0.92, 'sharp', pressure, 0.5);
    const legal = getMultiwayLegalActions(state, 'ai-1');

    expect(friendly.action.type).toBe('raise');
    expect(sharp.action.type).toBe('raise');
    expect(sharp.action.amount).toBeGreaterThan(friendly.action.amount ?? 0);
    expect(friendly.action.amount).toBeGreaterThanOrEqual(legal.minRaiseTo);
    expect(sharp.action.amount).toBeLessThanOrEqual(legal.maxRaiseTo);
  });

  it('keeps a production-depth six-player Sharp decision local and responsive', () => {
    const state = createMultiwayHand({ players: players(6), buttonSeat: 0, random: seededRandom(406) });
    const startedAt = performance.now();
    const decision = decideMultiwayAiAction(state, 'ai-3', {
      difficulty: 'sharp',
      random: seededRandom(9001),
    });
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1_000);
    expect(() => applyMultiwayAction(state, 'ai-3', decision.action)).not.toThrow();
  });

  it.each([4, 5])('supports complete %i-player AI tables', (tableSize) => {
    const result = simulateMultiwayAiTable('club', tableSize, {
      hands: 8,
      samplesPerDecision: 16,
      seed: 73_000 + tableSize,
    });

    expect(result.completedHands).toBe(8);
    expect(result.decisions).toBeGreaterThan(8);
    expect(result.raises).toBeGreaterThan(0);
  });

  it('finishes seeded three- and six-player tables for every difficulty', () => {
    const metrics = (['friendly', 'club', 'sharp'] as const).flatMap((difficulty) => (
      [3, 6].map((tableSize) => simulateMultiwayAiTable(difficulty, tableSize, {
        hands: 20,
        samplesPerDecision: 20,
        seed: 91_000 + tableSize * 101,
      }))
    ));

    if (process.env.PRINT_MULTIWAY_AI_METRICS === '1') {
      console.table(metrics.map((result) => ({
        difficulty: result.difficulty,
        players: result.tableSize,
        decisions: result.decisions,
        raisePct: Math.round(result.aggressionRate * 1_000) / 10,
        bluffPct: Math.round(result.bluffRate * 1_000) / 10,
        foldFacingPct: Math.round(result.foldRateFacingBet * 1_000) / 10,
        showdownPct: Math.round(result.showdowns / result.hands * 1_000) / 10,
      })));
    }

    metrics.forEach((result) => {
      expect(result.completedHands).toBe(20);
      expect(result.decisions).toBeGreaterThan(20);
      expect(result.raises).toBeGreaterThan(0);
    });
    const friendlySix = metrics.find((result) => result.difficulty === 'friendly' && result.tableSize === 6)!;
    const clubSix = metrics.find((result) => result.difficulty === 'club' && result.tableSize === 6)!;
    const sharpSix = metrics.find((result) => result.difficulty === 'sharp' && result.tableSize === 6)!;
    expect(friendlySix.aggressionRate).toBeLessThan(clubSix.aggressionRate);
    expect(clubSix.aggressionRate).toBeLessThan(sharpSix.aggressionRate);
    expect(friendlySix.bluffRate).toBeLessThan(sharpSix.bluffRate);
    expect(Object.values(sharpSix.identityDecisionCounts).filter((count) => count > 0)).toHaveLength(5);
  }, 30_000);
});
