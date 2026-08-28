import {
  collectAvatarObjects,
  removeAvatarObjectPathsBatched,
  type AvatarObjectPath,
  type StorageFolderLister,
} from '../delete-account/handler.ts';

/**
 * `avatar-cleanup` — the API-driven out-of-band cleanup workflow for the
 * private 'avatars' bucket.
 *
 * Uploaded avatar bytes must be removed exclusively through the Storage API:
 * deleting `storage.objects` rows directly removes only metadata and orphans
 * the stored bytes (the account-deletion trigger deliberately does NOT touch
 * `storage.objects`). In-app deletion runs `delete-account`, which purges the
 * caller's own objects before deleting the Auth user. But a dashboard or
 * Admin-API account deletion bypasses that function, so this worker exists for
 * exactly that out-of-band case: it lists every object in the bucket, keeps
 * only objects whose owner folder no longer has an auth user, and removes them
 * through the Storage API in bounded batches.
 *
 * The listing is fully paginated and recursive (see `listAvatarObjects`), so
 * buckets with more than 1,000 owners or owners with more than 1,000 objects
 * are enumerated completely or the sweep aborts — it never reports success
 * after inspecting only a 1,000-entry prefix.
 *
 * The orchestration is pure and the backend is injected, so the ordering and
 * failure semantics are unit tested without a real Supabase client. The
 * service-role wiring (secret-key auth) lives in `index.ts`.
 */

/** The fail-closed ceiling on bucket objects one sweep will touch. */
export const MAX_AVATAR_CLEANUP_OBJECTS = 100_000;

/** The sweep's unit of enumeration: an owner folder plus a full object path. */
export type AvatarBucketObject = AvatarObjectPath;

/**
 * Enumerate every object in the avatar bucket through the Storage API, walking
 * the root (owner folders) and recursively descending every folder with
 * explicit pagination, so a bucket with more than 1,000 owners or more than
 * 1,000 objects under one owner is never silently truncated. Historical nested
 * paths (`owner/nested/file`) are collected like any other file. `null` means
 * a listing failed or the fail-closed ceiling was crossed — the sweep aborts
 * rather than report success with bytes remaining.
 */
export async function listAvatarObjects(
  lister: StorageFolderLister,
  ceiling: number,
): Promise<AvatarBucketObject[] | null> {
  return collectAvatarObjects(lister, [''], ceiling);
}

/** The server-only boundaries the sweep needs, injected for tests. */
export interface AvatarCleanupBackend {
  /**
   * Every object in the 'avatars' bucket (service role). `null` means the
   * enumeration failed or exceeded the fail-closed ceiling.
   */
  listAllAvatarObjects(): Promise<AvatarBucketObject[] | null>;
  /**
   * Which of the given owner ids still have an auth user. `null` means the
   * existence check failed, so the sweep aborts without deleting anything.
   */
  filterExistingUserIds(ownerIds: string[]): Promise<Set<string> | null>;
  /**
   * Remove objects through the Storage API (metadata row AND stored bytes),
   * in bounded batches; returns the paths that were NOT removed.
   */
  removeObjects(paths: string[]): Promise<string[]>;
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, retryable: status >= 500 } }, { status });
}

/**
 * Run one out-of-band avatar cleanup sweep. Idempotent: a sweep with no
 * orphaned objects deletes nothing and reports `cleaned: 0`. Any failure
 * (list, existence check, or partial removal) is a retryable 503 so the
 * operator re-runs the workflow until it reports no failures — the auth
 * users are already gone by this point, so retrying is always safe.
 */
export async function handleAvatarCleanup(backend: AvatarCleanupBackend): Promise<Response> {
  let objects: AvatarBucketObject[] | null;
  try {
    objects = await backend.listAllAvatarObjects();
  } catch {
    return errorResponse(503, 'cleanup_failed', 'The avatar objects could not be listed. Run the cleanup again.');
  }
  if (objects === null) {
    return errorResponse(503, 'cleanup_failed', 'The avatar objects could not be listed. Run the cleanup again.');
  }
  if (objects.length === 0) {
    return Response.json({ cleaned: 0, failed: 0 });
  }

  const ownerIds = [...new Set(objects.map((object) => object.ownerId))];
  let existing: Set<string> | null;
  try {
    existing = await backend.filterExistingUserIds(ownerIds);
  } catch {
    return errorResponse(503, 'cleanup_failed', 'The avatar owners could not be verified. Run the cleanup again.');
  }
  if (existing === null) {
    return errorResponse(503, 'cleanup_failed', 'The avatar owners could not be verified. Run the cleanup again.');
  }

  const orphanPaths = objects
    .filter((object) => !existing.has(object.ownerId))
    .map((object) => object.path);

  let failed: string[];
  try {
    failed = await removeAvatarObjectPathsBatched(backend.removeObjects, orphanPaths);
  } catch {
    return errorResponse(503, 'cleanup_failed', 'The avatar objects could not be removed. Run the cleanup again.');
  }

  if (failed.length > 0) {
    console.error('Avatar cleanup partial failure', { failedCount: failed.length });
    return errorResponse(503, 'cleanup_partial', 'Some avatar objects remain. Run the cleanup again.');
  }
  return Response.json({ cleaned: orphanPaths.length, failed: 0 });
}
