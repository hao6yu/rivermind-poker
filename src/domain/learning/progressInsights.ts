import {
  learningConceptForActivityId,
  learningConceptForReview,
  type LearningConceptId,
} from './adaptiveRecommendation';
import type { LearningSessionRecord } from './history';
import type { LearningReviewItem } from './reviewQueue';

export interface ImprovingConceptInsight {
  attempts: number;
  change: number;
  concept: LearningConceptId;
}

export interface RecurringReviewInsight {
  concept: LearningConceptId;
  dueCount: number;
  spots: number;
}

export interface LearningProgressInsights {
  improving: ImprovingConceptInsight | null;
  recurringReview: RecurringReviewInsight | null;
}

const conceptOrder: LearningConceptId[] = [
  'poker-basics',
  'table-math',
  'betting-purpose',
  'preflop-entry',
  'preflop-pressure',
  'preflop-three-bet',
  'postflop-betting',
  'postflop-odds',
  'postflop-range',
  'postflop-river',
];

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

/**
 * Produces conservative trends from local evidence. Improvement needs at least
 * two scored attempts and a five-point change between older and newer halves;
 * a recurring review area needs at least two still-active review items.
 */
export function buildLearningProgressInsights(
  history: readonly LearningSessionRecord[],
  reviewQueue: readonly LearningReviewItem[],
  now = new Date().toISOString(),
): LearningProgressInsights {
  const scoredByConcept = new Map<LearningConceptId, LearningSessionRecord[]>();
  history.forEach((record) => {
    if (record.kind === 'review' || record.score === null) return;
    const concept = learningConceptForActivityId(record.activityId);
    if (!concept) return;
    scoredByConcept.set(concept, [...(scoredByConcept.get(concept) ?? []), record]);
  });

  const improving = [...scoredByConcept.entries()].flatMap(([concept, records]) => {
    if (records.length < 2) return [];
    const scores = [...records]
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .map((record) => record.score as number);
    const split = Math.max(1, Math.floor(scores.length / 2));
    const change = Math.round(average(scores.slice(split)) - average(scores.slice(0, split)));
    return change >= 5 ? [{ attempts: scores.length, change, concept }] : [];
  }).sort((left, right) => (
    right.change - left.change
      || right.attempts - left.attempts
      || conceptOrder.indexOf(left.concept) - conceptOrder.indexOf(right.concept)
  ))[0] ?? null;

  const reviewByConcept = new Map<LearningConceptId, LearningReviewItem[]>();
  reviewQueue.forEach((item) => {
    const concept = learningConceptForReview(item);
    reviewByConcept.set(concept, [...(reviewByConcept.get(concept) ?? []), item]);
  });
  const recurringReview = [...reviewByConcept.entries()]
    .flatMap(([concept, items]) => items.length < 2 ? [] : [{
      concept,
      dueCount: items.filter((item) => item.nextReviewAt <= now).length,
      spots: items.length,
    }])
    .sort((left, right) => (
      right.spots - left.spots
        || right.dueCount - left.dueCount
        || conceptOrder.indexOf(left.concept) - conceptOrder.indexOf(right.concept)
    ))[0] ?? null;

  return { improving, recurringReview };
}
