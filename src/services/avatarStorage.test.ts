import { beforeEach, describe, expect, it, vi } from 'vitest';

// The queue's sweep-then-fail-closed path loads `./avatarCleanup`, which
// imports the Supabase client and dynamically imports expo-file-system; mock
// both so that path is deterministic in Node. The File mock makes every
// deletion FAIL (exists, but delete throws), so a sweep at capacity cannot
// drain and the fail-closed branch is what the bound test exercises.
vi.mock('./supabase', () => ({ supabase: null }));
vi.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists(): boolean {
      return true;
    }
    delete(): void {
      throw new Error('cannot delete');
    }
  },
}));

import type { AvatarRegistryStorage, UploadedAvatar } from './avatarStorage';
import {
  AVATAR_CLEANUP_QUEUE_STORAGE_KEY,
  AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY,
  AVATAR_REGISTRY_STORAGE_KEY,
  MAX_PENDING_CLEANUPS,
  addAvatarCleanupTombstones,
  clearUploadedAvatars,
  enqueueAvatarCleanup,
  getUploadedAvatar,
  listAvatarCleanupTombstones,
  listPendingAvatarCleanups,
  listUploadedAvatars,
  persistAvatarCleanupTombstones,
  persistUploadedAvatar,
  persistUploadedAvatarConfirmed,
  removeAvatarCleanupTombstones,
  removePendingAvatarCleanups,
  removeUploadedAvatar,
  replacePendingAvatarCleanups,
  retainAvatarCleanupReference,
  stripOwnerFromAvatarCleanupTombstones,
  stripOwnerFromPendingAvatarCleanups,
} from './avatarStorage';

