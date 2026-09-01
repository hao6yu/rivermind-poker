import type { VerifiedHandAnalysis } from '../domain/poker/analysis';
import type { AiDifficulty } from '../domain/poker/aiProfiles';
import { AI_DIFFICULTY_OPTIONS } from '../domain/poker/aiProfiles';
import { isCoachReview } from '../domain/poker/coaching';
import type { MultiwayHandState } from '../domain/poker/multiway';
import {
  handClientId,
  redactGameForPersistence,
  redactMultiwayGameForPersistence,
} from '../domain/poker/persistence';
import { TABLE_PLAYER_COUNT_OPTIONS } from '../domain/poker/multiwaySession';
import type { GameState } from '../domain/poker/types';
import type { SessionHandRecord } from '../features/table/sessionModels';
import type { Database, Json } from '../types/database';
import type { CoachResult } from './coach';
import { ensureAnonymousSession, supabase } from './supabase';

const queueStorageKey = 'rivermind.persistence.hand-writes.v1';
const maxQueueFlushPasses = 3;
let memoryQueue: QueuedHandWrite[] = [];

interface QueuedHandWriteBase {
  version: 2;
  sessionClientId: string;
  handClientId: string;
  coachEnabled: boolean;
  aiDifficulty: AiDifficulty;
  completedAt: string;
  updatedAt: string;
}

type QueuedHandWrite = QueuedHandWriteBase & ({
  mode: 'heads_up';
  game: GameState;
  coachResult: CoachResult | null;
} | {
  mode: 'multiway';
  game: MultiwayHandState;
  coachResult: null;
});

interface QueueHandInput {
  sessionClientId: string;
  coachEnabled: boolean;
  game: GameState;
  coachResult?: CoachResult | null;
  aiDifficulty?: AiDifficulty;
  completedAt?: string;
}

