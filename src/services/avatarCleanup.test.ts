import { beforeEach, describe, expect, it, vi } from 'vitest';

// Avoid loading the real Supabase client, which transitively imports
// react-native (Flow) that the Node test transform cannot parse. The cleanup
// module only reads `supabase` inside `avatarStorageDeleter`, which this test
// never calls (deleters are injected).
vi.mock('./supabase', () => ({ supabase: null }));

// Mock the dynamic expo-file-system import so the production file deleter's
// exists/delete semantics are testable in Node. `exists` is a boolean GETTER
// — the real SDK 54 shape — so production code that calls `exists()` throws
// here and fails these tests, locking the property shape in place.
const expoFileSystem = vi.hoisted(() => {
  const state = {
    exists: true,
    existsThrows: false,
    deleteThrows: false,
    deleted: [] as string[],
  };
  return { state };
});
vi.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists(): boolean {
      if (expoFileSystem.state.existsThrows) throw new Error('exists failed');
      return expoFileSystem.state.exists;
    }
    delete(): void {
      if (expoFileSystem.state.deleteThrows) throw new Error('delete failed');
      expoFileSystem.state.deleted.push(this.uri);
    }
  },
}));

import {
  avatarFileDeleter,
  clearSingleUploadedAvatar,
  purgeUploadedAvatarArtifacts,
  sweepAvatarCleanupTombstones,
  sweepPendingAvatarCleanups,
  type AvatarCleanupDeleters,
  type AvatarFileDeleter,
  type AvatarStorageDeleter,
} from './avatarCleanup';
import {
  addAvatarCleanupTombstones,
  enqueueAvatarCleanup,
  getUploadedAvatar,
  listAvatarCleanupTombstones,
  listPendingAvatarCleanups,
  listUploadedAvatars,
  persistAvatarCleanupTombstones,
  persistUploadedAvatar,
  MAX_PENDING_CLEANUPS,
  type AvatarRegistryStorage,
  type UploadedAvatar,
} from './avatarStorage';