/** A memory-backed localStorage-like store shared across the injected client. */
function memoryStorage(initial?: Record<string, string>, failWrites = false): AvatarRegistryStorage {
  const backing: Record<string, string> = { ...(initial ?? {}) };
  return {
    getItem: (key) => backing[key] ?? null,
    removeItem: (key) => {
      delete backing[key];
    },
    setItem: (key, value) => {
      if (failWrites) throw new Error('quota exceeded');
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

  it('reports the registry write as confirmed only when the storage accepted it', () => {
    expect(persistUploadedAvatarConfirmed(entryFor('avatarid01'), storage)).toBe(true);
    expect(getUploadedAvatar('avatarid01', storage)?.uri).toBe('file://cache/avatarid01-1.png');

    const failing = memoryStorage({}, true);
    expect(persistUploadedAvatarConfirmed(entryFor('avatarid02'), failing)).toBe(false);
    expect(failing.getItem(AVATAR_REGISTRY_STORAGE_KEY)).toBeNull();

    expect(persistUploadedAvatarConfirmed(entryFor('avatarid03'), null)).toBe(false);
  });
});

describe('avatar pending-cleanup queue', () => {
  it('round-trips an enqueued record through the injected store', async () => {
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-abc123' },
      storage,
    );
    const pending = listPendingAvatarCleanups(storage);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      avatarId: 'avatarid01',
      uri: 'file://cache/old-1.png',
      ownerId: 'user-abc123',
    });
    expect(pending[0]?.enqueuedAtMs).toBeGreaterThan(0);
  });

  it('persists a foreign-cache record without an owner (file-only cleanup)', async () => {
    await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }, storage);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(1);
    expect(listPendingAvatarCleanups(storage)[0]?.ownerId).toBeUndefined();
  });

  it('collapses duplicate records for the same file and owner', async () => {
    await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-abc123' }, storage);
    await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-abc123' }, storage);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(1);
  });

  it('keeps distinct records for different files of the same avatar', async () => {
    await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }, storage);
    await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: 'file://cache/old-2.png' }, storage);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(2);
  });

  it('removes exactly the confirmed records', async () => {
    await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }, storage);
    await enqueueAvatarCleanup({ avatarId: 'avatarid02', uri: 'file://cache/old-2.png' }, storage);
    const [first] = listPendingAvatarCleanups(storage);

    removePendingAvatarCleanups([first!], storage);

    const pending = listPendingAvatarCleanups(storage);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.avatarId).toBe('avatarid02');
  });

  it('replaces an owner-scoped record with a file-only one in one synchronous write', async () => {
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-1' },
      storage,
    );
    const [original] = listPendingAvatarCleanups(storage);

    replacePendingAvatarCleanups(
      [original!],
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }],
      storage,
    );

    const raw = JSON.parse(storage.getItem(AVATAR_CLEANUP_QUEUE_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>;
    expect(raw).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }),
    ]);
    expect('ownerId' in raw[0]!).toBe(false);
  });

  it('deduplicates a file-only replacement onto an existing file-only record', async () => {
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-1' },
      storage,
    );
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
      storage,
    );
    const pending = listPendingAvatarCleanups(storage);
    const ownerScoped = pending.find((item) => item.ownerId === 'user-1')!;

    replacePendingAvatarCleanups(
      [ownerScoped],
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }],
      storage,
    );

    expect(listPendingAvatarCleanups(storage)).toHaveLength(1);
    expect(listPendingAvatarCleanups(storage)[0]?.ownerId).toBeUndefined();
  });

  it('strips the owner from matching records, leaving other owners untouched', async () => {
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-1' },
      storage,
    );
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid02', uri: 'file://cache/old-2.png', ownerId: 'user-2' },
      storage,
    );

    const converted = stripOwnerFromPendingAvatarCleanups('user-1', storage);

    expect(converted).toBe(1);
    const pending = listPendingAvatarCleanups(storage);
    expect(pending[0]).toMatchObject({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' });
    expect(pending[0]?.ownerId).toBeUndefined();
    expect(pending[1]).toMatchObject({ avatarId: 'avatarid02', uri: 'file://cache/old-2.png', ownerId: 'user-2' });
  });

  it('reports zero conversions and touches nothing when no record matches the owner', async () => {
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-1' },
      storage,
    );

    expect(stripOwnerFromPendingAvatarCleanups('nobody', storage)).toBe(0);
    expect(listPendingAvatarCleanups(storage)[0]?.ownerId).toBe('user-1');
  });

  it('ignores corrupt or arbitrary queue entries', () => {
    storage.setItem(AVATAR_CLEANUP_QUEUE_STORAGE_KEY, JSON.stringify([
      { avatarId: 'short', uri: 'u', enqueuedAtMs: 1 },
      { avatarId: 'avatarid01', uri: '', enqueuedAtMs: 1 },
      { avatarId: 'avatarid01', uri: 'file://cache/ok.png', enqueuedAtMs: 'later' },
    ]));
    expect(listPendingAvatarCleanups(storage)).toHaveLength(0);
  });

  it('rejects a new record at capacity when a sweep cannot drain — never evicts the oldest', async () => {
    for (let index = 0; index < MAX_PENDING_CLEANUPS; index += 1) {
      await enqueueAvatarCleanup(
        { avatarId: 'avatarid01', uri: `file://cache/old-${index}.png` },
        storage,
      );
    }
    expect(listPendingAvatarCleanups(storage)).toHaveLength(MAX_PENDING_CLEANUPS);

    // The queue is full; the internal sweep cannot confirm any deletion (the
    // mocked deleters fail), so the new record must be REJECTED — and the
    // oldest record must survive, not be silently discarded.
    const accepted = await enqueueAvatarCleanup(
      { avatarId: 'avatarid02', uri: 'file://cache/new-1.png' },
      storage,
    );

    expect(accepted).toBe(false);
    const pending = listPendingAvatarCleanups(storage);
    expect(pending).toHaveLength(MAX_PENDING_CLEANUPS);
    expect(pending[0]?.uri).toBe('file://cache/old-0.png');
  });

  it('accepts a new record when the queue has room', async () => {
    for (let index = 0; index < MAX_PENDING_CLEANUPS - 1; index += 1) {
      await enqueueAvatarCleanup(
        { avatarId: 'avatarid01', uri: `file://cache/old-${index}.png` },
        storage,
      );
    }

    const accepted = await enqueueAvatarCleanup(
      { avatarId: 'avatarid02', uri: 'file://cache/new-1.png' },
      storage,
    );

    expect(accepted).toBe(true);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(MAX_PENDING_CLEANUPS);
  });

  it('collapses onto an already-tracked record even at capacity', async () => {
    await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }, storage);

    const accepted = await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }, storage);

    expect(accepted).toBe(true);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(1);
  });

  it('returns false when the storage layer rejects the write (no record persisted)', async () => {
    const failing = memoryStorage({}, true); // every setItem throws (quota/security)

    const accepted = await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
      failing,
    );

    expect(accepted).toBe(false);
    // Nothing was silently persisted as "successful": the queue is absent.
    expect(failing.getItem(AVATAR_CLEANUP_QUEUE_STORAGE_KEY)).toBeNull();
    expect(listPendingAvatarCleanups(failing)).toEqual([]);
  });

  it('returns false when no storage is available at all', async () => {
    const accepted = await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
      null,
    );

    expect(accepted).toBe(false);
  });

  it('returns false for a malformed record', async () => {
    const accepted = await enqueueAvatarCleanup({ avatarId: 'short', uri: '' }, storage);

    expect(accepted).toBe(false);
    expect(listPendingAvatarCleanups(storage)).toEqual([]);
  });
});

