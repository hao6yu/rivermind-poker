import type { CoachFocusArea, CoachHandGrade, CoachReview } from './types.ts';

export const coachHandGrades: CoachHandGrade[] = ['strong', 'close', 'mistake'];

export const coachFocusAreas: CoachFocusArea[] = [
  'none',
  'preflop',
  'value-betting',
  'bluffing',
  'calling',
  'bet-sizing',
  'pot-odds',
  'draws',
];

export function isCoachReview(value: unknown): value is CoachReview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const review = value as Record<string, unknown>;
  const textFields = ['summary', 'bestDecision', 'keyConcept', 'practiceTip'] as const;
  return textFields.every((field) => typeof review[field] === 'string' && review[field].length <= 2_000)
    && typeof review.confidence === 'number'
    && Number.isFinite(review.confidence)
    && review.confidence >= 0
    && review.confidence <= 1
    && coachHandGrades.includes(review.handGrade as CoachHandGrade)
    && Number.isInteger(review.focusDecisionSequence)
    && (review.focusDecisionSequence as number) >= 0
    && (review.focusDecisionSequence as number) <= 40
    && coachFocusAreas.includes(review.focusArea as CoachFocusArea);
}
