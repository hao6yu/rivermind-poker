import type { CoachFocusArea } from '../poker/types';
import type { ScenarioSpot } from './types';

export type ReviewFocusArea = Exclude<CoachFocusArea, 'none'>;

interface LearningReviewBase {
  activityId: string;
  createdAt: string;
  id: string;
  updatedAt: string;
}

export interface TrainerLearningReviewItem extends LearningReviewBase {
  questionId: string;
  source: 'trainer';
}

export interface ScenarioLearningReviewItem extends LearningReviewBase {
  focusArea: ReviewFocusArea;
  scenario: ScenarioSpot;
  source: 'scenario';
}

export interface TableLearningReviewItem extends LearningReviewBase {
  focusArea: ReviewFocusArea;
  source: 'table';
}

export type LearningReviewItem =
  | TrainerLearningReviewItem
  | ScenarioLearningReviewItem
  | TableLearningReviewItem;

export type LearningReviewCapture =
  | { activityId: string; questionId: string; source: 'trainer' }
  | { activityId: string; focusArea: ReviewFocusArea; scenario: ScenarioSpot; source: 'scenario' }
  | { activityId: string; focusArea: ReviewFocusArea; source: 'table' };

export interface LearningReviewOutcome {
  correct: boolean;
  itemId: string;
}

export function learningReviewItemId(capture: LearningReviewCapture): string {
  if (capture.source === 'trainer') return `trainer:${capture.activityId}:${capture.questionId}`;
  if (capture.source === 'scenario') return `scenario:${capture.activityId}:${capture.scenario.id}`;
  return `table:${capture.focusArea}`;
}

export function applyLearningReviewUpdate(
  current: readonly LearningReviewItem[],
  captures: readonly LearningReviewCapture[],
  outcomes: readonly LearningReviewOutcome[] = [],
  updatedAt = new Date().toISOString(),
): LearningReviewItem[] {
  const correctIds = new Set(outcomes.filter((outcome) => outcome.correct).map((outcome) => outcome.itemId));
  const incorrectIds = new Set(outcomes.filter((outcome) => !outcome.correct).map((outcome) => outcome.itemId));
  let next = current
    .filter((item) => !correctIds.has(item.id))
    .map((item) => incorrectIds.has(item.id) ? { ...item, updatedAt } : item);

  for (const capture of captures) {
    const id = learningReviewItemId(capture);
    const existing = next.find((item) => item.id === id);
    const base = {
      activityId: capture.activityId,
      createdAt: existing?.createdAt ?? updatedAt,
      id,
      updatedAt,
    };
    const item: LearningReviewItem = capture.source === 'trainer'
      ? { ...base, questionId: capture.questionId, source: 'trainer' }
      : capture.source === 'scenario'
        ? { ...base, focusArea: capture.focusArea, scenario: capture.scenario, source: 'scenario' }
        : { ...base, focusArea: capture.focusArea, source: 'table' };
    next = [...next.filter((candidate) => candidate.id !== id), item];
  }

  return next
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id))
    .slice(-50);
}

export function selectDailyLearningReviewItems(
  queue: readonly LearningReviewItem[],
  count = 3,
): LearningReviewItem[] {
  return [...queue]
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, count));
}
