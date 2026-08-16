export const PLAYER_DISPLAY_NAME_MAX_LENGTH = 18;
export const PLAYER_DISPLAY_NAME_MIN_LENGTH = 2;

/**
 * Human names cross the private-room boundary and are visible to other
 * players. Keeping that surface to a small, product-authored allowlist avoids
 * exposing arbitrary user-generated text, personal contact details, or abuse.
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

function compactPlayerDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizePlayerDisplayName(value: string): string {
  return compactPlayerDisplayName(value).slice(0, PLAYER_DISPLAY_NAME_MAX_LENGTH);
}

export function isValidPlayerDisplayName(value: string): boolean {
  const normalized = normalizePlayerDisplayName(value);
  return PLAYER_DISPLAY_NAME_PRESETS.some((preset) => preset === normalized);
}
