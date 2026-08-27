import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import {
  clearPlayerDisplayName,
  isValidPlayerDisplayName,
  loadHumanAvatar,
  loadPlayerDisplayName,
  loadPlayerProfile,
  normalizePlayerDisplayName,
  PLAYER_PROFILE_LEGACY_KEY,
  playerProfileStorageContract,
  saveHumanAvatar,
  savePlayerDisplayName,
  savePlayerProfile,
  type HumanAvatarReference,
  type SavedPlayerProfile,
} from './playerProfile';

function memoryStorage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

const bay: HumanAvatarReference = { kind: 'authored', id: 'human-bay' };
const fern: HumanAvatarReference = { kind: 'authored', id: 'human-fern' };

describe('player profile persistence', () => {
  beforeEach(() => {
    // Reset the session-scoped memory cache between tests.
    clearPlayerDisplayName();
  });

  it('round-trips a full v2 profile (name + avatar) under the versioned key', () => {
    const storage = memoryStorage();
    const saved = savePlayerProfile({ version: 2, displayName: 'River', avatar: bay }, storage);
    expect(saved).toEqual({ version: 2, displayName: 'River', avatar: bay });
    expect(loadPlayerDisplayName(storage)).toBe('River');
    expect(loadHumanAvatar(storage)).toEqual(bay);
    expect(JSON.parse(storage.values.get(playerProfileStorageContract.key) ?? '')).toEqual({
      version: 2,
      displayName: 'River',
      avatar: bay,
    });
  });

  it('normalizes, saves, and reloads a preset used at private tables, defaulting the avatar', () => {
    const storage = memoryStorage();
    expect(savePlayerDisplayName('  River  ', storage)).toBe('River');
    expect(loadPlayerDisplayName(storage)).toBe('River');
    expect(JSON.parse(storage.values.get(playerProfileStorageContract.key) ?? '')).toEqual({
      version: 2,
      displayName: 'River',
      avatar: { kind: 'authored', id: 'human-ash' },
    });
  });

  it('preserves the avatar when only the name changes', () => {
    const storage = memoryStorage();
    savePlayerProfile({ version: 2, displayName: 'River', avatar: bay }, storage);
    savePlayerDisplayName('Nova', storage);
    expect(loadHumanAvatar(storage)).toEqual(bay);
    expect(loadPlayerDisplayName(storage)).toBe('Nova');
  });

  it('preserves the display name when only the avatar changes', () => {
    const storage = memoryStorage();
    savePlayerProfile({ version: 2, displayName: 'River', avatar: bay }, storage);
    const updated = saveHumanAvatar(fern, storage);
    expect(updated?.displayName).toBe('River');
    expect(updated?.avatar).toEqual(fern);
    expect(loadHumanAvatar(storage)).toEqual(fern);
    expect(loadPlayerDisplayName(storage)).toBe('River');
  });

  it('rejects an invalid name and leaves the persisted profile untouched', () => {
    const storage = memoryStorage();
    savePlayerProfile({ version: 2, displayName: 'River', avatar: bay }, storage);
    expect(savePlayerDisplayName('  ', storage)).toBe('');
    expect(storage.values.get(playerProfileStorageContract.key)).toContain('River');
    expect(loadHumanAvatar(storage)).toEqual(bay);
  });

  it('accepts and persists a free-form custom name', () => {
    const storage = memoryStorage();
    expect(savePlayerDisplayName('Custom Name', storage)).toBe('Custom Name');
    expect(loadPlayerDisplayName(storage)).toBe('Custom Name');
  });

  it('migrates a legacy v1 blob (stored under the current key) to v2', () => {
    const legacy = memoryStorage({
      [playerProfileStorageContract.key]: JSON.stringify({ displayName: 'River', version: 1 }),
    });
    // Lazy migration: the name and a default avatar are available, but storage
    // is only upgraded when the profile is next written.
    expect(loadPlayerDisplayName(legacy)).toBe('River');
    expect(loadHumanAvatar(legacy)).toEqual({ kind: 'authored', id: 'human-ash' });
    expect(JSON.parse(legacy.values.get(playerProfileStorageContract.key) ?? '')).toEqual({
      displayName: 'River',
      version: 1,
    });

    savePlayerDisplayName('River', legacy);
    expect(JSON.parse(legacy.values.get(playerProfileStorageContract.key) ?? '')).toEqual({
      version: 2,
      displayName: 'River',
      avatar: { kind: 'authored', id: 'human-ash' },
    });
  });

  it('migrates a legacy v1 blob stored under the legacy key', () => {
    const legacy = memoryStorage({
      [PLAYER_PROFILE_LEGACY_KEY]: JSON.stringify({ displayName: 'Nova', version: 1 }),
    });
    expect(loadPlayerDisplayName(legacy)).toBe('Nova');
    expect(loadHumanAvatar(legacy)).toEqual({ kind: 'authored', id: 'human-ash' });
  });

  it('ignores corrupt or arbitrary writes and corrupt blobs', () => {
    const corrupt = memoryStorage({ [playerProfileStorageContract.key]: '{bad json' });
    expect(loadPlayerDisplayName(corrupt)).toBe('');
    expect(loadPlayerProfile(corrupt)).toBeNull();

    const arbitrary = memoryStorage({
      [playerProfileStorageContract.key]: JSON.stringify({
        displayName: 'River',
        avatar: 'not-an-object',
        version: 2,
      }),
    });
    expect(loadHumanAvatar(arbitrary)).toBeNull();
    // A corrupt avatar reference is rejected, never applied.
    expect(
      saveHumanAvatar(
        { kind: 'uploaded', avatarId: 'short', version: 1 } as unknown as HumanAvatarReference,
        arbitrary,
      ),
    ).toBeNull();

    const badAvatar: SavedPlayerProfile = {
      version: 2,
      displayName: 'River',
      avatar: { kind: 'authored', id: 'ghost' } as unknown as HumanAvatarReference,
    };
    expect(savePlayerProfile(badAvatar, arbitrary)).toBeNull();
  });

  it('rejects a corrupt avatar so it can never overwrite a valid profile', () => {
    const storage = memoryStorage();
    expect(savePlayerProfile({ version: 2, displayName: 'River', avatar: bay }, storage)).not.toBeNull();
    const badAvatar: SavedPlayerProfile = {
      version: 2,
      displayName: 'River',
      avatar: { kind: 'uploaded', avatarId: 'short', version: 1 } as unknown as HumanAvatarReference,
    };
    expect(savePlayerProfile(badAvatar, storage)).toBeNull();
    expect(loadHumanAvatar(storage)).toEqual(bay);
  });

  it('applies identical name validation for profile and multiplayer entry', () => {
    expect(normalizePlayerDisplayName('  Mina ')).toBe('Mina');
    expect(isValidPlayerDisplayName(' Mina ')).toBe(true);
    // Free-form custom names within [MIN, MAX] characters are accepted on the client and the multiplayer Edge.
    expect(isValidPlayerDisplayName('Custom Name')).toBe(true);
    expect(isValidPlayerDisplayName('river')).toBe(true);
    // Contact and out-of-range content is rejected identically in both places.
    expect(isValidPlayerDisplayName('name@example.com')).toBe(false);
    expect(isValidPlayerDisplayName('https://example.com')).toBe(false);
    expect(isValidPlayerDisplayName('x'.repeat(19))).toBe(false);
    expect(normalizePlayerDisplayName('x'.repeat(19))).toHaveLength(19);
  });
});
