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
import {
  championshipCheckpointStorageKey as checkpointKey,
  championshipProgressStorageKey as progressKey,
  migrateChampionshipForEliteNemesisRelease,
} from './championshipProgressMigration';

let memoryProgress = createEmptyChampionshipProgress();
let memoryCheckpoint: ChampionshipCheckpoint | null = null;
let engineUpgradeMigrationChecked = false;
let v2ResetChecked = false;

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function ensureEngineUpgradeMigration(): void {
  if (engineUpgradeMigrationChecked) return;
  engineUpgradeMigrationChecked = true;
  const target = storage();
  if (!target) return;
  try {
    migrateChampionshipForEliteNemesisRelease(target);
    memoryProgress = createEmptyChampionshipProgress();
    memoryCheckpoint = null;
  } catch {
    // Continue with the latest valid data if device storage is unavailable.
  }
}

/**
 * The intentional Slice 3.11D reset: any stored version 1 Championship
 * progress, achievements, record, and active Championship checkpoint are
 * discarded and replaced by one valid empty version 2 state, persisted
 * immediately so the reset happens once — not on every launch. Nothing else
 * is touched: identity, learning progress, Daily Challenge, hand history,
 * Sit & Go checkpoints, and settings are all outside this boundary.
 */
function ensureChampionshipV2Reset(): void {
  if (v2ResetChecked) return;
  v2ResetChecked = true;
  const target = storage();
  if (!target) return;
  try {
    const raw = target.getItem(progressKey);
    let needsReset = true;
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isChampionshipProgress(parsed)) needsReset = false;
    }
    if (needsReset) {
      const empty = createEmptyChampionshipProgress();
      target.setItem(progressKey, JSON.stringify(empty));
      memoryProgress = empty;
    }
    // An active Championship checkpoint for a v1 course cannot represent a
    // v2 event: discard and persist the removal.
    const rawCheckpoint = target.getItem(checkpointKey);
    if (rawCheckpoint) {
      const parsedCheckpoint: unknown = JSON.parse(rawCheckpoint);
      if (!isChampionshipCheckpoint(parsedCheckpoint)) {
        target.removeItem(checkpointKey);
        memoryCheckpoint = null;
      }
    }
  } catch {
    // Fail open to an empty in-memory v2 state; storage stays untouched.
    memoryProgress = createEmptyChampionshipProgress();
    memoryCheckpoint = null;
  }
}

export function loadChampionshipProgress(): ChampionshipProgress {
  ensureEngineUpgradeMigration();
  ensureChampionshipV2Reset();
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
  ensureEngineUpgradeMigration();
  ensureChampionshipV2Reset();
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
  ensureEngineUpgradeMigration();
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
