import { describe, expect, it } from 'vitest';

import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';
import {
  DEFAULT_TABLE_MOMENT_PREFERENCES,
  type TableMomentPreferences,
} from './tableMomentPreferences';
import {
  loadTableMomentPreferences,
  saveTableMomentPreferences,
  type TableMomentPreferencesStorage,
} from './tableMomentPreferencesStore';

function memoryStorage(initial: Record<string, string> = {}): TableMomentPreferencesStorage & {
  values: Record<string, string>;
} {
  const values = { ...initial };
  return {
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
    values,
  };
}

const moment = (seat: number): TableMomentEnvelope => ({
  atMs: 1_000,
  handNumber: 1,
  id: 'client:room:1:cheer:abc123',
  playerId: 'player-1',
  protocolVersion: 1,
  reactionId: 'cheer',
  roomId: '11111111-1111-4111-8111-111111111111',
  seat,
});

describe('table moment preferences persistence', () => {
  it('loads defaults when no stored value exists', () => {
    expect(loadTableMomentPreferences(memoryStorage())).toEqual(DEFAULT_TABLE_MOMENT_PREFERENCES);
  });

  it('loads a valid stored value', () => {
    const stored: TableMomentPreferences = {
      motion: false,
      muteAll: true,
      muteSeats: [2],
    };
    const storage = memoryStorage();
    saveTableMomentPreferences(stored, storage);
    expect(loadTableMomentPreferences(storage)).toEqual(stored);
  });

  it('falls back to defaults for corrupted payloads', () => {
    for (const poisoned of [
      'not json',
      JSON.stringify({ version: 99 }),
      JSON.stringify({ ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteSeats: ['1'] }),
      JSON.stringify({ ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteSeats: 4 }),
      'null',
    ]) {
      const storage = memoryStorage({ 'rivermind.table-moment-preferences.v1': poisoned });
      expect(loadTableMomentPreferences(storage)).toEqual(DEFAULT_TABLE_MOMENT_PREFERENCES);
    }
  });

  it('drops the legacy sound field while preserving visual preferences', () => {
    const storage = memoryStorage({
      'rivermind.table-moment-preferences.v1': JSON.stringify({
        motion: false,
        muteAll: true,
        muteSeats: [2],
        sound: false,
      }),
    });
    expect(loadTableMomentPreferences(storage)).toEqual({
      motion: false,
      muteAll: true,
      muteSeats: [2],
    });
  });

  it('defaults a null storage without throwing', () => {
    expect(loadTableMomentPreferences(null)).toEqual(DEFAULT_TABLE_MOMENT_PREFERENCES);
    expect(() => saveTableMomentPreferences(DEFAULT_TABLE_MOMENT_PREFERENCES, null)).not.toThrow();
  });

  it('round-trips mute-seat toggles through storage', () => {
    const storage = memoryStorage();
    const prefs = { ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteSeats: [1, 5] };
    saveTableMomentPreferences(prefs, storage);
    const loaded = loadTableMomentPreferences(storage);
    expect(loaded.muteSeats).toEqual([1, 5]);
    expect(loaded).toEqual(prefs);
  });

  it('persists independently of any moment payload', () => {
    const storage = memoryStorage();
    saveTableMomentPreferences(DEFAULT_TABLE_MOMENT_PREFERENCES, storage);
    // Storing preferences never touches moment data: no envelope field appears.
    expect(storage.values['rivermind.table-moment-preferences.v1']).not.toContain('reactionId');
    expect(storage.values['rivermind.table-moment-preferences.v1']).not.toContain(moment(1).id);
  });
});
