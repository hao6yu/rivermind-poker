import { beforeEach, describe, expect, it, vi } from 'vitest';

// Avoid loading the real Supabase client, which transitively imports
// react-native (Flow) that the Node test transform cannot parse. The cleanup
// module only reads `supabase` inside `avatarStorageDeleter`, which this test
// never calls (deleters are injected).
vi.mock('./supabase', () => ({ supabase: null }));

import {
  clearSingleUploadedAvatar,
  purgeUploadedAvatarArtifacts,
  type AvatarCleanupDeleters,
  type AvatarFileDeleter,
  type AvatarStorageDeleter,
} from './avatarCleanup';
import {
  listUploadedAvatars,
  persistUploadedAvatar,
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

    const ok = await clearSingleUploadedAvatar(listUploadedAvatars(storage)[0]!, d);

    expect(ok).toBe(true);
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

    const ok = await clearSingleUploadedAvatar(listUploadedAvatars(storage)[0]!, d);

    expect(ok).toBe(true);
    expect(d.filesDeleted).toEqual(['file://cache/foreignid01-1.png']);
    // No object is deleted: the device does not own the bucket object.
    expect(d.objectsDeleted).toEqual([]);
  });

  it('treats an absent deletable as neutral', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);

    // Only a file deleter is provided; object absence must not fail the call.
    const ok = await clearSingleUploadedAvatar(listUploadedAvatars(storage)[0]!, { files: recordingDeleters().files });
    expect(ok).toBe(true);
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
  });

  it('neither touches the file nor the object when no delecters are provided', async () => {
    persistUploadedAvatar(entryFor('avatarid01'), storage);

    const clients: AvatarCleanupDeleters = {};
    const { filesRemoved, objectsRemoved } = await purgeUploadedAvatarArtifacts(storage, clients);

    expect(filesRemoved).toBe(0);
    expect(objectsRemoved).toBe(0);
    expect(listUploadedAvatars(storage)).toHaveLength(1);
  });
});
