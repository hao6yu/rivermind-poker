import 'expo-sqlite/localStorage/install';

import {
  createEmptyOpponentMemory,
  isOpponentMemory,
  type OpponentMemory,
} from '../domain/poker/opponentMemory';

const opponentMemoryStorageKey = 'rivermind.opponent-memory.v1';
let sessionMemory = createEmptyOpponentMemory();

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function loadOpponentMemory(): OpponentMemory {
  const local = storage();
  if (!local) return sessionMemory;
  try {
    const raw = local.getItem(opponentMemoryStorageKey);
    if (!raw) return sessionMemory;
    const parsed: unknown = JSON.parse(raw);
    if (!isOpponentMemory(parsed)) return sessionMemory;
    sessionMemory = parsed;
  } catch {
    // Keep the valid in-memory profile when device storage is unavailable or malformed.
  }
  return sessionMemory;
}

export function saveOpponentMemory(memory: OpponentMemory): void {
  sessionMemory = memory;
  const local = storage();
  if (!local) return;
  try {
    local.setItem(opponentMemoryStorageKey, JSON.stringify(memory));
  } catch {
    // The current app session can still learn even when device storage is unavailable.
  }
}

export function resetOpponentMemory(): OpponentMemory {
  sessionMemory = createEmptyOpponentMemory();
  const local = storage();
  if (local) {
    try {
      local.removeItem(opponentMemoryStorageKey);
    } catch {
      // The in-memory reset still takes effect for this app session.
    }
  }
  return sessionMemory;
}
