import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import type { AiDifficulty } from '../aiProfiles';
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
import {
  applyOpponentObservation,
  buildOpponentAdaptation,
  createEmptyOpponentMemory,
} from '../opponentMemory';
import { createFairMultiwayDecisionState } from '../fairness';

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

function simulateSmallBlindOpenDefense(
  difficulty: AiDifficulty,
  hands = 400,
  opponentMemory = createEmptyOpponentMemory(),
) {
  const actions = { calls: 0, folds: 0, raises: 0 };
  for (let hand = 0; hand < hands; hand += 1) {
    let state = createMultiwayHand({
      players: players(6),
      buttonSeat: 5,
      random: seededRandom(120_000 + hand * 101),
    });
    expect(state.players.hero?.position).toBe('SB');
    while (state.toAct !== 'hero') {
      const playerId = state.toAct;
      if (!playerId) throw new Error('The small-blind defense corpus lost its actor.');
      state = applyMultiwayAction(state, playerId, { type: 'fold' });
    }
    state = applyMultiwayAction(state, 'hero', { type: 'raise', amount: 50 });
    const playerId = state.toAct;
    if (!playerId || playerId === 'hero') throw new Error('The big blind did not face the steal.');
    const player = state.players[playerId];
    if (!player) throw new Error('The defending big blind is missing.');
    const decision = decideMultiwayAiAction(createFairMultiwayDecisionState(state, playerId), playerId, {
      difficulty,
      identity: multiwayAiIdentityAt(player.seat - 1),
      identities: Object.fromEntries(state.tablePlayerIds
        .filter((id) => id !== 'hero')
        .map((id) => [id, multiwayAiIdentityAt((state.players[id]?.seat ?? 1) - 1)])),
      opponentMemory,
      random: seededRandom(220_000 + hand * 307),
      simulations: 1,
      tournament: { enabled: true, qualifyingPlace: 1 },
    });
    if (decision.action.type === 'fold') actions.folds += 1;
    if (decision.action.type === 'call') actions.calls += 1;
    if (decision.action.type === 'raise') actions.raises += 1;
  }
  return {
    ...actions,
    defendRate: (actions.calls + actions.raises) / hands,
    foldRate: actions.folds / hands,
  };
}

