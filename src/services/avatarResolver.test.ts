import { beforeEach, describe, expect, it, vi } from 'vitest';

// The queue's sweep-then-fail-closed path (reached when the resolver's
// enqueue hits a full queue) loads `./avatarCleanup`, which imports the
// Supabase client and dynamically imports expo-file-system; mock both so that
// path is deterministic in Node. The File mock makes every deletion FAIL
// (exists, but delete throws), so a capacity sweep cannot drain and the
// fail-closed branch is what the full-queue test exercises.
vi.mock('./betaFeedback', () => ({ recordAppDiagnostic: () => undefined }));
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

import {
  deviceAvatarReferences,
  resolveAvatar,
  resolveRoomAvatars,
  signedAvatarAccessor,
  type AvatarReference,
  type AvatarRemoteAccessor,
  type RemoteAvatarBytes,
} from './avatarResolver';
import {
  getRenderableUploadedAvatar,
  getUploadedAvatar,
  listAvatarCleanupTombstones,
  listPendingAvatarCleanups,
  listUploadedAvatars,
  persistUploadedAvatar,
  enqueueAvatarCleanup,
  MAX_PENDING_CLEANUPS,
  type AvatarRegistryStorage,
  type UploadedAvatar,
} from './avatarStorage';

function memoryStorage(): AvatarRegistryStorage {
  const backing: Record<string, string> = {};
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

function ref(avatarId = 'avatarid01', version = 1): AvatarReference {
  return { avatarId, version };
}

/**
 * A room-authorized accessor: bound to the single room the caller belongs to,
 * holding that room's object set. A request for any other room, or a room the
 * caller is not a member of, resolves to null. This is the isolation contract.
 */
function accessorForRoom(roomId: string, objects: Record<string, RemoteAvatarBytes>): AvatarRemoteAccessor {
  return {
    fetchAvatar: async (reference, requestedRoom) => {
      if (requestedRoom !== roomId) return null;
      return objects[reference.avatarId] ?? null;
    },
  };
}

const bytes: RemoteAvatarBytes = { uri: 'file://cache/avatarid01.bin', mimeType: 'image/webp' };

describe('avatarResolver.resolveAvatar', () => {
  let storage: AvatarRegistryStorage;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it('returns the current cached avatar without touching the remote accessor', async () => {
    const accessor = { fetchAvatar: vi.fn(async () => bytes) };
    const cached: UploadedAvatar = {
      avatarId: 'avatarid01',
      version: 1,
      objectPath: 'signed:roomX:avatarid01',
      uri: 'file://cache/existing.bin',
      descriptor: { avatarId: 'avatarid01', version: 1, mime: 'image/webp', bytes: 0, width: 0, height: 0 },
      savedAtMs: 1,
    };
    // Seed the cache directly.
    const seed = getUploadedAvatar('avatarid01', storage);
    // No entry yet, so resolve fills; but with a matching version it is a hit.
    await resolveAvatar(accessor, ref('avatarid01', 1), 'roomX', storage);
    expect(accessor.fetchAvatar).toHaveBeenCalledTimes(1);

    // A second call with the same version must be a pure cache hit.
    await resolveAvatar(accessor, ref('avatarid01', 1), 'roomX', storage);
    expect(accessor.fetchAvatar).toHaveBeenCalledTimes(1);
  });

  it('fills the cache from the accessor on a miss and returns the entry', async () => {
    const accessor = { fetchAvatar: vi.fn(async () => bytes) };

    const resolved = await resolveAvatar(accessor, ref(), 'roomX', storage);

    expect(accessor.fetchAvatar).toHaveBeenCalledWith(ref(), 'roomX');
    expect(resolved?.version).toBe(1);
    expect(resolved?.uri).toBe('file://cache/avatarid01.bin');
    // It is now a local-registry entry, so HumanAvatar renders that, not the URL.
    expect(getUploadedAvatar('avatarid01', storage)?.uri).toBe('file://cache/avatarid01.bin');
  });

  it('treats an unauthorized accessor (null) as "no avatar", persisting nothing', async () => {
    const accessor = { fetchAvatar: vi.fn(async () => null) };

    const resolved = await resolveAvatar(accessor, ref(), 'roomX', storage);

    expect(resolved).toBeNull();
    expect(listUploadedAvatars(storage)).toHaveLength(0);
  });

  it('preserves an existing owner id when the room resolves the avatar', async () => {
    // A self-uploaded avatar is persisted with the device's own owner id. When
    // the room later resolves it (the objectPath becomes room-scoped), the
    // owner id must survive so cleanup still targets `${ownerId}/${avatarId}`.
    const accessor = { fetchAvatar: vi.fn(async () => bytes) };
    persistUploadedAvatar(
      {
        avatarId: 'avatarid01',
        version: 1,
        ownerId: 'user-owned',
        objectPath: 'local:avatarid01:1',
        uri: 'file://cache/self.bin',
        descriptor: { avatarId: 'avatarid01', version: 1, mime: 'image/webp', bytes: 0, width: 0, height: 0 },
        savedAtMs: 1,
      },
      storage,
    );

    const resolved = await resolveAvatar(accessor, ref('avatarid01', 1), 'roomX', storage);

    // Room-scoped marker, but ownership is unchanged.
    expect(resolved?.objectPath).toBe('signed:roomX:avatarid01');
    expect(resolved?.ownerId).toBe('user-owned');
  });

  it('refills when the cached version is stale', async () => {
    const older = { uri: 'file://cache/avatarid01-old.bin', mimeType: 'image/webp' as const };
    const newer = { uri: 'file://cache/avatarid01-new.bin', mimeType: 'image/webp' as const };
    const accessor = {
      fetchAvatar: vi.fn(async () => newer),
    };
    // Seed version 1; the caller now wants version 2, so it must refill.
    await resolveAvatar(accessor, ref('avatarid01', 1), 'roomX', storage);
    expect(getUploadedAvatar('avatarid01', storage)?.version).toBe(1);

    await resolveAvatar(accessor, ref('avatarid01', 2), 'roomX', storage);
    expect(accessor.fetchAvatar).toHaveBeenCalledTimes(2);
    expect(getUploadedAvatar('avatarid01', storage)?.version).toBe(2);
  });

  it('two-user isolation: a room member cannot resolve another room avatar', async () => {
    const roomX = accessorForRoom('roomX', { avatarid01: bytes });
    const roomY = accessorForRoom('roomY', { avatarid02: bytes });

    // Member of room X can see X's avatar in room X.
    const local = await resolveAvatar(roomX, ref('avatarid01'), 'roomX', storage);
    expect(local?.avatarId).toBe('avatarid01');

    // The SAME member, asked for room Y's avatar, is refused (no leak).
    const cross = await resolveAvatar(roomX, ref('avatarid02'), 'roomY', storage);
    expect(cross).toBeNull();

    // And even the object that lives in X cannot be pulled under room Y's id.
    const spoofed = await resolveAvatar(roomX, ref('avatarid01'), 'roomY', storage);
    expect(spoofed).toBeNull();
  });

  it('a denied cross-room refill never authorizes the old room cached image for rendering', async () => {
    // Room A resolved the avatar; the registry now holds a room-A entry.
    await resolveAvatar(accessorForRoom('roomA', { avatarid01: bytes }), ref('avatarid01'), 'roomA', storage);
    expect(getRenderableUploadedAvatar('avatarid01', 'roomA', storage)?.uri).toBe('file://cache/avatarid01.bin');

    // The same bounded id reappears in room B (a different player reused it).
    // The worker for room B has no such avatar and denies.
    const resolved = await resolveAvatar(accessorForRoom('roomB', {}), ref('avatarid01'), 'roomB', storage);
    expect(resolved).toBeNull();

    // The room-A cache entry is untouched (it still serves room A), but it is
    // NOT authorized to render in room B — the seat falls back to initials.
    expect(getRenderableUploadedAvatar('avatarid01', 'roomB', storage)).toBeNull();
    expect(getRenderableUploadedAvatar('avatarid01', 'roomA', storage)?.uri).toBe('file://cache/avatarid01.bin');
  });

  it('renders the device own avatar without any room context', async () => {
    persistUploadedAvatar(
      {
        avatarId: 'avatarid01',
        version: 3,
        ownerId: 'self',
        objectPath: 'local:avatarid01:3',
        uri: 'file://cache/self.bin',
        descriptor: { avatarId: 'avatarid01', version: 3, mime: 'image/webp', bytes: 0, width: 0, height: 0 },
        savedAtMs: 1,
      },
      storage,
    );
    // The Profile, solo tables, results, and replay surfaces render without a
    // room; the own avatar must resolve there.
    expect(getRenderableUploadedAvatar('avatarid01', undefined, storage)?.uri).toBe('file://cache/self.bin');
  });

  it('a foreign cached avatar without a room context is never rendered', async () => {
    // A room-resolved entry (no owner) rendered without `roomId` — e.g. a
    // stale registry entry leaking into a non-room surface — must not render.
    await resolveAvatar(accessorForRoom('roomA', { avatarid01: bytes }), ref('avatarid01'), 'roomA', storage);
    expect(getRenderableUploadedAvatar('avatarid01', undefined, storage)).toBeNull();
  });

  it('deletes the superseded cached file when a refill replaces the registry entry', async () => {
    await resolveAvatar(accessorForRoom('roomA', { avatarid01: bytes }), ref('avatarid01'), 'roomA', storage);
    expect(getUploadedAvatar('avatarid01', storage)?.uri).toBe('file://cache/avatarid01.bin');

    const newer = { uri: 'file://cache/avatarid01-v2.bin', mimeType: 'image/webp' as const };
    const fileDeleter = { deleteCachedAvatarFile: vi.fn(async () => true) };
    await resolveAvatar(
      accessorForRoom('roomA', { avatarid01: newer }),
      ref('avatarid01', 2),
      'roomA',
      storage,
      fileDeleter,
    );

    expect(getUploadedAvatar('avatarid01', storage)?.version).toBe(2);
    expect(getUploadedAvatar('avatarid01', storage)?.uri).toBe('file://cache/avatarid01-v2.bin');
    // The unreferenced first file is removed so re-resolution never accumulates
    // stale cached bytes on disk.
    expect(fileDeleter.deleteCachedAvatarFile).toHaveBeenCalledWith('file://cache/avatarid01.bin');
    // A confirmed deletion leaves nothing queued for a later sweep.
    expect(listPendingAvatarCleanups(storage)).toEqual([]);
  });

  it('records the superseded file in the cleanup queue when the deleter reports failure', async () => {
    await resolveAvatar(accessorForRoom('roomA', { avatarid01: bytes }), ref('avatarid01'), 'roomA', storage);
    const newer = { uri: 'file://cache/avatarid01-v2.bin', mimeType: 'image/webp' as const };
    const fileDeleter = { deleteCachedAvatarFile: vi.fn(async () => false) };

    await resolveAvatar(
      accessorForRoom('roomA', { avatarid01: newer }),
      ref('avatarid01', 2),
      'roomA',
      storage,
      fileDeleter,
    );

    // The entry moved on, but the stale file's reference survives in the queue.
    expect(listPendingAvatarCleanups(storage)).toMatchObject([
      { avatarId: 'avatarid01', uri: 'file://cache/avatarid01.bin' },
    ]);
  });

  it('records the superseded file in the cleanup queue when the deleter throws', async () => {
    await resolveAvatar(accessorForRoom('roomA', { avatarid01: bytes }), ref('avatarid01'), 'roomA', storage);
    const newer = { uri: 'file://cache/avatarid01-v2.bin', mimeType: 'image/webp' as const };
    const fileDeleter = { deleteCachedAvatarFile: vi.fn(async () => { throw new Error('io'); }) };

    await resolveAvatar(
      accessorForRoom('roomA', { avatarid01: newer }),
      ref('avatarid01', 2),
      'roomA',
      storage,
      fileDeleter,
    );

    expect(listPendingAvatarCleanups(storage)).toMatchObject([
      { avatarId: 'avatarid01', uri: 'file://cache/avatarid01.bin' },
    ]);
  });

  it('records the superseded file in the cleanup queue when no deleter is available', async () => {
    await resolveAvatar(accessorForRoom('roomA', { avatarid01: bytes }), ref('avatarid01'), 'roomA', storage);
    const newer = { uri: 'file://cache/avatarid01-v2.bin', mimeType: 'image/webp' as const };

    await resolveAvatar(
      accessorForRoom('roomA', { avatarid01: newer }),
      ref('avatarid01', 2),
      'roomA',
      storage,
    );

    expect(listPendingAvatarCleanups(storage)).toMatchObject([
      { avatarId: 'avatarid01', uri: 'file://cache/avatarid01.bin' },
    ]);
  });

  it('keeps the previous cached file when the refill resolves the same uri', async () => {
    const fileDeleter = { deleteCachedAvatarFile: vi.fn(async () => true) };
    await resolveAvatar(accessorForRoom('roomA', { avatarid01: bytes }), ref('avatarid01'), 'roomA', storage);
    await resolveAvatar(accessorForRoom('roomA', { avatarid01: bytes }), ref('avatarid01'), 'roomA', storage);
    // The second call is a pure cache hit — nothing was replaced, nothing deleted.
    expect(fileDeleter.deleteCachedAvatarFile).not.toHaveBeenCalled();
    expect(listPendingAvatarCleanups(storage)).toEqual([]);
  });

  it('does not advance the cache when the superseded file cannot be secured', async () => {
    // Fill the cleanup queue so a sweep cannot make room and the enqueue of
    // the superseded file must be rejected (fail closed).
    for (let index = 0; index < MAX_PENDING_CLEANUPS; index += 1) {
      await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: `file://cache/old-${index}.png` }, storage);
    }
    await resolveAvatar(accessorForRoom('roomA', { avatarid01: bytes }), ref('avatarid01'), 'roomA', storage);
    const newer = { uri: 'file://cache/avatarid01-v2.bin', mimeType: 'image/webp' as const };
    // The superseded file cannot be deleted; the freshly fetched one can.
    const fileDeleter = {
      deleteCachedAvatarFile: vi.fn(async (uri: string) => uri !== 'file://cache/avatarid01.bin'),
    };

    const resolved = await resolveAvatar(
      accessorForRoom('roomA', { avatarid01: newer }),
      ref('avatarid01', 2),
      'roomA',
      storage,
      fileDeleter,
    );

    // The cache did NOT advance: the existing entry is retained and returned,
    // so the old uri stays the tracked reference.
    expect(resolved?.uri).toBe('file://cache/avatarid01.bin');
    expect(resolved?.version).toBe(1);
    expect(getUploadedAvatar('avatarid01', storage)?.uri).toBe('file://cache/avatarid01.bin');
    // The freshly fetched file was removed so it does not linger untracked.
    expect(fileDeleter.deleteCachedAvatarFile).toHaveBeenCalledWith('file://cache/avatarid01-v2.bin');
    // The queue was left untouched — no silent eviction of the oldest record.
    expect(listPendingAvatarCleanups(storage)).toHaveLength(MAX_PENDING_CLEANUPS);
  });

  it('retains the freshly fetched file when it cannot be removed either', async () => {
    // Fill the cleanup queue so a sweep cannot make room and BOTH the
    // superseded and the freshly fetched file enqueues must be rejected.
    for (let index = 0; index < MAX_PENDING_CLEANUPS; index += 1) {
      await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: `file://cache/old-${index}.png` }, storage);
    }
    await resolveAvatar(accessorForRoom('roomA', { avatarid01: bytes }), ref('avatarid01'), 'roomA', storage);
    const newer = { uri: 'file://cache/avatarid01-v2.bin', mimeType: 'image/webp' as const };
    // EVERY deletion fails — the superseded file AND the freshly fetched one.
    const fileDeleter = { deleteCachedAvatarFile: vi.fn(async () => false) };

    const resolved = await resolveAvatar(
      accessorForRoom('roomA', { avatarid01: newer }),
      ref('avatarid01', 2),
      'roomA',
      storage,
      fileDeleter,
    );

    // The cache did NOT advance — the existing entry is retained — and the
    // fresh file, which could not be removed, is durably retained as a
    // tombstone (its uri is tracked even though no registry entry holds it).
    expect(resolved?.uri).toBe('file://cache/avatarid01.bin');
    expect(listAvatarCleanupTombstones(storage)).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/avatarid01-v2.bin' }),
    ]);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(MAX_PENDING_CLEANUPS);
  });
});

