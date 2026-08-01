import { describe, expect, it } from 'vitest';

import { isCoachReview } from '../coaching';

const validReview = {
  summary: 'A close turn decision.',
  bestDecision: 'Call at this price.',
  keyConcept: 'Pot odds versus draw completion.',
  practiceTip: 'Compare required equity with clean outs.',
  confidence: 0.8,
  handGrade: 'close',
  focusDecisionSequence: 3,
  focusArea: 'pot-odds',
};

describe('coach review contract', () => {
  it('accepts the complete structured learning result', () => {
    expect(isCoachReview(validReview)).toBe(true);
  });

  it('rejects unknown grades and invalid decision references', () => {
    expect(isCoachReview({ ...validReview, handGrade: 'bad' })).toBe(false);
    expect(isCoachReview({ ...validReview, focusDecisionSequence: 41 })).toBe(false);
    expect(isCoachReview({ ...validReview, focusDecisionSequence: 1.5 })).toBe(false);
  });
});
