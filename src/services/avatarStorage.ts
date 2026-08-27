import type { AvatarUploadDescriptor } from '../domain/avatarProcessing';
import {
  BOUNDED_AVATAR_ID,
  type HumanAvatarReference,
} from '../domain/playerProfile';

/**
 * Persisted registry of uploaded human avatars.
 *
 * The profile carries only a bounded avatar identifier plus a version. The
 * object path, cached image URI, and processing descriptor are kept here so
 * nothing client-owned leaks into profile or multiplayer state. This store is
 * account-bound data and is cleared on account deletion.
 */
export const AVATAR_REGISTRY_STORAGE_KEY = 'rivermind.avatar-registry.v1';

export interface UploadedAvatar {
  avatarId: string;
  version: number;
  /** Owner-scoped object path in the upload bucket. Local only. */
  objectPath: string;
  /** Cached image URI. Local only. */
  uri: string;
  descriptor: AvatarUploadDescriptor;
  savedAtMs: number;
}

/** A reference to a persisted uploaded avatar: the same shape the wire carries. */
export type UploadedAvatarReference = HumanAvatarReference & { kind: 'uploaded' };

/**
 * A persisted, localStorage-like registry store. Tests inject a
 * memory-backed implementation; production injects `localStorage`.
 */
export interface AvatarRegistryStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function deviceStorage(): AvatarRegistryStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function normalizeEntry(value: unknown): UploadedAvatar | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.avatarId !== 'string'
    || !BOUNDED_AVATAR_ID.test(entry.avatarId)
    || typeof entry.objectPath !== 'string'
    || typeof entry.uri !== 'string'
    || typeof entry.version !== 'number'
    || typeof entry.savedAtMs !== 'number'
  ) {
    return null;
  }
  const descriptor = normalizeDescriptor(entry.descriptor);
  if (!descriptor) return null;
  return {
    avatarId: entry.avatarId,
    objectPath: entry.objectPath,
    uri: entry.uri,
    version: entry.version,
    descriptor,
    savedAtMs: entry.savedAtMs,
  };
}

function normalizeDescriptor(value: unknown): AvatarUploadDescriptor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    typeof source.avatarId !== 'string'
    || typeof source.version !== 'number'
    || typeof source.mime !== 'string'
    || typeof source.bytes !== 'number'
    || typeof source.width !== 'number'
    || typeof source.height !== 'number'
  ) {
    return null;
  }
  return {
    avatarId: source.avatarId,
    version: source.version,
    mime: source.mime as AvatarUploadDescriptor['mime'],
    bytes: source.bytes,
    width: source.width,
    height: source.height,
  };
}

/** The current registry: a copy of persisted entries, or an empty array. */
function list(storage: AvatarRegistryStorage | null = deviceStorage()): UploadedAvatar[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(AVATAR_REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as unknown;
    if (!Array.isArray(entries)) return [];
    return entries.map(normalizeEntry).filter((entry): entry is UploadedAvatar => entry !== null);
  } catch {
    return [];
  }
}

function persist(all: UploadedAvatar[], storage: AvatarRegistryStorage | null = deviceStorage()): void {
  try {
    storage?.setItem(AVATAR_REGISTRY_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // A non-persistent store simply cannot retain the registry this session.
  }
}

/** Register (or replace) a persisted uploaded avatar. */
export function persistUploadedAvatar(
  avatar: UploadedAvatar,
  storage: AvatarRegistryStorage | null = deviceStorage(),
): UploadedAvatar {
  const all = list(storage);
  const next = all.filter((entry) => entry.avatarId !== avatar.avatarId);
  next.push(avatar);
  persist(next, storage);
  return avatar;
}

/** Resolve a persisted uploaded avatar by its bounded identifier. */
export function getUploadedAvatar(
  avatarId: string,
  storage: AvatarRegistryStorage | null = deviceStorage(),
): UploadedAvatar | null {
  return list(storage).find((entry) => entry.avatarId === avatarId) ?? null;
}

/** Every persisted uploaded avatar. */
export function listUploadedAvatars(storage: AvatarRegistryStorage | null = deviceStorage()): UploadedAvatar[] {
  return list(storage);
}

/** Remove one persisted uploaded avatar by identifier. */
export function removeUploadedAvatar(
  avatarId: string,
  storage: AvatarRegistryStorage | null = deviceStorage(),
): boolean {
  const all = list(storage);
  if (!all.some((entry) => entry.avatarId === avatarId)) return false;
  persist(all.filter((entry) => entry.avatarId !== avatarId), storage);
  return true;
}

/** Remove every persisted uploaded avatar; returns the count removed. */
export function clearUploadedAvatars(storage: AvatarRegistryStorage | null = deviceStorage()): number {
  // The count reflects what the registry held before removal. The key is
  // always cleared — even when it holds no valid avatar yet — so account
  // deletion cannot leave stale avatar metadata behind.
  const all = list(storage);
  try {
    storage?.removeItem(AVATAR_REGISTRY_STORAGE_KEY);
  } catch {
    // A non-persistent store has nothing to remove.
  }
  return all.length;
}
