import 'expo-sqlite/localStorage/install';

import {
  applyChampionshipResult,
  createEmptyChampionshipProgress,
  isChampionshipCheckpoint,
  isChampionshipProgress,
  type ChampionshipCheckpoint,
  type ChampionshipProgress,
  type ChampionshipResult,
} from '../domain/poker/championship';

const progressKey = 'rivermind.championship.progress.v1';
const checkpointKey = 'rivermind.championship.checkpoint.v1';
let memoryProgress = createEmptyChampionshipProgress();
let memoryCheckpoint: ChampionshipCheckpoint | null = null;

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function loadChampionshipProgress(): ChampionshipProgress {
  try {
    const raw = storage()?.getItem(progressKey);
    if (!raw) return memoryProgress;
    const parsed: unknown = JSON.parse(raw);
    if (isChampionshipProgress(parsed)) memoryProgress = parsed;
  } catch {
    // Keep the latest valid in-memory progress.
  }
  return memoryProgress;
}

export function recordChampionshipResult(result: ChampionshipResult): ChampionshipProgress {
  const next = applyChampionshipResult(loadChampionshipProgress(), result);
  memoryProgress = next;
  try {
    storage()?.setItem(progressKey, JSON.stringify(next));
  } catch {
    // Memory preserves progress for this app session.
  }
  return next;
}

export function loadChampionshipCheckpoint(): ChampionshipCheckpoint | null {
  try {
    const raw = storage()?.getItem(checkpointKey);
    if (!raw) return memoryCheckpoint;
    const parsed: unknown = JSON.parse(raw);
    if (isChampionshipCheckpoint(parsed)) memoryCheckpoint = parsed;
  } catch {
    // Keep the latest valid in-memory checkpoint.
  }
  return memoryCheckpoint;
}

export function saveChampionshipCheckpoint(checkpoint: ChampionshipCheckpoint): void {
  if (!isChampionshipCheckpoint(checkpoint)) {
    throw new Error('Refusing to save an invalid Championship checkpoint.');
  }
  memoryCheckpoint = checkpoint;
  try {
    storage()?.setItem(checkpointKey, JSON.stringify(checkpoint));
  } catch {
    // Memory preserves the current run for this app session.
  }
}

export function clearChampionshipCheckpoint(): void {
  memoryCheckpoint = null;
  try {
    storage()?.removeItem(checkpointKey);
  } catch {
    // The in-memory checkpoint has still been cleared.
  }
}

export function clearChampionshipProgress(): void {
  memoryProgress = createEmptyChampionshipProgress();
  clearChampionshipCheckpoint();
  try {
    storage()?.removeItem(progressKey);
  } catch {
    // The in-memory progress has still been cleared.
  }
}
