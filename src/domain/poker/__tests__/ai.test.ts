import { describe, expect, it } from 'vitest';

import { decideAiAction, selectAiActionForEquity } from '../ai';
import { AI_DIFFICULTY_OPTIONS, AI_STRATEGY_PROFILES } from '../aiProfiles';
import { simulateAiDifficulty } from '../aiSimulation';
import { seededRandom } from '../cards';
import { applyAction, createHand } from '../engine';
import { createFairHeadsUpDecisionState } from '../fairness';
import {
  applyOpponentObservation,
  buildOpponentAdaptation,
  createEmptyOpponentMemory,
} from '../opponentMemory';

function stateFacingRaise() {
  const initial = createHand({ button: 'hero', random: seededRandom(91) });
  return applyAction(initial, 'hero', { type: 'raise', amount: 80 });
}

function stateWithOptionToBet() {
  let state = createHand({ button: 'hero', random: seededRandom(92) });
  state = applyAction(state, 'hero', { type: 'call' });
  state = applyAction(state, 'villain', { type: 'check' });
  return {
    ...state,
    board: [
      { rank: 14, suit: 'spades' },
      { rank: 8, suit: 'hearts' },
      { rank: 2, suit: 'clubs' },
    ],
  } as typeof state;
}

describe('AI difficulty profiles', () => {
  it('uses its own preflop range without reading the opponent hidden cards', () => {
    const state = createHand({ button: 'villain', random: seededRandom(89) });
    state.players.villain.holeCards = [
      { rank: 14, suit: 'spades' },
      { rank: 13, suit: 'spades' },
    ];
    const changed = {
      ...state,
      players: {
        ...state.players,
        hero: {
          ...state.players.hero,
          holeCards: [
            { rank: 14 as const, suit: 'hearts' as const },
            { rank: 14 as const, suit: 'diamonds' as const },
          ],
        },
      },
    };
    const originalDecision = decideAiAction(
      createFairHeadsUpDecisionState(state, 'villain'),
      'villain',
      seededRandom(144),
      'club',
    );
    const changedDecision = decideAiAction(
      createFairHeadsUpDecisionState(changed, 'villain'),
      'villain',
      seededRandom(144),
      'club',
    );

    expect(originalDecision.action.type).toBe('raise');
    expect(changedDecision).toEqual(originalDecision);
  });

  it('keeps the postflop plan unchanged when hidden opponent cards change', () => {
    const state = stateWithOptionToBet();
    state.players.villain.holeCards = [
      { rank: 14, suit: 'clubs' },
      { rank: 13, suit: 'clubs' },
    ];
    const changed = {
      ...state,
      players: {
        ...state.players,
        hero: {
          ...state.players.hero,
          holeCards: [
            { rank: 8 as const, suit: 'spades' as const },
            { rank: 8 as const, suit: 'diamonds' as const },
          ],
        },
      },
    };

    const original = decideAiAction(
      createFairHeadsUpDecisionState(state, 'villain'),
      'villain',
      seededRandom(2_344),
      'sharp',
    );
    const changedDecision = decideAiAction(
      createFairHeadsUpDecisionState(changed, 'villain'),
      'villain',
      seededRandom(2_344),
      'sharp',
    );

    expect(changedDecision).toEqual(original);
  });

  it('defines three public presets plus ordered earned Championship tiers', () => {
    expect(AI_DIFFICULTY_OPTIONS.map((profile) => profile.id)).toEqual(['friendly', 'club', 'sharp']);
    expect(AI_STRATEGY_PROFILES.friendly.equitySamples).toBeLessThan(AI_STRATEGY_PROFILES.club.equitySamples);
    expect(AI_STRATEGY_PROFILES.club.equitySamples).toBeLessThan(AI_STRATEGY_PROFILES.sharp.equitySamples);
    expect(AI_STRATEGY_PROFILES.friendly.openValueFrequency).toBeLessThan(AI_STRATEGY_PROFILES.sharp.openValueFrequency);
    expect(AI_STRATEGY_PROFILES.friendly.standardValuePotFraction).toBeLessThan(AI_STRATEGY_PROFILES.club.standardValuePotFraction);
    expect(AI_STRATEGY_PROFILES.club.standardValuePotFraction).toBeLessThan(AI_STRATEGY_PROFILES.sharp.standardValuePotFraction);
    expect(AI_STRATEGY_PROFILES.sharp.equitySamples).toBeLessThan(AI_STRATEGY_PROFILES.elite.equitySamples);
    expect(AI_STRATEGY_PROFILES.elite.equitySamples).toBeLessThan(AI_STRATEGY_PROFILES.nemesis.equitySamples);
    expect(AI_STRATEGY_PROFILES.sharp.openValueFrequency).toBeLessThan(AI_STRATEGY_PROFILES.elite.openValueFrequency);
    expect(AI_STRATEGY_PROFILES.elite.openValueFrequency).toBeLessThan(AI_STRATEGY_PROFILES.nemesis.openValueFrequency);
  });

  it('lets Friendly make a forgiving loose call that Club folds', () => {
    const state = stateFacingRaise();
    const friendly = selectAiActionForEquity(state, 'villain', 0.24, 'friendly', 0.15);
    const club = selectAiActionForEquity(state, 'villain', 0.24, 'club', 0.15);

    expect(friendly.action.type).toBe('call');
    expect(club.action.type).toBe('fold');
  });

  it('gives Sharp thinner value pressure and larger value sizing', () => {
    const facing = stateFacingRaise();
    const friendlyFacing = selectAiActionForEquity(facing, 'villain', 0.7, 'friendly', 0.8);
    const sharpFacing = selectAiActionForEquity(facing, 'villain', 0.7, 'sharp', 0.8);
    expect(friendlyFacing.action.type).toBe('call');
    expect(sharpFacing.action.type).toBe('raise');

    const checkedTo = stateWithOptionToBet();
    const friendlyValue = selectAiActionForEquity(checkedTo, 'villain', 0.82, 'friendly', 0.1);
    const sharpValue = selectAiActionForEquity(checkedTo, 'villain', 0.82, 'sharp', 0.1);
    expect(friendlyValue.action.type).toBe('raise');
    expect(sharpValue.action.type).toBe('raise');
    expect(sharpValue.action.amount).toBeGreaterThan(friendlyValue.action.amount ?? 0);
  });

  it('gives Sharp a mixed bluff that the other profiles check', () => {
    const state = stateWithOptionToBet();
    expect(selectAiActionForEquity(state, 'villain', 0.25, 'friendly', 0.12).action.type).toBe('check');
    expect(selectAiActionForEquity(state, 'villain', 0.25, 'club', 0.12).action.type).toBe('check');
    expect(selectAiActionForEquity(state, 'villain', 0.25, 'sharp', 0.12).action.type).toBe('raise');
  });

  it('adds only bounded bluff pressure after an established public fold pattern', () => {
    const state = stateWithOptionToBet();
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
    const adaptation = buildOpponentAdaptation(memory, 1);
    const baseline = selectAiActionForEquity(state, 'villain', 0.25, 'club', 0.105);
    const adjusted = selectAiActionForEquity(state, 'villain', 0.25, 'club', 0.105, adaptation);

    expect(baseline.action.type).toBe('check');
    expect(adjusted.action.type).toBe('raise');
    expect(adaptation.bluffFrequencyScale).toBeLessThanOrEqual(1.6);
  });

  it('completes repeatable varied-hand simulations without illegal actions or lost chips', () => {
    const metrics = AI_DIFFICULTY_OPTIONS.map((profile) => simulateAiDifficulty(profile.id, 40));
    if (process.env.PRINT_AI_METRICS === '1') {
      console.table(metrics.map((result) => ({
        difficulty: result.difficulty,
        decisions: result.decisions,
        raisePct: Math.round(result.aggressionRate * 1_000) / 10,
        bluffPct: Math.round(result.bluffRate * 1_000) / 10,
        foldFacingPct: Math.round(result.foldRateFacingBet * 1_000) / 10,
        averageRaisePotPct: Math.round(result.averageRaisePotFraction * 1_000) / 10,
      })));
    }
    for (const result of metrics) {
      expect(result.completedHands).toBe(40);
      expect(result.decisions).toBeGreaterThan(40);
      expect(result.raises).toBeGreaterThan(0);
    }
    const [friendly, club, sharp] = metrics;
    expect(friendly!.aggressionRate).toBeLessThan(club!.aggressionRate);
    expect(club!.aggressionRate).toBeLessThan(sharp!.aggressionRate);
    expect(friendly!.bluffRate).toBeLessThan(club!.bluffRate);
    expect(club!.bluffRate).toBeLessThan(sharp!.bluffRate);
    // Tier shaping now happens on the range table (`applyTier`), where
    // Friendly's profile is explicitly passive-loose: 30% of its raise mass
    // becomes calls and its `wide` bands widen. The observable signature is a
    // higher call share — it enters more marginal pots than Sharp and so also
    // faces (and folds to) more postflop bets.
    expect(friendly!.calls / friendly!.decisions).toBeGreaterThan(sharp!.calls / sharp!.decisions);
    // Sharp adds more small bluffs, so its blended average need not exceed
    // Club's value-heavy sizing. It should still size above Friendly overall.
    expect(friendly!.averageRaisePotFraction).toBeLessThan(sharp!.averageRaisePotFraction);
  }, 15_000);

  it('shows bounded adaptation across a repeatable 60-hand corpus', () => {
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
    const baseline = simulateAiDifficulty('sharp', 60, 84_221);
    const adapted = simulateAiDifficulty('sharp', 60, 84_221, foldMemory);

    if (process.env.PRINT_AI_METRICS === '1') {
      console.table([
        { profile: 'baseline', raises: baseline.raises, bluffs: baseline.bluffs, calls: baseline.calls, folds: baseline.folds },
        { profile: 'adaptive', raises: adapted.raises, bluffs: adapted.bluffs, calls: adapted.calls, folds: adapted.folds },
      ]);
    }

    expect(adapted.completedHands).toBe(60);
    expect(adapted.bluffs).toBeGreaterThanOrEqual(baseline.bluffs);
    expect([adapted.raises, adapted.calls, adapted.folds]).not.toEqual([
      baseline.raises,
      baseline.calls,
      baseline.folds,
    ]);
    expect(Math.abs(adapted.aggressionRate - baseline.aggressionRate)).toBeLessThan(0.08);
    // 30s mirrors the base branch's "Stabilize AI simulation timeout" fix: the
    // ~6s local runtime lands past 15s on the ~2-3x slower CI runner.
  }, 30_000);
});
