/**
 * Versioned, serializable human identity.
 *
 * A player's identity is a display name plus an avatar reference. The name is
 * normalized and validated identically on the client and on the multiplayer
 * Edge so untrusted cross-room names are rejected in one place. Seat kind
 * (human / AI, You, Host, temporary AI control) is never derived from the name
 * or the avatar: a human may intentionally use the same name as an AI.
 *
 * The avatar is an explicit reference union. Uploaded avatars carry a bounded,
 * opaque identifier plus a version — never a local file path, signed URL, or
 * owner-scoped object path — so nothing client-owned leaks into profile or
 * multiplayer state. The object path and cached image live only in a local
 * upload registry, not in anything that is serialized or sent on the wire.
 */

/** Name length bounds. A name between these is a valid custom name. */
export const PLAYER_DISPLAY_NAME_MAX_LENGTH = 18;
export const PLAYER_DISPLAY_NAME_MIN_LENGTH = 2;

/**
 * Product-authored display-name suggestions. Preset names always remain valid
 * custom names; they are never the only valid names.
 */
export const PLAYER_DISPLAY_NAME_PRESETS = [
  'River',
  'Kai',
  'Mina',
  'Nora',
  'Iris',
  'Nova',
  'Sage',
  'Sky',
] as const;

export type PlayerDisplayName = typeof PLAYER_DISPLAY_NAME_PRESETS[number];
export const DEFAULT_PLAYER_DISPLAY_NAME: PlayerDisplayName = PLAYER_DISPLAY_NAME_PRESETS[0];

/**
 * Authored human avatars: authored visuals, distinct from AI avatars and from
 * the initials fallback. Each carries an accessible label and fallback
 * initials. The id doubles as the bounded avatar identifier carried on the wire.
 */
export const HUMAN_AVATAR_LIBRARY = [
  { id: 'human-ash', label: 'Ash', initials: 'AS' },
  { id: 'human-bay', label: 'Bay', initials: 'BY' },
  { id: 'human-cove', label: 'Cove', initials: 'CV' },
  { id: 'human-dawn', label: 'Dawn', initials: 'DW' },
  { id: 'human-ember', label: 'Ember', initials: 'EM' },
  { id: 'human-fern', label: 'Fern', initials: 'FN' },
] as const;

export type HumanAvatarId = (typeof HUMAN_AVATAR_LIBRARY)[number]['id'];
export const HUMAN_AVATAR_LABELS: Record<HumanAvatarId, string> = HUMAN_AVATAR_LIBRARY.reduce(
  (acc, avatar) => ({ ...acc, [avatar.id]: avatar.label }),
  {} as Record<HumanAvatarId, string>,
);
export const HUMAN_AVATAR_INITIALS: Record<HumanAvatarId, string> = HUMAN_AVATAR_LIBRARY.reduce(
  (acc, avatar) => ({ ...acc, [avatar.id]: avatar.initials }),
  {} as Record<HumanAvatarId, string>,
);
export const HUMAN_AVATAR_IDS: readonly HumanAvatarId[] = HUMAN_AVATAR_LIBRARY.map(
  (avatar) => avatar.id,
);

/**
 * An explicit avatar reference — the same bounded shape used for both local
 * profile persistence and the multiplayer wire:
 *  - authored: a stable, product-authored avatar id;
 *  - uploaded: a bounded, opaque identifier plus its version (never an object
 *    path, signed URL, or local file path);
 *  - initials: the stable fallback derived from the display name.
 */
export type HumanAvatarReference =
  | { kind: 'authored'; id: HumanAvatarId }
  | { kind: 'uploaded'; avatarId: string; version: number }
  | { kind: 'initials'; initials: string };

/** The bounded wire form. Structurally identical to the profile reference. */
export type HumanAvatarSnapshot = HumanAvatarReference;

export const DEFAULT_HUMAN_AVATAR: HumanAvatarReference = { kind: 'authored', id: 'human-ash' };

/** A persisted, versioned profile. */
export type PlayerProfileVersion = 2;

export interface SavedPlayerProfile {
  version: 2;
  displayName: string;
  avatar: HumanAvatarReference;
}

/**
 * A bounded uploaded-avatar identifier: lowercase alphanumeric, 8 to 96
 * characters. Never matches an object path, URL, or local file reference.
 */
export const BOUNDED_AVATAR_ID = /^[a-z0-9]{8,96}$/;

export type PlayerNameValidationResult =
  | { ok: true; value: string }
  | {
      ok: false;
      reason:
        | 'empty'
        | 'too-short'
        | 'too-long'
        | 'control-character'
        | 'bidi-control'
        | 'contact-information'
        | 'invalid-character';
    };

export type HumanAvatarValidationReason = 'bad-avatar' | 'oversized-avatar';

/** The rejection reasons a display name can carry. */
export type PlayerNameValidationReason = Extract<PlayerNameValidationResult, { ok: false }>['reason'];

export type HumanIdentityValidationResult =
  | { ok: true; displayName: string; avatar: HumanAvatarSnapshot }
  | { ok: false; reason: PlayerNameValidationReason | HumanAvatarValidationReason };

