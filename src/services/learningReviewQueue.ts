import 'expo-sqlite/localStorage/install';

import {
  applyLearningReviewUpdate,
  type LearningReviewCapture,
  type LearningReviewItem,
  type LearningReviewOutcome,
  type ScenarioLearningReviewItem,
  type TableLearningReviewItem,
  type TrainerLearningReviewItem,
} from '../domain/learning/reviewQueue';

const reviewStorageKey = 'rivermind.learning-review-queue.v1';
let memoryQueue: LearningReviewItem[] = [];

function reviewStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function normalizeLearningReviewItem(value: unknown): LearningReviewItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string'
    || typeof item.activityId !== 'string'
    || typeof item.createdAt !== 'string'
    || typeof item.updatedAt !== 'string') return null;
  const scheduling = {
    correctStreak: typeof item.correctStreak === 'number' ? Math.max(0, Math.floor(item.correctStreak)) : 0,
    lastReviewedAt: typeof item.lastReviewedAt === 'string' ? item.lastReviewedAt : null,
    nextReviewAt: typeof item.nextReviewAt === 'string' ? item.nextReviewAt : item.updatedAt,
  };
  if (item.source === 'trainer' && typeof item.questionId === 'string') {
    return { ...item, ...scheduling } as TrainerLearningReviewItem;
  }
  if (item.source === 'table' && typeof item.focusArea === 'string') {
    return { ...item, ...scheduling } as TableLearningReviewItem;
  }
  if (item.source === 'scenario'
    && typeof item.focusArea === 'string'
    && Boolean(item.scenario)
    && typeof item.scenario === 'object') {
    return { ...item, ...scheduling } as ScenarioLearningReviewItem;
  }
  return null;
}

function readQueue(): LearningReviewItem[] {
  const storage = reviewStorage();
  if (!storage) return [...memoryQueue];
  try {
    const raw = storage.getItem(reviewStorageKey);
    if (!raw) return [...memoryQueue];
    const parsed: unknown = JSON.parse(raw);
    memoryQueue = Array.isArray(parsed)
      ? parsed.flatMap((item) => {
        const normalized = normalizeLearningReviewItem(item);
        return normalized ? [normalized] : [];
      })
      : [];
    return [...memoryQueue];
  } catch {
    return [...memoryQueue];
  }
}

function writeQueue(queue: readonly LearningReviewItem[]): void {
  memoryQueue = [...queue];
  const storage = reviewStorage();
  if (!storage) return;
  try {
    if (queue.length === 0) storage.removeItem(reviewStorageKey);
    else storage.setItem(reviewStorageKey, JSON.stringify(queue));
  } catch {
    // The in-memory queue still supports this app session.
  }
}

export function loadCachedLearningReviewQueue(): LearningReviewItem[] {
  return readQueue();
}

export function updateLearningReviewQueue(
  captures: readonly LearningReviewCapture[],
  outcomes: readonly LearningReviewOutcome[] = [],
  updatedAt = new Date().toISOString(),
): LearningReviewItem[] {
  const next = applyLearningReviewUpdate(readQueue(), captures, outcomes, updatedAt);
  writeQueue(next);
  return next;
}

export function clearLearningReviewQueue(): void {
  writeQueue([]);
}
