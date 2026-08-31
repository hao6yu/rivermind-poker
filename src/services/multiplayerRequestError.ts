export type MultiplayerRequestErrorCode =
  | 'ai_roster_exhausted'
  | 'command_conflict'
  | 'moment_burst'
  | 'moment_cooldown'
  | 'moment_duplicate'
  | 'moment_hand_budget'
  | 'multiplayer_configuration'
  | 'multiplayer_invalid_response'
  | 'multiplayer_network'
  | 'multiplayer_update_required'
  | 'request_invalid'
  | 'room_access'
  | 'room_code_busy'
  | 'room_command_invalid'
  | 'room_failure'
  | 'room_forbidden'
  | 'room_not_found'
  | 'room_rate_limited'
  | 'room_seat_count_unsupported'
  | 'room_stale'
  | 'room_started'
  | 'room_unavailable'
  | 'room_unsupported_state'
  | 'seat_unavailable';

export class MultiplayerRequestError extends Error {
  constructor(
    public readonly code: MultiplayerRequestErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'MultiplayerRequestError';
  }
}
