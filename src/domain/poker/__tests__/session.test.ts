import { describe, expect, it } from 'vitest';

import { coachFocusLabel, summarizeCoachSession } from '../session';
import type { CoachReview } from '../types';

function review(overrides: Partial<CoachReview> = {}): CoachReview {
  return {
    summary: 'Summary',
    bestDecision: 'Call.',
    keyConcept: 'Pot odds.',
    practiceTip: 'Review the price.',
    confidence: 0.8,
    handGrade: 'close',
    focusDecisionSequence: 1,
    focusArea: 'pot-odds',
    ...overrides,
  };
}

describe('coach session summary', () => {
  it('counts grades and surfaces the most frequent learning focus', () => {
    const stats = summarizeCoachSession([
      review({ handGrade: 'mistake', focusArea: 'calling' }),
      review({ handGrade: 'strong', focusArea: 'calling' }),
      review({ handGrade: 'close', focusArea: 'bet-sizing' }),
    ]);
    expect(stats.reviewedHands).toBe(3);
    expect(stats.grades).toEqual({ strong: 1, close: 1, mistake: 1 });
    expect(stats.topFocusArea).toBe('calling');
    expect(coachFocusLabel(stats.topFocusArea ?? 'none')).toBe('Calling decisions');
  });

  it('ignores the no-leak label when selecting a session focus', () => {
    const stats = summarizeCoachSession([review({ handGrade: 'strong', focusArea: 'none' })]);
    expect(stats.topFocusArea).toBeNull();
  });
});
