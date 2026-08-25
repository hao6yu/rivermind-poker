import { describe, expect, it } from 'vitest';

import type { DecisionComparison, DecisionLine } from '../../domain/poker/decisionGrading';
import type { CoachFocusArea, CoachHandGrade } from '../../domain/poker/types';
import type { ActionType } from '../../domain/poker/types';
import { decisionReviewAccessibilityLabel } from './tableReviewPresentation';
import { translate } from '../../localization/core';

function line(action: ActionType, amountChips: number | undefined, label: string): DecisionLine {
  return { action, amountChips, label };
}

/**
 * Builds a decision comparison as the review card would receive it. A sizing
 * difference is just a bet-sizing focus with a different chosen and baseline
 * raise amount on the same action family.
 */
function comparison(overrides: Partial<DecisionComparison> = {}): DecisionComparison {
  return {
    alternative: null,
    baseline: line('raise', 27, 'Raise to 27'),
    chosen: line('raise', 30, 'Raise to 30'),
    detail: 'A complete decision explanation for the review card.',
    focusArea: 'none',
    grade: 'strong',
    initiative: undefined,
    authoredMixedAction: false,
    relativeScoreGap: 0,
    sequence: 1,
    street: 'preflop',
    summary: 'Summary',
    ...overrides,
  };
}

const en = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]): string => (
  translate('en', key, values)
);
const zhHans = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]): string => (
  translate('zh-Hans', key, values)
);
const zhHant = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]): string => (
  translate('zh-Hant', key, values)
);

describe('decision review card accessibility label', () => {
  it('exposes the full headline, summary, and you/baseline line as one grouped label', () => {
    const label = decisionReviewAccessibilityLabel(comparison({ focusArea: 'none', grade: 'strong' }), en, 'en');

    // The label is the card's `accessibilityLabel`, not just the eyebrow word:
    // accessibility clients announce the whole card, so it must bundle every part.
    expect(label).toBe(label.trim());
    expect(label).toContain(en('decision.classification.recommended'));
    expect(label).toContain(en('decision.summary.recommended'));
    expect(label).toContain(en('decision.youChose'));
    expect(label).toContain(en('decision.baseline'));
    expect(label).toContain('Raise to 30');
    expect(label).toContain('Raise to 27');

    // Grouped with a separator, so the classes read as one sentence.
    expect(label).toContain('. ');
    expect(label.split('. ').length).toBeGreaterThan(1);
  });

  it('includes the sizing note whenever the chosen size differs from the baseline', () => {
    const sizing = comparison({
      focusArea: 'bet-sizing' as CoachFocusArea,
      grade: 'close' as CoachHandGrade,
      chosen: line('raise', 30, 'Raise to 30'),
      baseline: line('raise', 27, 'Raise to 27'),
    });
    const label = decisionReviewAccessibilityLabel(sizing, en, 'en');

    expect(label).toContain(en('decision.sizingNote').replace('{{chosen}}', 'Raise to 30').replace('{{baseline}}', 'Raise to 27'));
    expect(label).toContain('Raise to 30');
    expect(label).toContain('Raise to 27');
  });

  it('does not repeat a doubled verb inside the grouping', () => {
    const sizing = comparison({
      focusArea: 'bet-sizing' as CoachFocusArea,
      grade: 'close' as CoachHandGrade,
      chosen: line('raise', 30, 'Raise to 30'),
      baseline: line('raise', 27, 'Raise to 27'),
    });
    const label = decisionReviewAccessibilityLabel(sizing, en, 'en');
    expect(label).not.toMatch(/raised to Raise/i);
  });

  it('announces localized line labels in Simplified Chinese, not the English action', () => {
    const sizing = comparison({
      focusArea: 'bet-sizing' as CoachFocusArea,
      grade: 'close' as CoachHandGrade,
      chosen: line('raise', 30, 'Raise to 30'),
      baseline: line('raise', 27, 'Raise to 27'),
    });
    const label = decisionReviewAccessibilityLabel(sizing, zhHans, 'zh-Hans');
    // The closing you/baseline line and the sizing note announce the localized
    // actions, never the raw English line labels the grader produced.
    expect(label).toContain('加注至 30');
    expect(label).toContain('加注至 27');
    expect(label).not.toContain('Raise to 30');
    expect(label).not.toContain('Raise to 27');
  });

  it('announces localized line labels in Traditional Chinese, not the English action', () => {
    const sizing = comparison({
      focusArea: 'bet-sizing' as CoachFocusArea,
      grade: 'close' as CoachHandGrade,
      chosen: line('raise', 30, 'Raise to 30'),
      baseline: line('raise', 27, 'Raise to 27'),
    });
    const label = decisionReviewAccessibilityLabel(sizing, zhHant, 'zh-Hant');
    expect(label).toContain('加注至 30');
    expect(label).toContain('加注至 27');
    expect(label).not.toContain('Raise to 30');
    expect(label).not.toContain('Raise to 27');
  });
});
