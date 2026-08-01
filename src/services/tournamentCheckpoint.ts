import 'expo-sqlite/localStorage/install';

import {
  DEFAULT_SIT_AND_GO_PLAYER_COUNT,
  isSitAndGoCheckpoint,
  type SitAndGoPlayerCount,
  type SitAndGoCheckpoint,
} from '../domain/poker/tournament';
import {
  dailyChallengeDate,
  isDailyChallengeCheckpoint,
  type DailyChallengeCheckpoint,
} from '../domain/poker/dailyChallenge';

const threePlayerCheckpointKey = 'rivermind.sit-and-go.checkpoint.v1';
const sixPlayerCheckpointKey = 'rivermind.sit-and-go.checkpoint.6-player.v1';
const dailyCheckpointKey = 'rivermind.daily-challenge.checkpoint.v1';
const memoryCheckpoints: Partial<Record<SitAndGoPlayerCount, SitAndGoCheckpoint>> = {};
let memoryDailyCheckpoint: DailyChallengeCheckpoint | null = null;

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function checkpointKey(playerCount: SitAndGoPlayerCount): string {
  return playerCount === 6 ? sixPlayerCheckpointKey : threePlayerCheckpointKey;
}

export function loadSitAndGoCheckpoint(
  playerCount: SitAndGoPlayerCount = DEFAULT_SIT_AND_GO_PLAYER_COUNT,
): SitAndGoCheckpoint | null {
  const local = storage();
  if (!local) return memoryCheckpoints[playerCount] ?? null;
  try {
    const raw = local.getItem(checkpointKey(playerCount));
    if (!raw) return memoryCheckpoints[playerCount] ?? null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSitAndGoCheckpoint(parsed) || parsed.players.length !== playerCount) {
      return memoryCheckpoints[playerCount] ?? null;
    }
    memoryCheckpoints[playerCount] = parsed;
  } catch {
    // Keep a valid in-memory checkpoint when device storage is unavailable.
  }
  return memoryCheckpoints[playerCount] ?? null;
}

export function saveSitAndGoCheckpoint(checkpoint: SitAndGoCheckpoint): void {
  if (!isSitAndGoCheckpoint(checkpoint)) throw new Error('Refusing to save an invalid tournament checkpoint.');
  const playerCount = checkpoint.players.length as SitAndGoPlayerCount;
  memoryCheckpoints[playerCount] = checkpoint;
  try {
    storage()?.setItem(checkpointKey(playerCount), JSON.stringify(checkpoint));
  } catch {
    // The current app session can still resume from memory.
  }
}

export function clearSitAndGoCheckpoint(
  playerCount: SitAndGoPlayerCount = DEFAULT_SIT_AND_GO_PLAYER_COUNT,
): void {
  delete memoryCheckpoints[playerCount];
  try {
    storage()?.removeItem(checkpointKey(playerCount));
  } catch {
    // The in-memory checkpoint has still been cleared.
  }
}

export function loadDailyChallengeCheckpoint(
  currentDate = dailyChallengeDate(),
): DailyChallengeCheckpoint | null {
  const local = storage();
  if (local) {
    try {
      const parsed: unknown = JSON.parse(local.getItem(dailyCheckpointKey) ?? 'null');
      if (isDailyChallengeCheckpoint(parsed)) memoryDailyCheckpoint = parsed;
    } catch {
      // Keep a valid in-memory checkpoint when device storage is unavailable.
    }
  }
  if (memoryDailyCheckpoint?.challengeDate !== currentDate) {
    clearDailyChallengeCheckpoint();
    return null;
  }
  return memoryDailyCheckpoint;
}

export function saveDailyChallengeCheckpoint(checkpoint: DailyChallengeCheckpoint): void {
  if (!isDailyChallengeCheckpoint(checkpoint)) throw new Error('Refusing to save an invalid Daily Challenge.');
  memoryDailyCheckpoint = checkpoint;
  try {
    storage()?.setItem(dailyCheckpointKey, JSON.stringify(checkpoint));
  } catch {
    // The current app session can still resume from memory.
  }
}

export function clearDailyChallengeCheckpoint(): void {
  memoryDailyCheckpoint = null;
  try {
    storage()?.removeItem(dailyCheckpointKey);
  } catch {
    // The in-memory checkpoint has still been cleared.
  }
}
