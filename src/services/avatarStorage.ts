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

/**
 * Persisted cleanup queue for avatar artifacts whose deletion could not be
 * confirmed when they were superseded (a failed replacement/removal purge, or
 * a cached file the resolver could not delete). The registry entry is
 * authoritative for what RENDERS; this queue is the retry source for what must
 * be DELETED, so a real I/O failure never silently drops the reference to an
 * orphaned cached file or hosted object. Swept on startup, replacement,
 * removal, and account deletion; entries stay until their deletion is
 * confirmed, so failed deletions survive even account deletion and are retried
 * on the next sweep.
 */
export const AVATAR_CLEANUP_QUEUE_STORAGE_KEY = 'rivermind.avatar-cleanup-queue.v1';

/** Largest persisted cleanup queue; enforced by sweep-then-reject, never by eviction. */
export const MAX_PENDING_CLEANUPS = 500;

/**
 * Persisted cleanup tombstones — the final fail-closed fallback for artifact
 * references that could be neither deleted NOR recorded in the cleanup queue
 * (the queue was full even after a sweep, or storage rejected the write).
 * Unlike the queue, tombstones are never evicted: the app-startup sweep
 * resolves each one — deleting the artifacts when deleters confirm them, or
 * moving the reference into the queue when a slot frees — so a tombstone is a
 * retry source with its own consumer, independent of the account registry
 * (which may already be cleared). The store is device-global and survives
 * account deletion by design.
 */
export const AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY = 'rivermind.avatar-cleanup-tombstones.v1';

