export const ACCOUNT_DELETION_CONFIRMATION = 'delete-account';

const MAX_BODY_BYTES = 512;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Supabase's Storage API removes at most 1,000 objects per call, so every
 * removal path batches. This is the shared bound for in-app deletion
 * (`delete-account`) and out-of-band cleanup (`avatar-cleanup`).
 */
export const AVATAR_REMOVE_BATCH_SIZE = 1000;
/**
 * Fail-closed ceiling on the number of avatar objects one account may hold.
 * Listing beyond it aborts the deletion (retryable) instead of silently
 * dropping objects, so the auth user is never deleted with bytes remaining.
 */
export const MAX_AVATAR_OBJECTS = 100_000;

/** A Storage-API removal call that returns the paths it did NOT remove. */
export type AvatarObjectRemover = (paths: string[]) => Promise<string[]>;

/**
 * Remove avatar objects through the Storage API in bounded batches of at most
 * `AVATAR_REMOVE_BATCH_SIZE`. The union of every chunk's failures is returned
 * so the caller can retry exactly what survived.
 */
export async function removeAvatarObjectPathsBatched(
  remove: AvatarObjectRemover,
  paths: string[],
): Promise<string[]> {
  const failed: string[] = [];
  for (let offset = 0; offset < paths.length; offset += AVATAR_REMOVE_BATCH_SIZE) {
    const chunk = paths.slice(offset, offset + AVATAR_REMOVE_BATCH_SIZE);
    failed.push(...(await remove(chunk)));
  }
  return failed;
}

/**
 * The Storage-API list page size: the same 1,000-entry bound as removal, so a
 * folder with more than 1,000 entries is never truncated by a single call.
 */
export const STORAGE_LIST_BATCH_SIZE = 1000;

/** One entry in a Storage-API folder listing. `metadata === null` marks a folder. */
export interface StorageListEntry {
  name?: string | null;
  metadata?: unknown;
}

/** Pages one folder listing; `null` means the listing failed. */
export type StorageFolderLister = (folder: string, offset: number) => Promise<StorageListEntry[] | null>;

/** A file object inside the avatar bucket: its owner folder and full path. */
export interface AvatarObjectPath {
  ownerId: string;
  path: string;
}

/**
 * Collect every file under `roots` — `''` for a whole-bucket walk, `${ownerId}`
 * for one owner's folder — recursively descending folder markers and paging
 * every folder by `STORAGE_LIST_BATCH_SIZE` until a short page proves it is
 * exhausted. A listing failure, or crossing the fail-closed `ceiling`, returns
 * `null` — never a silently truncated set, so a bucket with more than 1,000
 * owners (or an owner with more than 1,000 objects) is fully enumerated or the
 * sweep aborts.
 *
 * Files whose path has extra segments (historical `owner/nested/file` shapes
 * created before the policies enforced the flat `owner/avatarId` form) are
 * collected like any other file: the recursion descends the nested folders, so
 * both deletion workflows remove them instead of reporting success with bytes
 * remaining. `ownerId` is the first path segment.
 */
export async function collectAvatarObjects(
  lister: StorageFolderLister,
  roots: string[],
  ceiling: number,
): Promise<AvatarObjectPath[] | null> {
  const objects: AvatarObjectPath[] = [];
  const pending = [...roots];
  while (pending.length > 0) {
    const folder = pending.shift() as string;
    for (let offset = 0; ; offset += STORAGE_LIST_BATCH_SIZE) {
      const entries = await lister(folder, offset);
      if (entries === null) return null;
      for (const entry of entries) {
        if (entry.name == null || entry.name === '') continue;
        const path = folder === '' ? entry.name : `${folder}/${entry.name}`;
        if (entry.metadata == null) {
          // A folder marker: descend into it, so nested history is recovered.
          pending.push(path);
        } else {
          objects.push({ ownerId: path.split('/')[0] ?? entry.name, path });
        }
        if (objects.length >= ceiling) return null;
      }
      if (entries.length < STORAGE_LIST_BATCH_SIZE) break;
    }
  }
  return objects;
}

interface DeleteUserError {
  code?: string;
}

/**
 * The server-only boundaries the deletion needs, injected so the ordering and
 * failure semantics are unit tested without a real Supabase client:
 *  - `listAvatarObjectPaths` enumerates the user's hosted avatar objects via
 *    the service-role Storage API (the prefix-scoped `list` is the only
 *    server-only enumeration boundary — the `storage` schema is not exposed
 *    through PostgREST); `null` means the list failed or exceeded the
 *    fail-closed `MAX_AVATAR_OBJECTS` ceiling.
 *  - `removeAvatarObjectPaths` deletes objects through the Storage API — the
 *    only way to remove both the metadata row *and* the stored bytes — in
 *    bounded batches of at most `AVATAR_REMOVE_BATCH_SIZE`, and returns the
 *    paths that were not removed.
 *  - `deleteUser` removes the Auth user last, after no hosted bytes remain.
 */
export interface AccountDeletionAdminClient {
  auth: {
    admin: {
      deleteUser(userId: string, shouldSoftDelete: false): Promise<{ error: DeleteUserError | null }>;
    };
  };
  listAvatarObjectPaths(userId: string): Promise<string[] | null>;
  removeAvatarObjectPaths(paths: string[]): Promise<string[]>;
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, retryable: status >= 500 } }, { status });
}

function confirmedDeletion(value: unknown): boolean {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>).confirmation === ACCOUNT_DELETION_CONFIRMATION;
}

export async function handleDeleteAccountRequest(
  request: Request,
  userId: string | null | undefined,
  admin: AccountDeletionAdminClient,
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST for account deletion.');
  }
  if (!userId || !UUID_PATTERN.test(userId)) {
    return errorResponse(401, 'account_access', 'Start a new guest session and try again.');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413, 'request_too_large', 'The account deletion request is too large.');
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(400, 'request_invalid', 'Confirm account deletion and try again.');
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return errorResponse(413, 'request_too_large', 'The account deletion request is too large.');
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse(400, 'request_invalid', 'Confirm account deletion and try again.');
  }
  if (!confirmedDeletion(body)) {
    return errorResponse(400, 'confirmation_required', 'Confirm account deletion and try again.');
  }

  // Hosted avatar bytes must not outlive the account (the client cannot reach
  // them once its token is invalidated by the deletion), so purge them through
  // the Storage API *before* deleting the Auth user. The DB trigger is only a
  // metadata backstop; a failed purge aborts the deletion as retryable, and a
  // re-run re-lists whatever survived — the sequence is idempotent.
  try {
    const paths = await admin.listAvatarObjectPaths(userId);
    if (paths === null) {
      throw new Error('avatar list failed');
    }
    if (paths.length > 0) {
      const failed = await admin.removeAvatarObjectPaths(paths);
      if (failed.length > 0) {
        console.error('Avatar purge failed', { failedCount: failed.length });
        return errorResponse(503, 'account_delete_failed', 'The account could not be deleted. Try again.');
      }
    }
  } catch {
    console.error('Unexpected avatar purge failure');
    return errorResponse(503, 'account_delete_failed', 'The account could not be deleted. Try again.');
  }

  try {
    const { error } = await admin.auth.admin.deleteUser(userId, false);
    if (error) {
      console.error('Account deletion failed', { code: error.code ?? 'unknown' });
      return errorResponse(503, 'account_delete_failed', 'The account could not be deleted. Try again.');
    }
  } catch {
    console.error('Unexpected account deletion failure');
    return errorResponse(503, 'account_delete_failed', 'The account could not be deleted. Try again.');
  }

  return Response.json({ deleted: true });
}
