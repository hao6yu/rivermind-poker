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
import { classifyDecision, aggregateClassification } from '../decisionReviewPresentation';
import { handSummaryText } from '../../../features/table/tableReviewPresentation';
import { translate } from '../../../localization/core';
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

  it('maps strong on a different family the model did not author to Close decision', () => {
    // A strong is only Recommended when it is the same action family as the
    // baseline. A strong that is a different, unauthored family (e.g. a
    // Call instead of a Raise) must never read as a baseline match.
    const result = classify({
      grade: 'strong',
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

  it('never labels a real Fold-vs-Call a baseline match', () => {
    // Heads-up, villain opens; the tables author a big-blind CALL, but the hero
    // folds pocket nines. Chosen Fold and the Call baseline are different action
    // families, so the card must not describe it as a match. (Preflop
    // mixedLegs intentionally excludes residual folds, so this hand is the
    // real Fold-vs-Call, not the authored mixed-leg test above.)
    const base = createHand({ button: 'villain', random: seededRandom(9_100) });
    let game: GameState = {
      ...base,
      players: {
        ...base.players,
        hero: { ...base.players.hero, holeCards: [{ rank: 9, suit: 'spades' }, { rank: 9, suit: 'hearts' }] },
      },
    };
    game = applyAction(game, 'villain', { type: 'raise', amount: 50 });
    game = applyAction(game, 'hero', { type: 'fold' });

    const decision = graded(game);
    expect(decision.chosen.action).toBe('fold');
    expect(decision.baseline.action).toBe('call');

    const { classification, actionFamilyMatch } = classifyDecision(decision);
    expect(actionFamilyMatch).toBe(false);
    expect(classification).not.toBe('recommended');
    expect(classification).toBe('costlyMistake');
  });
});


/**
 * Phase 16 Slice 0 review fixes: a zero-decision hand is an explicit `null`, a
 * mixed hand routes to the worse-of the presented classes, and the hand summary
 * is grammatically singular and explicit about the no-decision case.
 */
describe('aggregateClassification + handSummaryText (Slice 0 review fixes)', () => {
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]): string => (
    translate('en', key, values)
  );

  it('returns null for a zero-decision hand', () => {
    expect(aggregateClassification([])).toBeNull();
  });

  it('routes a mixed hand (acceptable + close) to the worse class, closeDecision', () => {
    const acceptable = fixture({
      grade: 'close',
      authoredMixedAction: true,
      chosen: { action: 'call', label: 'Call 30', amountChips: 30 },
      baseline: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
    });
    const close = fixture({
      grade: 'close',
      authoredMixedAction: false,
      chosen: { action: 'call', label: 'Call 30', amountChips: 30 },
      baseline: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
    });
    expect(classifyDecision(acceptable).classification).toBe('acceptableAlternative');
    expect(classifyDecision(close).classification).toBe('closeDecision');
    // closeDecision ranks above acceptableAlternative, so it wins the aggregate.
    expect(aggregateClassification([acceptable, close])).toBe('closeDecision');
    expect(aggregateClassification([close, acceptable])).toBe('closeDecision');
  });

  it('routes any costly mistake to the top of the rank regardless of position', () => {
    const costly = fixture({
      grade: 'mistake',
      chosen: { action: 'fold', label: 'Fold', amountChips: undefined },
      baseline: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
    });
    const recommended = fixture({
      grade: 'strong',
      chosen: { action: 'raise', label: 'Raise to 30', amountChips: 30 },
      baseline: { action: 'raise', label: 'Raise to 27', amountChips: 27 },
    });
    expect(aggregateClassification([recommended, costly])).toBe('costlyMistake');
    expect(aggregateClassification([costly, recommended])).toBe('costlyMistake');
  });

  it('reports a zero-decision hand as an explicit no-decision note', () => {
    expect(handSummaryText(null, t, 3, 'en')).toBe(t('table.review.noDecision'));
    expect(handSummaryText('recommended', t, 0, 'en')).toBe(t('table.review.noDecision'));
  });

  it('renders every presentation class singularly for a single decision', () => {
    expect(handSummaryText('recommended', t, 1, 'en')).toBe('Strong baseline match across 1 decision.');
    expect(handSummaryText('acceptableAlternative', t, 1, 'en')).toBe('Mixed with the baseline across 1 decision; another action was the highest-weight line in some spots.');
    expect(handSummaryText('closeDecision', t, 1, 'en')).toBe('Close decision across 1 spot; the baseline had a mild preference.');
    expect(handSummaryText('costlyMistake', t, 1, 'en')).toBe('Costly mistake across 1 decision; the baseline preferred another line.');
  });

  it('renders every presentation class in the plural for several decisions', () => {
    expect(handSummaryText('recommended', t, 3, 'en')).toBe('Strong baseline match across 3 decisions.');
    expect(handSummaryText('acceptableAlternative', t, 3, 'en')).toBe('Mixed with the baseline across 3 decisions; another action was the highest-weight line in some spots.');
    expect(handSummaryText('closeDecision', t, 3, 'en')).toBe('Close decisions across 3 spots; the baseline had a mild preference.');
    expect(handSummaryText('costlyMistake', t, 3, 'en')).toBe('Costly mistakes across 3 decisions; the baseline preferred another line.');
  });

  it('keeps the whole sentence singular-aware in the Chinese scripts', () => {
    const zhHans = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate('zh-Hans', key, values);
    const zhHant = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate('zh-Hant', key, values);
    expect(handSummaryText('closeDecision', zhHans, 1, 'zh-Hans')).toContain('1 个决策');
    expect(handSummaryText('closeDecision', zhHant, 3, 'zh-Hant')).toContain('3 個決策');
  });
});
