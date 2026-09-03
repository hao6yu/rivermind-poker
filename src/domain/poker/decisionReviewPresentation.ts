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
  | 'costlyMistake'
  | 'ungraded';

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
 * The grade alone never decides the label. A `strong` is `recommended` only
 * when it is the same action family as the highest-weight baseline (a nearby
 * raise size is carried by the sizing note, not treated as a different action).
 * A `strong` or `close` on a genuinely different, authored line is
 * `acceptableAlternative`; a `strong` or `close` on a different family that
 * was not authored as a mixed leg, or a `close` on the same family, stays
 * `closeDecision`; every `mistake` is `costlyMistake`.
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
  const hasSizingDifference = comparison.ungradedReason === undefined
    && comparison.focusArea === 'bet-sizing';

  let classification: DecisionPresentationClass;

  if (comparison.grade === 'ungraded') {
    // An ungraded decision carries no judgment at all — it is a diagnostic,
    // never a recommendation, alternative, or mistake.
    classification = 'ungraded';
  } else if (comparison.grade === 'mistake') {
    classification = 'costlyMistake';
  } else if (!actionFamilyMatch && comparison.authoredMixedAction) {
    // A supported mixed line that is not the highest-weight baseline action.
    classification = 'acceptableAlternative';
  } else if (comparison.grade === 'strong' && actionFamilyMatch) {
    // A strong is only the same action family as the highest-weight baseline;
    // a nearby raise size can still qualify, which the sizing note carries
    // separately.
    classification = 'recommended';
  } else {
    // A `strong` or `close` on a different family the model did not author as a
    // mixed leg, or a `close` on the same family: the baseline has a modest
    // preference.
    classification = 'closeDecision';
  }

  return { classification, actionFamilyMatch, hasSizingDifference };
}

/**
 * Ranks how instructional each class is for focus selection. `'ungraded'`
 * carries no judgment, so it ranks at the bottom: it can never become the
 * focus of a hand or lift a session summary, and `aggregateClassification`
 * returns `'ungraded'` only when every decision in scope is ungraded (and
 * `null` only when there were no decisions at all).
 */
export const presentationRank: Record<DecisionPresentationClass, number> = {
  recommended: 0,
  acceptableAlternative: 1,
  closeDecision: 2,
  costlyMistake: 3,
  ungraded: -1,
};

/**
 * Collapses the decisions of a single hand into one presentation class for the
 * hand-level summary. The most instructional class wins so the summary never
 * overstates: a hand that contains any costly mistake, any authored
 * alternative, or any close spot is never summarized as a clean match. Internal
 * grades stay available separately for scoring and learning evidence.
 *
 * Returns `null` when there are no decisions to grade (for instance the AI folded
 * before the player ever acted), so the empty case is represented explicitly
 * rather than being silently read as a clean baseline match.
 */
export function aggregateClassification(
  decisions: readonly DecisionComparison[],
): DecisionPresentationClass | null {
  let classification: DecisionPresentationClass | null = null;
  for (const decision of decisions) {
    const candidate = classifyDecision(decision).classification;
    if (classification === null || presentationRank[candidate] > presentationRank[classification]) {
      classification = candidate;
    }
  }
  return classification;
}