describe('multiway AI identities and decisions', () => {
  it('keeps a unique expanded roster across five stable personalities', () => {
    expect(MULTIWAY_AI_IDENTITIES).toHaveLength(27);
    expect(new Set(MULTIWAY_AI_IDENTITIES.map((identity) => identity.id)).size).toBe(27);
    expect(new Set(MULTIWAY_AI_IDENTITIES.map((identity) => identity.name)).size).toBe(27);
    expect(new Set(MULTIWAY_AI_IDENTITIES.map((identity) => identity.style)).size).toBe(5);
    expect(MULTIWAY_AI_IDENTITIES.filter((identity) => identity.level === 'friendly')).toHaveLength(7);
    expect(MULTIWAY_AI_IDENTITIES.filter((identity) => identity.level === 'club')).toHaveLength(9);
    expect(MULTIWAY_AI_IDENTITIES.filter((identity) => identity.level === 'sharp')).toHaveLength(11);
    expect(multiwayAiIdentityAt(0)).toBe(multiwayAiIdentityAt(7));
    expect(multiwayAiIdentityAt(0, 'club').name).toBe('Kai');
    expect(multiwayAiIdentityForSeat(3).name).toBe('June');
    expect(MULTIWAY_AI_IDENTITIES.find((identity) => identity.name === 'Zhou')?.title).toBe('The Table Boss');
    expect(MULTIWAY_AI_IDENTITIES.find((identity) => identity.name === 'Uncle Tu')?.title).toBe('The Steady Hand');
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
    const originalView = createFairMultiwayDecisionState(state, 'ai-1');
    const changedView = createFairMultiwayDecisionState(changedHiddenCards, 'ai-1');
    const original = decideMultiwayAiAction(originalView, 'ai-1', {
      identity,
      simulations: 90,
      random: seededRandom(7001),
    });
    const changed = decideMultiwayAiAction(changedView, 'ai-1', {
      identity,
      simulations: 90,
      random: seededRandom(7001),
    });

    expect(changed).toEqual(original);
    expect(originalView.deck).toEqual([]);
    expect(originalView.players.hero?.holeCards).toEqual([]);
    expect(originalView.players['ai-2']?.holeCards).toEqual([]);
    expect(changedView.players['ai-1']?.holeCards).toEqual(originalView.players['ai-1']?.holeCards);
  });

  it('keeps a postflop decision unchanged when every other hidden hand changes', () => {
    const state = stateCheckedToAi();
    state.players['ai-1']!.holeCards = [card(13, 'diamonds'), card(12, 'diamonds')];
    const changed: MultiwayHandState = {
      ...state,
      players: {
        ...state.players,
        hero: { ...state.players.hero!, holeCards: [card(14, 'hearts'), card(14, 'diamonds')] },
        'ai-2': { ...state.players['ai-2']!, holeCards: [card(8, 'clubs'), card(8, 'spades')] },
      },
    };
    const options = {
      difficulty: 'sharp' as const,
      identity: multiwayAiIdentityForSeat(1),
      simulations: 140,
    };
    const original = decideMultiwayAiAction(createFairMultiwayDecisionState(state, 'ai-1'), 'ai-1', {
      ...options,
      random: seededRandom(7_701),
    });
    const changedDecision = decideMultiwayAiAction(createFairMultiwayDecisionState(changed, 'ai-1'), 'ai-1', {
      ...options,
      random: seededRandom(7_701),
    });

    expect(changedDecision).toEqual(original);
  });

  it('prices the same premium hand lower as more live ranges enter the pot', () => {
    const headsUp = createMultiwayHand({ players: players(2), buttonSeat: 0, random: seededRandom(403) });
    const sixHanded = createMultiwayHand({ players: players(6), buttonSeat: 0, random: seededRandom(404) });
    headsUp.players.hero!.holeCards = [card(14, 'spades'), card(14, 'hearts')];
    sixHanded.players.hero!.holeCards = [card(14, 'spades'), card(14, 'hearts')];

    const headsUpEquity = estimateMultiwayEquity(createFairMultiwayDecisionState(headsUp, 'hero'), 'hero', {
      simulations: 700,
      random: seededRandom(8001),
    });
    const sixHandedEquity = estimateMultiwayEquity(createFairMultiwayDecisionState(sixHanded, 'hero'), 'hero', {
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

  it('applies opponent identity through the production preflop decision path', () => {
    const initial = createMultiwayHand({ players: players(3), buttonSeat: 1, random: seededRandom(4_071) });
    initial.players['ai-1']!.holeCards = [card(13, 'spades'), card(6, 'hearts')];
    const fair = createFairMultiwayDecisionState(initial, 'ai-1');
    const patient = decideMultiwayAiAction(fair, 'ai-1', {
      identity: multiwayAiIdentityAt(1),
      simulations: 1,
      random: () => 0.5,
    });
    const pressure = decideMultiwayAiAction(fair, 'ai-1', {
      identity: multiwayAiIdentityAt(2),
      simulations: 1,
      random: () => 0.5,
    });

    expect(patient.action.type).toBe('fold');
    expect(pressure.action.type).toBe('raise');
  });

  it('uses the production decision path to shove a critical tournament stack', () => {
    const tablePlayers = players(6).map((player) => (
      player.id === 'ai-3' ? { ...player, stack: 160 } : player
    ));
    const state = createMultiwayHand({ players: tablePlayers, buttonSeat: 0, random: seededRandom(4_072) });
    state.players['ai-3']!.holeCards = [card(14, 'spades'), card(11, 'spades')];
    const decision = decideMultiwayAiAction(
      createFairMultiwayDecisionState(state, 'ai-3'),
      'ai-3',
      {
        difficulty: 'club',
        identity: multiwayAiIdentityForSeat(3),
        simulations: 1,
        random: () => 0,
        tournament: { enabled: true, qualifyingPlace: 1 },
      },
    );

    expect(decision.action).toEqual({ type: 'raise', amount: 160 });
    expect(decision.tournamentPressureLabel).toContain('Push-or-fold zone');
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

  it('uses an established fold read for a narrow extra multiway bluff window', () => {
    const state = stateCheckedToAi();
    let memory = createEmptyOpponentMemory();
    for (let hand = 0; hand < 30; hand += 1) {
      memory = applyOpponentObservation(memory, {
        actions: [
          { facingBet: false, street: 'preflop', type: 'call' },
          { facingBet: true, street: 'flop', type: 'fold' },
        ],
        position: 'late',
      });
    }
    const identity = multiwayAiIdentityAt(2);
    const baseline = selectMultiwayAiActionForEquity(state, 'ai-1', 0.05, 'club', identity, 0.03);
    const adjusted = selectMultiwayAiActionForEquity(
      state,
      'ai-1',
      0.05,
      'club',
      identity,
      0.03,
      buildOpponentAdaptation(memory),
    );

    expect(baseline.action.type).toBe('check');
    expect(adjusted.action.type).toBe('raise');
    expect(adjusted.style).toBe('bluff');
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

  it('does not surrender the big blind too often to a repeated 2.5 BB small-blind open', () => {
    const results = (['friendly', 'club', 'sharp', 'elite', 'nemesis'] as const).map((difficulty) => ({
      difficulty,
      ...simulateSmallBlindOpenDefense(difficulty),
    }));

    if (process.env.PRINT_MULTIWAY_AI_METRICS === '1') console.table(results);
    results.forEach((result) => expect(result.defendRate).toBeGreaterThanOrEqual(0.48));
    expect(results.find((result) => result.difficulty === 'sharp')!.raises).toBeGreaterThan(
      results.find((result) => result.difficulty === 'club')!.raises,
    );
    expect(results.find((result) => result.difficulty === 'elite')!.raises).toBeGreaterThanOrEqual(
      results.find((result) => result.difficulty === 'sharp')!.raises,
    );
    expect(results.find((result) => result.difficulty === 'nemesis')!.raises).toBeGreaterThanOrEqual(
      results.find((result) => result.difficulty === 'elite')!.raises,
    );
  });

  it('defends more often after observing a persistent preflop raiser', () => {
    let aggressiveMemory = createEmptyOpponentMemory();
    for (let hand = 0; hand < 24; hand += 1) {
      aggressiveMemory = applyOpponentObservation(aggressiveMemory, {
        actions: [{ facingBet: false, street: 'preflop', type: 'raise' }],
        position: 'blind',
      });
    }
    const baseline = simulateSmallBlindOpenDefense('sharp');
    const adapted = simulateSmallBlindOpenDefense('sharp', 400, aggressiveMemory);

    if (process.env.PRINT_MULTIWAY_AI_METRICS === '1') console.table({ baseline, adapted });
    expect(adapted.defendRate).toBeGreaterThanOrEqual(baseline.defendRate + 0.02);
  });

  it('keeps a production-depth six-player Sharp decision local and responsive', () => {
    const state = createMultiwayHand({ players: players(6), buttonSeat: 0, random: seededRandom(406) });
    const startedAt = performance.now();
    const decision = decideMultiwayAiAction(createFairMultiwayDecisionState(state, 'ai-3'), 'ai-3', {
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
    const metrics = (['friendly', 'club', 'sharp', 'elite', 'nemesis'] as const).flatMap((difficulty) => (
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
        walkPct: Math.round(result.walkRate * 1_000) / 10,
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

  it('keeps six-player walks possible but uncommon across varied deals', () => {
    const result = simulateMultiwayAiTable('club', 6, {
      hands: 120,
      samplesPerDecision: 8,
      seed: 96_201,
    });

    expect(result.walks).toBeGreaterThan(0);
    expect(result.walkRate).toBeLessThan(0.12);
  }, 30_000);

  it('keeps all-AI six-player pots contested through a healthy number of showdowns', () => {
    const results = (['friendly', 'club', 'sharp', 'elite', 'nemesis'] as const).map((difficulty, index) => (
      simulateMultiwayAiTable(difficulty, 6, {
        hands: 200,
        heroStrategy: 'ai',
        samplesPerDecision: 8,
        seed: 96_401 + index * 10_000,
      })
    ));

    if (process.env.PRINT_MULTIWAY_AI_METRICS === '1') {
      console.table(results.map((result) => ({
        difficulty: result.difficulty,
        foldFacingPct: Math.round(result.foldRateFacingBet * 1_000) / 10,
        foldsFacingOpen: result.preflopFoldsFacingOpen,
        foldsFacingReraise: result.preflopFoldsFacingReraise,
        showdownPct: Math.round(result.showdowns / result.hands * 1_000) / 10,
        walkPct: Math.round(result.walkRate * 1_000) / 10,
      })));
    }
    results.forEach((result) => {
      const showdownFloor = result.difficulty === 'elite' || result.difficulty === 'nemesis'
        ? 0.18
        : 0.22;
      expect(result.showdowns / result.hands).toBeGreaterThanOrEqual(showdownFloor);
      expect(result.walkRate).toBeLessThan(0.12);
    });
  }, 30_000);

  it('keeps production personalities measurably distinct across a six-player corpus', () => {
    const result = simulateMultiwayAiTable('club', 6, {
      hands: 120,
      samplesPerDecision: 12,
      seed: 96_701,
    });
    const rate = (value: number, total: number) => value / Math.max(1, total);
    const patient = result.identityMetrics['iris-patient']!;
    const pressure = result.identityMetrics['dex-pressure']!;
    const sticky = result.identityMetrics['lena-sticky']!;

    if (process.env.PRINT_MULTIWAY_AI_METRICS === '1') {
      console.table(Object.entries(result.identityMetrics).map(([identity, metric]) => ({
        identity,
        decisions: metric.decisions,
        raisePct: Math.round(rate(metric.raises, metric.decisions) * 1_000) / 10,
        callPct: Math.round(rate(metric.calls, metric.decisions) * 1_000) / 10,
        callFacingPct: Math.round(rate(metric.callsFacingBet, metric.facedBetDecisions) * 1_000) / 10,
        foldPct: Math.round(rate(metric.folds, metric.decisions) * 1_000) / 10,
        bluffPct: Math.round(rate(metric.bluffs, metric.decisions) * 1_000) / 10,
      })));
    }

    expect(rate(pressure.raises, pressure.decisions)).toBeGreaterThan(rate(patient.raises, patient.decisions));
    expect(rate(sticky.callsFacingBet, sticky.facedBetDecisions)).toBeGreaterThan(
      rate(patient.callsFacingBet, patient.facedBetDecisions),
    );
    expect(rate(patient.folds, patient.decisions)).toBeGreaterThan(rate(sticky.folds, sticky.decisions));
  }, 30_000);

  it('keeps adaptive pressure subtle across varied seeded multiway hands', () => {
    let foldMemory = createEmptyOpponentMemory();
    for (let hand = 0; hand < 30; hand += 1) {
      foldMemory = applyOpponentObservation(foldMemory, {
        actions: [
          { facingBet: false, street: 'preflop', type: 'call' },
          { facingBet: true, street: 'flop', type: 'fold' },
        ],
        position: 'late',
      });
    }
    const baseline = simulateMultiwayAiTable('sharp', 3, {
      hands: 40,
      samplesPerDecision: 16,
      seed: 85_103,
    });
    const adapted = simulateMultiwayAiTable('sharp', 3, {
      hands: 40,
      opponentMemory: foldMemory,
      samplesPerDecision: 16,
      seed: 85_103,
    });

    expect(adapted.completedHands).toBe(40);
    expect(adapted.bluffs).toBeGreaterThanOrEqual(baseline.bluffs);
    expect([adapted.raises, adapted.calls, adapted.folds]).not.toEqual([
      baseline.raises,
      baseline.calls,
      baseline.folds,
    ]);
    expect(Math.abs(adapted.aggressionRate - baseline.aggressionRate)).toBeLessThan(0.08);
  }, 20_000);
});
