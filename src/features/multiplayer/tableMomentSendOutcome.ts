import {
  MultiplayerRequestError,
  type MultiplayerRequestErrorCode,
} from '../../services/multiplayerRequestError';

import { TABLE_MOMENT_DEFAULT_RETRY_AFTER_MS } from './tableMomentOutboundQueue';

export type TableMomentSendOutcome =
  | { status: 'accepted' | 'discarded' | 'error' }
  | { retryAfterMs: number; status: 'retry' };

const TABLE_MOMENT_DISCARD_CODES: ReadonlySet<MultiplayerRequestErrorCode> = new Set([
  'moment_hand_budget',
  'room_command_invalid',
  'room_stale',
]);

/**
 * Converts transport errors into queue behavior without invoking the table's
 * modal command-error presenter. Reactions are ephemeral: stale-hand and
 * exhausted-budget items are discarded, transient failures stay at the FIFO
 * head, and terminal failures remain local to the tray.
 */
export function tableMomentSendOutcome(error: unknown): TableMomentSendOutcome {
  if (!(error instanceof MultiplayerRequestError)) return { status: 'error' };
  if (error.code === 'moment_duplicate') return { status: 'accepted' };
  if (TABLE_MOMENT_DISCARD_CODES.has(error.code)) return { status: 'discarded' };
  if (error.code === 'moment_burst' || error.code === 'moment_cooldown' || error.retryable) {
    return {
      retryAfterMs: error.retryAfterMs ?? TABLE_MOMENT_DEFAULT_RETRY_AFTER_MS,
      status: 'retry',
    };
  }
  return { status: 'error' };
}
