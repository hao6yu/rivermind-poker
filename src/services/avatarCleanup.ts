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
 * removes the hosted object. Both degrade to "absent" when the module or the
 * configured client is missing, so a partial cleanup never throws.
 */
import {
  listUploadedAvatars,
  type AvatarRegistryStorage,
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

/**
 * Delete one uploaded avatar's cached file and hosted object. `true` is
 * returned only when every requested deletion actually succeeded; a deletable
 * that is absent is neutral (never a failure), so callers can pass only the
 * artifacts that exist on the current device.
 */
export async function clearSingleUploadedAvatar(
  avatar: UploadedAvatar,
  clients: AvatarCleanupDeleters = {},
): Promise<boolean> {
  const [fileOk, objectOk] = await Promise.all([
    clients.files?.deleteAvatarFile(avatar.uri),
    // The hosted object is stored at the bucket path (`avatarId`); the registry
    // `objectPath` is the room-scoped `belongsToRoom` marker and is NOT the path.
    clients.objects?.deleteAvatarObject(avatar.avatarId),
  ]);
  const fileResult = clients.files ? fileOk === true : true;
  const objectResult = clients.objects ? objectOk === true : true;
  return fileResult && objectResult;
}

/**
 * Delete every uploaded avatar's cached file and hosted object across the
 * device, returning how many of each were actually removed. This is the local
 * and hosted side of "complete" cleanup; the registry itself is cleared
 * separately by the account-deletion path, so this function never mutates the
 * persisted metadata — it only destroys the file and object artifacts.
 */
export async function purgeUploadedAvatarArtifacts(
  storage: AvatarRegistryStorage | null = deviceStorage(),
  clients: AvatarCleanupDeleters = {},
): Promise<{ filesRemoved: number; objectsRemoved: number }> {
  const all = listUploadedAvatars(storage);
  let filesRemoved = 0;
  let objectsRemoved = 0;
  for (const avatar of all) {
    if (clients.files) {
      const ok = await clients.files.deleteAvatarFile(avatar.uri);
      if (ok) filesRemoved += 1;
    }
    if (clients.objects) {
      const ok = await clients.objects.deleteAvatarObject(avatar.avatarId);
      if (ok) objectsRemoved += 1;
    }
  }
  return { filesRemoved, objectsRemoved };
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
 * absent. A missing cached file is treated as success: the cleanup goal is
 * "no cached avatar image remains".
 */
export async function avatarFileDeleter(): Promise<AvatarFileDeleter | null> {
  try {
    const mod = await import('expo-file-system' as unknown as string);
    // `expo-file-system` exposes `FileSystem` as its default (and named) export.
    const loaded = mod as unknown as {
      FileSystem?: { deleteAsync?: (uri: string) => Promise<{ error?: string }> };
      default?: { deleteAsync?: (uri: string) => Promise<{ error?: string }> };
    };
    const FileSystem = loaded.FileSystem ?? loaded.default;
    const deleteAsync = FileSystem?.deleteAsync;
    if (!deleteAsync) return null;
    return {
      deleteAvatarFile: async (uri) => {
        try {
          const { error } = await deleteAsync(uri);
          return !error;
        } catch {
          // A delete that throws (e.g. the file was already gone) still leaves
          // no cached image, which is the cleanup goal.
          return true;
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
