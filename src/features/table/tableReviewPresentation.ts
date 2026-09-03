import { classifyDecision, type DecisionPresentationClass } from '../../domain/poker/decisionReviewPresentation';
import type { DecisionComparison } from '../../domain/poker/decisionGrading';
import { formatChips } from '../../domain/poker/moneyFormat';
import { translateCount, usesAuthoredCoachProse } from '../../localization/core';
import type { useLocalization } from '../../localization';
import type { AppLanguage } from '../../localization/core';
import type { MessageKey } from '../../localization/messages';

/** A translation call. Kept here only as a type so this module stays pure. */
type Translate = ReturnType<typeof useLocalization>['t'];

export function localizedLine(
  line: DecisionComparison['chosen'],
  t: Translate,
): string {
  // The grader hands us the wager as a number, so the localized line formats it
  // in chips rather than parsing the English label back apart.
  const amount = line.amountChips === undefined ? undefined : formatChips(line.amountChips);
  if (line.action === 'raise') {
    return amount ? t('poker.action.raiseTo', { amount }) : t('poker.action.raise');
  }
  if (line.action === 'call') return amount ? t('poker.action.callAmount', { amount }) : t('poker.action.call');
  return t(line.action === 'check' ? 'poker.action.check' : 'poker.action.fold');
}

function eyebrowLabel(
  classification: DecisionPresentationClass,
  t: Translate,
): string {
  return classification === 'recommended'
    ? t('decision.classification.recommended')
    : classification === 'acceptableAlternative'
      ? t('decision.classification.alternative')
      : classification === 'costlyMistake'
        ? t('decision.classification.mistake')
        : classification === 'ungraded'
          ? t('decision.classification.ungraded')
          : t('decision.close');
}

function reviewSummary(
  classification: DecisionPresentationClass,
  t: Translate,
): string {
  return classification === 'recommended'
    ? t('decision.summary.recommended')
    : classification === 'acceptableAlternative'
      ? t('decision.summary.alternative')
      : classification === 'costlyMistake'
        ? t('decision.summary.mistake')
        : classification === 'ungraded'
          ? t('decision.summary.ungraded')
          : t('decision.summary.close');
}

/**
 * The full label the card exposes to accessibility clients through its root
 * `accessibilityLabel`. Pure so the grouping is testable without rendering the
 * React Native component: headline, summary, sizing note, and the you/baseline
 * line are joined into a single announcement.
 */
export function decisionReviewAccessibilityLabel(
  comparison: DecisionComparison,
  t: Translate,
  language: AppLanguage,
): string {
  const presentation = classifyDecision(comparison);
  const parts = [eyebrowLabel(presentation.classification, t), reviewSummary(presentation.classification, t)];
  // Localize the chosen and baseline actions once (falling back to the grader's
  // line labels only in English) so the sizing note and the closing
  // you/baseline sentence announce the same localized actions.
  const chosen = usesAuthoredCoachProse(language) ? comparison.chosen.label : localizedLine(comparison.chosen, t);
  const baseline = usesAuthoredCoachProse(language) ? comparison.baseline.label : localizedLine(comparison.baseline, t);
  if (comparison.ungradedReason !== undefined) {
    // No judgment and no baseline exists for an ungraded decision, so the
    // announcement states the diagnostic instead of comparing two lines.
    parts.push(`${t('decision.youChose')} ${chosen}. ${t('decision.detail.ungraded')}`);
    return parts.join('. ');
  }
  if (presentation.hasSizingDifference) {
    parts.push(t('decision.sizingNote', { chosen, baseline }));
  }
  parts.push(`${t('decision.youChose')} ${chosen}. ${t('decision.baseline')} ${baseline}.`);
  return parts.join('. ');
}

/**
 * The player-facing label shown as the card headline and the table review
 * grade header. Mirrors the presentation class so every surface reads the same
 * wording for the same decision.
 */
export function classificationTitle(
  classification: DecisionPresentationClass,
  t: Translate,
): string {
  return classification === 'recommended'
    ? t('decision.classification.recommended')
    : classification === 'acceptableAlternative'
      ? t('decision.classification.alternative')
      : classification === 'costlyMistake'
        ? t('decision.classification.mistake')
        : classification === 'ungraded'
          ? t('decision.classification.ungraded')
          : t('decision.close');
}

/**
 * The whole-hand summary, localized, with the graded decision count. Derived
 * from the hand's presentation class so a hand never reads as a clean "match"
 * unless every decision was a same-family baseline move.
 */
export function handSummaryText(
  classification: DecisionPresentationClass | null,
  t: Translate,
  count: number,
  language: AppLanguage,
): string {
  // A zero-decision hand (or a missing report) is a no-decision note, not a
  // clean baseline match, so it never reads as a strong run.
  if (classification === null || count === 0) return t('table.review.noDecision');
  const label = handSummaryLabel(classification, count, language);
  const handSummaryKey: Record<DecisionPresentationClass, MessageKey> = {
    recommended: 'decision.handSummary.recommended',
    acceptableAlternative: 'decision.handSummary.alternative',
    closeDecision: 'decision.handSummary.closeDecision',
    costlyMistake: 'decision.handSummary.costlyMistake',
    ungraded: 'decision.handSummary.ungraded',
  };
  return t(handSummaryKey[classification], { label });
}

/**
 * The count phrase for the whole-hand summary, routed through the count-aware
 * catalog API. The per-classification keys carry singular/plural forms per
 * locale in the plural catalogs (plurals.ts); no caller encodes grammar.
 * Chinese rides a fixed demonstrative phrase, so all five keys share the same
 * zh wording; Spanish and Portuguese inflect the noun.
 */
const handSummaryCountKeys: Record<DecisionPresentationClass, MessageKey> = {
  recommended: 'decision.handCount.match',
  acceptableAlternative: 'decision.handCount.mixed',
  closeDecision: 'decision.handCount.closeSpot',
  costlyMistake: 'decision.handCount.mistake',
  ungraded: 'decision.handCount.ungradedSpot',
};

function handSummaryLabel(
  classification: DecisionPresentationClass,
  count: number,
  language: AppLanguage,
): string {
  return translateCount(language, handSummaryCountKeys[classification], count);
}
