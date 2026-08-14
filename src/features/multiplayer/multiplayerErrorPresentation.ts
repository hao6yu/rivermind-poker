import type { MessageKey } from '../../localization';
import type { MultiplayerRequestErrorCode } from '../../services/multiplayer';

const errorMessages: Record<MultiplayerRequestErrorCode, MessageKey> = {
  command_conflict: 'multiplayer.error.changed',
  multiplayer_configuration: 'multiplayer.error.configuration',
  multiplayer_invalid_response: 'multiplayer.error.generic',
  multiplayer_network: 'multiplayer.error.unavailable',
  request_invalid: 'multiplayer.error.generic',
  room_access: 'multiplayer.error.access',
  room_code_busy: 'multiplayer.error.codeBusy',
  room_command_invalid: 'multiplayer.error.generic',
  room_failure: 'multiplayer.error.generic',
  room_forbidden: 'multiplayer.error.access',
  room_not_found: 'multiplayer.error.roomNotFound',
  room_rate_limited: 'multiplayer.error.rateLimited',
  room_stale: 'multiplayer.error.changed',
  room_started: 'multiplayer.error.roomStarted',
  room_unavailable: 'multiplayer.error.unavailable',
  seat_unavailable: 'multiplayer.error.seatUnavailable',
};

/** Never surface server/SDK English directly in a localized build. */
export function localizedMultiplayerErrorKey(
  code: MultiplayerRequestErrorCode,
): MessageKey {
  return errorMessages[code];
}

export const multiplayerRequestErrorCodes = Object.freeze(
  Object.keys(errorMessages) as MultiplayerRequestErrorCode[],
);
