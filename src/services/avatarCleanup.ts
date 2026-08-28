/**
 * Upload-cleanup boundary: deletes the two artifacts an uploaded avatar creates
 * — a locally cached, processed image file and the owner-scoped object hosted
 * in the avatar upload bucket — so neither the registry, the device cache, nor
 * the hosted object survives account deletion, avatar removal, or avatar
 * replacement.
 *
 * Every decision is expressed through injectable deleters so the orchestration
 * is unit tested in Node without Expo or Supabase, exactly like the rest of the
 * avatar pipeline. In production the deleters are resolved dynamically:
 * `expo-file-system` deletes the cached image, and the Supabase Storage client
 * removes the hosted object. A missing module/client, a thrown call, and a
 * `false` result are all UNCONFIRMED — never success — so a partial cleanup
 * cannot make a caller discard the only cleanup reference.
 */
import {
  enqueueAvatarCleanup,
  listAvatarCleanupTombstones,
  listPendingAvatarCleanups,
  listUploadedAvatars,
  removeAvatarCleanupTombstones,
  removePendingAvatarCleanups,
  replacePendingAvatarCleanups,
  type AvatarCleanupTombstone,
  type AvatarRegistryStorage,
  type PendingAvatarCleanup,
  type UploadedAvatar,
} from './avatarStorage';
import { supabase } from './supabase';

/** The owner-scoped upload bucket processed avatars are hosted in. */
export const AVATAR_UPLOAD_BUCKET = 'avatars';

/** Delete a locally cached, processed avatar image (via `expo-file-system`). */
export interface AvatarFileDeleter {
  deleteAvatarFile(uri: string): Promise<boolean>;
}

/** Delete a hosted avatar object at its owner-scoped path (via Supabase Storage). */
export interface AvatarStorageDeleter {
  deleteAvatarObject(objectPath: string): Promise<boolean>;
}

/** Injectable deleters for the local-file and hosted-object artifacts. */
export interface AvatarCleanupDeleters {
  files?: AvatarFileDeleter;
  objects?: AvatarStorageDeleter;
}

/** The local, device-storage registry default — mirrors the avatar storage layer. */
function deviceStorage(): AvatarRegistryStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

/** Per-artifact result of a single-avatar cleanup attempt. */
export interface SingleAvatarCleanupResult {
  /** True only when the cached file is confirmed gone (or no file was required). */
  fileConfirmed: boolean;
  /** True only when the hosted object is confirmed gone (or no object was required). */
  objectConfirmed: boolean;
}

/**
 * Delete one uploaded avatar's cached file and hosted object, reporting each
 * artifact's confirmation separately. A missing deleter, a deleter that
 * throws, or a deleter that reports false are all UNCONFIRMED — never
 * success — so the caller cannot discard the registry reference without a
 * real deletion to back it. The cached file is required for every avatar; the
 * hosted object is required only for a self-uploaded avatar (ownerId present).
 */
export async function clearSingleUploadedAvatar(
  avatar: UploadedAvatar,
  clients: AvatarCleanupDeleters = {},
): Promise<SingleAvatarCleanupResult> {
  const [fileConfirmed, objectConfirmed] = await Promise.all([
    clients.files
      ? deleteAvatarFileConfirmed(clients.files, avatar.uri)
      : Promise.resolve(false),
    // The hosted object is required only for a self-uploaded avatar, whose
    // object path is `${ownerId}/${avatarId}`. A resolved foreign avatar is
    // owned by another account — this device caches it, not hosts it — so
    // deletion is file-only.
    avatar.ownerId
      ? (clients.objects
        ? deleteAvatarObjectConfirmed(clients.objects, `${avatar.ownerId}/${avatar.avatarId}`)
        : Promise.resolve(false))
      : Promise.resolve(true),
  ]);
  return { fileConfirmed, objectConfirmed };
}

/** Run a file deletion, treating a thrown call as unconfirmed. */
export async function deleteAvatarFileConfirmed(
  files: AvatarFileDeleter,
  uri: string,
): Promise<boolean> {
  try {
    return (await files.deleteAvatarFile(uri)) === true;
  } catch {
    return false;
  }
}

