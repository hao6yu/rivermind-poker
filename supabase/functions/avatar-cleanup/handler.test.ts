import { describe, expect, it, vi } from 'vitest';

import {
  handleAvatarCleanup,
  listAvatarObjects,
  MAX_AVATAR_CLEANUP_OBJECTS,
  type AvatarBucketObject,
  type AvatarCleanupBackend,
} from './handler';
import type { StorageFolderLister } from '../delete-account/handler';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

function objects(entries: Array<{ ownerId: string; suffix: string }>): AvatarBucketObject[] {
  return entries.map(({ ownerId, suffix }) => ({ ownerId, path: `${ownerId}/${suffix}` }));
}

function backendWith({
  objects: bucketObjects = [],
  existing = new Set<string>([OWNER_A]),
  removeFailures = [],
}: {
  objects?: AvatarBucketObject[] | null;
  existing?: Set<string> | null;
  removeFailures?: string[];
} = {}): {
  backend: AvatarCleanupBackend;
  removeObjects: ReturnType<typeof vi.fn>;
} {
  const removeObjects = vi.fn(async (requested: string[]) =>
    removeFailures.filter((path) => requested.includes(path)));
  return {
    removeObjects,
    backend: {
      listAllAvatarObjects: async () => bucketObjects,
      filterExistingUserIds: async () => existing,
      removeObjects,
    },
  };
}

describe('avatar-cleanup handleAvatarCleanup', () => {
  it('removes every orphaned object whose owner no longer exists', async () => {
    const { backend, removeObjects } = backendWith({
      objects: objects([
        { ownerId: OWNER_A, suffix: 'abcdef0123456789' },
        { ownerId: OWNER_B, suffix: 'fedcba9876543210' },
      ]),
      existing: new Set([OWNER_A]),
    });

    const response = await handleAvatarCleanup(backend);
    const body = await response.json() as { cleaned: number; failed: number };

    expect(response.status).toBe(200);
    expect(body).toEqual({ cleaned: 1, failed: 0 });
    // Only owner B's object (the orphan) is passed to the Storage API.
    expect(removeObjects).toHaveBeenCalledWith([`${OWNER_B}/fedcba9876543210`]);
  });

  it('deletes nothing when the bucket is empty or has no orphans', async () => {
    const empty = backendWith({ objects: [] });
    const emptyResponse = await handleAvatarCleanup(empty.backend);
    expect(await emptyResponse.json()).toEqual({ cleaned: 0, failed: 0 });
    expect(empty.removeObjects).not.toHaveBeenCalled();

    const none = backendWith({
      objects: objects([{ ownerId: OWNER_A, suffix: 'abcdef0123456789' }]),
      existing: new Set([OWNER_A]),
    });
    const noneResponse = await handleAvatarCleanup(none.backend);
    expect(await noneResponse.json()).toEqual({ cleaned: 0, failed: 0 });
    expect(none.removeObjects).not.toHaveBeenCalled();
  });

  it('returns a retryable failure when the object list fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { backend } = backendWith({ objects: null });
    const response = await handleAvatarCleanup(backend);
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { retryable: boolean } }).error.retryable).toBe(true);
  });

  it('returns a retryable failure when owner existence cannot be verified', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { backend } = backendWith({
      objects: objects([{ ownerId: OWNER_B, suffix: 'fedcba9876543210' }]),
      existing: null,
    });
    const response = await handleAvatarCleanup(backend);
    expect(response.status).toBe(503);
  });

  it('reports a partial removal as retryable so the operator reruns the sweep', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const path = `${OWNER_B}/fedcba9876543210`;
    const { backend } = backendWith({
      objects: [{ ownerId: OWNER_B, path }],
      existing: new Set<string>(),
      removeFailures: [path],
    });
    const response = await handleAvatarCleanup(backend);
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('cleanup_partial');
  });

  it('survives a partial sweep retry: the second run finishes the removal', async () => {
    const path = `${OWNER_B}/fedcba9876543210`;
    let failFirst = true;
    const removeObjects = vi.fn(async (requested: string[]) => {
      if (failFirst) { failFirst = false; return [...requested]; }
      return [];
    });
    const backend: AvatarCleanupBackend = {
      listAllAvatarObjects: async () => [{ ownerId: OWNER_B, path }],
      filterExistingUserIds: async () => new Set<string>(),
      removeObjects,
    };

    const first = await handleAvatarCleanup(backend);
    expect(first.status).toBe(503);
    const second = await handleAvatarCleanup(backend);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ cleaned: 1, failed: 0 });
  });
});