describe('avatar cleanup tombstone store', () => {
  it('round-trips persisted tombstones through the injected store', () => {
    const persisted = persistAvatarCleanupTombstones(
      [
        { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-1' },
        { avatarId: 'avatarid02', uri: 'file://cache/old-2.png' },
      ],
      storage,
    );

    expect(persisted).toBe(true);
    expect(listAvatarCleanupTombstones(storage)).toEqual([
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-1' },
      { avatarId: 'avatarid02', uri: 'file://cache/old-2.png' },
    ]);
  });

  it('removes exactly the resolved tombstones and leaves no key when all resolve', () => {
    persistAvatarCleanupTombstones(
      [
        { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
        { avatarId: 'avatarid02', uri: 'file://cache/old-2.png' },
      ],
      storage,
    );

    removeAvatarCleanupTombstones([{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }], storage);

    expect(listAvatarCleanupTombstones(storage)).toEqual([
      { avatarId: 'avatarid02', uri: 'file://cache/old-2.png' },
    ]);

    removeAvatarCleanupTombstones([{ avatarId: 'avatarid02', uri: 'file://cache/old-2.png' }], storage);
    expect(storage.getItem(AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY)).toBeNull();
    expect(listAvatarCleanupTombstones(storage)).toEqual([]);
  });

  it('ignores corrupt or arbitrary tombstone entries', () => {
    storage.setItem(AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY, JSON.stringify([
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
      { avatarId: 'short', uri: '' },
      'junk',
      { uri: 'file://cache/no-id.png' },
    ]));

    expect(listAvatarCleanupTombstones(storage)).toEqual([
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
    ]);
  });

  it('reports false when the storage layer rejects the write', () => {
    const failing = memoryStorage({}, true);

    const persisted = persistAvatarCleanupTombstones(
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }],
      failing,
    );

    expect(persisted).toBe(false);
    expect(failing.getItem(AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY)).toBeNull();
  });

  it('merges new tombstones into the existing store without discarding earlier ones', () => {
    persistAvatarCleanupTombstones(
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }],
      storage,
    );

    const accepted = addAvatarCleanupTombstones(
      [
        { avatarId: 'avatarid02', uri: 'file://cache/old-2.png' },
        // A duplicate of the existing record collapses onto it.
        { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
      ],
      storage,
    );

    expect(accepted).toBe(true);
    expect(listAvatarCleanupTombstones(storage)).toEqual([
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
      { avatarId: 'avatarid02', uri: 'file://cache/old-2.png' },
    ]);
  });

  it('reports false when the merge write is rejected (existing records stay)', () => {
    const failing = memoryStorage({}, true);
    const accepted = addAvatarCleanupTombstones(
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }],
      failing,
    );

    expect(accepted).toBe(false);
    expect(failing.getItem(AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY)).toBeNull();
  });

  it('strips the owner from matching tombstones, leaving other owners untouched', async () => {
    persistAvatarCleanupTombstones(
      [
        { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-1' },
        { avatarId: 'avatarid02', uri: 'file://cache/old-2.png', ownerId: 'user-2' },
      ],
      storage,
    );

    const converted = stripOwnerFromAvatarCleanupTombstones('user-1', storage);

    expect(converted).toBe(1);
    const tombstones = listAvatarCleanupTombstones(storage);
    expect(tombstones[0]).toEqual({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' });
    expect(tombstones[1]).toEqual({ avatarId: 'avatarid02', uri: 'file://cache/old-2.png', ownerId: 'user-2' });
  });

  it('reports zero conversions when no tombstone matches the owner', () => {
    persistAvatarCleanupTombstones(
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: 'user-1' }],
      storage,
    );

    expect(stripOwnerFromAvatarCleanupTombstones('nobody', storage)).toBe(0);
    expect(listAvatarCleanupTombstones(storage)[0]?.ownerId).toBe('user-1');
  });
});

describe('avatar cleanup reference retention', () => {
  it('queues the reference when the queue has room (no tombstone needed)', async () => {
    const retained = await retainAvatarCleanupReference(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
      storage,
    );

    expect(retained).toBe(true);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(1);
    expect(storage.getItem(AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY)).toBeNull();
  });

  it('falls back to the tombstone store when the queue rejects the record', async () => {
    // Fill the queue to capacity; the internal sweep cannot drain (the mocked
    // file deleter always fails), so the enqueue must be rejected.
    for (let index = 0; index < MAX_PENDING_CLEANUPS; index += 1) {
      await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: `file://cache/fill-${index}.png` }, storage);
    }

    const retained = await retainAvatarCleanupReference(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
      storage,
    );

    expect(retained).toBe(true);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(MAX_PENDING_CLEANUPS);
    expect(listAvatarCleanupTombstones(storage)).toEqual([
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
    ]);
  });

  it('collapses onto an already-tombstoned reference', async () => {
    persistAvatarCleanupTombstones([{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }], storage);

    const retained = await retainAvatarCleanupReference(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
      storage,
    );

    expect(retained).toBe(true);
    expect(listAvatarCleanupTombstones(storage)).toHaveLength(1);
  });

  it('reports false when BOTH the queue and the tombstone store reject the write', async () => {
    const failing = memoryStorage({}, true); // every setItem throws

    const retained = await retainAvatarCleanupReference(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
      failing,
    );

    expect(retained).toBe(false);
    expect(failing.getItem(AVATAR_CLEANUP_QUEUE_STORAGE_KEY)).toBeNull();
    expect(failing.getItem(AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY)).toBeNull();
  });
});
