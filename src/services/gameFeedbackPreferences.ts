import 'expo-sqlite/localStorage/install';

import { useSyncExternalStore } from 'react';

export interface GameFeedbackPreferences {
  version: 1;
  hapticsEnabled: boolean;
}

export interface GameFeedbackPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_GAME_FEEDBACK_PREFERENCES: GameFeedbackPreferences = Object.freeze({
  version: 1,
  hapticsEnabled: true,
});

const gameFeedbackPreferencesStorageKey = 'rivermind.game-feedback-preferences.v1';

function deviceStorage(): GameFeedbackPreferencesStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function normalizeStoredPreferences(value: unknown): GameFeedbackPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const preferences = value as Record<string, unknown>;
  if (preferences.version !== 1 || typeof preferences.hapticsEnabled !== 'boolean') return null;
  // Extra legacy fields (including the evaluated sound preference) are ignored
  // so an existing physical-device build keeps its haptic choice.
  return { version: 1, hapticsEnabled: preferences.hapticsEnabled };
}

export function loadGameFeedbackPreferences(
  storage: GameFeedbackPreferencesStorage | null = deviceStorage(),
): GameFeedbackPreferences {
  if (!storage) return DEFAULT_GAME_FEEDBACK_PREFERENCES;
  try {
    const raw = storage.getItem(gameFeedbackPreferencesStorageKey);
    if (!raw) return DEFAULT_GAME_FEEDBACK_PREFERENCES;
    return normalizeStoredPreferences(JSON.parse(raw) as unknown)
      ?? DEFAULT_GAME_FEEDBACK_PREFERENCES;
  } catch {
    return DEFAULT_GAME_FEEDBACK_PREFERENCES;
  }
}

export function saveGameFeedbackPreferences(
  preferences: Pick<GameFeedbackPreferences, 'hapticsEnabled'>,
  storage: GameFeedbackPreferencesStorage | null = deviceStorage(),
): GameFeedbackPreferences {
  const saved: GameFeedbackPreferences = {
    version: 1,
    hapticsEnabled: preferences.hapticsEnabled,
  };
  try {
    storage?.setItem(gameFeedbackPreferencesStorageKey, JSON.stringify(saved));
  } catch {
    // The reactive in-memory preference still applies for this app session.
  }
  return saved;
}

let currentPreferences = loadGameFeedbackPreferences();
const preferenceListeners = new Set<() => void>();

export function getGameFeedbackPreferences(): GameFeedbackPreferences {
  return currentPreferences;
}

export function subscribeGameFeedbackPreferences(listener: () => void): () => void {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}

export function setHapticsEnabled(enabled: boolean): void {
  if (enabled === currentPreferences.hapticsEnabled) return;
  currentPreferences = { version: 1, hapticsEnabled: enabled };
  // Notify synchronously so disabling takes effect before another game event.
  preferenceListeners.forEach((listener) => listener());
  saveGameFeedbackPreferences(currentPreferences);
}

export interface UseGameFeedbackPreferencesValue {
  hapticsEnabled: boolean;
  setHapticsEnabled: typeof setHapticsEnabled;
}

export function useGameFeedbackPreferences(): UseGameFeedbackPreferencesValue {
  const preferences = useSyncExternalStore(
    subscribeGameFeedbackPreferences,
    getGameFeedbackPreferences,
    getGameFeedbackPreferences,
  );
  return {
    hapticsEnabled: preferences.hapticsEnabled,
    setHapticsEnabled,
  };
}

export const gameFeedbackPreferencesStorageContract = {
  key: gameFeedbackPreferencesStorageKey,
  version: 1,
} as const;