describe('avatar-cleanup listAvatarObjects (paginated, recursive listing)', () => {
  /**
   * A fake Storage lister backed by a flat map of folder → entries. Folder
   * markers are `metadata: null`; files carry metadata. Pages are split at
   * 1,000 entries, so a folder with more than 1,000 entries requires several
   * lister calls — exactly like the Storage API.
   */
  function listerFrom(contents: Record<string, Array<{ name: string; folder?: boolean }>>): StorageFolderLister {
    return async (folder, offset) => {
      const entries = (contents[folder] ?? []).map((entry) => ({
        name: entry.name,
        metadata: entry.folder ? null : { mimetype: 'image/webp' },
      }));
      return entries.slice(offset, offset + 1000);
    };
  }

  it('enumerates a bucket with 1,001 owner folders without truncating to the first page', async () => {
    const owners = Array.from({ length: 1001 }, (_, index) => `owner-${String(index).padStart(4, '0')}`);
    const root = owners.map((name) => ({ name, folder: true }));
    const contents: Record<string, Array<{ name: string; folder?: boolean }>> = { '': root };
    for (const owner of owners) {
      contents[owner] = [{ name: 'abcdef0123456789', folder: false }];
    }
    const lister = listerFrom(contents);

    const objects = await listAvatarObjects(lister, MAX_AVATAR_CLEANUP_OBJECTS);

    expect(objects).toHaveLength(1001);
    expect(objects?.[0]).toEqual({ ownerId: 'owner-0000', path: 'owner-0000/abcdef0123456789' });
    expect(objects?.[1000]).toEqual({ ownerId: 'owner-1000', path: 'owner-1000/abcdef0123456789' });
  });

  it('enumerates 1,001 objects under one owner without truncating the folder listing', async () => {
    const files = Array.from({ length: 1001 }, (_, index) => ({
      name: `abcdef0123456${String(index).padStart(4, '0').slice(-4)}`,
      folder: false,
    }));
    const lister = listerFrom({ '': [{ name: OWNER_A, folder: true }], [OWNER_A]: files });

    const objects = await listAvatarObjects(lister, MAX_AVATAR_CLEANUP_OBJECTS);

    expect(objects).toHaveLength(1001);
    // The 1,001st object comes from the SECOND page of the owner folder, which
    // the offset-driven lister call must reach.
    expect(objects?.[1000]?.path).toBe(`${OWNER_A}/${files[1000]?.name}`);
  });

  it('recursively collects historical nested objects under an owner folder', async () => {
    const lister = listerFrom({
      '': [{ name: OWNER_A, folder: true }],
      [OWNER_A]: [{ name: 'nested', folder: true }],
      [`${OWNER_A}/nested`]: [{ name: 'file', folder: false }],
    });

    const objects = await listAvatarObjects(lister, MAX_AVATAR_CLEANUP_OBJECTS);

    expect(objects).toEqual([{ ownerId: OWNER_A, path: `${OWNER_A}/nested/file` }]);
  });

  it('sweeps a stray root-level file as an orphan object', async () => {
    const lister = listerFrom({ '': [{ name: 'strayfile', folder: false }] });

    const objects = await listAvatarObjects(lister, MAX_AVATAR_CLEANUP_OBJECTS);

    expect(objects).toEqual([{ ownerId: 'strayfile', path: 'strayfile' }]);
  });

  it('returns null when the fail-closed ceiling is crossed across pages', async () => {
    // 50 owners, each with 60 objects: 3,000 objects total, ceiling 2,500.
    const owners = Array.from({ length: 50 }, (_, index) => `owner-${index}`);
    const root = owners.map((name) => ({ name, folder: true }));
    const contents: Record<string, Array<{ name: string; folder?: boolean }>> = { '': root };
    for (const owner of owners) {
      contents[owner] = Array.from({ length: 60 }, (_, index) => ({
        name: `abcdef0123456${String(index).padStart(4, '0').slice(-4)}`,
        folder: false,
      }));
    }

    const objects = await listAvatarObjects(listerFrom(contents), 2500);

    expect(objects).toBeNull();
  });

  it('returns null when any listing page fails', async () => {
    const lister: StorageFolderLister = async (folder, offset) => {
      if (folder === OWNER_A) return null;
      return [{ name: OWNER_A, metadata: null }];
    };

    const objects = await listAvatarObjects(lister, MAX_AVATAR_CLEANUP_OBJECTS);

    expect(objects).toBeNull();
  });

  it('skips entries with empty or missing names', async () => {
    const lister: StorageFolderLister = async () => [
      { name: '', metadata: null },
      { name: null, metadata: { mimetype: 'image/webp' } },
      { name: undefined, metadata: { mimetype: 'image/webp' } },
    ];

    const objects = await listAvatarObjects(lister, MAX_AVATAR_CLEANUP_OBJECTS);

    expect(objects).toEqual([]);
  });
});