/**
 * Display normalization: collapse runs of whitespace to a single space and trim
 * leading/trailing whitespace. The collapsed text is returned untruncated so its
 * length is validated by `validatePlayerDisplayName`, which bounds a display
 * name to the product-authored presets and to free-form custom names within
 * `[MIN, MAX]` characters.
 */
export function normalizePlayerDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Reject control characters: C0 (U+0000–U+001F), DEL (U+007F), and C1
 * (U+0080–U+009F). Ordinary whitespace is already collapsed by
 * `normalizePlayerDisplayName`, so any surviving control byte is not human
 * intent and is dropped before a name is stored or sent on the wire.
 */
const CONTROL_CHAR = /[\u0000-\u001F\u007F-\u009F]/;

/**
 * Reject invisible, zero-width, and bidi-reformatting characters (U+200B–U+200F,
 * U+202A–U+202E, U+2060–U+206F, U+FEFF, U+180E, U+FFF8–U+FFFB). A display name
 * must never embed a byte that neutralizes, reorders, or hides its text.
 */
const BIDI_AND_FORMAT_CHAR = /[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u180E\uFFF8-\uFFFB]/;

/** Reject email, URL, and phone-shaped input, which must never be a display name. */
function looksLikeContact(value: string): boolean {
  return (
    /@/.test(value)
    || /https?:\/\//i.test(value)
    || /\d{7,}/.test(value)
    || /^[\d\s().+-]{7,}$/.test(value)
  );
}

/** A display name may only contain Unicode letters, decimal digits, and spaces. */
function hasOnlyNameCharacters(value: string): boolean {
  return /^\s*[\p{L}\p{Nd}\s]*\s*$/u.test(value);
}

/** Derive up to two uppercase initials from a display name. */
export function initialsFromName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => word.slice(0, 1).toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('');
}

/**
 * Validate and normalize a display name, identically on the client and the
 * multiplayer Edge, so untrusted cross-room names are rejected in one place.
 * A name is accepted when it is a product-authored preset or a free-form custom
 * name within `[MIN, MAX]` characters, contains no control/bidi/format byte, and
 * carries no email/URL/phone content.
 */
export function validatePlayerDisplayName(value: string): PlayerNameValidationResult {
  const normalized = normalizePlayerDisplayName(value);
  if (normalized.length === 0) return { ok: false, reason: 'empty' };
  if (CONTROL_CHAR.test(normalized)) return { ok: false, reason: 'control-character' };
  if (BIDI_AND_FORMAT_CHAR.test(normalized)) return { ok: false, reason: 'bidi-control' };
  // Contact/URL patterns are rejected before length bounds: a 19-character URL is
  // contact content, not merely a long name.
  if (looksLikeContact(normalized)) return { ok: false, reason: 'contact-information' };
  if (normalized.length < PLAYER_DISPLAY_NAME_MIN_LENGTH) {
    return { ok: false, reason: 'too-short' };
  }
  if (normalized.length > PLAYER_DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }
  if (!hasOnlyNameCharacters(normalized)) return { ok: false, reason: 'invalid-character' };
  return { ok: true, value: normalized };
}

/** True when a display name is acceptable for local storage and multiplayer entry. */
export function isValidPlayerDisplayName(value: string): boolean {
  return validatePlayerDisplayName(value).ok;
}

/** True when the reference is the initials fallback rather than a chosen avatar. */
export function isInitialsAvatar(
  avatar: HumanAvatarReference,
): avatar is { kind: 'initials'; initials: string } {
  return avatar.kind === 'initials';
}

/** The fallback initials for a profile: authored initials, else name initials. */
export function fallbackInitialsFor(profile: SavedPlayerProfile): string {
  if (profile.avatar.kind === 'initials') {
    return profile.avatar.initials;
  }
  if (profile.avatar.kind === 'authored') {
    return HUMAN_AVATAR_INITIALS[profile.avatar.id];
  }
  return initialsFromName(profile.displayName);
}

/** Validate a bounded avatar snapshot. */
export function validateHumanAvatarSnapshot(
  snapshot: HumanAvatarSnapshot,
): snapshot is HumanAvatarSnapshot {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  switch (snapshot.kind) {
    case 'authored':
      return (HUMAN_AVATAR_IDS as readonly string[]).includes(snapshot.id);
    case 'initials':
      return /^[A-Z]{1,2}$/.test(snapshot.initials);
    case 'uploaded':
      return BOUNDED_AVATAR_ID.test(snapshot.avatarId) && Number.isSafeInteger(snapshot.version) && snapshot.version > 0
        ? true
        : false;
  }
}

/**
 * Validate and normalize a human identity. Client and multiplayer Edge apply
 * this one path so an untrusted name or avatar is rejected identically.
 */
export function normalizeHumanIdentity(input: {
  displayName: string;
  avatar: HumanAvatarSnapshot;
}): HumanIdentityValidationResult {
  const name = validatePlayerDisplayName(input.displayName);
  if (!name.ok) {
    return { ok: false, reason: name.reason };
  }
  if (!validateHumanAvatarSnapshot(input.avatar)) {
    return { ok: false, reason: 'bad-avatar' };
  }
  return { ok: true, displayName: name.value, avatar: input.avatar };
}

/** True when two seats display the same name; seat kind is still separate. */
export function hasSameDisplayName(
  a: { displayName: string },
  b: { displayName: string },
): boolean {
  return a.displayName === b.displayName;
}