interface QueueMultiwayHandInput {
  sessionClientId: string;
  coachEnabled: boolean;
  game: MultiwayHandState;
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

const heroPlayerId = 'hero';

/**
 * The multiway sizes the game seats, from the canonical table model. Practice
 * tables offer heads-up (2) plus the multiway sizes 3, 6, and 9 — never any
 * other count — so a persisted multiway hand at any other size is corrupt.
 */
function isSupportedMultiwayTablePlayerCount(playerCount: number): boolean {
  return playerCount !== 2
    && (TABLE_PLAYER_COUNT_OPTIONS as readonly number[]).includes(playerCount);
}

function isCompletedMultiwayState(value: unknown): value is MultiwayHandState {
  if (!isRecord(value) || value.street !== 'complete' || !isRecord(value.outcome)) return false;
  if (!isRecord(value.players) || !Array.isArray(value.tablePlayerIds)) return false;
  if (!isSupportedMultiwayTablePlayerCount(value.tablePlayerIds.length)) return false;
  const tablePlayerIds = value.tablePlayerIds;
  // One record per seat: a repeated id would let a single player stand in for
  // two seats and silently reshape the hand's betting order.
  if (new Set(tablePlayerIds).size !== tablePlayerIds.length) return false;
  // The hero must be seated: a table without them is nobody's hand.
  if (!tablePlayerIds.includes(heroPlayerId)) return false;
  const players = value.players;
  const hero = players.hero;
  return isRecord(hero)
    && Array.isArray(hero.holeCards)
    && hero.holeCards.length === 2
    && Array.isArray(value.activePlayerIds)
    && Array.isArray(value.deck)
    && Array.isArray(value.board)
    && Array.isArray(value.history)
    && value.tablePlayerIds.every((playerId) => {
      if (typeof playerId !== 'string') return false;
      const player = players[playerId];
      return isRecord(player)
        && Array.isArray(player.holeCards)
        && (player.holeCards.length === 0 || player.holeCards.length === 2);
    });
}

function queuedWriteBaseIsValid(value: Record<string, unknown>): boolean {
  return typeof value.sessionClientId === 'string'
    && typeof value.handClientId === 'string'
    && typeof value.coachEnabled === 'boolean'
    && AI_DIFFICULTY_OPTIONS.some((profile) => profile.id === value.aiDifficulty)
    && typeof value.completedAt === 'string'
    && typeof value.updatedAt === 'string';
}

function parseQueuedHandWrite(value: unknown): QueuedHandWrite | null {
  if (!isRecord(value) || !queuedWriteBaseIsValid(value)) return null;
  if (value.version === 1 && isCompletedGameState(value.game)
    && (value.coachResult === null || isCoachResult(value.coachResult))) {
    return {
      ...value,
      version: 2,
      mode: 'heads_up',
      game: value.game,
      coachResult: value.coachResult,
    } as QueuedHandWrite;
  }
  if (value.version !== 2) return null;
  if (value.mode === 'heads_up' && isCompletedGameState(value.game)
    && (value.coachResult === null || isCoachResult(value.coachResult))) {
    return value as unknown as QueuedHandWrite;
  }
  if (value.mode === 'multiway' && isCompletedMultiwayState(value.game) && value.coachResult === null) {
    return value as unknown as QueuedHandWrite;
  }
  return null;
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
    const queue = Array.isArray(parsed)
      ? parsed.flatMap((value) => {
          const write = parseQueuedHandWrite(value);
          return write ? [write] : [];
        })
      : [];
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
  if (write.mode === 'multiway') return {
    clientId: write.handClientId,
    completedAt: write.completedAt,
    game: write.game,
    coachResult: null,
    mode: 'multiway',
  };
  return {
    clientId: write.handClientId,
    completedAt: write.completedAt,
    game: write.game,
    coachResult: write.coachResult,
    mode: 'heads_up',
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
    version: 2,
    mode: 'heads_up',
    sessionClientId: input.sessionClientId,
    handClientId: id,
    coachEnabled: input.coachEnabled,
    aiDifficulty: input.aiDifficulty ?? existing?.aiDifficulty ?? 'club',
    completedAt: input.completedAt ?? existing?.completedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    game,
    coachResult: input.coachResult ?? (existing?.mode === 'heads_up' ? existing.coachResult : null),
  };
  writeQueue([...queue.filter((write) => write.handClientId !== id), next]);
  return flushPendingHandWrites();
}

export async function queueMultiwayHandPersistence(input: QueueMultiwayHandInput): Promise<boolean> {
  const game = redactMultiwayGameForPersistence(input.game);
  const id = handClientId(input.sessionClientId, game.handNumber);
  const queue = readQueue();
  const existing = queue.find((write) => write.handClientId === id);
  const next: QueuedHandWrite = {
    version: 2,
    mode: 'multiway',
    sessionClientId: input.sessionClientId,
    handClientId: id,
    coachEnabled: input.coachEnabled,
    aiDifficulty: input.aiDifficulty ?? existing?.aiDifficulty ?? 'club',
    completedAt: input.completedAt ?? existing?.completedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    game,
    coachResult: null,
  };
  writeQueue([...queue.filter((write) => write.handClientId !== id), next]);
  return flushPendingHandWrites();
}

async function persistWrite(write: QueuedHandWrite, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const sessionPayload: PracticeSessionInsert = {
    user_id: userId,
    client_id: write.sessionClientId,
    mode: write.mode,
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

  let outcomeWinner: 'hero' | 'villain' | 'tie';
  let showdown: boolean;
  let potWon: number;
  if (write.mode === 'heads_up') {
    const outcome = write.game.outcome;
    if (!outcome) throw new Error('A persisted heads-up hand must have an outcome.');
    outcomeWinner = outcome.winner;
    showdown = outcome.showdown;
    potWon = outcome.potWon;
  } else {
    const outcome = write.game.outcome;
    if (!outcome) throw new Error('A persisted multiway hand must have an outcome.');
    outcomeWinner = outcome.winnerPlayerIds.includes('hero')
      ? outcome.winnerPlayerIds.length > 1 ? 'tie' : 'hero'
      : 'villain';
    showdown = outcome.showdown;
    potWon = outcome.totalPot;
  }
  const handPayload: PracticeHandInsert = {
    user_id: userId,
    session_id: session.id,
    client_id: write.handClientId,
    hand_number: write.game.handNumber,
    outcome_winner: outcomeWinner,
    showdown,
    pot_won: potWon,
    game_state: write.game as unknown as Json,
    completed_at: write.completedAt,
  };
  const { data: hand, error: handError } = await supabase
    .from('practice_hands')
    .upsert(handPayload, { onConflict: 'user_id,client_id' })
    .select('id')
    .single();
  if (handError) throw handError;

  if (write.mode === 'heads_up' && write.coachResult) {
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

/**
 * One read of the player's hand history. `readComplete` is false exactly when
 * the remote read failed and only the offline queue came back, so callers can
 * tell a genuinely complete record from an unverified partial fallback — and a
 * genuinely empty history from one that could not be read at all.
 */
export interface RecentHandHistory {
  readComplete: boolean;
  records: SessionHandRecord[];
}

export async function loadRecentHandHistoryResult(limit = 50): Promise<RecentHandHistory> {
  const localRecords = readQueue().map(queuedWriteToRecord);
  if (!supabase) {
    // Without a configured remote there is nothing to verify against: the
    // offline queue is the whole record, so reading it is a complete read.
    return { readComplete: true, records: localRecords.slice(-limit) };
  }

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

    const remoteRecords: SessionHandRecord[] = [];
    hands.forEach((row) => {
      if (isCompletedMultiwayState(row.game_state)) {
        remoteRecords.push({
          clientId: row.client_id,
          completedAt: row.completed_at,
          game: row.game_state,
          coachResult: null,
          mode: 'multiway',
        });
      } else if (isCompletedGameState(row.game_state)) {
        remoteRecords.push({
          clientId: row.client_id,
          completedAt: row.completed_at,
          game: row.game_state,
          coachResult: reviewsByHand.get(row.id) ?? null,
          mode: 'heads_up',
        });
      }
    });
    const queuedRecords = readQueue().map(queuedWriteToRecord);
    const merged = new Map(remoteRecords.map((record) => [record.clientId, record]));
    for (const record of queuedRecords) merged.set(record.clientId, record);
    return {
      readComplete: true,
      records: [...merged.values()]
        .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
        .slice(-limit),
    };
  } catch {
    return {
      readComplete: false,
      records: localRecords
        .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
        .slice(-limit),
    };
  }
}

export async function loadRecentHandHistory(limit = 50): Promise<SessionHandRecord[]> {
  return (await loadRecentHandHistoryResult(limit)).records;
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

/** Drops offline hand writes once their anonymous owner account no longer exists. */
export function clearPendingHandHistory(): void {
  writeQueue([]);
}
