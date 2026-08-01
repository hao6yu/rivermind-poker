import 'expo-sqlite/localStorage/install';

import {
  isSitAndGoCheckpoint,
  type SitAndGoCheckpoint,
} from '../domain/poker/tournament';

const checkpointKey = 'rivermind.sit-and-go.checkpoint.v1';
let memoryCheckpoint: SitAndGoCheckpoint | null = null;

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
