import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import {
  isValidPlayerDisplayName,
  loadPlayerDisplayName,
  normalizePlayerDisplayName,
  playerProfileStorageContract,
  savePlayerDisplayName,
} from './playerProfile';

function memoryStorage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe('player profile persistence', () => {
  beforeEach(() => {
    loadPlayerDisplayName(memoryStorage());
  });

  it('normalizes, saves, and reloads the display name used at private tables', () => {
    const storage = memoryStorage();
    expect(savePlayerDisplayName('  River   Kai  ', storage)).toBe('River Kai');
    expect(loadPlayerDisplayName(storage)).toBe('River Kai');
    expect(JSON.parse(storage.values.get(playerProfileStorageContract.key) ?? '')).toEqual({
      displayName: 'River Kai',
      version: 1,
    });
  });

  it('ignores invalid writes and corrupt persisted values', () => {
    const storage = memoryStorage();
    expect(savePlayerDisplayName('A', storage)).toBe('');
    expect(storage.values.has(playerProfileStorageContract.key)).toBe(false);

    const corrupt = memoryStorage({ [playerProfileStorageContract.key]: '{bad json' });
    expect(loadPlayerDisplayName(corrupt)).toBe('');
  });

  it('uses the same validation rules for profile and multiplayer entry', () => {
    expect(normalizePlayerDisplayName('  Mina   Chen ')).toBe('Mina Chen');
    expect(isValidPlayerDisplayName(' A ')).toBe(false);
    expect(isValidPlayerDisplayName(' Mina ')).toBe(true);
    expect(isValidPlayerDisplayName('x'.repeat(19))).toBe(false);
    expect(normalizePlayerDisplayName('x'.repeat(19))).toHaveLength(18);
  });
});
