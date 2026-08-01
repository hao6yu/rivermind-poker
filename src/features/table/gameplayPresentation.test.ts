import { describe, expect, it } from 'vitest';

import type { ActionRecord, GameState, LegalActions } from '../../domain/poker/types';
import {
  aiThinkingLabel,
  aiTurnDelayMs,
  buildBetSizeOptions,
  buildHandResultSummary,
  clampRaiseTarget,
  formatLatestAction,
  hapticCueForOutcome,
  hapticCueForPlayerAction,
  motionDuration,
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

    expect(formatLatestAction(base, 20)).toBe('Mara bet 3 BB');
    expect(formatLatestAction({
      ...base,
      player: 'hero',
      decisionContext: { ...base.decisionContext, currentBet: 40 },
    }, 20)).toBe('You raised to 3 BB');
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
      heroDelta: '+4.5 BB',
      heroStack: '54.5 BB',
      pot: '9 BB',
      title: 'You win the hand',
      tone: 'win',
      villainStack: '45.5 BB',
    });
  });

  it('paces AI decisions deterministically within an efficient range', () => {
    const simple = aiTurnDelayMs({
      baseDelayMs: 720,
      handNumber: 4,
      historyLength: 2,
      legal: { ...legal, canFold: false, canCall: false, toCall: 0 },
      pot: 80,
      street: 'flop',
    });
    const sameSpot = aiTurnDelayMs({
      baseDelayMs: 720,
      handNumber: 4,
      historyLength: 2,
      legal: { ...legal, canFold: false, canCall: false, toCall: 0 },
      pot: 80,
      street: 'flop',
    });
    const pressuredRiver = aiTurnDelayMs({
      baseDelayMs: 720,
      handNumber: 4,
      historyLength: 2,
      legal: { ...legal, toCall: 160 },
      pot: 240,
      street: 'river',
    });

    expect(simple).toBe(sameSpot);
    expect(simple).toBeGreaterThanOrEqual(420);
    expect(pressuredRiver).toBeLessThanOrEqual(1_450);
    expect(pressuredRiver).toBeGreaterThan(simple);
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
});
