import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_DELETION_CONFIRMATION,
  handleDeleteAccountRequest,
  removeAvatarObjectPathsBatched,
  collectAvatarObjects,
  AVATAR_REMOVE_BATCH_SIZE,
  MAX_AVATAR_OBJECTS,
  type AccountDeletionAdminClient,
  type StorageFolderLister,
} from './handler';

const userId = '11111111-1111-4111-8111-111111111111';

function request(body: unknown, method = 'POST'): Request {
  return new Request('https://example.test/functions/v1/delete-account', {
    body: method === 'POST' ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json' },
    method,
  });
}

function adminWith(
  result: { error: { code?: string } | null } | Error = { error: null },
  purge: {
    list?: string[] | null;
    failedRemovals?: string[];
  } = {},
): {
  admin: AccountDeletionAdminClient;
  deleteUser: ReturnType<typeof vi.fn>;
  listAvatarObjectPaths: ReturnType<typeof vi.fn>;
  removeAvatarObjectPaths: ReturnType<typeof vi.fn>;
} {
  const deleteUser = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const listAvatarObjectPaths = vi.fn(async () => (purge.list === undefined ? [] : purge.list));
  const removeAvatarObjectPaths = vi.fn(async (requested: string[]) =>
    (purge.failedRemovals ?? []).filter((path) => requested.includes(path)));
  return {
    admin: {
      auth: { admin: { deleteUser } },
      listAvatarObjectPaths,
      removeAvatarObjectPaths,
    },
    deleteUser,
    listAvatarObjectPaths,
    removeAvatarObjectPaths,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('delete-account Edge Function handler', () => {
  it('hard-deletes only the authenticated caller after explicit confirmation', async () => {
    const { admin, deleteUser } = adminWith();
    const response = await handleDeleteAccountRequest(request({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }), userId, admin);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(deleteUser).toHaveBeenCalledOnce();
    expect(deleteUser).toHaveBeenCalledWith(userId, false);
  });

  it('purges the caller\'s hosted avatar objects BEFORE deleting the auth user', async () => {
    const calls: string[] = [];
    const paths = [`${userId}/abcdef0123456789`, `${userId}/fedcba9876543210`];
    const admin: AccountDeletionAdminClient = {
      auth: { admin: { deleteUser: vi.fn(async () => { calls.push('deleteUser'); return { error: null }; }) } },
      listAvatarObjectPaths: async () => { calls.push('list'); return paths; },
      removeAvatarObjectPaths: async (requested) => { calls.push(`remove:${requested.length}`); return []; },
    };
    const response = await handleDeleteAccountRequest(request({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }), userId, admin);

    expect(response.status).toBe(200);
    expect(calls).toEqual(['list', 'remove:2', 'deleteUser']);
  });

  it('skips the removal call when the caller has no hosted objects', async () => {
    const { admin, removeAvatarObjectPaths } = adminWith();
    const response = await handleDeleteAccountRequest(request({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }), userId, admin);

    expect(response.status).toBe(200);
    expect(removeAvatarObjectPaths).not.toHaveBeenCalled();
  });

  it.each([
    ['a failed object list', { list: null }],
    ['a failed object removal', { list: [`${userId}/abcdef0123456789`], failedRemovals: [`${userId}/abcdef0123456789`] }],
  ])('never deletes the auth user when the purge hits %s', async (_label, purge) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin, deleteUser } = adminWith(undefined, purge);
    const response = await handleDeleteAccountRequest(request({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }), userId, admin);
    const body = await response.json() as { error: Record<string, unknown> };

    expect(response.status).toBe(503);
    expect(body.error.retryable).toBe(true);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('survives a partial purge retry: the retry removes the remainder and completes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const path = `${userId}/abcdef0123456789`;
    let failFirstRemoval = true;
    const admin: AccountDeletionAdminClient = {
      auth: { admin: { deleteUser: vi.fn(async () => ({ error: null })) } },
      listAvatarObjectPaths: async () => [path],
      removeAvatarObjectPaths: async () => {
        if (failFirstRemoval) { failFirstRemoval = false; return [path]; }
        return [];
      },
    };
    const first = await handleDeleteAccountRequest(request({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }), userId, admin);
    expect(first.status).toBe(503);

    const second = await handleDeleteAccountRequest(request({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }), userId, admin);
    expect(second.status).toBe(200);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing identity', userId.slice(1), { confirmation: ACCOUNT_DELETION_CONFIRMATION }, 401],
    ['missing confirmation', userId, {}, 400],
    ['wrong confirmation', userId, { confirmation: 'delete-history' }, 400],
  ])('rejects %s without calling the admin API', async (_label, identity, body, status) => {
    const { admin, deleteUser } = adminWith();
    const response = await handleDeleteAccountRequest(request(body), identity, admin);

    expect(response.status).toBe(status);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('rejects non-POST, malformed JSON, and oversized bodies', async () => {
    const { admin, deleteUser } = adminWith();
    const getResponse = await handleDeleteAccountRequest(request(null, 'GET'), userId, admin);
    const malformedResponse = await handleDeleteAccountRequest(new Request(
      'https://example.test/functions/v1/delete-account',
      { body: '{bad', method: 'POST' },
    ), userId, admin);
    const oversizedResponse = await handleDeleteAccountRequest(new Request(
      'https://example.test/functions/v1/delete-account',
      { body: JSON.stringify({ confirmation: ACCOUNT_DELETION_CONFIRMATION, padding: 'x'.repeat(600) }), method: 'POST' },
    ), userId, admin);

    expect(getResponse.status).toBe(405);
    expect(malformedResponse.status).toBe(400);
    expect(oversizedResponse.status).toBe(413);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ['an admin error', { error: { code: 'unexpected_failure' } }],
    ['an unexpected exception', new Error('secret database detail')],
  ])('returns a retryable, non-sensitive failure for %s', async (_label, failure) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin } = adminWith(failure);
    const response = await handleDeleteAccountRequest(request({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }), userId, admin);
    const body = await response.json() as { error: Record<string, unknown> };

    expect(response.status).toBe(503);
    expect(body.error).toEqual({
      code: 'account_delete_failed',
      message: 'The account could not be deleted. Try again.',
      retryable: true,
    });
    expect(JSON.stringify(body)).not.toContain('secret database detail');
  });
});

describe('delete-account batched removal (Storage API 1,000-object cap)', () => {
  it('removes paths in bounded batches and returns the union of failures', async () => {
    const chunkSizes: number[] = [];
    const remove = vi.fn(async (chunk: string[]) => {
      chunkSizes.push(chunk.length);
      // Fail every path in the middle batch.
      return chunk.length === AVATAR_REMOVE_BATCH_SIZE && chunkSizes.length === 2 ? [...chunk] : [];
    });

    const paths = Array.from({ length: 2500 }, (_, index) => `${userId}/avatar${String(index).padStart(4, '0')}`);
    const failed = await removeAvatarObjectPathsBatched(remove, paths);

    // 1000 + 1000 + 500 — no single Storage-API call exceeds the documented cap.
    expect(chunkSizes).toEqual([1000, 1000, 500]);
    // The middle batch's paths are reported for retry, nothing else.
    expect(failed).toEqual(paths.slice(1000, 2000));
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it('removes nothing when there is nothing to remove', async () => {
    const remove = vi.fn(async (chunk: string[]) => chunk);
    expect(await removeAvatarObjectPathsBatched(remove, [])).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('returns every failed path across several batches', async () => {
    const remove = vi.fn(async (chunk: string[]) => chunk.filter((_path, index) => index % 2 === 0));
    const paths = Array.from({ length: 2100 }, (_, index) => `${userId}/avatar${index}`);
    const failed = await removeAvatarObjectPathsBatched(remove, paths);
    // The odd-indexed paths were removed; even-indexed ones survived per batch.
    expect(failed).toEqual(paths.filter((_path, index) => index % 2 === 0));
  });
});

describe('delete-account collectAvatarObjects (paginated, recursive listing)', () => {
  /**
   * A fake Storage lister: folder markers carry `metadata: null`, files carry
   * metadata, and every folder is paged at 1,000 entries — mirroring the
   * Storage API so truncation would be observable.
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

  it('collects 1,001 objects under one owner without truncating the folder listing', async () => {
    const files = Array.from({ length: 1001 }, (_, index) => ({
      name: `abcdef0123456${String(index).padStart(4, '0').slice(-4)}`,
      folder: false,
    }));
    const lister = listerFrom({ [userId]: files });

    const collected = await collectAvatarObjects(lister, [userId], MAX_AVATAR_OBJECTS);

    expect(collected).toHaveLength(1001);
    expect(collected?.[1000]).toEqual({
      ownerId: userId,
      path: `${userId}/${files[1000]?.name}`,
    });
  });

  it('recursively collects historical nested objects under the owner folder', async () => {
    const lister = listerFrom({
      [userId]: [{ name: 'nested', folder: true }],
      [`${userId}/nested`]: [{ name: 'deeper', folder: true }],
      [`${userId}/nested/deeper`]: [{ name: 'file', folder: false }],
    });

    const collected = await collectAvatarObjects(lister, [userId], MAX_AVATAR_OBJECTS);

    expect(collected).toEqual([{ ownerId: userId, path: `${userId}/nested/deeper/file` }]);
  });

  it('returns null when the fail-closed ceiling is crossed across pages', async () => {
    const files = Array.from({ length: 1500 }, (_, index) => ({
      name: `abcdef0123456${String(index).padStart(4, '0').slice(-4)}`,
      folder: false,
    }));

    const collected = await collectAvatarObjects(listerFrom({ [userId]: files }), [userId], 1000);

    expect(collected).toBeNull();
  });

  it('returns null when any listing page fails', async () => {
    const lister: StorageFolderLister = async (folder, offset) =>
      (folder === '' ? [{ name: userId, metadata: null }] : null);

    const collected = await collectAvatarObjects(lister, ['', userId], MAX_AVATAR_OBJECTS);

    expect(collected).toBeNull();
  });
});