/** Run an object deletion, treating a thrown call as unconfirmed. */
async function deleteAvatarObjectConfirmed(
  objects: AvatarStorageDeleter,
  objectPath: string,
): Promise<boolean> {
  try {
    return (await objects.deleteAvatarObject(objectPath)) === true;
  } catch {
    return false;
  }
}

/**
 * Options controlling how the artifact purge treats hosted objects.
 */
export interface PurgeAvatarArtifactsOptions {
  /**
   * The server already confirmed the hosted objects are gone: the
   * delete-account Edge function removes every owned avatar object BEFORE
   * deleting the auth user, after which the client can no longer authenticate
   * to verify them. Object deletion is skipped (never a failure) and any
   * queue/tombstone records are FILE-ONLY, so a record never blocks forever
   * on an unverifiable-but-server-confirmed object.
   */
  serverConfirmedObjects?: boolean;
}

/**
 * An entry whose artifacts could not be secured into the cleanup queue.
 */
export interface UnretainedAvatarCleanup {
  avatar: UploadedAvatar;
  /**
   * True when the hosted object's deletion was NOT confirmed while one was
   * required: the retained reference must stay owner-scoped so a later sweep
   * still targets `${ownerId}/${avatarId}`. False when the object is
   * confirmed gone (or was never required), in which case a file-only record
   * is correct.
   */
  objectUnconfirmed: boolean;
}

/**
 * Delete every uploaded avatar's cached file and hosted object across the
 * device, returning how many of each were actually removed plus the entries
 * whose artifacts could NOT be secured. The cached file is a required
 * artifact for EVERY avatar, and the hosted object is required for a
 * self-uploaded avatar (ownerId present) — a missing/throwing/denying deleter
 * is unconfirmed, never success (unless the server already confirmed the
 * objects). Every deletion that cannot be confirmed is recorded in the
 * persisted cleanup queue FIRST, because the account-deletion path clears the
 * registry right after this runs — the registry holds the failed avatar's
 * only URI, so an unqueued failure would be permanently lost. Queue records
 * carry the owner ONLY while the object deletion itself is unconfirmed:
 * retrying a known-missing object can never drain, while a file-only record
 * drains as soon as the cached file is gone. An entry whose deletion is
 * unconfirmed AND whose queue record was rejected (storage failure or a full
 * queue) is returned in `unretained`; the caller must retain its reference
 * another way (the tombstone store).
 */
export async function purgeUploadedAvatarArtifacts(
  storage: AvatarRegistryStorage | null = deviceStorage(),
  clients: AvatarCleanupDeleters = {},
  options: PurgeAvatarArtifactsOptions = {},
): Promise<{ filesRemoved: number; objectsRemoved: number; unretained: UnretainedAvatarCleanup[] }> {
  const all = listUploadedAvatars(storage);
  let filesRemoved = 0;
  let objectsRemoved = 0;
  const unretained: UnretainedAvatarCleanup[] = [];
  for (const avatar of all) {
    // The cached file is a required artifact for EVERY avatar: a missing,
    // throwing, or denying deleter is unconfirmed, never success.
    const fileOk = clients.files
      ? await deleteAvatarFileConfirmed(clients.files, avatar.uri)
      : false;
    if (fileOk) filesRemoved += 1;
    // The hosted object is required only for a self-uploaded avatar (the
    // object path is `${ownerId}/${avatarId}`) — unless the server already
    // confirmed its removal, in which case it is treated as gone.
    let objectOk = !avatar.ownerId || options.serverConfirmedObjects === true;
    if (avatar.ownerId && !options.serverConfirmedObjects) {
      objectOk = clients.objects
        ? await deleteAvatarObjectConfirmed(clients.objects, `${avatar.ownerId}/${avatar.avatarId}`)
        : false;
      if (objectOk) objectsRemoved += 1;
    }
    if (!fileOk || !objectOk) {
      // The registry (this entry's only URI) is cleared by the caller right
      // after this purge, so the unconfirmed artifact must survive in the
      // cleanup queue — including the avatar that was CURRENT at deletion.
      // The owner is recorded only while the object deletion itself is
      // unconfirmed; an object that is confirmed gone must never be retried
      // (its known missing-object response would keep the record forever).
      const queued = await enqueueAvatarCleanup(
        {
          avatarId: avatar.avatarId,
          uri: avatar.uri,
          ...(avatar.ownerId && !objectOk ? { ownerId: avatar.ownerId } : {}),
        },
        storage,
      );
      if (!queued) {
        // The queue rejected the record (storage failure or full even after a
        // sweep): the caller must retain this entry's reference.
        unretained.push({ avatar, objectUnconfirmed: !objectOk });
      }
    }
  }
  return { filesRemoved, objectsRemoved, unretained };
}