describe('avatarResolver.resolveRoomAvatars', () => {
  it('fills every authorized reference and counts the fills', async () => {
    const storage = memoryStorage();
    const roomX = accessorForRoom('roomX', {
      avatarid01: { uri: 'file://cache/one.bin', mimeType: 'image/webp' },
      avatarid02: { uri: 'file://cache/two.bin', mimeType: 'image/webp' },
    });

    const filled = await resolveRoomAvatars('roomX', [ref('avatarid01'), ref('avatarid02')], roomX, storage);

    expect(filled).toBe(2);
    expect(listUploadedAvatars(storage)).toHaveLength(2);
  });

  it('skips unauthorized references without throwing', async () => {
    const storage = memoryStorage();
    const roomX = accessorForRoom('roomX', { avatarid01: bytes });

    const filled = await resolveRoomAvatars('roomX', [ref('avatarid01'), ref('avatarid99')], roomX, storage);

    // avatarid99 is not in room X's object set, so only one reference resolves.
    expect(filled).toBe(1);
  });
});

describe('avatarResolver.deviceAvatarReferences', () => {
  it('lists the registered references', async () => {
    const storage = memoryStorage();
    const roomX = accessorForRoom('roomX', { avatarid01: bytes, avatarid02: bytes });
    await resolveRoomAvatars('roomX', [ref('avatarid01'), ref('avatarid02')], roomX, storage);

    const refs = deviceAvatarReferences(storage).map((r) => r.avatarId).sort();
    expect(refs).toEqual(['avatarid01', 'avatarid02']);
  });
});