/** A memory-backed localStorage-like store, optionally pre-seeded with avatars. */
function memoryStorage(avatarIds: string[] = []): AvatarRegistryStorage {
  const backing: Record<string, string> = {};
  const avatars: UploadedAvatar[] = avatarIds.map((id) => entryFor(id));
  if (avatars.length) backing['rivermind.avatar-registry.v1'] = JSON.stringify(avatars);
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

/** A store whose queue writes always fail (quota/security), so enqueues reject. */
function failingQueueStorage(avatarIds: string[] = []): AvatarRegistryStorage {
  const backing: Record<string, string> = {};
  const avatars: UploadedAvatar[] = avatarIds.map((id) => entryFor(id));
  if (avatars.length) backing['rivermind.avatar-registry.v1'] = JSON.stringify(avatars);
  return {
    getItem: (key) => backing[key] ?? null,
    removeItem: (key) => {
      delete backing[key];
    },
    setItem: (key, value) => {
      if (key === 'rivermind.avatar-cleanup-queue.v1') throw new Error('quota exceeded');
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

/** The owner id a self-uploaded avatar is persisted under. */
const OWNER_ID = 'user-abc123';

function entryFor(avatarId: string, extra: Partial<UploadedAvatar> = {}): UploadedAvatar {
  return {
    avatarId,
    version: 1,
    ownerId: OWNER_ID,
    objectPath: `avatars/user/${avatarId}@1.png`,
    uri: `file://cache/${avatarId}-1.png`,
    descriptor: { ...baseDescriptor, avatarId },
    savedAtMs: 1710000000000,
    ...extra,
  };
}

/** A deletable that records every request; reports success by default. */
function recordingDeleters(over?: { file?: boolean; object?: boolean }): {
  files: AvatarFileDeleter;
  objects: AvatarStorageDeleter;
  filesDeleted: string[];
  objectsDeleted: string[];
} {
  const filesDeleted: string[] = [];
  const objectsDeleted: string[] = [];
  return {
    files: { deleteAvatarFile: vi.fn(async (uri: string) => { filesDeleted.push(uri); return over?.file ?? true; }) },
    objects: { deleteAvatarObject: vi.fn(async (path: string) => { objectsDeleted.push(path); return over?.object ?? true; }) },
    filesDeleted,
    objectsDeleted,
  };
}

describe('avatar cleanup', () => {
  let storage: AvatarRegistryStorage;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it('clears one uploaded avatar file and hosted object', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    const d = recordingDeleters();

    const result = await clearSingleUploadedAvatar(listUploadedAvatars(storage)[0]!, d);

    expect(result).toEqual({ fileConfirmed: true, objectConfirmed: true });
    expect(d.filesDeleted).toEqual(['file://cache/avatarid01-1.png']);
    // The hosted object is stored at the owner-scoped bucket path
    // (`${ownerId}/${avatarId}`), not the registry `objectPath` marker.
    expect(d.objectsDeleted).toEqual([`${OWNER_ID}/avatarid01`]);
  });

  it('purges every uploaded avatar file and object, reporting the counts', async () => {
    const ids = ['avatarid01', 'avatarid02', 'avatarid03'];
    ids.forEach((id) => persistUploadedAvatar(entryFor(id), storage));
    const d = recordingDeleters();

    const { filesRemoved, objectsRemoved } = await purgeUploadedAvatarArtifacts(storage, {
      files: d.files,
      objects: d.objects,
    });

    expect(filesRemoved).toBe(3);
    expect(objectsRemoved).toBe(3);
    expect(d.filesDeleted).toHaveLength(3);
    expect(d.objectsDeleted).toHaveLength(3);
    // Purge destroys the file/object artifacts, not the registry metadata;
    // the registry is cleared separately by clearLocalAccountData.
    expect(listUploadedAvatars(storage)).toHaveLength(3);
  });

  it('deletes only the cached file for a resolved foreign avatar', async () => {
    // A resolved foreign avatar has no `ownerId` (this device caches it, it does
    // not own the hosted object), so only the cached file is removed.
    const foreign = entryFor('foreignid01', { ownerId: undefined, objectPath: 'signed:room-1/foreignid01:1' });
    persistUploadedAvatar(foreign, storage);
    const d = recordingDeleters();

    const result = await clearSingleUploadedAvatar(listUploadedAvatars(storage)[0]!, d);

    // File confirmed; no object was ever required, so it is trivially confirmed.
    expect(result).toEqual({ fileConfirmed: true, objectConfirmed: true });
    expect(d.filesDeleted).toEqual(['file://cache/foreignid01-1.png']);
    // No object is deleted: the device does not own the bucket object.
    expect(d.objectsDeleted).toEqual([]);
  });

  it('treats a missing required deleter as unconfirmed, never success', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    persistUploadedAvatar({ ...entryFor('foreignid01'), ownerId: undefined }, storage);

    // Only a file deleter is provided: the self-uploaded avatar's hosted
    // object cannot be verified, so the call must NOT report it confirmed.
    const selfResult = await clearSingleUploadedAvatar(getUploadedAvatar('avatarid01', storage)!, {
      files: recordingDeleters().files,
    });
    expect(selfResult).toEqual({ fileConfirmed: true, objectConfirmed: false });

    // An ownerless (room-resolved) avatar has no required object: file-only
    // deletion is complete when the file is confirmed gone.
    const foreignResult = await clearSingleUploadedAvatar(getUploadedAvatar('foreignid01', storage)!, {
      files: recordingDeleters().files,
    });
    expect(foreignResult).toEqual({ fileConfirmed: true, objectConfirmed: true });
  });

  it('treats a throwing deleter as unconfirmed, never success', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    const throwing = recordingDeleters();
    throwing.files.deleteAvatarFile = vi.fn(async () => {
      throw new Error('io failure');
    });

    const result = await clearSingleUploadedAvatar(getUploadedAvatar('avatarid01', storage)!, {
      files: throwing.files,
      objects: throwing.objects,
    });

    expect(result).toEqual({ fileConfirmed: false, objectConfirmed: true });
  });

  it('does not increment the count when a deletion fails', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    persistUploadedAvatar(entryFor('avatarid02'), storage);
    const d = recordingDeleters({ object: false }); // object deletion always fails

    const { filesRemoved, objectsRemoved } = await purgeUploadedAvatarArtifacts(storage, {
      files: d.files,
      objects: d.objects,
    });

    expect(filesRemoved).toBe(2);
    expect(objectsRemoved).toBe(0);
    // Purge only destroys the file/object artifacts; the registry metadata is
    // left intact and is cleared separately by clearLocalAccountData.
    expect(listUploadedAvatars(storage)).toHaveLength(2);
    // Every unconfirmed object deletion is recorded in the cleanup queue,
    // because the caller clears the registry right after this purge.
    expect(listPendingAvatarCleanups(storage)).toHaveLength(2);
  });

  it('queues a failed CURRENT avatar purge so its uri survives the registry clear', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    const d = recordingDeleters({ file: false }); // the current file cannot be deleted

    const { filesRemoved, objectsRemoved, unretained } = await purgeUploadedAvatarArtifacts(storage, d);

    expect(filesRemoved).toBe(0);
    expect(objectsRemoved).toBe(1);
    expect(unretained).toEqual([]);
    // The object was confirmed gone, so the record is FILE-ONLY — retrying
    // the known-missing object would never drain.
    const rawQueue = JSON.parse(storage.getItem('rivermind.avatar-cleanup-queue.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(rawQueue).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png' }),
    ]);
    expect('ownerId' in rawQueue[0]!).toBe(false);
  });

  it('queues an owner-scoped record when only the hosted object purge fails', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    const d = recordingDeleters({ object: false });

    await purgeUploadedAvatarArtifacts(storage, d);

    expect(listPendingAvatarCleanups(storage)).toMatchObject([
      { avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png', ownerId: OWNER_ID },
    ]);
  });

  it('queues a FILE-ONLY record when only the file deletion fails (object confirmed gone)', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    const d = recordingDeleters({ file: false, object: true });

    await purgeUploadedAvatarArtifacts(storage, d);

    // The object is confirmed gone: an owner-scoped record would retry the
    // known-missing object on every sweep and never drain. The file-only
    // record drains as soon as the cached file is removed.
    const rawQueue = JSON.parse(storage.getItem('rivermind.avatar-cleanup-queue.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(rawQueue).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png' }),
    ]);
    expect('ownerId' in rawQueue[0]!).toBe(false);
  });

  it('returns an entry as unretained when the queue record cannot be persisted', async () => {
    const failing = failingQueueStorage(['avatarid01']);
    const d = recordingDeleters({ file: false }); // deletion fails AND the queue write fails

    const { filesRemoved, objectsRemoved, unretained } = await purgeUploadedAvatarArtifacts(failing, d);

    expect(filesRemoved).toBe(0);
    expect(objectsRemoved).toBe(1);
    // The caller must preserve this entry's reference. The object WAS
    // confirmed deleted, so the retained reference is file-only.
    expect(unretained).toEqual([
      {
        avatar: expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png', ownerId: OWNER_ID }),
        objectUnconfirmed: false,
      },
    ]);
    expect(listPendingAvatarCleanups(failing)).toEqual([]);
  });

  it('returns nothing as unretained when every failure is durably queued', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    const d = recordingDeleters({ file: false });

    const { filesRemoved, objectsRemoved, unretained } = await purgeUploadedAvatarArtifacts(storage, d);

    expect(filesRemoved).toBe(0);
    expect(objectsRemoved).toBe(1);
    expect(unretained).toEqual([]);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(1);
  });

  it('queues every artifact when no deleters are provided (nothing is confirmable)', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);

    const clients: AvatarCleanupDeleters = {};
    const { filesRemoved, objectsRemoved, unretained } = await purgeUploadedAvatarArtifacts(storage, clients);

    expect(filesRemoved).toBe(0);
    expect(objectsRemoved).toBe(0);
    expect(unretained).toEqual([]);
    // Nothing is confirmable without deleters: every required artifact is
    // recorded in the cleanup queue so the registry clear cannot untrack it.
    expect(listPendingAvatarCleanups(storage)).toMatchObject([
      { avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png', ownerId: OWNER_ID },
    ]);
  });

  it('treats a throwing deleter as unconfirmed and queues the artifact', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    const d = recordingDeleters();
    d.files.deleteAvatarFile = vi.fn(async () => {
      throw new Error('io failure');
    });

    const { filesRemoved, objectsRemoved, unretained } = await purgeUploadedAvatarArtifacts(storage, {
      files: d.files,
      objects: d.objects,
    });

    expect(filesRemoved).toBe(0);
    expect(objectsRemoved).toBe(1);
    expect(unretained).toEqual([]);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(1);
  });

  it('skips object deletion entirely when the server confirmed the objects', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    const d = recordingDeleters({ file: false, object: false });
    const objectSpy = vi.fn(d.objects.deleteAvatarObject);
    d.objects.deleteAvatarObject = objectSpy;

    const { filesRemoved, objectsRemoved, unretained } = await purgeUploadedAvatarArtifacts(
      storage,
      { files: d.files, objects: d.objects },
      { serverConfirmedObjects: true },
    );

    expect(filesRemoved).toBe(0);
    expect(objectsRemoved).toBe(0);
    expect(objectSpy).not.toHaveBeenCalled();
    expect(unretained).toEqual([]);
    // The queue record is FILE-ONLY: an owner-scoped record could never drain
    // once the deleted account can no longer authenticate to verify the object.
    const rawQueue = JSON.parse(storage.getItem('rivermind.avatar-cleanup-queue.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(rawQueue).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png' }),
    ]);
    expect('ownerId' in rawQueue[0]!).toBe(false);
  });

  it('reports the file as removed and skips the object when server-confirmed', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);
    const d = recordingDeleters({ file: true, object: false });
    const objectSpy = vi.fn(d.objects.deleteAvatarObject);
    d.objects.deleteAvatarObject = objectSpy;

    const { filesRemoved, objectsRemoved, unretained } = await purgeUploadedAvatarArtifacts(
      storage,
      { files: d.files, objects: d.objects },
      { serverConfirmedObjects: true },
    );

    expect(filesRemoved).toBe(1);
    expect(objectsRemoved).toBe(0);
    expect(objectSpy).not.toHaveBeenCalled();
    expect(unretained).toEqual([]);
    expect(listPendingAvatarCleanups(storage)).toEqual([]);
  });
});

