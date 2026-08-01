import type { CoachFocusArea, CoachHandGrade, CoachReview } from './types';

export interface CoachSessionStats {
  reviewedHands: number;
  grades: Record<CoachHandGrade, number>;
  focusCounts: Record<CoachFocusArea, number>;
  topFocusArea: Exclude<CoachFocusArea, 'none'> | null;
}

const focusAreas: CoachFocusArea[] = [
  'preflop',
  'value-betting',
  'bluffing',
  'calling',
  'bet-sizing',
  'pot-odds',
  'draws',
  'none',
];

export function summarizeCoachSession(reviews: readonly CoachReview[]): CoachSessionStats {
  const grades: CoachSessionStats['grades'] = { strong: 0, close: 0, mistake: 0 };
  const focusCounts = Object.fromEntries(focusAreas.map((area) => [area, 0])) as CoachSessionStats['focusCounts'];
  for (const review of reviews) {
    grades[review.handGrade] += 1;
    focusCounts[review.focusArea] += 1;
  }
  const rankedFocusAreas = focusAreas
    .filter((area): area is Exclude<CoachFocusArea, 'none'> => area !== 'none')
    .map((area, order) => ({ area, count: focusCounts[area], order }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count || left.order - right.order);
  return {
    reviewedHands: reviews.length,
    grades,
    focusCounts,
    topFocusArea: rankedFocusAreas[0]?.area ?? null,
  };
}

export function coachFocusLabel(focusArea: CoachFocusArea): string {
  const labels: Record<CoachFocusArea, string> = {
    none: 'No recurring leak',
    preflop: 'Preflop decisions',
    'value-betting': 'Value betting',
    bluffing: 'Bluffing',
    calling: 'Calling decisions',
    'bet-sizing': 'Bet sizing',
    'pot-odds': 'Pot odds',
    draws: 'Playing draws',
  };
  return labels[focusArea];
}
