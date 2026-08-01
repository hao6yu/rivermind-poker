import 'expo-sqlite/localStorage/install';

import {
  isSitAndGoCheckpoint,
  type SitAndGoCheckpoint,
} from '../domain/poker/tournament';
import {
  dailyChallengeDate,
  isDailyChallengeCheckpoint,
  type DailyChallengeCheckpoint,
} from '../domain/poker/dailyChallenge';

const checkpointKey = 'rivermind.sit-and-go.checkpoint.v1';
const dailyCheckpointKey = 'rivermind.daily-challenge.checkpoint.v1';
let memoryCheckpoint: SitAndGoCheckpoint | null = null;
let memoryDailyCheckpoint: DailyChallengeCheckpoint | null = null;

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function loadSitAndGoCheckpoint(): SitAndGoCheckpoint | null {
  const local = storage();
  if (!local) return memoryCheckpoint;
  try {
    const raw = local.getItem(checkpointKey);
    if (!raw) return memoryCheckpoint;
    const parsed: unknown = JSON.parse(raw);
    if (!isSitAndGoCheckpoint(parsed)) return memoryCheckpoint;
    memoryCheckpoint = parsed;
  } catch {
    // Keep a valid in-memory checkpoint when device storage is unavailable.
  }
  return memoryCheckpoint;
}

export function saveSitAndGoCheckpoint(checkpoint: SitAndGoCheckpoint): void {
  if (!isSitAndGoCheckpoint(checkpoint)) throw new Error('Refusing to save an invalid tournament checkpoint.');
  memoryCheckpoint = checkpoint;
  try {
    storage()?.setItem(checkpointKey, JSON.stringify(checkpoint));
  } catch {
    // The current app session can still resume from memory.
  }
}

export function clearSitAndGoCheckpoint(): void {
  memoryCheckpoint = null;
  try {
    storage()?.removeItem(checkpointKey);
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
