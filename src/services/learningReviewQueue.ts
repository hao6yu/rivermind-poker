import 'expo-sqlite/localStorage/install';

import {
  applyLearningReviewUpdate,
  type LearningReviewCapture,
  type LearningReviewItem,
  type LearningReviewOutcome,
} from '../domain/learning/reviewQueue';

const reviewStorageKey = 'rivermind.learning-review-queue.v1';
let memoryQueue: LearningReviewItem[] = [];

function reviewStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function isLearningReviewItem(value: unknown): value is LearningReviewItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string'
    || typeof item.activityId !== 'string'
    || typeof item.createdAt !== 'string'
    || typeof item.updatedAt !== 'string') return false;
  if (item.source === 'trainer') return typeof item.questionId === 'string';
  if (item.source === 'table') return typeof item.focusArea === 'string';
  return item.source === 'scenario'
    && typeof item.focusArea === 'string'
    && Boolean(item.scenario)
    && typeof item.scenario === 'object';
}

function readQueue(): LearningReviewItem[] {
  const storage = reviewStorage();
  if (!storage) return [...memoryQueue];
  try {
    const raw = storage.getItem(reviewStorageKey);
    if (!raw) return [...memoryQueue];
    const parsed: unknown = JSON.parse(raw);
    memoryQueue = Array.isArray(parsed) ? parsed.filter(isLearningReviewItem) : [];
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
