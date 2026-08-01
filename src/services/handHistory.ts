import type { VerifiedHandAnalysis } from '../domain/poker/analysis';
import type { AiDifficulty } from '../domain/poker/aiProfiles';
import { isCoachReview } from '../domain/poker/coaching';
import { handClientId, redactGameForPersistence } from '../domain/poker/persistence';
import type { GameState } from '../domain/poker/types';
import type { SessionHandRecord } from '../features/table/sessionModels';
import type { Database, Json } from '../types/database';
import type { CoachResult } from './coach';
import { ensureAnonymousSession, supabase } from './supabase';

const queueStorageKey = 'rivermind.persistence.hand-writes.v1';
const maxQueueFlushPasses = 3;
let memoryQueue: QueuedHandWrite[] = [];

interface QueuedHandWrite {
  version: 1;
  sessionClientId: string;
  handClientId: string;
  coachEnabled: boolean;
  aiDifficulty: AiDifficulty;
  completedAt: string;
  updatedAt: string;
  game: GameState;
  coachResult: CoachResult | null;
}

interface QueueHandInput {
  sessionClientId: string;
  coachEnabled: boolean;
  game: GameState;
  coachResult?: CoachResult | null;
  aiDifficulty?: AiDifficulty;
  completedAt?: string;
}

