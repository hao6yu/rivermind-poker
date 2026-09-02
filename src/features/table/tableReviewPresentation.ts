import { classifyDecision, type DecisionPresentationClass } from '../../domain/poker/decisionReviewPresentation';
import type { DecisionComparison } from '../../domain/poker/decisionGrading';
import { formatChips } from '../../domain/poker/moneyFormat';
import type { useLocalization } from '../../localization';
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
  language: string,
): string {
  const presentation = classifyDecision(comparison);
  const parts = [eyebrowLabel(presentation.classification, t), reviewSummary(presentation.classification, t)];
  // Localize the chosen and baseline actions once (falling back to the grader's
  // line labels only in English) so the sizing note and the closing
  // you/baseline sentence announce the same localized actions.
  const chosen = language === 'en' ? comparison.chosen.label : localizedLine(comparison.chosen, t);
  const baseline = language === 'en' ? comparison.baseline.label : localizedLine(comparison.baseline, t);
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
  language: string,
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
 * A locale-correct noun phrase for the graded-decision count. English switches
 * the number on the noun; the Chinese scripts use a fixed measure word, so the
 * number is bare. `spotClass` selects the English noun only.
 */
function handSummaryLabel(
  classification: DecisionPresentationClass,
  count: number,
  language: string,
): string {
  // Chinese has no plural; the demonstrative rides in the label so the whole
  // sentence reads naturally at any count.
  if (language === 'zh-Hant') return count === 1 ? '這 1 個決策' : `這 ${count} 個決策`;
  if (language === 'zh-Hans') return count === 1 ? '这 1 个决策' : `这 ${count} 个决策`;
  // English: a complete sentence head plus a singular/plural count phrase.
  if (classification === 'ungraded') {
    return count === 1 ? 'Not graded across 1 spot' : `Not graded across ${count} spots`;
  }
  if (classification === 'closeDecision') {
    return count === 1 ? 'Close decision across 1 spot' : `Close decisions across ${count} spots`;
  }
  if (classification === 'costlyMistake') {
    return count === 1 ? 'Costly mistake across 1 decision' : `Costly mistakes across ${count} decisions`;
  }
  if (classification === 'acceptableAlternative') {
    return count === 1 ? 'Mixed with the baseline across 1 decision' : `Mixed with the baseline across ${count} decisions`;
  }
  return count === 1 ? 'Strong baseline match across 1 decision' : `Strong baseline match across ${count} decisions`;
}
