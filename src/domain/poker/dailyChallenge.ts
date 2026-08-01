import { seededRandom, type RandomSource } from './cards';
import type { MultiwayHandState } from './multiway';
import { seededMultiwayDecisionRandom } from './multiwaySession';
import {
  createNextSitAndGoHand,
  createSitAndGo,
  createSitAndGoCheckpoint,
  isSitAndGoCheckpoint,
  resumeSitAndGo,
  sitAndGoHeroPlace,
  type SitAndGoCheckpoint,
} from './tournament';

export const DAILY_CHALLENGE_VERSION = 1;

export interface DailyChallengeCheckpoint {
  version: 1;
  challengeDate: string;
  tournament: SitAndGoCheckpoint;
}

export interface DailyChallengeResult {
  challengeDate: string;
  score: number;
  place: 1 | 2 | 3;
  handsPlayed: number;
  completedAt: string;
}

function validChallengeDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

/** Stable non-cryptographic event seed. Only Daily Challenge uses reproducible deals. */
export function dailyChallengeSeed(label: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function dailyChallengeDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function dailyChallengeDealRandom(challengeDate: string, handNumber: number): RandomSource {
  if (!validChallengeDate(challengeDate)) throw new Error('Daily Challenge date must use YYYY-MM-DD.');
  if (!Number.isInteger(handNumber) || handNumber < 1) throw new Error('Daily Challenge hand number must be positive.');
  return seededRandom(dailyChallengeSeed(`rivermind:daily:v${DAILY_CHALLENGE_VERSION}:${challengeDate}:hand:${handNumber}`));
}

export function dailyChallengeDecisionRandom(
  challengeDate: string,
  state: MultiwayHandState,
  playerId: string,
): RandomSource {
  const eventRandom = dailyChallengeDealRandom(challengeDate, state.handNumber);
  const decisionRandom = seededMultiwayDecisionRandom(state, playerId);
  const salt = Math.floor(eventRandom() * 0x1_0000_0000) ^ Math.floor(decisionRandom() * 0x1_0000_0000);
  return seededRandom(salt >>> 0);
}

export function createDailyChallenge(challengeDate: string): MultiwayHandState {
  return createSitAndGo(dailyChallengeDealRandom(challengeDate, 1));
}

export function createNextDailyChallengeHand(
  challengeDate: string,
  state: MultiwayHandState,
): MultiwayHandState {
  return createNextSitAndGoHand(
    state,
    dailyChallengeDealRandom(challengeDate, state.handNumber + 1),
  );
}

export function createDailyChallengeCheckpoint(
  challengeDate: string,
  state: MultiwayHandState,
): DailyChallengeCheckpoint {
  if (!validChallengeDate(challengeDate)) throw new Error('Daily Challenge date must use YYYY-MM-DD.');
  return {
    version: DAILY_CHALLENGE_VERSION,
    challengeDate,
    tournament: createSitAndGoCheckpoint(state, 'club'),
  };
}

export function isDailyChallengeCheckpoint(value: unknown): value is DailyChallengeCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const checkpoint = value as Record<string, unknown>;
  return checkpoint.version === DAILY_CHALLENGE_VERSION
    && typeof checkpoint.challengeDate === 'string'
    && validChallengeDate(checkpoint.challengeDate)
    && isSitAndGoCheckpoint(checkpoint.tournament)
    && checkpoint.tournament.players.length === 3;
}

export function resumeDailyChallenge(checkpoint: DailyChallengeCheckpoint): MultiwayHandState {
  if (!isDailyChallengeCheckpoint(checkpoint)) throw new Error('The saved Daily Challenge is invalid.');
  return resumeSitAndGo(
    checkpoint.tournament,
    dailyChallengeDealRandom(checkpoint.challengeDate, checkpoint.tournament.nextHandNumber),
  );
}

export function dailyChallengeResult(
  challengeDate: string,
  state: MultiwayHandState,
  completedAt = new Date().toISOString(),
): DailyChallengeResult | null {
  const place = sitAndGoHeroPlace(state);
  if (place !== 1 && place !== 2 && place !== 3) return null;
  return {
    challengeDate,
    score: place === 1 ? 100 : place === 2 ? 70 : 40,
    place,
    handsPlayed: state.handNumber,
    completedAt,
  };
}

export function dailyChallengeDisplayDate(challengeDate: string): string {
  if (!validChallengeDate(challengeDate)) return challengeDate;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${challengeDate}T00:00:00.000Z`));
}

export function dailyChallengeStreak(
  completedDates: readonly string[],
  today = dailyChallengeDate(),
): number {
  const completed = new Set(completedDates.filter(validChallengeDate));
  const cursor = new Date(`${today}T00:00:00.000Z`);
  if (!completed.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (completed.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
