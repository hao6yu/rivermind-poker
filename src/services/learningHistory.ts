import 'expo-sqlite/localStorage/install';

import {
  isLearningDateKey,
  learningDateKey,
  type LearningSessionInput,
  type LearningSessionKind,
  type LearningSessionRecord,
} from '../domain/learning/history';

const historyStorageKey = 'rivermind.learning-history.v1';
const maximumHistoryRecords = 500;
let memoryHistory: LearningSessionRecord[] = [];

function historyStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function isSessionKind(value: unknown): value is LearningSessionKind {
  return value === 'lesson' || value === 'practice' || value === 'review';
}

function normalizeCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}

function normalizeLearningSession(value: unknown): LearningSessionRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string'
    || typeof item.activityId !== 'string'
    || !isSessionKind(item.kind)
    || typeof item.localDate !== 'string'
    || !isLearningDateKey(item.localDate)
    || typeof item.occurredAt !== 'string') return null;
  const score = typeof item.score === 'number' && Number.isFinite(item.score)
    ? Math.max(0, Math.min(100, Math.round(item.score)))
    : null;
  return {
    activityId: item.activityId,
    correctCount: normalizeCount(item.correctCount),
    id: item.id,
    kind: item.kind,
    localDate: item.localDate,
    occurredAt: item.occurredAt,
    score,
    totalCount: normalizeCount(item.totalCount),
  };
}

function readHistory(): LearningSessionRecord[] {
  const storage = historyStorage();
  if (!storage) return [...memoryHistory];
  try {
    const raw = storage.getItem(historyStorageKey);
    if (!raw) return [...memoryHistory];
    const parsed: unknown = JSON.parse(raw);
    memoryHistory = Array.isArray(parsed)
      ? parsed.flatMap((item) => {
        const normalized = normalizeLearningSession(item);
        return normalized ? [normalized] : [];
      })
      : [];
    return [...memoryHistory];
  } catch {
    return [...memoryHistory];
  }
}

function writeHistory(history: readonly LearningSessionRecord[]): void {
  memoryHistory = [...history];
  const storage = historyStorage();
  if (!storage) return;
  try {
    if (history.length === 0) storage.removeItem(historyStorageKey);
    else storage.setItem(historyStorageKey, JSON.stringify(history));
  } catch {
    // The in-memory history still supports this app session.
  }
}

export function loadCachedLearningHistory(): LearningSessionRecord[] {
  return readHistory();
}

export function recordLearningSession(
  input: LearningSessionInput,
  occurredAt = new Date().toISOString(),
): LearningSessionRecord[] {
  const timestamp = new Date(occurredAt);
  const safeTimestamp = Number.isNaN(timestamp.getTime()) ? new Date() : timestamp;
  const current = readHistory();
  const nextRecord: LearningSessionRecord = {
    activityId: input.activityId,
    correctCount: normalizeCount(input.correctCount),
    id: `${safeTimestamp.toISOString()}:${input.kind}:${input.activityId}:${current.length}`,
    kind: input.kind,
    localDate: learningDateKey(safeTimestamp),
    occurredAt: safeTimestamp.toISOString(),
    score: input.score === undefined ? null : Math.max(0, Math.min(100, Math.round(input.score))),
    totalCount: normalizeCount(input.totalCount),
  };
  const next = [nextRecord, ...current]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, maximumHistoryRecords);
  writeHistory(next);
  return next;
}

export function clearLearningHistory(): void {
  writeHistory([]);
}
