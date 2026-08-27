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

/**
 * A scored attempt only ever counts a practice-style session record (kind is not
 * `review` and the score is non-null). Lessons are study, not graded attempts.
 * These are the thresholds a conservative trend is built from: at least two
 * scored attempts and a five-point or greater rise between the older and newer
 * halves. The closing-outcome module reuses the same rule.
 */
export const IMPROVEMENT_MIN_ATTEMPTS = 2;
export const IMPROVEMENT_MIN_CHANGE = 5;

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
  'tournament-short-stack',
  'tournament-bubble',
  'opponent-adjustments',
  'advanced-math',
];

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

/**
 * The conservative improvement trend for a single concept: the older-half and
 * newer-half averages of its scored attempts, reported only when at least two
 * attempts exist and the change is at least `IMPROVEMENT_MIN_CHANGE` points.
 * Reused by the global insight and by the per-concept closing outcome, so the
 * rule is defined once.
 */
export function conceptImprovementTrend(
  history: readonly LearningSessionRecord[],
  concept: LearningConceptId,
): ImprovingConceptInsight | null {
  const scores = history
    .filter((record) => (
      record.kind !== 'review'
      && record.score !== null
      && learningConceptForActivityId(record.activityId) === concept
    ))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .map((record) => record.score as number);
  if (scores.length < IMPROVEMENT_MIN_ATTEMPTS) return null;
  const split = Math.max(1, Math.floor(scores.length / 2));
  const change = Math.round(average(scores.slice(split)) - average(scores.slice(0, split)));
  return change >= IMPROVEMENT_MIN_CHANGE ? { attempts: scores.length, change, concept } : null;
}

/**
 * The recurring-review area for a single concept: the count of its still-active
 * review items (all spots) and how many are due right now. Reported only when at
 * least two active items exist. Reused by the global insight and the closing
 * outcome's recurring-focus statement.
 */
export function conceptRecurringReview(
  reviewQueue: readonly LearningReviewItem[],
  concept: LearningConceptId,
  now = new Date().toISOString(),
): RecurringReviewInsight | null {
  const items = reviewQueue.filter((item) => learningConceptForReview(item) === concept);
  if (items.length < 2) return null;
  return {
    concept,
    dueCount: items.filter((item) => item.nextReviewAt <= now).length,
    spots: items.length,
  };
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
  const improving = conceptOrder
    .map((concept) => conceptImprovementTrend(history, concept))
    .filter((insight): insight is ImprovingConceptInsight => insight !== null)
    .sort((left, right) => (
      right.change - left.change
        || right.attempts - left.attempts
        || conceptOrder.indexOf(left.concept) - conceptOrder.indexOf(right.concept)
    ))[0] ?? null;

  const recurringReview = conceptOrder
    .map((concept) => conceptRecurringReview(reviewQueue, concept, now))
    .filter((insight): insight is RecurringReviewInsight => insight !== null)
    .sort((left, right) => (
      right.spots - left.spots
        || right.dueCount - left.dueCount
        || conceptOrder.indexOf(left.concept) - conceptOrder.indexOf(right.concept)
    ))[0] ?? null;

  return { improving, recurringReview };
}
