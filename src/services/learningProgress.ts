import 'expo-sqlite/localStorage/install';

import { applyLearningResult, mergeLearningProgress } from '../domain/learning/progress';
import type {
  LearningActivityType,
  LearningProgressEntry,
  LearningResultInput,
  LearningStatus,
} from '../domain/learning/types';
import type { Database } from '../types/database';
import { ensureAnonymousSession, supabase } from './supabase';

const learningStorageKey = 'rivermind.learning-progress.v1';
let memoryProgress: StoredLearningProgress[] = [];

interface StoredLearningProgress extends LearningProgressEntry {
  pending: boolean;
}

type LearningProgressInsert = Database['public']['Tables']['learning_progress']['Insert'];
type LearningProgressRow = Database['public']['Tables']['learning_progress']['Row'];

function isActivityType(value: unknown): value is LearningActivityType {
  return value === 'lesson'
    || value === 'percentage_drill'
    || value === 'hand_quiz'
    || value === 'scenario_drill';
}

function isStatus(value: unknown): value is LearningStatus {
  return value === 'started' || value === 'completed';
}

function isStoredProgress(value: unknown): value is StoredLearningProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.activityId === 'string'
    && isActivityType(entry.activityType)
    && isStatus(entry.status)
    && (entry.bestScore === null || (typeof entry.bestScore === 'number' && entry.bestScore >= 0 && entry.bestScore <= 100))
    && typeof entry.attempts === 'number'
    && (entry.completedAt === null || typeof entry.completedAt === 'string')
    && typeof entry.updatedAt === 'string'
    && typeof entry.pending === 'boolean';
}

function progressStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function readStoredProgress(): StoredLearningProgress[] {
  const storage = progressStorage();
  if (!storage) return [...memoryProgress];
  try {
    const raw = storage.getItem(learningStorageKey);
    if (!raw) return [...memoryProgress];
    const parsed: unknown = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed.filter(isStoredProgress) : [];
    memoryProgress = entries;
    return [...entries];
  } catch {
    return [...memoryProgress];
  }
}

function writeStoredProgress(entries: readonly StoredLearningProgress[]): void {
  memoryProgress = [...entries];
  const storage = progressStorage();
  if (!storage) return;
  try {
    if (entries.length === 0) storage.removeItem(learningStorageKey);
    else storage.setItem(learningStorageKey, JSON.stringify(entries));
  } catch {
    // Memory still preserves progress for the current app session.
  }
}

function publicProgress(entries: readonly StoredLearningProgress[]): LearningProgressEntry[] {
  return entries.map(({ pending: _pending, ...entry }) => entry);
}

function fromRow(row: LearningProgressRow): LearningProgressEntry | null {
  if (!isActivityType(row.activity_type) || !isStatus(row.status)) return null;
  return {
    activityId: row.activity_id,
    activityType: row.activity_type,
    status: row.status,
    bestScore: row.best_score,
    attempts: row.attempts,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function toInsert(entry: LearningProgressEntry, userId: string): LearningProgressInsert {
  return {
    user_id: userId,
    activity_id: entry.activityId,
    activity_type: entry.activityType,
    status: entry.status,
    best_score: entry.bestScore,
    attempts: entry.attempts,
    completed_at: entry.completedAt,
    updated_at: entry.updatedAt,
  };
}

async function upsertProgress(entry: LearningProgressEntry, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase
    .from('learning_progress')
    .upsert(toInsert(entry, userId), { onConflict: 'user_id,activity_id' });
  if (error) throw error;
}

export function loadCachedLearningProgress(): LearningProgressEntry[] {
  return publicProgress(readStoredProgress());
}

export async function loadLearningProgress(): Promise<LearningProgressEntry[]> {
  let stored = readStoredProgress();
  if (!supabase) return publicProgress(stored);

  try {
    const userId = await ensureAnonymousSession();
    for (const entry of stored.filter((item) => item.pending)) {
      await upsertProgress(entry, userId);
      stored = stored.map((item) => item.activityId === entry.activityId
        ? { ...item, pending: false }
        : item);
      writeStoredProgress(stored);
    }

    const { data, error } = await supabase
      .from('learning_progress')
      .select('activity_id, activity_type, status, best_score, attempts, completed_at, updated_at')
      .eq('user_id', userId);
    if (error) throw error;

    const remote = data.flatMap((row) => {
      const entry = fromRow({ ...row, user_id: userId });
      return entry ? [entry] : [];
    });
    const merged = mergeLearningProgress(publicProgress(stored), remote);
    const next = merged.map((entry) => ({ ...entry, pending: false }));
    writeStoredProgress(next);
    return merged;
  } catch {
    return publicProgress(stored);
  }
}

export async function saveLearningResult(
  input: LearningResultInput,
  updatedAt = new Date().toISOString(),
): Promise<LearningProgressEntry> {
  const stored = readStoredProgress();
  const nextProgress = applyLearningResult(publicProgress(stored), input, updatedAt);
  const entry = nextProgress.find((item) => item.activityId === input.activityId);
  if (!entry) throw new Error('Could not create learning progress.');
  let nextStored = nextProgress.map((item) => ({
    ...item,
    pending: item.activityId === input.activityId
      ? true
      : stored.find((saved) => saved.activityId === item.activityId)?.pending ?? false,
  }));
  writeStoredProgress(nextStored);

  if (!supabase) return entry;
  try {
    const userId = await ensureAnonymousSession();
    await upsertProgress(entry, userId);
    nextStored = nextStored.map((item) => item.activityId === entry.activityId
      ? { ...item, pending: false }
      : item);
    writeStoredProgress(nextStored);
  } catch {
    // Keep the entry pending. The next load will retry it.
  }
  return entry;
}

export async function deleteAllLearningProgress(): Promise<void> {
  if (supabase) {
    const userId = await ensureAnonymousSession();
    const { error } = await supabase.from('learning_progress').delete().eq('user_id', userId);
    if (error) throw error;
  }
  writeStoredProgress([]);
}

/** Clears only the device cache after the owning auth row was deleted server-side. */
export function clearCachedLearningProgress(): void {
  writeStoredProgress([]);
}
