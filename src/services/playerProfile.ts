import 'expo-sqlite/localStorage/install';

import {
  DEFAULT_HUMAN_AVATAR,
  DEFAULT_PLAYER_DISPLAY_NAME,
  fallbackInitialsFor,
  isValidPlayerDisplayName,
  normalizeHumanIdentity,
  normalizePlayerDisplayName,
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
  PLAYER_DISPLAY_NAME_MIN_LENGTH,
  PLAYER_DISPLAY_NAME_PRESETS,
  type HumanAvatarReference,
  type HumanAvatarSnapshot,
  type PlayerDisplayName,
  type SavedPlayerProfile,
} from '../domain/playerProfile';

export {
  DEFAULT_HUMAN_AVATAR,
  DEFAULT_PLAYER_DISPLAY_NAME,
  fallbackInitialsFor,
  isValidPlayerDisplayName,
  normalizePlayerDisplayName,
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
  PLAYER_DISPLAY_NAME_MIN_LENGTH,
  PLAYER_DISPLAY_NAME_PRESETS,
  type HumanAvatarReference,
  type PlayerDisplayName,
  type SavedPlayerProfile,
} from '../domain/playerProfile';

/**
 * A single, versioned, serializable profile holding the display name and the
 * avatar reference. The profile is one blob so name and avatar stay in sync:
 * `savePlayerDisplayName` preserves the avatar, and avatar save preserves the
 * name. Legacy v1 blobs (name only) are migrated to v2 on load with the
 * authored default avatar; v2 blobs are validated before they are accepted.
 */
export const PLAYER_PROFILE_STORAGE_KEY = 'rivermind.player-profile.v2';
/** The pre-avatar v1 profile blob, still readable for lazy migration. */
export const PLAYER_PROFILE_LEGACY_KEY = 'rivermind.player-profile.v1';

let memoryProfile: SavedPlayerProfile | null = null;

interface PlayerProfileStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function deviceStorage(): PlayerProfileStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

/** A parsed v2 profile, or null when the blob is corrupt/arbitrary. */
function parseProfile(value: unknown): SavedPlayerProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const identity = normalizeHumanIdentity({
    displayName: typeof (value as Record<string, unknown>).displayName === 'string'
      ? ((value as Record<string, unknown>).displayName as string)
      : '',
    avatar: (value as Record<string, unknown>).avatar as HumanAvatarSnapshot,
  });
  if (!identity.ok) return null;
  return { version: 2, displayName: identity.displayName, avatar: identity.avatar };
}

/**
 * Migrate a legacy v1 blob (`{ displayName, version: 1 }`) to v2. The name is
 * validated the same way a fresh name is, and the authored default avatar is
 * attached so existing users are not silently unavatared.
 */
function migrateLegacy(value: unknown): SavedPlayerProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  if (profile.version !== 1 || typeof profile.displayName !== 'string') return null;
  const displayName = normalizePlayerDisplayName(profile.displayName);
  return isValidPlayerDisplayName(displayName)
    ? { version: 2, displayName, avatar: DEFAULT_HUMAN_AVATAR }
    : null;
}

function readProfileBlob(storage: PlayerProfileStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function load(storage: PlayerProfileStorage | null = deviceStorage()): SavedPlayerProfile | null {
  if (!storage) return memoryProfile;
  // Prefer the current v2 profile; fall back to a legacy v1 blob (name only),
  // which is migrated on read and re-persisted on the next write.
  const current = readProfileBlob(storage, PLAYER_PROFILE_STORAGE_KEY);
  if (current != null) {
    const profile = parseProfile(current) ?? migrateLegacy(current);
    if (profile) return profile;
  }
  const legacy = readProfileBlob(storage, PLAYER_PROFILE_LEGACY_KEY);
  if (legacy != null) {
    const profile = migrateLegacy(legacy);
    if (profile) return profile;
  }
  return null;
}

function persist(profile: SavedPlayerProfile, storage: PlayerProfileStorage | null = deviceStorage()): SavedPlayerProfile {
  memoryProfile = profile;
  try {
    storage?.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // The in-memory profile still supports the current app session.
  }
  return profile;
}

/**
 * Save a full profile (display name + avatar). Rejects an invalid avatar so a
 * corrupt reference can never overwrite a valid persisted profile.
 */
export function savePlayerProfile(
  profile: SavedPlayerProfile,
  storage: PlayerProfileStorage | null = deviceStorage(),
): SavedPlayerProfile | null {
  const parsed = parseProfile(profile);
  return parsed ? persist(parsed, storage) : null;
}

/** Save (or replace) the avatar on the current profile, keeping the display name. */
export function saveHumanAvatar(
  avatar: HumanAvatarReference,
  storage: PlayerProfileStorage | null = deviceStorage(),
): SavedPlayerProfile | null {
  const current = load(storage)
    ?? { version: 2, displayName: DEFAULT_PLAYER_DISPLAY_NAME, avatar: DEFAULT_HUMAN_AVATAR };
  const profile = parseProfile({ version: 2, displayName: current.displayName, avatar });
  return profile ? persist(profile, storage) : null;
}

/**
 * Load the persisted profile. `memoryProfile` is the session fallback when no
 * storage is available (the multiplayer entry modal and App shell read from it).
 */
export function loadPlayerProfile(
  storage: PlayerProfileStorage | null = deviceStorage(),
): SavedPlayerProfile | null {
  const profile = load(storage);
  memoryProfile = profile;
  return profile;
}

export function loadPlayerDisplayName(
  storage: PlayerProfileStorage | null = deviceStorage(),
): string {
  return loadPlayerProfile(storage)?.displayName ?? '';
}

export function loadHumanAvatar(
  storage: PlayerProfileStorage | null = deviceStorage(),
): HumanAvatarReference | null {
  return loadPlayerProfile(storage)?.avatar ?? null;
}

/**
 * Save the display name, preserving any persisted avatar. Returns the saved
 * name, or '' when the name is invalid (the profile is left untouched).
 */
export function savePlayerDisplayName(
  value: string,
  storage: PlayerProfileStorage | null = deviceStorage(),
): string {
  const displayName = normalizePlayerDisplayName(value);
  if (!isValidPlayerDisplayName(displayName)) return '';
  const current = load(storage);
  const profile: SavedPlayerProfile = {
    version: 2,
    displayName,
    avatar: current?.avatar ?? DEFAULT_HUMAN_AVATAR,
  };
  return persist(profile, storage).displayName;
}

export function clearPlayerDisplayName(
  storage: PlayerProfileStorage | null = deviceStorage(),
): void {
  memoryProfile = null;
  try {
    // Purge both the legacy v1 profile and the current v2 profile so no
    // identity data survives account deletion, including any unmigrated blob.
    storage?.removeItem(PLAYER_PROFILE_STORAGE_KEY);
    storage?.removeItem(PLAYER_PROFILE_LEGACY_KEY);
  } catch {
    // The in-memory identity is already cleared for this app session.
  }
}

export const playerProfileStorageContract = {
  key: PLAYER_PROFILE_STORAGE_KEY,
};
