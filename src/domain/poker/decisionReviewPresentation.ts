import type { DecisionComparison } from './decisionGrading';

/**
 * The single player-facing meaning of a grade. The internal grade is never
 * shown to a player directly; every grade maps through one of these so the copy
 * stays consistent across the review card, session summary, history, and
 * targeted-practice routing.
 */
export type DecisionPresentationClass =
  | 'recommended'
  | 'acceptableAlternative'
  | 'closeDecision'
  | 'costlyMistake';

export interface DecisionPresentation {
  /** The single label the player sees as the card headline. */
  classification: DecisionPresentationClass;
  /**
   * Whether the chosen and baseline actions belong to the same family (both
   * raises, both calls, both checks, both folds). A different family is the
   * axis the card splits out from bet-size tolerance.
   */
  actionFamilyMatch: boolean;
  /**
   * Whether the chosen size deviates meaningfully from the baseline size while
   * the action family stays the same. Always presented as its own note so bet
   * sizing is never described as if it were a different action.
   */
  hasSizingDifference: boolean;
}

/**
 * Maps an internal grade, the chosen-vs-baseline action family, and whether the
 * chosen action is an authored mixed leg to one presentation class.
 *
 * The grade alone never decides the label. A `strong` that is really a nearby
 * raise size stays `recommended`; a `close` or `strong` that is a genuinely
 * different authored line becomes `acceptableAlternative`; a `close` that is a
 * sizing or mild-preference delta stays `closeDecision`.
 *
 * The function is pure domain logic: it imports no React, no Supabase, and no
 * presentation data. Views render the class through localized strings only.
 */
export function classifyDecision(
  comparison: DecisionComparison,
): DecisionPresentation {
  const actionFamilyMatch = comparison.chosen.action === comparison.baseline.action;
  // A bet-sizing focus means the chosen size deviates from the baseline while
  // the action family matches, so it is always a separate axis from the line.
  const hasSizingDifference = comparison.focusArea === 'bet-sizing';

  let classification: DecisionPresentationClass;

  if (comparison.grade === 'mistake') {
    classification = 'costlyMistake';
  } else if ((comparison.grade === 'strong' || comparison.grade === 'close')
    && !actionFamilyMatch
    && comparison.authoredMixedAction) {
    // A supported mixed line that is not the highest-weight baseline action.
    classification = 'acceptableAlternative';
  } else if (comparison.grade === 'strong') {
    // Same action family as the highest-weight baseline; a nearby raise size
    // can still qualify, which the sizing note carries separately.
    classification = 'recommended';
  } else {
    // `close` on the same family, or a different family the model did not
    // author as a mixed leg: the baseline has a modest preference.
    classification = 'closeDecision';
  }

  return { classification, actionFamilyMatch, hasSizingDifference };
}