type PracticeSessionInsert = Database['public']['Tables']['practice_sessions']['Insert'];
type PracticeHandInsert = Database['public']['Tables']['practice_hands']['Insert'];
type HandReviewInsert = Database['public']['Tables']['hand_reviews']['Insert'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isVerifiedAnalysis(value: unknown): value is VerifiedHandAnalysis {
  if (!isRecord(value)) return false;
  return value.version === 1
    && value.source === 'deterministic-poker-engine'
    && Array.isArray(value.heroCards)
    && Array.isArray(value.finalBoard)
    && Array.isArray(value.decisions)
    && Array.isArray(value.interpretationLimits);
}

function isCoachResult(value: unknown): value is CoachResult {
  return isRecord(value) && isCoachReview(value.review) && isVerifiedAnalysis(value.analysis);
}

function isCompletedGameState(value: unknown): value is GameState {
  if (!isRecord(value) || value.street !== 'complete' || !isRecord(value.outcome)) return false;
  if (!isRecord(value.players)) return false;
  const hero = value.players.hero;
  const villain = value.players.villain;
  return isRecord(hero)
    && isRecord(villain)
    && Array.isArray(hero.holeCards)
    && hero.holeCards.length === 2
    && Array.isArray(villain.holeCards)
    && (villain.holeCards.length === 0 || villain.holeCards.length === 2)
    && Array.isArray(value.deck)
    && Array.isArray(value.board)
    && Array.isArray(value.history);
}

function isQueuedHandWrite(value: unknown): value is QueuedHandWrite {
  if (!isRecord(value) || value.version !== 1) return false;
  return typeof value.sessionClientId === 'string'
    && typeof value.handClientId === 'string'
    && typeof value.coachEnabled === 'boolean'
    && ['friendly', 'club', 'sharp'].includes(String(value.aiDifficulty))
    && typeof value.completedAt === 'string'
    && typeof value.updatedAt === 'string'
    && isCompletedGameState(value.game)
    && (value.coachResult === null || isCoachResult(value.coachResult));
}

function persistenceStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function readQueue(): QueuedHandWrite[] {
  const storage = persistenceStorage();
  if (!storage) return [...memoryQueue];
  try {
    const raw = storage.getItem(queueStorageKey);
    if (!raw) return [...memoryQueue];
    const parsed: unknown = JSON.parse(raw);
    const queue = Array.isArray(parsed) ? parsed.filter(isQueuedHandWrite) : [];
    memoryQueue = queue;
    return [...queue];
  } catch {
    return [...memoryQueue];
  }
}

function writeQueue(queue: readonly QueuedHandWrite[]): void {
  memoryQueue = [...queue];
  const storage = persistenceStorage();
  if (!storage) return;
  try {
    if (queue.length === 0) {
      storage.removeItem(queueStorageKey);
      return;
    }
    storage.setItem(queueStorageKey, JSON.stringify(queue));
  } catch {
    // The in-memory queue still preserves this session's writes when device storage is unavailable.
  }
}

function queuedWriteToRecord(write: QueuedHandWrite): SessionHandRecord {
  return {
    clientId: write.handClientId,
    completedAt: write.completedAt,
    game: write.game,
    coachResult: write.coachResult,
  };
}

export function pendingHandWriteCount(): number {
  return readQueue().length;
}

export async function queueHandPersistence(input: QueueHandInput): Promise<boolean> {
  const game = redactGameForPersistence(input.game);
  const id = handClientId(input.sessionClientId, game.handNumber);
  const queue = readQueue();
  const existing = queue.find((write) => write.handClientId === id);
  const next: QueuedHandWrite = {
    version: 1,
    sessionClientId: input.sessionClientId,
    handClientId: id,
    coachEnabled: input.coachEnabled,
    aiDifficulty: input.aiDifficulty ?? existing?.aiDifficulty ?? 'club',
    completedAt: input.completedAt ?? existing?.completedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    game,
    coachResult: input.coachResult ?? existing?.coachResult ?? null,
  };
  writeQueue([...queue.filter((write) => write.handClientId !== id), next]);
  return flushPendingHandWrites();
}

async function persistWrite(write: QueuedHandWrite, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const sessionPayload: PracticeSessionInsert = {
    user_id: userId,
    client_id: write.sessionClientId,
    mode: 'heads_up',
    ai_difficulty: write.aiDifficulty,
    coach_enabled: write.coachEnabled,
    last_played_at: new Date().toISOString(),
  };
  const { data: session, error: sessionError } = await supabase
    .from('practice_sessions')
    .upsert(sessionPayload, { onConflict: 'user_id,client_id' })
    .select('id')
    .single();
  if (sessionError) throw sessionError;

  const outcome = write.game.outcome;
  if (!outcome) throw new Error('A persisted hand must have an outcome.');
  const handPayload: PracticeHandInsert = {
    user_id: userId,
    session_id: session.id,
    client_id: write.handClientId,
    hand_number: write.game.handNumber,
    outcome_winner: outcome.winner,
    showdown: outcome.showdown,
    pot_won: outcome.potWon,
    game_state: write.game as unknown as Json,
    completed_at: write.completedAt,
  };
  const { data: hand, error: handError } = await supabase
    .from('practice_hands')
    .upsert(handPayload, { onConflict: 'user_id,client_id' })
    .select('id')
    .single();
  if (handError) throw handError;

  if (write.coachResult) {
    const review = write.coachResult.review;
    const reviewPayload: HandReviewInsert = {
      user_id: userId,
      hand_id: hand.id,
      analysis_version: write.coachResult.analysis.version,
      hand_grade: review.handGrade,
      focus_area: review.focusArea,
      focus_decision_sequence: review.focusDecisionSequence,
      review: review as unknown as Json,
      verified_analysis: write.coachResult.analysis as unknown as Json,
      updated_at: write.updatedAt,
    };
    const { error: reviewError } = await supabase
      .from('hand_reviews')
      .upsert(reviewPayload, { onConflict: 'hand_id' });
    if (reviewError) throw reviewError;
  }
}

let activeFlush: Promise<boolean> | null = null;

async function runQueueFlush(): Promise<boolean> {
  if (!supabase) return false;
  let userId: string;
  try {
    userId = await ensureAnonymousSession();
  } catch {
    return false;
  }

  for (let pass = 0; pass < maxQueueFlushPasses; pass += 1) {
    const snapshot = readQueue();
    if (snapshot.length === 0) return true;
    let progressed = false;
    for (const write of snapshot) {
      try {
        await persistWrite(write, userId);
      } catch {
        return false;
      }
      const current = readQueue();
      const currentWrite = current.find((item) => item.handClientId === write.handClientId);
      if (currentWrite?.updatedAt === write.updatedAt) {
        writeQueue(current.filter((item) => item.handClientId !== write.handClientId));
        progressed = true;
      }
    }
    if (!progressed) return false;
  }
  return readQueue().length === 0;
}

export function flushPendingHandWrites(): Promise<boolean> {
  if (activeFlush) return activeFlush;
  activeFlush = runQueueFlush().finally(() => {
    activeFlush = null;
  });
  return activeFlush;
}

function coachResultFromRows(
  review: unknown,
  verifiedAnalysis: unknown,
): CoachResult | null {
  return isCoachReview(review) && isVerifiedAnalysis(verifiedAnalysis)
    ? { review, analysis: verifiedAnalysis }
    : null;
}

export async function loadRecentHandHistory(limit = 50): Promise<SessionHandRecord[]> {
  const localRecords = readQueue().map(queuedWriteToRecord);
  if (!supabase) return localRecords.slice(-limit);

  try {
    await flushPendingHandWrites();
    const userId = await ensureAnonymousSession();
    const { data: hands, error: handsError } = await supabase
      .from('practice_hands')
      .select('id, client_id, completed_at, game_state')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(limit);
    if (handsError) throw handsError;

    const handIds = hands.map((hand) => hand.id);
    const reviewsByHand = new Map<string, CoachResult>();
    if (handIds.length > 0) {
      const { data: reviews, error: reviewsError } = await supabase
        .from('hand_reviews')
        .select('hand_id, review, verified_analysis')
        .eq('user_id', userId)
        .in('hand_id', handIds);
      if (reviewsError) throw reviewsError;
      for (const row of reviews) {
        const result = coachResultFromRows(row.review, row.verified_analysis);
        if (result) reviewsByHand.set(row.hand_id, result);
      }
    }

    const remoteRecords: SessionHandRecord[] = hands.flatMap((row) => {
      if (!isCompletedGameState(row.game_state)) return [];
      return [{
        clientId: row.client_id,
        completedAt: row.completed_at,
        game: row.game_state,
        coachResult: reviewsByHand.get(row.id) ?? null,
      }];
    });
    const queuedRecords = readQueue().map(queuedWriteToRecord);
    const merged = new Map(remoteRecords.map((record) => [record.clientId, record]));
    for (const record of queuedRecords) merged.set(record.clientId, record);
    return [...merged.values()]
      .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
      .slice(-limit);
  } catch {
    return localRecords
      .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
      .slice(-limit);
  }
}

export async function deleteAllHandHistory(): Promise<void> {
  if (!supabase) {
    writeQueue([]);
    return;
  }
  const userId = await ensureAnonymousSession();
  const { error } = await supabase.from('practice_sessions').delete().eq('user_id', userId);
  if (error) throw error;
  writeQueue([]);
}