/**
 * Drain the persisted pending-cleanup queue: retry every artifact whose
 * deletion was not confirmed when it was superseded, and forget exactly those
 * whose deletions are now confirmed. A record stays queued when any required
 * deleter is absent or reports failure, so a real I/O failure is always
 * retried later (startup, replacement, removal, account deletion) instead of
 * being silently untracked. A PARTIAL success downgrades instead of stalling:
 * when the object deletion is confirmed but the file is not, the owner-scoped
 * record is replaced — in one synchronous read-modify-write — by a file-only
 * record, because retrying the known-missing object on every sweep could
 * otherwise keep the record forever. Returns how many records drained and
 * remain.
 */
export async function sweepPendingAvatarCleanups(
  storage: AvatarRegistryStorage | null = deviceStorage(),
  clients?: AvatarCleanupDeleters,
): Promise<{ drained: number; remaining: number }> {
  const pending = listPendingAvatarCleanups(storage);
  if (pending.length === 0) return { drained: 0, remaining: 0 };
  const resolved = clients ?? (await resolveAvatarCleanupDeleters()) ?? {};
  const drained: PendingAvatarCleanup[] = [];
  const downgraded: PendingAvatarCleanup[] = [];
  const remaining: PendingAvatarCleanup[] = [];
  for (const item of pending) {
    // A required deleter that is absent means the deletion cannot be verified,
    // so the record stays queued for a sweep that has the module/client. A
    // deleter that THROWS is treated as unconfirmed (the record stays), so a
    // sweep never propagates a single I/O failure and aborts the rest.
    let fileOk = false;
    let objectOk = item.ownerId ? false : true;
    if (resolved.files) {
      try {
        fileOk = (await resolved.files.deleteAvatarFile(item.uri)) === true;
      } catch {
        fileOk = false;
      }
    }
    if (item.ownerId && resolved.objects) {
      try {
        objectOk = (await resolved.objects.deleteAvatarObject(`${item.ownerId}/${item.avatarId}`)) === true;
      } catch {
        objectOk = false;
      }
    }
    if (fileOk && objectOk) {
      drained.push(item);
    } else if (item.ownerId && objectOk) {
      // The object is confirmed gone while the cached file is not: the file
      // stays tracked, but as a FILE-ONLY record (see the doc comment).
      downgraded.push(item);
    } else {
      remaining.push(item);
    }
  }
  if (drained.length > 0) removePendingAvatarCleanups(drained, storage);
  for (const item of downgraded) {
    replacePendingAvatarCleanups([item], [{ avatarId: item.avatarId, uri: item.uri }], storage);
  }
  return { drained: drained.length, remaining: remaining.length + downgraded.length };
}

/**
 * Resolve the persisted cleanup tombstones — artifact references that could be
 * neither deleted nor queued when they were created (a full queue, or storage
 * rejecting the write). Every tombstone is retried with the deleters:
 * confirmed deletions drop it; an unconfirmed one is handed to the primary
 * cleanup queue when the queue accepts it (the queue sweep then retries it);
 * otherwise it stays tombstoned for the next sweep. Called from app startup
 * alongside the queue sweep, so tombstoned references always have a consumer.
 *
 * Only the EXACT snapshot records that were resolved are removed, via
 * `removeAvatarCleanupTombstones` — which re-reads the latest store — so a
 * tombstone appended by the resolver/picker during the awaited deletion calls
 * is never clobbered by a whole-list write. Returns how many tombstones were
 * resolved (deleted or moved into the queue) and how many remain.
 */
