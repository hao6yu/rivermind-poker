import 'expo-sqlite/localStorage/install';

import {
  isValidPlayerDisplayName,
  normalizePlayerDisplayName,
} from '../domain/playerProfile';

export {
  DEFAULT_PLAYER_DISPLAY_NAME,
  isValidPlayerDisplayName,
  normalizePlayerDisplayName,
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
  PLAYER_DISPLAY_NAME_MIN_LENGTH,
  PLAYER_DISPLAY_NAME_PRESETS,
  type PlayerDisplayName,
} from '../domain/playerProfile';

const playerProfileStorageKey = 'rivermind.player-profile.v1';
let memoryDisplayName = '';

interface PlayerProfileStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface StoredPlayerProfile {
  displayName: string;
  version: 1;
}

function deviceStorage(): PlayerProfileStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function normalizeStoredProfile(value: unknown): StoredPlayerProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  if (profile.version !== 1 || typeof profile.displayName !== 'string') return null;
  const displayName = normalizePlayerDisplayName(profile.displayName);
  return isValidPlayerDisplayName(displayName) ? { displayName, version: 1 } : null;
}

export function loadPlayerDisplayName(
  storage: PlayerProfileStorage | null = deviceStorage(),
): string {
  if (!storage) return memoryDisplayName;
  try {
    const raw = storage.getItem(playerProfileStorageKey);
    const profile = raw ? normalizeStoredProfile(JSON.parse(raw) as unknown) : null;
    memoryDisplayName = profile?.displayName ?? '';
  } catch {
    memoryDisplayName = '';
  }
  return memoryDisplayName;
}

export function savePlayerDisplayName(
  value: string,
  storage: PlayerProfileStorage | null = deviceStorage(),
): string {
  const displayName = normalizePlayerDisplayName(value);
  if (!isValidPlayerDisplayName(displayName)) return memoryDisplayName;
  memoryDisplayName = displayName;
  try {
    storage?.setItem(playerProfileStorageKey, JSON.stringify({ displayName, version: 1 }));
  } catch {
    // The in-memory name still supports the current app session.
  }
  return memoryDisplayName;
}

export function clearPlayerDisplayName(
  storage: PlayerProfileStorage | null = deviceStorage(),
): void {
  memoryDisplayName = '';
  try {
    storage?.removeItem(playerProfileStorageKey);
  } catch {
    // The in-memory identity is already cleared for this app session.
  }
}

export const playerProfileStorageContract = {
  key: playerProfileStorageKey,
};
