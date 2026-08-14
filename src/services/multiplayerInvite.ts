const INVITE_SCHEME = 'rivermind';
const INVITE_HOST = 'join';
const ROOM_CODE_PATTERN = /^\d{6}$/;

export interface MultiplayerInvite {
  roomCode: string;
}

function decodeQueryValue(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

export function buildMultiplayerInviteUrl(roomCode: string): string {
  const inviteUrl = buildMultiplayerInviteUrlIfAvailable(roomCode);
  if (!inviteUrl) {
    throw new Error('A multiplayer invite requires a six-digit room code.');
  }
  return inviteUrl;
}

export function buildMultiplayerInviteUrlIfAvailable(roomCode: string): string | null {
  const normalized = roomCode.trim();
  return ROOM_CODE_PATTERN.test(normalized)
    ? `${INVITE_SCHEME}://${INVITE_HOST}?code=${normalized}`
    : null;
}

/**
 * Accept only RiverMind's intentionally small invite contract. The link carries
 * a short-lived room locator, never a room id, player id, or auth material.
 */
export function parseMultiplayerInviteUrl(value: string): MultiplayerInvite | null {
  const match = /^rivermind:\/\/join\/?\?([^#]+)$/i.exec(value.trim());
  if (!match?.[1]) return null;
  const pairs = match[1].split('&');
  if (pairs.length !== 1) return null;
  const [rawKey, rawValue, ...extra] = pairs[0]?.split('=') ?? [];
  if (extra.length > 0 || rawKey !== 'code' || rawValue === undefined) return null;
  const roomCode = decodeQueryValue(rawValue);
  return roomCode && ROOM_CODE_PATTERN.test(roomCode) ? { roomCode } : null;
}

export const multiplayerInviteContract = {
  host: INVITE_HOST,
  scheme: INVITE_SCHEME,
};
