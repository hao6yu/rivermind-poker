import { beforeEach, describe, expect, it } from 'vitest';

import type { AvatarRegistryStorage, UploadedAvatar } from './avatarStorage';
import {
  AVATAR_REGISTRY_STORAGE_KEY,
  clearUploadedAvatars,
  getUploadedAvatar,
  listUploadedAvatars,
  persistUploadedAvatar,
  removeUploadedAvatar,
} from './avatarStorage';

/** A memory-backed localStorage-like store shared across the injected client. */
function memoryStorage(initial?: Record<string, string>): AvatarRegistryStorage {
  const backing: Record<string, string> = { ...(initial ?? {}) };
  return {
    getItem: (key) => backing[key] ?? null,
    removeItem: (key) => {
      delete backing[key];
    },
    setItem: (key, value) => {
      backing[key] = value;
    },
  };
}

const baseDescriptor = {
  avatarId: 'avatarid01',
  version: 1,
  mime: 'image/png' as const,
  bytes: 4096,
  width: 512,
  height: 512,
};

function entryFor(avatarId = 'avatarid01'): UploadedAvatar {
  return {
    avatarId,
    version: 1,
    objectPath: `avatars/user/${avatarId}@1.png`,
    uri: `file://cache/${avatarId}-1.png`,
    descriptor: { ...baseDescriptor, avatarId },
    savedAtMs: 1710000000000,
  };
}

let storage: AvatarRegistryStorage;
beforeEach(() => {
  storage = memoryStorage();
});

describe('avatar registry persistence', () => {
  it('round-trips a persisted uploaded avatar through the injected store', () => {
    const persisted = persistUploadedAvatar(entryFor(), storage);
    expect(persisted).toEqual(entryFor());

    const resolved = getUploadedAvatar('avatarid01', storage);
    expect(resolved).toEqual(entryFor());
    expect(listUploadedAvatars(storage)).toHaveLength(1);
    // The registry is the only place the object path and URI live.
    expect(resolved?.objectPath).toContain('avatars/user/avatarid01');
  });

  it('replaces an uploaded avatar when the same identifier is re-persisted', () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    persistUploadedAvatar(
      { ...entryFor('avatarid01'), version: 2, uri: 'file://cache/avatarid01-2.png', savedAtMs: 1710000001000 },
      storage,
    );
    expect(listUploadedAvatars(storage)).toHaveLength(1);
    const resolved = getUploadedAvatar('avatarid01', storage);
    expect(resolved?.version).toBe(2);
    expect(resolved?.uri).toBe('file://cache/avatarid01-2.png');
  });

  it('removes a single uploaded avatar and reports whether it existed', () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    persistUploadedAvatar(entryFor('avatarid02'), storage);
    expect(removeUploadedAvatar('avatarid01', storage)).toBe(true);
    expect(getUploadedAvatar('avatarid01', storage)).toBeNull();
    expect(listUploadedAvatars(storage)).toHaveLength(1);
    expect(removeUploadedAvatar('avatarid01', storage)).toBe(false);
  });

  it('clears every persisted uploaded avatar and returns the count', () => {
    expect(clearUploadedAvatars(storage)).toBe(0);
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    persistUploadedAvatar(entryFor('avatarid02'), storage);
    expect(clearUploadedAvatars(storage)).toBe(2);
    expect(listUploadedAvatars(storage)).toHaveLength(0);
  });

  it('ignores corrupt or arbitrary entries', () => {
    storage.setItem(
      AVATAR_REGISTRY_STORAGE_KEY,
      JSON.stringify([{ avatarId: 'short', version: 1, objectPath: 'p', uri: 'u', savedAtMs: 1, descriptor: { ...baseDescriptor } }]),
    );
    expect(listUploadedAvatars(storage)).toHaveLength(0);
  });
});