export interface UploadedAvatar {
  avatarId: string;
  version: number;
  /**
   * The authenticated id that owns the hosted object (`${ownerId}/${avatarId}`),
   * or `undefined` for a resolved foreign avatar this device merely cached.
   * Distinguishes a self-uploaded avatar (which owns its bucket object) from a
   * room-resolved avatar (which does not), so cleanup removes the right object.
   */
  ownerId?: string;
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
  const ownerId =
    typeof entry.ownerId === 'string' && entry.ownerId.length > 0
      ? entry.ownerId
      : undefined;
  const descriptor = normalizeDescriptor(entry.descriptor);
  if (!descriptor) return null;
  return {
    avatarId: entry.avatarId,
    version: entry.version,
    ownerId,
    objectPath: entry.objectPath,
    uri: entry.uri,
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
  persistUploadedAvatarConfirmed(avatar, storage);
  return avatar;
}

/**
 * Persist an uploaded avatar; `true` ONLY when the storage layer accepted the
 * write. A throwing or unavailable store reports failure — never success — so
 * a caller that relies on the write (for example the ownership marker of a
 * confirmed hosted object) can compensate instead of silently losing the
 * record.
 */
export function persistUploadedAvatarConfirmed(
  avatar: UploadedAvatar,
  storage: AvatarRegistryStorage | null = deviceStorage(),
): boolean {
  if (!storage) return false;
  const all = list(storage);
  const next = all.filter((entry) => entry.avatarId !== avatar.avatarId);
  next.push(avatar);
  try {
    storage.setItem(AVATAR_REGISTRY_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** Resolve a persisted uploaded avatar by its bounded identifier. */
export function getUploadedAvatar(
  avatarId: string,
  storage: AvatarRegistryStorage | null = deviceStorage(),
): UploadedAvatar | null {
  return list(storage).find((entry) => entry.avatarId === avatarId) ?? null;
}

/**
 * A remote-resolved cache entry belongs to the room it was resolved under. The
 * object path carries the `signed:<roomId>:` marker the resolver writes, so a
 * registry lookup can prove which room authorized a cached image.
 */
export function belongsToRoom(entry: UploadedAvatar, roomId: string): boolean {
  return typeof entry.objectPath === 'string'
    && entry.objectPath.startsWith(`signed:${roomId}:`);
}

/**
 * Whether a registry entry may be *rendered*. This is the render-time
 * authorization boundary: the device's own avatar (created locally, or owned
 * by this device's account) renders anywhere; a foreign, room-resolved avatar
 * renders only inside the room it was resolved under. An entry cached under
 * another room, or a foreign entry rendered without any room context, is not
 * authorized and must fall back to initials.
 */
export function isRenderableUploadedAvatar(entry: UploadedAvatar, roomId?: string): boolean {
  if (typeof entry.ownerId === 'string' && entry.ownerId.length > 0) return true;
  if (entry.objectPath.startsWith('local:')) return true;
  return roomId != null && belongsToRoom(entry, roomId);
}

/**
 * Resolve a persisted uploaded avatar *only when it is authorized to render in
 * the given context*. `roomId` is required for a foreign (room-resolved)
 * avatar; the device's own avatar resolves without one. Returns `null` for an
 * entry that exists but was authorized in a different room, so the caller's
 * seat falls back to initials instead of rendering another room's cached image.
 */
export function getRenderableUploadedAvatar(
  avatarId: string,
  roomId?: string,
  storage: AvatarRegistryStorage | null = deviceStorage(),
): UploadedAvatar | null {
  const entry = getUploadedAvatar(avatarId, storage);
  return entry && isRenderableUploadedAvatar(entry, roomId) ? entry : null;
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

/** One artifact whose deletion has not yet been confirmed, awaiting a sweep. */
export interface PendingAvatarCleanup {
  /** The registry avatar the artifact belonged to. */
  avatarId: string;
  /** The cached processed image file that must be deleted. */
  uri: string;
  /**
   * The hosted object's owner, when a self-uploaded object (`${ownerId}/${avatarId}`)
   * must also be removed. Absent for a room-resolved foreign cache.
   */
  ownerId?: string;
  enqueuedAtMs: number;
}

function normalizePending(value: unknown): PendingAvatarCleanup | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.avatarId !== 'string'
    || !BOUNDED_AVATAR_ID.test(entry.avatarId)
    || typeof entry.uri !== 'string'
    || entry.uri.length === 0
    || typeof entry.enqueuedAtMs !== 'number'
  ) {
    return null;
  }
  const ownerId =
    typeof entry.ownerId === 'string' && entry.ownerId.length > 0
      ? entry.ownerId
      : undefined;
  return {
    avatarId: entry.avatarId,
    uri: entry.uri,
    ownerId,
    enqueuedAtMs: entry.enqueuedAtMs,
  };
}

function listPending(storage: AvatarRegistryStorage | null = deviceStorage()): PendingAvatarCleanup[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(AVATAR_CLEANUP_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as unknown;
    if (!Array.isArray(entries)) return [];
    return entries
      .map(normalizePending)
      .filter((entry): entry is PendingAvatarCleanup => entry !== null);
  } catch {
    return [];
  }
}

/**
 * Persist the queue; `true` only when the storage layer accepted the write.
 * A throwing or unavailable store reports failure instead of silently losing
 * the cleanup references.
 */
function persistPending(
  pending: PendingAvatarCleanup[],
  storage: AvatarRegistryStorage | null = deviceStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AVATAR_CLEANUP_QUEUE_STORAGE_KEY, JSON.stringify(pending));
    return true;
  } catch {
    // A throwing store (quota, security, unavailable) cannot retain the queue.
    return false;
  }
}

/** Every persisted pending-cleanup record. */
export function listPendingAvatarCleanups(
  storage: AvatarRegistryStorage | null = deviceStorage(),
): PendingAvatarCleanup[] {
  return listPending(storage);
}

/**
 * Record an artifact whose deletion could not be confirmed, so a later sweep
 * can retry it. Duplicates (same file uri and object owner) collapse into one
 * record. `true` is returned ONLY when the record is durably persisted: a
 * storage failure (or unavailable storage) and a full queue both report
 * `false`, so the caller knows the reference is NOT retained and must keep it
 * another way.
 *
 * The queue is bounded but NEVER silently evicts: when it is already at
 * `MAX_PENDING_CLEANUPS`, a sweep is attempted first (confirmed deletions
 * drain and make room), and if it is STILL full the new record is rejected.
 * Existing records — including the oldest — are left untouched.
 */
export async function enqueueAvatarCleanup(
  cleanup: Omit<PendingAvatarCleanup, 'enqueuedAtMs'>,
  storage: AvatarRegistryStorage | null = deviceStorage(),
): Promise<boolean> {
  const normalized = normalizePending({ ...cleanup, enqueuedAtMs: 0 });
  if (!normalized) return false;
  const pending = listPending(storage);
  if (pending.some((item) => item.uri === normalized.uri && item.ownerId === normalized.ownerId)) {
    // Already tracked: nothing new to retain.
    return true;
  }
  if (pending.length >= MAX_PENDING_CLEANUPS) {
    // Loaded lazily to avoid a static import cycle (avatarCleanup sweeps this
    // queue). Sweep with the production deleters first: any record whose
    // deletion is now confirmed drains and frees a slot.
    const { sweepPendingAvatarCleanups } = await import('./avatarCleanup');
    await sweepPendingAvatarCleanups(storage);
    if (listPending(storage).length >= MAX_PENDING_CLEANUPS) {
      // Still full: fail closed. Existing records — including the oldest — are
      // left untouched; the caller keeps the reference another way.
      return false;
    }
  }
  const next = listPending(storage);
  next.push({ ...normalized, enqueuedAtMs: Date.now() });
  return persistPending(next, storage);
}

/** Forget the given records (only after their deletions were confirmed). */
export function removePendingAvatarCleanups(
  cleanups: PendingAvatarCleanup[],
  storage: AvatarRegistryStorage | null = deviceStorage(),
): void {
  if (cleanups.length === 0) return;
  const doomed = new Set(cleanups.map((item) => `${item.uri}\u0000${item.ownerId ?? ''}`));
  const remaining = listPending(storage).filter(
    (item) => !doomed.has(`${item.uri}\u0000${item.ownerId ?? ''}`),
  );
  if (remaining.length === 0) {
    // A fully drained queue leaves no key behind, so account deletion and
    // sweeps observe an absent queue rather than an empty array.
    try {
      storage?.removeItem(AVATAR_CLEANUP_QUEUE_STORAGE_KEY);
    } catch {
      // A non-persistent store has nothing to remove.
    }
    return;
  }
  persistPending(remaining, storage);
}

/**
 * Replace the given pending records with file-only replacements, in one
 * synchronous read-modify-write (no await between the read and the write, so
 * nothing can be clobbered in between). Used by the sweep when an object
 * deletion is confirmed while the file is not: the owner-scoped record would
 * retry the known-missing object forever, so it is swapped for a file-only
 * record that drains as soon as the cached file is gone.
 */
export function replacePendingAvatarCleanups(
  original: PendingAvatarCleanup[],
  replacement: Omit<PendingAvatarCleanup, 'enqueuedAtMs'>[],
  storage: AvatarRegistryStorage | null = deviceStorage(),
): void {
  if (original.length === 0) return;
  const doomed = new Set(original.map((item) => `${item.uri}\u0000${item.ownerId ?? ''}`));
  const current = listPending(storage).filter(
    (item) => !doomed.has(`${item.uri}\u0000${item.ownerId ?? ''}`),
  );
  const known = new Set(current.map((item) => `${item.uri}\u0000${item.ownerId ?? ''}`));
  for (const item of replacement) {
    const key = `${item.uri}\u0000${item.ownerId ?? ''}`;
    if (!known.has(key)) {
      known.add(key);
      current.push({ ...item, enqueuedAtMs: Date.now() });
    }
  }
  if (current.length === 0) {
    try {
      storage?.removeItem(AVATAR_CLEANUP_QUEUE_STORAGE_KEY);
    } catch {
      // A non-persistent store has nothing to remove.
    }
    return;
  }
  persistPending(current, storage);
}

/**
 * Convert every pending record owned by `ownerId` to a file-only record
 * (deduplicated against any existing file-only record for the same uri).
 * Used after a confirmed remote account deletion: the server removed the
 * deleted user's objects, so their records must never retry the
 * unverifiable-but-gone objects again. Returns the number of records
 * converted; a store that rejects the write leaves the records untouched.
 */
export function stripOwnerFromPendingAvatarCleanups(
  ownerId: string,
  storage: AvatarRegistryStorage | null = deviceStorage(),
): number {
  const current = listPending(storage);
  let converted = 0;
  const next: PendingAvatarCleanup[] = [];
  const seen = new Set<string>();
  for (const item of current) {
    const candidate =
      item.ownerId === ownerId
        ? { avatarId: item.avatarId, uri: item.uri, enqueuedAtMs: item.enqueuedAtMs }
        : item;
    if (candidate !== item) converted += 1;
    const key = `${candidate.uri}\u0000${candidate.ownerId ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      next.push(candidate);
    }
  }
  if (converted === 0) return 0;
  if (next.length === 0) {
    try {
      storage?.removeItem(AVATAR_CLEANUP_QUEUE_STORAGE_KEY);
    } catch {
      // A non-persistent store has nothing to remove.
    }
  } else {
    persistPending(next, storage);
  }
  return converted;
}

/** A retained artifact reference awaiting deletion (see the tombstone store). */
export interface AvatarCleanupTombstone {
  avatarId: string;
  uri: string;
  ownerId?: string;
}

function normalizeTombstone(value: unknown): AvatarCleanupTombstone | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.avatarId !== 'string'
    || !BOUNDED_AVATAR_ID.test(entry.avatarId)
    || typeof entry.uri !== 'string'
    || entry.uri.length === 0
  ) {
    return null;
  }
  const ownerId =
    typeof entry.ownerId === 'string' && entry.ownerId.length > 0
      ? entry.ownerId
      : undefined;
  return { avatarId: entry.avatarId, uri: entry.uri, ownerId };
}

function listTombstones(storage: AvatarRegistryStorage | null = deviceStorage()): AvatarCleanupTombstone[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as unknown;
    if (!Array.isArray(entries)) return [];
    return entries
      .map(normalizeTombstone)
      .filter((entry): entry is AvatarCleanupTombstone => entry !== null);
  } catch {
    return [];
  }
}

/** Every persisted cleanup tombstone. */
export function listAvatarCleanupTombstones(
  storage: AvatarRegistryStorage | null = deviceStorage(),
): AvatarCleanupTombstone[] {
  return listTombstones(storage);
}

/**
 * Persist the tombstone list; `true` only when the storage layer accepted the
 * write. An empty list removes the key (a fully resolved store leaves no key
 * behind). An unavailable/throwing store reports failure — never success.
 */
export function persistAvatarCleanupTombstones(
  tombstones: AvatarCleanupTombstone[],
  storage: AvatarRegistryStorage | null = deviceStorage(),
): boolean {
  if (!storage) return false;
  try {
    if (tombstones.length === 0) {
      storage.removeItem(AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY);
    } else {
      storage.setItem(AVATAR_CLEANUP_TOMBSTONES_STORAGE_KEY, JSON.stringify(tombstones));
    }
    return true;
  } catch {
    return false;
  }
}

/** Forget the given tombstones (only after their references were secured). */
export function removeAvatarCleanupTombstones(
  tombstones: AvatarCleanupTombstone[],
  storage: AvatarRegistryStorage | null = deviceStorage(),
): void {
  if (tombstones.length === 0) return;
  const doomed = new Set(tombstones.map((item) => `${item.uri}\u0000${item.ownerId ?? ''}`));
  // The LATEST store is re-read here, so a tombstone appended after the
  // caller's snapshot was taken is never clobbered — only the exact records
  // listed are removed.
  persistAvatarCleanupTombstones(
    listTombstones(storage).filter((item) => !doomed.has(`${item.uri}\u0000${item.ownerId ?? ''}`)),
    storage,
  );
}

/**
 * Convert every tombstone owned by `ownerId` to a file-only tombstone
 * (deduplicated against any existing file-only tombstone for the same uri).
 * Used after a confirmed remote account deletion: the server removed the
 * deleted user's objects, so their tombstones must never retry the
 * unverifiable-but-gone objects again. Returns the number of tombstones
 * converted; a store that rejects the write leaves them untouched.
 */
export function stripOwnerFromAvatarCleanupTombstones(
  ownerId: string,
  storage: AvatarRegistryStorage | null = deviceStorage(),
): number {
  const current = listTombstones(storage);
  let converted = 0;
  const next: AvatarCleanupTombstone[] = [];
  const seen = new Set<string>();
  for (const item of current) {
    const candidate =
      item.ownerId === ownerId
        ? { avatarId: item.avatarId, uri: item.uri }
        : item;
    if (candidate !== item) converted += 1;
    const key = `${candidate.uri}\u0000${candidate.ownerId ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      next.push(candidate);
    }
  }
  if (converted === 0) return 0;
  persistAvatarCleanupTombstones(next, storage);
  return converted;
}

/**
 * Append cleanup tombstones NON-destructively: the latest persisted store is
 * re-read, the new records are merged in (deduplicated by file uri + owner),
 * and the merged list is written in a single call. A whole-list writer can
 * never discard tombstones added earlier — each writer merges instead of
 * replacing. `true` only when the write was accepted.
 */
export function addAvatarCleanupTombstones(
  tombstones: AvatarCleanupTombstone[],
  storage: AvatarRegistryStorage | null = deviceStorage(),
): boolean {
  if (tombstones.length === 0) return true;
  const current = listTombstones(storage);
  const known = new Set(current.map((item) => `${item.uri}\u0000${item.ownerId ?? ''}`));
  const merged = [...current];
  for (const tombstone of tombstones) {
    const key = `${tombstone.uri}\u0000${tombstone.ownerId ?? ''}`;
    if (!known.has(key)) {
      known.add(key);
      merged.push(tombstone);
    }
  }
  return persistAvatarCleanupTombstones(merged, storage);
}

/**
 * Durably retain a cleanup reference that the queue alone cannot hold: the
 * cleanup queue is tried first; when it rejects the record (full even after a
 * sweep, or storage failure), the reference falls back to the persisted
 * tombstone store (merged non-destructively). `true` means the reference is
 * retained somewhere the sweeps read — the queue or the tombstones; `false`
 * means neither could persist it and the caller must not discard the
 * reference.
 */
export async function retainAvatarCleanupReference(
  cleanup: Omit<PendingAvatarCleanup, 'enqueuedAtMs'>,
  storage: AvatarRegistryStorage | null = deviceStorage(),
): Promise<boolean> {
  if (await enqueueAvatarCleanup(cleanup, storage)) return true;
  const normalized = normalizePending({ ...cleanup, enqueuedAtMs: 0 });
  if (!normalized) return false;
  return addAvatarCleanupTombstones(
    [
      {
        avatarId: normalized.avatarId,
        uri: normalized.uri,
        ...(normalized.ownerId ? { ownerId: normalized.ownerId } : {}),
      },
    ],
    storage,
  );
}