describe('avatar production file deleter (expo-file-system)', () => {
  beforeEach(() => {
    expoFileSystem.state.exists = true;
    expoFileSystem.state.existsThrows = false;
    expoFileSystem.state.deleteThrows = false;
    expoFileSystem.state.deleted = [];
  });

  it('treats an already-missing cached file as success', async () => {
    expoFileSystem.state.exists = false;
    const deleter = await avatarFileDeleter();

    expect(await deleter!.deleteAvatarFile('file://cache/old-1.png')).toBe(true);
    expect(expoFileSystem.state.deleted).toEqual([]);
  });

  it('deletes an existing cached file and reports success', async () => {
    const deleter = await avatarFileDeleter();

    expect(await deleter!.deleteAvatarFile('file://cache/old-1.png')).toBe(true);
    expect(expoFileSystem.state.deleted).toEqual(['file://cache/old-1.png']);
  });

  it('returns false when the deletion throws — never success for a real I/O failure', async () => {
    expoFileSystem.state.deleteThrows = true;
    const deleter = await avatarFileDeleter();

    expect(await deleter!.deleteAvatarFile('file://cache/old-1.png')).toBe(false);
  });

  it('returns false when even the existence check throws (cannot verify absence)', async () => {
    expoFileSystem.state.existsThrows = true;
    const deleter = await avatarFileDeleter();

    expect(await deleter!.deleteAvatarFile('file://cache/old-1.png')).toBe(false);
  });
});

