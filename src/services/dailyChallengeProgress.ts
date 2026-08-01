import 'expo-sqlite/localStorage/install';

import type { DailyChallengeResult } from '../domain/poker/dailyChallenge';
import {
  applyDailyChallengeResult,
  mergeDailyChallengeProgress,
  type DailyChallengeProgress,
} from '../domain/poker/dailyChallengeProgress';
import type { Database } from '../types/database';
import { ensureAnonymousSession, supabase } from './supabase';

const storageKey = 'rivermind.daily-challenge.results.v1';
let memoryResults: StoredDailyChallengeProgress[] = [];

export type { DailyChallengeProgress } from '../domain/poker/dailyChallengeProgress';

interface StoredDailyChallengeProgress extends DailyChallengeProgress {
  pending: boolean;
}

type DailyChallengeInsert = Database['public']['Tables']['daily_challenge_results']['Insert'];
type DailyChallengeRow = Database['public']['Tables']['daily_challenge_results']['Row'];

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function isProgress(value: unknown): value is StoredDailyChallengeProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.challengeDate === 'string'
    && [40, 70, 100].includes(Number(candidate.bestScore))
    && [1, 2, 3].includes(Number(candidate.bestPlace))
    && Number.isInteger(candidate.bestHands) && Number(candidate.bestHands) > 0
    && Number.isInteger(candidate.attempts) && Number(candidate.attempts) > 0
    && typeof candidate.completedAt === 'string'
    && typeof candidate.updatedAt === 'string'
    && typeof candidate.pending === 'boolean';
}

function readStored(): StoredDailyChallengeProgress[] {
  const local = storage();
  if (!local) return [...memoryResults];
  try {
    const parsed: unknown = JSON.parse(local.getItem(storageKey) ?? '[]');
    memoryResults = Array.isArray(parsed) ? parsed.filter(isProgress) : [];
  } catch {
    // Keep the latest valid in-memory results.
  }
  return [...memoryResults];
}

function writeStored(results: readonly StoredDailyChallengeProgress[]): void {
  memoryResults = [...results];
  try {
    if (results.length === 0) storage()?.removeItem(storageKey);
    else storage()?.setItem(storageKey, JSON.stringify(results));
  } catch {
    // Memory preserves results for this app session.
  }
}

function publicResults(results: readonly StoredDailyChallengeProgress[]): DailyChallengeProgress[] {
  return results.map(({ pending: _pending, ...result }) => result);
}

function fromRow(row: DailyChallengeRow): DailyChallengeProgress | null {
  if (![40, 70, 100].includes(row.best_score) || ![1, 2, 3].includes(row.best_place)) return null;
  return {
    challengeDate: row.challenge_date,
    bestScore: row.best_score,
    bestPlace: row.best_place as 1 | 2 | 3,
    bestHands: row.best_hands,
    attempts: row.attempts,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function toInsert(result: DailyChallengeProgress, userId: string): DailyChallengeInsert {
  return {
    user_id: userId,
    challenge_date: result.challengeDate,
    challenge_version: 1,
    best_score: result.bestScore,
    best_place: result.bestPlace,
    best_hands: result.bestHands,
    attempts: result.attempts,
    completed_at: result.completedAt,
    updated_at: result.updatedAt,
  };
}

async function upsertResult(result: DailyChallengeProgress, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase
    .from('daily_challenge_results')
    .upsert(toInsert(result, userId), { onConflict: 'user_id,challenge_date' });
  if (error) throw error;
}

export function loadCachedDailyChallengeProgress(): DailyChallengeProgress[] {
  return publicResults(readStored());
}

export async function loadDailyChallengeProgress(): Promise<DailyChallengeProgress[]> {
  let stored = readStored();
  if (!supabase) return publicResults(stored);
  try {
    const userId = await ensureAnonymousSession();
    for (const result of stored.filter((item) => item.pending)) {
      await upsertResult(result, userId);
      stored = stored.map((item) => item.challengeDate === result.challengeDate ? { ...item, pending: false } : item);
      writeStored(stored);
    }
    const { data, error } = await supabase
      .from('daily_challenge_results')
      .select('challenge_date, challenge_version, best_score, best_place, best_hands, attempts, completed_at, updated_at')
      .eq('user_id', userId)
      .order('challenge_date', { ascending: false })
      .limit(90);
    if (error) throw error;
    const remote = data.flatMap((row) => {
      const parsed = fromRow({ ...row, user_id: userId });
      return parsed ? [parsed] : [];
    });
    const merged = mergeDailyChallengeProgress(publicResults(stored), remote);
    writeStored(merged.map((result) => ({ ...result, pending: false })));
    return merged;
  } catch {
    return publicResults(stored);
  }
}

export async function recordDailyChallengeResult(
  result: DailyChallengeResult,
  updatedAt = new Date().toISOString(),
): Promise<DailyChallengeProgress> {
  const stored = readStored();
  const previous = stored.find((item) => item.challengeDate === result.challengeDate);
  const best = applyDailyChallengeResult(previous, result, updatedAt);
  let next = [
    ...stored.filter((item) => item.challengeDate !== result.challengeDate),
    { ...best, pending: true },
  ].sort((left, right) => right.challengeDate.localeCompare(left.challengeDate));
  writeStored(next);

  if (!supabase) return best;
  try {
    const userId = await ensureAnonymousSession();
    await upsertResult(best, userId);
    next = next.map((item) => item.challengeDate === best.challengeDate ? { ...item, pending: false } : item);
    writeStored(next);
  } catch {
    // Retry this owner-scoped upsert on the next progress load.
  }
  return best;
}

export async function deleteAllDailyChallengeProgress(): Promise<void> {
  if (supabase) {
    const userId = await ensureAnonymousSession();
    const { error } = await supabase.from('daily_challenge_results').delete().eq('user_id', userId);
    if (error) throw error;
  }
  writeStored([]);
}
