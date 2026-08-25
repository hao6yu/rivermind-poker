import { describe, expect, it } from 'vitest';

import { applyAction, createHand } from '../engine';
import { seededRandom } from '../cards';
import type { Card, GameState, CoachHandGrade } from '../types';
import { gradeHeadsUpHand, type DecisionComparison } from '../decisionGrading';

const acesCards: [Card, Card] = [
  { rank: 14, suit: 'spades' },
  { rank: 14, suit: 'hearts' },
];

function heroesWithAces(seed: number): GameState {
  const base = createHand({ button: 'hero', random: seededRandom(seed) });
  return {
    ...base,
    players: { ...base.players, hero: { ...base.players.hero, holeCards: acesCards } },
  };
}
import { classifyDecision } from '../decisionReviewPresentation';
import type { DecisionPresentationClass } from '../decisionReviewPresentation';

function fixture(overrides: Partial<DecisionComparison>): DecisionComparison {
  return {
    alternative: null,
    baseline: { action: 'fold', label: 'Fold', amountChips: undefined },
    chosen: { action: 'fold', label: 'Fold', amountChips: undefined },
    detail: 'Deterministic test detail.',
    focusArea: 'preflop',
    grade: 'close',
    authoredMixedAction: false,
    relativeScoreGap: 0,
    sequence: 1,
    street: 'preflop',
    summary: 'Deterministic test summary.',
    ...overrides,
  };
}

/** The classification plus the two axes the card splits copy on. */
function classify(overrides: Partial<DecisionComparison>): {
  actionFamilyMatch: boolean;
  classification: DecisionPresentationClass;
  hasSizingDifference: boolean;
} {
  const presentation = classifyDecision(fixture(overrides));
  return {
    actionFamilyMatch: presentation.actionFamilyMatch,
    classification: presentation.classification,
    hasSizingDifference: presentation.hasSizingDifference,
  };
}

describe('decision presentation classification (Phase 16 Slice 0)', () => {
  it('maps strong + same action family to Recommended', () => {
    const result = classify({
      grade: 'strong',
      chosen: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
      baseline: { action: 'raise', label: 'Raise to 27', amountChips: 27 },
    });
    expect(result.classification).toBe('recommended');
    expect(result.actionFamilyMatch).toBe(true);
    expect(result.hasSizingDifference).toBe(false);
  });

  it('keeps a sizing-only delta out of the action label and flags it separately', () => {
    // A strong match on a slightly different raise size is still Recommended —
    // the size question is carried by the sizing note, not the action label.
    const result = classify({
      grade: 'strong',
      focusArea: 'bet-sizing',
      chosen: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
      baseline: { action: 'raise', label: 'Raise to 26', amountChips: 26 },
    });
    expect(result.classification).toBe('recommended');
    expect(result.actionFamilyMatch).toBe(true);
    expect(result.hasSizingDifference).toBe(true);
  });

  it('maps close + same action family to Close decision', () => {
    const result = classify({
      grade: 'close',
      chosen: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
      baseline: { action: 'raise', label: 'Raise to 27', amountChips: 27 },
    });
    expect(result.classification).toBe('closeDecision');
    expect(result.actionFamilyMatch).toBe(true);
  });

  it('maps a close on a different authored leg to Acceptable alternative', () => {
    const result = classify({
      grade: 'close',
      authoredMixedAction: true,
      chosen: { action: 'call', label: 'Call 30', amountChips: 30 },
      baseline: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
    });
    expect(result.classification).toBe('acceptableAlternative');
    expect(result.actionFamilyMatch).toBe(false);
  });

  it('maps a close on a different family the model did not author to Close decision', () => {
    const result = classify({
      grade: 'close',
      authoredMixedAction: false,
      chosen: { action: 'call', label: 'Call 30', amountChips: 30 },
      baseline: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
    });
    expect(result.classification).toBe('closeDecision');
    expect(result.actionFamilyMatch).toBe(false);
  });

  it('maps strong on a different authored leg to Acceptable alternative', () => {
    const result = classify({
      grade: 'strong',
      authoredMixedAction: true,
      chosen: { action: 'call', label: 'Call 30', amountChips: 30 },
      baseline: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
    });
    expect(result.classification).toBe('acceptableAlternative');
    expect(result.actionFamilyMatch).toBe(false);
  });

  it('maps every mistake to Costly mistake regardless of family', () => {
    const result = classify({
      grade: 'mistake',
      chosen: { action: 'fold', label: 'Fold', amountChips: undefined },
      baseline: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
    });
    expect(result.classification).toBe('costlyMistake');
  });

  it('classifies every internal grade without throwing', () => {
    const grades: CoachHandGrade[] = ['strong', 'close', 'mistake'];
    grades.forEach((grade) => {
      expect(() => classifyDecision(fixture({ grade, authoredMixedAction: false }))).not.toThrow();
    });
  });
});

/**
 * Integration regressions over real graded hands, so the presentation class
 * cannot drift from the grade independently of these tests.
 */
describe('decision presentation classification integration', () => {
  function graded(hand: GameState): DecisionComparison {
    return gradeHeadsUpHand(hand).decisions[0]!;
  }

  it('grades a premium opening raise as Recommended with the same action family', () => {
    let game = heroesWithAces(9_101);
    game = applyAction(game, 'hero', { type: 'raise', amount: 50 });

    const { classification, actionFamilyMatch, hasSizingDifference } = classifyDecision(graded(game));

    expect(classification).toBe('recommended');
    expect(actionFamilyMatch).toBe(true);
    expect(hasSizingDifference).toBe(false);
  });

  it('folds a premium hand the tables never fold and keeps it Costly mistake', () => {
    const game = applyAction(heroesWithAces(9_105), 'hero', { type: 'fold' });
    const { classification } = classifyDecision(graded(game));
    expect(classification).toBe('costlyMistake');
  });

  it('keeps the Fold-vs-Call mixed-leg presentation as Acceptable alternative, not a baseline copy', () => {
    // The tables author a K9o big-blind call defense; a player calling a 50 raise
    // is on an authored mixed leg, so the card must not describe it as following
    // the Raise baseline.
    const base = createHand({ button: 'villain', random: seededRandom(9_104) });
    let game: GameState = {
      ...base,
      players: {
        ...base.players,
        hero: { ...base.players.hero, holeCards: [{ rank: 13, suit: 'spades' }, { rank: 9, suit: 'hearts' }] },
      },
    };
    game = applyAction(game, 'villain', { type: 'raise', amount: 50 });
    game = applyAction(game, 'hero', { type: 'raise', amount: 150 });

    const decision = graded(game);
    expect(decision.grade).toBe('close');
    expect(decision.chosen.action).toBe('raise');
    expect(decision.baseline.action).toBe('call');

    const { classification, actionFamilyMatch } = classifyDecision(decision);
    expect(decision.authoredMixedAction).toBe(true);
    expect(actionFamilyMatch).toBe(false);
    expect(classification).toBe('acceptableAlternative');
  });
});
