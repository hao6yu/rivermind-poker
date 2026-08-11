import { describe, expect, it } from 'vitest';

import type { SessionLearningSummary } from '../../domain/poker/sessionLearning';
import { sessionLearningVerdict } from './sessionModels';

function summary(
  overrides: Partial<SessionLearningSummary>,
): SessionLearningSummary {
  return {
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
    }));

    expect(verdict.title).toBe('Solid run with a few review spots');
    expect(verdict.detail).toContain('across 4 hands');
  });

  it('calls out a strong run only when no decisions were mistakes', () => {
    expect(sessionLearningVerdict(summary({
      decisionsGraded: 8,
      grades: { strong: 7, close: 1, mistake: 0 },
      handsGraded: 3,
      reviewSpots: 1,
      strongRate: 88,
    })).tone).toBe('strong');
  });
});