describe('avatar pending-cleanup sweep', () => {
  it('drains records whose file and hosted-object deletions are confirmed', async () => {
    const pendingStorage = memoryStorage();
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: OWNER_ID },
      pendingStorage,
    );
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid02', uri: 'file://cache/old-2.png' },
      pendingStorage,
    );
    const d = recordingDeleters();

    const result = await sweepPendingAvatarCleanups(pendingStorage, { files: d.files, objects: d.objects });

    expect(result).toEqual({ drained: 2, remaining: 0 });
    expect(listPendingAvatarCleanups(pendingStorage)).toEqual([]);
    // The owner-scoped record deletes its cached file AND the hosted object;
    // the foreign cache deletes only its file.
    expect(d.filesDeleted).toEqual(['file://cache/old-1.png', 'file://cache/old-2.png']);
    expect(d.objectsDeleted).toEqual([`${OWNER_ID}/avatarid01`]);
  });

  it('keeps records whose deletion fails, and retries only the remainder later', async () => {
    const pendingStorage = memoryStorage();
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: OWNER_ID },
      pendingStorage,
    );
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid02', uri: 'file://cache/old-2.png' },
      pendingStorage,
    );
    const d = recordingDeleters({ file: false }); // every file deletion fails

    const first = await sweepPendingAvatarCleanups(pendingStorage, { files: d.files, objects: d.objects });
    expect(first).toEqual({ drained: 0, remaining: 2 });

    // A later sweep with a working deleter drains the queue.
    const retry = recordingDeleters();
    const second = await sweepPendingAvatarCleanups(pendingStorage, { files: retry.files, objects: retry.objects });
    expect(second).toEqual({ drained: 2, remaining: 0 });
    expect(listPendingAvatarCleanups(pendingStorage)).toEqual([]);
  });

  it('keeps a record whose deleter THROWS — a sweep never aborts on one I/O failure', async () => {
    const pendingStorage = memoryStorage();
    await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }, pendingStorage);
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid02', uri: 'file://cache/old-2.png' },
      pendingStorage,
    );
    // The first record's file deleter throws; the second one succeeds.
    const d = recordingDeleters();
    d.files.deleteAvatarFile = vi.fn(async (uri: string) => {
      if (uri === 'file://cache/old-1.png') throw new Error('io failure');
      return true;
    });

    const result = await sweepPendingAvatarCleanups(pendingStorage, { files: d.files, objects: d.objects });

    // The throwing record is treated as unconfirmed and stays queued; the
    // healthy record drains, and the sweep itself never throws.
    expect(result).toEqual({ drained: 1, remaining: 1 });
    expect(listPendingAvatarCleanups(pendingStorage)).toMatchObject([
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
    ]);
  });

  it('DOWNGRADES an owner-scoped record to file-only when only the object was confirmed', async () => {
    const pendingStorage = memoryStorage();
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: OWNER_ID },
      pendingStorage,
    );
    // The object deletion succeeds, the file deletion fails.
    const d = recordingDeleters({ file: false, object: true });

    const result = await sweepPendingAvatarCleanups(pendingStorage, { files: d.files, objects: d.objects });

    // The file is still tracked — as a FILE-ONLY record. Retrying the
    // known-missing object on every sweep could otherwise keep the record
    // forever (a 404 reports unconfirmed).
    expect(result).toEqual({ drained: 0, remaining: 1 });
    const raw = JSON.parse(pendingStorage.getItem('rivermind.avatar-cleanup-queue.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(raw).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }),
    ]);
    expect('ownerId' in raw[0]!).toBe(false);
  });

  it('keeps the owner scope when the object deletion is ALSO unconfirmed', async () => {
    const pendingStorage = memoryStorage();
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: OWNER_ID },
      pendingStorage,
    );
    const d = recordingDeleters({ file: false, object: false });

    const result = await sweepPendingAvatarCleanups(pendingStorage, { files: d.files, objects: d.objects });

    expect(result).toEqual({ drained: 0, remaining: 1 });
    expect(listPendingAvatarCleanups(pendingStorage)).toMatchObject([
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: OWNER_ID },
    ]);
  });

  it('keeps a record when a required deleter is absent (deletion cannot be verified)', async () => {
    const pendingStorage = memoryStorage();
    await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }, pendingStorage);

    const result = await sweepPendingAvatarCleanups(pendingStorage, {});

    expect(result).toEqual({ drained: 0, remaining: 1 });
    expect(listPendingAvatarCleanups(pendingStorage)).toHaveLength(1);
  });

  it('keeps an owner-scoped record when only the file deleter exists', async () => {
    const pendingStorage = memoryStorage();
    await enqueueAvatarCleanup(
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: OWNER_ID },
      pendingStorage,
    );

    const result = await sweepPendingAvatarCleanups(pendingStorage, { files: recordingDeleters().files });

    expect(result).toEqual({ drained: 0, remaining: 1 });
  });

  it('reports zeroes when the queue is empty', async () => {
    const result = await sweepPendingAvatarCleanups(memoryStorage());

    expect(result).toEqual({ drained: 0, remaining: 0 });
  });
});

