import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import {
  DEFAULT_GAME_FEEDBACK_PREFERENCES,
  gameFeedbackPreferencesStorageContract,
  getGameFeedbackPreferences,
  loadGameFeedbackPreferences,
  saveGameFeedbackPreferences,
  setHapticsEnabled,
  subscribeGameFeedbackPreferences,
} from './gameFeedbackPreferences';

function memoryStorage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe('game haptic preference persistence', () => {
  beforeEach(() => setHapticsEnabled(true));

  it('defaults optional tactile feedback on', () => {
    expect(loadGameFeedbackPreferences(memoryStorage())).toEqual({
      version: 1,
      hapticsEnabled: true,
    });
    expect(DEFAULT_GAME_FEEDBACK_PREFERENCES).toEqual(loadGameFeedbackPreferences(null));
  });

  it('saves and reloads one versioned device-local value', () => {
    const storage = memoryStorage();
    const saved = saveGameFeedbackPreferences({ hapticsEnabled: false }, storage);
    expect(saved).toEqual({ version: 1, hapticsEnabled: false });
    expect(loadGameFeedbackPreferences(storage)).toEqual(saved);
    expect(JSON.parse(storage.values.get(gameFeedbackPreferencesStorageContract.key) ?? '')).toEqual(saved);
  });

  it('migrates the evaluated-build preference while ignoring its legacy sound field', () => {
    const storage = memoryStorage({
      [gameFeedbackPreferencesStorageContract.key]: JSON.stringify({
        version: 1,
        gameSoundsEnabled: true,
        hapticsEnabled: false,
      }),
    });
    expect(loadGameFeedbackPreferences(storage)).toEqual({ version: 1, hapticsEnabled: false });
  });

  it.each([
    '{bad json',
    'null',
    '[]',
    JSON.stringify({ version: 2, hapticsEnabled: false }),
    JSON.stringify({ version: 1 }),
    JSON.stringify({ version: 1, hapticsEnabled: 'no' }),
  ])('falls back safely for corrupt or unsupported data: %s', (raw) => {
    const storage = memoryStorage({ [gameFeedbackPreferencesStorageContract.key]: raw });
    expect(loadGameFeedbackPreferences(storage)).toEqual(DEFAULT_GAME_FEEDBACK_PREFERENCES);
  });

  it('keeps persistence failures non-blocking', () => {
    const storage = {
      getItem: () => { throw new Error('unavailable'); },
      setItem: () => { throw new Error('full'); },
    };
    expect(loadGameFeedbackPreferences(storage)).toEqual(DEFAULT_GAME_FEEDBACK_PREFERENCES);
    expect(saveGameFeedbackPreferences({ hapticsEnabled: false }, storage)).toEqual({
      version: 1,
      hapticsEnabled: false,
    });
  });

  it('updates subscribers synchronously and ignores unchanged values', () => {
    const snapshots: boolean[] = [];
    const unsubscribe = subscribeGameFeedbackPreferences(() => {
      snapshots.push(getGameFeedbackPreferences().hapticsEnabled);
    });

    setHapticsEnabled(false);
    expect(snapshots).toEqual([false]);
    setHapticsEnabled(false);
    expect(snapshots).toEqual([false]);
    expect(getGameFeedbackPreferences().hapticsEnabled).toBe(false);
    unsubscribe();
  });
});
