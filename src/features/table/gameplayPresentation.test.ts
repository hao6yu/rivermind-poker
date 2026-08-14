import { describe, expect, it } from 'vitest';

import type { ActionRecord, GameState, LegalActions } from '../../domain/poker/types';
import {
  aiThinkingLabel,
  aiTurnDelayMs,
  buildBetSizeOptions,
  buildHandResultSummary,
  clampRaiseTarget,
  coachReviewButtonLabel,
  coachReviewState,
  formatLatestAction,
  headsUpActionBubbleDurationMs,
  headsUpSeatRole,
  hapticCueForOutcome,
  hapticCueForPlayerAction,
  motionDuration,
  shouldRequestCoachReview,
} from './gameplayPresentation';

const legal: LegalActions = {
  canFold: true,
  canCheck: false,
  canCall: true,
  canRaise: true,
  toCall: 20,
  minRaiseTo: 60,
  maxRaiseTo: 1_000,
  suggestedRaiseTo: 100,
};

describe('gameplay presentation', () => {
  it('requests a coach review only before the hand has review state', () => {
    const idle = coachReviewState({ hasError: false, hasResult: false, loading: false });
    const loading = coachReviewState({ hasError: false, hasResult: false, loading: true });
    const ready = coachReviewState({ hasError: false, hasResult: true, loading: false });
    const error = coachReviewState({ hasError: true, hasResult: false, loading: false });

    expect(shouldRequestCoachReview(idle)).toBe(true);
    expect(coachReviewButtonLabel(idle)).toBe('AI review');
    for (const cachedState of [loading, ready, error]) {
      expect(shouldRequestCoachReview(cachedState)).toBe(false);
    }
    expect(coachReviewButtonLabel(loading)).toBe('Reviewing…');
    expect(coachReviewButtonLabel(ready)).toBe('View review');
    expect(coachReviewButtonLabel(error)).toBe('View review');
  });

  it('builds legal, deduplicated raise presets', () => {
    expect(buildBetSizeOptions({
      bigBlind: 20,
      currentBet: 40,
      playerStreetBet: 20,
      pot: 70,
      legal,
    })).toEqual([
      { id: 'minimum', label: 'Minimum', target: 60 },
      { id: 'two-and-half-x', label: '2.5×', target: 100 },
      { id: 'three-x', label: '3×', target: 120 },
      { id: 'all-in', label: 'All-in', target: 1_000 },
    ]);
  });

  it('builds pot-relative bet presets and keeps every target legal', () => {
    const options = buildBetSizeOptions({
      bigBlind: 20,
      currentBet: 0,
      playerStreetBet: 0,
      pot: 120,
      legal: { ...legal, toCall: 0, minRaiseTo: 20, suggestedRaiseTo: 80 },
    });

    expect(options.map(({ label, target }) => ({ label, target }))).toEqual([
      { label: '⅓ pot', target: 40 },
      { label: '½ pot', target: 60 },
      { label: '¾ pot', target: 90 },
      { label: 'Pot', target: 120 },
      { label: 'All-in', target: 1_000 },
    ]);
  });

  it('collapses a short stack to its only legal all-in size', () => {
    const shortLegal = { ...legal, minRaiseTo: 75, maxRaiseTo: 75 };
    expect(buildBetSizeOptions({
      bigBlind: 20,
      currentBet: 40,
      playerStreetBet: 20,
      pot: 100,
      legal: shortLegal,
    })).toEqual([{ id: 'all-in', label: 'All-in', target: 75 }]);
    expect(clampRaiseTarget(60, shortLegal)).toBe(75);
  });

  it('uses bet or raise wording from the action snapshot', () => {
    const base: ActionRecord = {
      player: 'villain',
      type: 'raise',
      amount: 60,
      street: 'flop',
      potAfter: 100,
      decisionContext: {
        board: [],
        potBefore: 40,
        currentBet: 0,
        toCall: 0,
        playerStackBefore: 980,
        opponentStackBefore: 980,
        playerStreetBetBefore: 0,
        opponentStreetBetBefore: 0,
        legalActions: legal,
      },
    };

    expect(formatLatestAction(base, 20)).toBe('Mara bet 60');
    expect(formatLatestAction({
      ...base,
      player: 'hero',
      decisionContext: { ...base.decisionContext, currentBet: 40 },
    }, 20)).toBe('You raised to 60');
  });

  it('summarizes the winning hand, actual stack movement, and new stacks', () => {
    const game = {
      bigBlind: 20,
      outcome: {
        winner: 'hero',
        message: 'You win with a pair of aces.',
        potWon: 180,
        showdown: true,
        heroHand: 'a pair of aces',
        villainHand: 'a pair of queens',
      },
      players: {
        hero: { stack: 1_090 },
        villain: { stack: 910 },
      },
    } as GameState;

    expect(buildHandResultSummary(game, 1_000)).toEqual({
      detail: 'Winning hand · A pair of aces',
      heroDelta: '+90',
      heroStack: '1,090',
      pot: '180',
      title: 'You win the hand',
      tone: 'win',
      villainStack: '910',
    });
  });

  it('paces AI decisions deterministically while giving consequential moves more room', () => {
    const simpleCheck = aiTurnDelayMs({
      action: { type: 'check' },
      baseDelayMs: 720,
      handNumber: 4,
      historyLength: 2,
      legal: { ...legal, canFold: false, canCall: false, toCall: 0 },
      pot: 80,
      street: 'flop',
    });
    const sameSpot = aiTurnDelayMs({
      action: { type: 'check' },
      baseDelayMs: 720,
      handNumber: 4,
      historyLength: 2,
      legal: { ...legal, canFold: false, canCall: false, toCall: 0 },
      pot: 80,
      street: 'flop',
    });
    const simpleFold = aiTurnDelayMs({
      action: { type: 'fold' },
      baseDelayMs: 720,
      handNumber: 4,
      historyLength: 2,
      legal: { ...legal, canRaise: false, toCall: 20 },
      pot: 80,
      street: 'flop',
    });
    const pressuredRiverRaise = aiTurnDelayMs({
      action: { type: 'raise', amount: 520 },
      baseDelayMs: 720,
      handNumber: 4,
      historyLength: 2,
      legal: { ...legal, toCall: 160 },
      pot: 240,
      street: 'river',
    });

    expect(simpleCheck).toBe(sameSpot);
    expect(simpleFold).toBeLessThanOrEqual(simpleCheck);
    expect(simpleCheck).toBeGreaterThanOrEqual(1_450);
    expect(pressuredRiverRaise).toBeLessThanOrEqual(2_450);
    expect(pressuredRiverRaise).toBeGreaterThan(simpleCheck + 350);
  });

  it('keeps the prior heads-up action visible for its full reading window', () => {
    const firstAction = aiTurnDelayMs({
      action: { type: 'fold' },
      baseDelayMs: 560,
      handNumber: 1,
      historyLength: 0,
      legal: { ...legal, canRaise: false },
      pot: 30,
      street: 'preflop',
    });
    const replyingToAction = aiTurnDelayMs({
      action: { type: 'fold' },
      baseDelayMs: 560,
      handNumber: 1,
      historyLength: 1,
      legal: { ...legal, canRaise: false },
      pot: 60,
      street: 'preflop',
    });

    expect(firstAction).toBeGreaterThanOrEqual(900);
    expect(replyingToAction).toBeGreaterThanOrEqual(1_450);
  });

  it('applies the global visual pace without changing the selected action', () => {
    const context = {
      action: { type: 'call' as const },
      baseDelayMs: 720,
      handNumber: 6,
      historyLength: 3,
      legal,
      pot: 180,
      street: 'turn' as const,
    };
    const brisk = aiTurnDelayMs({ ...context, pace: 'brisk' });
    const normal = aiTurnDelayMs({ ...context, pace: 'normal' });
    const relaxed = aiTurnDelayMs({ ...context, pace: 'relaxed' });

    expect(brisk).toBeLessThan(normal);
    expect(normal).toBeLessThan(relaxed);
    expect(brisk).toBeGreaterThanOrEqual(headsUpActionBubbleDurationMs('brisk'));
    expect(normal).toBeGreaterThanOrEqual(headsUpActionBubbleDurationMs('normal'));
    expect(relaxed).toBeGreaterThanOrEqual(headsUpActionBubbleDurationMs('relaxed'));
  });

  it('takes more time over the same raise as the street and pot become more consequential', () => {
    const context = {
      action: { type: 'raise' as const, amount: 240 },
      baseDelayMs: 720,
      handNumber: 8,
      historyLength: 5,
      legal,
    };
    const smallFlop = aiTurnDelayMs({ ...context, pot: 80, street: 'flop' });
    const largeRiver = aiTurnDelayMs({ ...context, pot: 640, street: 'river' });

    expect(largeRiver).toBeGreaterThan(smallFlop + 300);
  });

  it('uses concise thinking copy that reflects the decision context', () => {
    expect(aiThinkingLabel('flop', 40)).toBe('Mara is weighing the price…');
    expect(aiThinkingLabel('river', 0)).toBe('Mara is reading the river…');
    expect(aiThinkingLabel('preflop', 0)).toBe('Mara is thinking…');
  });

  it('maps meaningful actions and results to restrained haptic cues', () => {
    expect(hapticCueForPlayerAction({ type: 'check' })).toBe('light');
    expect(hapticCueForPlayerAction({ type: 'raise', amount: 120 })).toBe('medium');
    expect(hapticCueForPlayerAction({ type: 'fold' })).toBe('selection');
    expect(hapticCueForOutcome('hero')).toBe('success');
    expect(hapticCueForOutcome('villain')).toBe('warning');
    expect(hapticCueForOutcome('tie')).toBe('selection');
  });

  it('turns motion durations off when the OS requests reduced motion', () => {
    expect(motionDuration(220, false)).toBe(220);
    expect(motionDuration(220, true)).toBe(0);
  });

  it('keeps heads-up role badges limited to dealer and big blind', () => {
    expect(headsUpSeatRole('hero', 'hero')).toBe('D');
    expect(headsUpSeatRole('hero', 'villain')).toBe('BB');
    expect(headsUpSeatRole('villain', 'villain')).toBe('D');
    expect(headsUpSeatRole('villain', 'hero')).toBe('BB');
  });
});