describe('avatar cleanup tombstone sweep', () => {
  it('drops tombstones whose deletions are now confirmed', async () => {
    const storage = memoryStorage();
    persistAvatarCleanupTombstones(
      [
        { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
        { avatarId: 'avatarid02', uri: 'file://cache/old-2.png', ownerId: OWNER_ID },
      ],
      storage,
    );
    const d = recordingDeleters();

    const result = await sweepAvatarCleanupTombstones(storage, { files: d.files, objects: d.objects });

    expect(result).toEqual({ drained: 2, remaining: 0 });
    expect(listAvatarCleanupTombstones(storage)).toEqual([]);
    expect(d.filesDeleted).toEqual(['file://cache/old-1.png', 'file://cache/old-2.png']);
    expect(d.objectsDeleted).toEqual([`${OWNER_ID}/avatarid02`]);
  });

  it('moves an unconfirmed tombstone into the cleanup queue', async () => {
    const storage = memoryStorage();
    persistAvatarCleanupTombstones(
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }],
      storage,
    );
    const d = recordingDeleters({ file: false }); // the file cannot be deleted yet

    const result = await sweepAvatarCleanupTombstones(storage, { files: d.files, objects: d.objects });

    // The reference moved from the tombstone store into the primary queue,
    // which the regular sweep retries.
    expect(result).toEqual({ drained: 1, remaining: 0 });
    expect(listAvatarCleanupTombstones(storage)).toEqual([]);
    expect(listPendingAvatarCleanups(storage)).toMatchObject([
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
    ]);
  });

  it('moves an owner-scoped tombstone into the queue as FILE-ONLY when the object was confirmed during the sweep', async () => {
    const storage = memoryStorage();
    persistAvatarCleanupTombstones(
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: OWNER_ID }],
      storage,
    );
    // The object deletion succeeds during THIS sweep; the file cannot be
    // deleted yet.
    const d = recordingDeleters({ file: false, object: true });

    const result = await sweepAvatarCleanupTombstones(storage, { files: d.files, objects: d.objects });

    // The tombstone is resolved into the queue, but the queue record must NOT
    // re-add the confirmed-gone object's scope.
    expect(result).toEqual({ drained: 1, remaining: 0 });
    expect(listAvatarCleanupTombstones(storage)).toEqual([]);
    const raw = JSON.parse(storage.getItem('rivermind.avatar-cleanup-queue.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(raw).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }),
    ]);
    expect('ownerId' in raw[0]!).toBe(false);
  });

  it('keeps the owner scope in the queue copy when the object deletion is ALSO unconfirmed', async () => {
    const storage = memoryStorage();
    persistAvatarCleanupTombstones(
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: OWNER_ID }],
      storage,
    );
    const d = recordingDeleters({ file: false, object: false });

    const result = await sweepAvatarCleanupTombstones(storage, { files: d.files, objects: d.objects });

    expect(result).toEqual({ drained: 1, remaining: 0 });
    expect(listPendingAvatarCleanups(storage)).toMatchObject([
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png', ownerId: OWNER_ID },
    ]);
  });

  it('keeps a tombstone when the queue rejects the record (still full after a sweep)', async () => {
    const storage = memoryStorage();
    persistAvatarCleanupTombstones(
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }],
      storage,
    );
    // Fill the queue to capacity, then make every file deletion fail so the
    // queue's internal capacity sweep cannot drain it.
    expoFileSystem.state.deleteThrows = true;
    for (let index = 0; index < MAX_PENDING_CLEANUPS; index += 1) {
      await enqueueAvatarCleanup({ avatarId: 'avatarid01', uri: `file://cache/fill-${index}.png` }, storage);
    }
    const d = recordingDeleters({ file: false });

    const result = await sweepAvatarCleanupTombstones(storage, { files: d.files, objects: d.objects });

    // Neither the deletion nor the queue could take the reference: it stays
    // tombstoned for the next sweep, and the queue was not force-evicted.
    expect(result).toEqual({ drained: 0, remaining: 1 });
    expect(listAvatarCleanupTombstones(storage)).toMatchObject([
      { avatarId: 'avatarid01', uri: 'file://cache/old-1.png' },
    ]);
    expect(listPendingAvatarCleanups(storage)).toHaveLength(MAX_PENDING_CLEANUPS);
  });

  it('never clobbers a tombstone appended during the sweep', async () => {
    const storage = memoryStorage();
    persistAvatarCleanupTombstones(
      [{ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }],
      storage,
    );
    // The first deletion call appends a NEW tombstone mid-sweep (as a
    // concurrent resolver/picker retention would), while the sweep still holds
    // its snapshot of the store.
    const d = recordingDeleters();
    d.files.deleteAvatarFile = vi.fn(async (uri: string) => {
      addAvatarCleanupTombstones([{ avatarId: 'avatarid02', uri: 'file://cache/old-2.png' }], storage);
      return true;
    });

    const result = await sweepAvatarCleanupTombstones(storage, { files: d.files, objects: d.objects });

    // The resolved record is gone; the concurrently appended one survives —
    // the sweep removed only its exact snapshot entries from the latest store.
    expect(result).toEqual({ drained: 1, remaining: 0 });
    expect(listAvatarCleanupTombstones(storage)).toEqual([
      { avatarId: 'avatarid02', uri: 'file://cache/old-2.png' },
    ]);
  });

  it('reports zeroes when the tombstone store is empty', async () => {
    const result = await sweepAvatarCleanupTombstones(memoryStorage());

    expect(result).toEqual({ drained: 0, remaining: 0 });
  });
});
