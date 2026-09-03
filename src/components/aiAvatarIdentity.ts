/**
 * The persona→identity resolution (P18-016): pure, so tests can audit every
 * active persona without loading the native module graph or the PNG assets.
 * The canonical asset-key list is a type-level tuple; the require-carrying
 * map in `aiAvatarSources.ts` is typed against it, so a key that gains an
 * asset without leaving the fallback set (or vice versa) fails typecheck.
 */

/** Every persona key that has an authored asset. Adding a key here requires
 * the matching PNG in assets/ai-players/ and the map in aiAvatarSources.ts. */
export const AI_AVATAR_ASSET_KEYS = [
  'mara-balanced',
  'theo-patient',
  'nova-pressure',
  'june-sticky',
  'sol-deceptive',
  'kai-balanced',
  'iris-patient',
  'dex-pressure',
  'lena-sticky',
  'amir-deceptive',
  'rowan-balanced',
  'priya-patient',
  'zane-pressure',
  'aya-sticky',
  'victor-deceptive',
  'vivian-sticky',
  'mary-patient',
  'bruce-pressure',
  'lulu-patient',
  'steve-patient',
  'yoyo-patient',
  'hao-patient',
  'uncle-tu-patient',
  'gary-pressure',
  'mr-chi-sticky',
  'auntie-chi-sticky',
  'zhou-pressure',
] as const;

export type AiAvatarAssetKey = typeof AI_AVATAR_ASSET_KEYS[number];

/**
 * P18-016 — the explicit temporary fallback for the four personas whose
 * approved authored art does not exist yet (Elsa, Milo, Noah, Otto). Each
 * resolves to a consistent, intended visual identity — their initial on a
 * distinct hue — everywhere `AiAvatar` renders, so the product never shows an
 * accidental generic fallback. OWNER ART DEPENDENCY: when the four assets are
 * authored, add their keys to `AI_AVATAR_ASSET_KEYS` + the map, and DELETE
 * the entries here; the persona-identity test enforces both directions.
 */
export const AI_AVATAR_DOCUMENTED_FALLBACKS: Readonly<Record<string, string>> = {
  'milo-balanced': '#4A53D2',
  'elsa-sticky': '#188080',
  'otto-pressure': '#B85C38',
  'noah-deceptive': '#7A4BA8',
};

/** How one persona resolves visually. */
export type AiAvatarResolution =
  | { kind: 'asset'; avatarKey: string }
  | { kind: 'fallback'; avatarKey: string; color: string }
  | { kind: 'unknown' };

/** The persona→identity resolution used by the renderer and the identity test. */
export function resolveAiAvatarIdentity(avatarKey: string): AiAvatarResolution {
  if ((AI_AVATAR_ASSET_KEYS as readonly string[]).includes(avatarKey)) {
    return { kind: 'asset', avatarKey };
  }
  const color = AI_AVATAR_DOCUMENTED_FALLBACKS[avatarKey];
  if (color) return { kind: 'fallback', avatarKey, color };
  return { kind: 'unknown' };
}