describe('avatarResolver.signedAvatarAccessor URL derivation', () => {
  const ENV_KEYS = ['EXPO_PUBLIC_AVATAR_ACCESS_URL', 'EXPO_PUBLIC_SUPABASE_URL'] as const;

  function stubEnvs(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
    for (const key of ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  beforeEach(() => stubEnvs({}));

  it('prefers an explicitly configured absolute Edge Function base', async () => {
    stubEnvs({
      EXPO_PUBLIC_AVATAR_ACCESS_URL: 'https://cdn.example.test/functions/v1/',
      EXPO_PUBLIC_SUPABASE_URL: 'https://unused.supabase.co',
    });
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await signedAvatarAccessor('token').fetchAvatar(ref('avatarid01'), 'roomX');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe(
      'https://cdn.example.test/functions/v1/avatar-access/roomX/avatarid01?v=1',
    );
    vi.unstubAllGlobals();
  });

  it('derives <SUPABASE_URL>/functions/v1 when no explicit base is configured', async () => {
    stubEnvs({ EXPO_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co/' });
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await signedAvatarAccessor('token').fetchAvatar(ref('avatarid01'), 'roomX');

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe(
      'https://proj.supabase.co/functions/v1/avatar-access/roomX/avatarid01?v=1',
    );
    vi.unstubAllGlobals();
  });

  it('never issues a relative fetch when no base URL is configured', async () => {
    stubEnvs({});
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await signedAvatarAccessor('token').fetchAvatar(ref('avatarid01'), 'roomX');

    // React Native fetch rejects relative URLs outright, so the accessor must
    // degrade to "not resolvable" without attempting one.
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('a denied (cross-room) response resolves to null — no bytes, no cache write', async () => {
    stubEnvs({ EXPO_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co' });
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const storage = memoryStorage();

    const resolved = await resolveAvatar(
      signedAvatarAccessor('token'),
      ref('avatarid01'),
      'roomOther',
      storage,
    );

    expect(resolved).toBeNull();
    expect(listUploadedAvatars(storage)).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