export async function sweepAvatarCleanupTombstones(
  storage: AvatarRegistryStorage | null = deviceStorage(),
  clients?: AvatarCleanupDeleters,
): Promise<{ drained: number; remaining: number }> {
  const tombstones = listAvatarCleanupTombstones(storage);
  if (tombstones.length === 0) return { drained: 0, remaining: 0 };
  const resolved = clients ?? (await resolveAvatarCleanupDeleters()) ?? {};
  const resolvedEntries: AvatarCleanupTombstone[] = [];
  for (const tombstone of tombstones) {
    const fileOk = resolved.files
      ? await deleteAvatarFileConfirmed(resolved.files, tombstone.uri)
      : false;
    const objectOk = tombstone.ownerId
      ? (resolved.objects
        ? await deleteAvatarObjectConfirmed(resolved.objects, `${tombstone.ownerId}/${tombstone.avatarId}`)
        : false)
      : true;
    if (fileOk && objectOk) {
      resolvedEntries.push(tombstone);
      continue;
    }
    // Not confirmed: move the reference into the primary cleanup queue when
    // possible, so the regular sweep retries it. The owner is copied only
    // while the object deletion itself is unconfirmed — an object confirmed
    // gone during this sweep must not be retried as a file-only record.
    const queued = await enqueueAvatarCleanup(
      {
        avatarId: tombstone.avatarId,
        uri: tombstone.uri,
        ...(tombstone.ownerId && !objectOk ? { ownerId: tombstone.ownerId } : {}),
      },
      storage,
    );
    if (queued) resolvedEntries.push(tombstone);
  }
  if (resolvedEntries.length > 0) {
    // The latest store is re-read inside; only the exact resolved records are
    // removed, leaving any concurrently appended tombstones untouched.
    removeAvatarCleanupTombstones(resolvedEntries, storage);
  }
  return { drained: resolvedEntries.length, remaining: tombstones.length - resolvedEntries.length };
}

/**
 * A raw Supabase-like storage client, decoupled from the app's typed client so
 * the deleter stays unit-testable. Mirrors the `storage.from().remove()` shape.
 */
export interface AvatarStorageBackend {
  removeAvatarObject(objectPath: string): Promise<boolean>;
}

/**
 * The production file deleter. Loads `expo-file-system` dynamically so the
 * account-deletion path compiles without it and degrades when the module is
 * absent. `true` is reported ONLY when the cached file is confirmed gone: an
 * already-missing file is success (the cleanup goal is "no cached avatar image
 * remains"), while a deletion that throws — a real I/O failure — returns
 * `false` so the caller keeps a retryable cleanup reference instead of
 * untracking bytes that may still be on disk.
 *
 * The dynamic module is typed against the real `expo-file-system` types so an
 * SDK-shape change (for example `File.exists` flipping between a method and a
 * property) breaks the typecheck instead of silently misbehaving at runtime.
 */
export async function avatarFileDeleter(): Promise<AvatarFileDeleter | null> {
  try {
    const { File } = await import(
      'expo-file-system' as unknown as string
    ) as typeof import('expo-file-system');
    return {
      deleteAvatarFile: async (uri) => {
        try {
          const file = new File(uri);
          // SDK 54: `exists` is a boolean PROPERTY, and `delete()` throws when
          // the file is missing — so the guard is both a success shortcut for
          // an already-removed file and a mandatory precondition for delete().
          if (!file.exists) return true;
          file.delete();
          return true;
        } catch {
          // A real deletion failure (or an unresolvable uri): never report
          // success, so the caller retains the cleanup reference for retry.
          return false;
        }
      },
    };
  } catch {
    return null;
  }
}

/**
 * The production object deleter. Removes the owner-scoped object from the avatar
 * upload bucket via the configured Supabase client, or degrades to null when
 * Supabase is not configured.
 */
export async function avatarStorageDeleter(): Promise<AvatarStorageDeleter | null> {
  if (!supabase) return null;
  const backend: AvatarStorageBackend = {
    removeAvatarObject: async (objectPath) => {
      const { error } = await supabase!.storage.from(AVATAR_UPLOAD_BUCKET).remove([objectPath]);
      return !error;
    },
  };
  return {
    deleteAvatarObject: (objectPath) => backend.removeAvatarObject(objectPath),
  };
}

/** Resolve both production deleters; returns null when neither can be loaded. */
export async function resolveAvatarCleanupDeleters(): Promise<AvatarCleanupDeleters | null> {
  const [files, objects] = await Promise.all([avatarFileDeleter(), avatarStorageDeleter()]);
  if (!files && !objects) return null;
  const clients: AvatarCleanupDeleters = {};
  if (files) clients.files = files;
  if (objects) clients.objects = objects;
  return clients;
}
