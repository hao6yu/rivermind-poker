import { describe, expect, it } from 'vitest';

import type { SessionLearningSummary } from '../../domain/poker/sessionLearning';
import { sessionLearningVerdict } from './sessionModels';

function summary(
  overrides: Partial<SessionLearningSummary>,
): SessionLearningSummary {
  return {
    classification: 'recommended',
    decisionsGraded: 0,
    focusDecisionSequence: null,
    focusHandId: null,
    grades: { strong: 0, close: 0, mistake: 0 },
    handsGraded: 0,
    repeatedWeakness: false,
    reviewSpots: 0,
    strongRate: null,
    strengths: [],
    topFocusArea: null,
    topFocusHandCount: 0,
    topFocusSpotCount: 0,
    ...overrides,
  };
}

describe('session learning verdict', () => {
  it('summarizes the whole run instead of presenting one hand as the result', () => {
    const verdict = sessionLearningVerdict(summary({
      decisionsGraded: 10,
      grades: { strong: 7, close: 2, mistake: 1 },
      handsGraded: 4,
      reviewSpots: 3,
      strongRate: 70,
      classification: 'costlyMistake',
    }));

    expect(verdict.title).toBe('Solid run with a few review spots');
    expect(verdict.detail).toContain('across 4 hands');
  });

  it('calls out a strong run only when every decision matched the baseline', () => {
    expect(sessionLearningVerdict(summary({
      decisionsGraded: 8,
      grades: { strong: 8, close: 0, mistake: 0 },
      handsGraded: 4,
      reviewSpots: 0,
      strongRate: 100,
      classification: 'recommended',
    })).tone).toBe('strong');
  });
  it('presents the whole run by its classification, not by the grade count', () => {
    const base = {
      decisionsGraded: 4,
      grades: { close: 1, mistake: 0, strong: 3 },
      handsGraded: 2,
      strongRate: 75,
    };
    const strong = sessionLearningVerdict(summary({ ...base, classification: 'recommended' }));
    const mixed = sessionLearningVerdict(summary({ ...base, classification: 'acceptableAlternative' }));
    const costly = sessionLearningVerdict(summary({ ...base, classification: 'costlyMistake' }));
    expect(strong.tone).toBe('strong');
    expect(strong.title).toBe('Strong decisions overall');
    expect(mixed.tone).toBe('solid');
    expect(mixed.title).toBe('Solid run with a few review spots');
    // A single costly hand with otherwise strong grades still lands on
    // "solid", not "strong", because not every decision matched the baseline.
    expect(costly.tone).toBe('solid');
  });
});
