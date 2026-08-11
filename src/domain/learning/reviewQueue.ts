import type { CoachFocusArea } from '../poker/types';
import type { ScenarioSpot } from './types';

export type ReviewFocusArea = Exclude<CoachFocusArea, 'none'>;

interface LearningReviewBase {
  activityId: string;
  correctStreak: number;
  createdAt: string;
  id: string;
  lastReviewedAt: string | null;
  nextReviewAt: string;
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

const masteredReviewStreak = 3;

function addReviewDays(isoTimestamp: string, days: number): string {
  const date = new Date(isoTimestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
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
  const outcomesById = new Map(outcomes.map((outcome) => [outcome.itemId, outcome]));
  let next = current.flatMap((item): LearningReviewItem[] => {
    const outcome = outcomesById.get(item.id);
    if (!outcome) return [item];
    if (!outcome.correct) {
      return [{
        ...item,
        correctStreak: 0,
        lastReviewedAt: updatedAt,
        nextReviewAt: addReviewDays(updatedAt, 1),
        updatedAt,
      }];
    }
    const correctStreak = item.correctStreak + 1;
    if (correctStreak >= masteredReviewStreak) return [];
    return [{
      ...item,
      correctStreak,
      lastReviewedAt: updatedAt,
      nextReviewAt: addReviewDays(updatedAt, correctStreak === 1 ? 1 : 3),
      updatedAt,
    }];
  });

  for (const capture of captures) {
    const id = learningReviewItemId(capture);
    const existing = next.find((item) => item.id === id);
    const base = {
      activityId: capture.activityId,
      correctStreak: 0,
      createdAt: existing?.createdAt ?? updatedAt,
      id,
      lastReviewedAt: existing?.lastReviewedAt ?? null,
      nextReviewAt: updatedAt,
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
  now = new Date().toISOString(),
): LearningReviewItem[] {
  return [...queue]
    .filter((item) => item.nextReviewAt <= now)
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, count));
}

export function dueLearningReviewCount(
  queue: readonly LearningReviewItem[],
  now = new Date().toISOString(),
): number {
  return queue.filter((item) => item.nextReviewAt <= now).length;
}
