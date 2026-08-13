export const PLAYER_DISPLAY_NAME_MAX_LENGTH = 18;
export const PLAYER_DISPLAY_NAME_MIN_LENGTH = 2;

function compactPlayerDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizePlayerDisplayName(value: string): string {
  return compactPlayerDisplayName(value).slice(0, PLAYER_DISPLAY_NAME_MAX_LENGTH);
}

export function isValidPlayerDisplayName(value: string): boolean {
  const length = compactPlayerDisplayName(value).length;
  return length >= PLAYER_DISPLAY_NAME_MIN_LENGTH && length <= PLAYER_DISPLAY_NAME_MAX_LENGTH;
}
