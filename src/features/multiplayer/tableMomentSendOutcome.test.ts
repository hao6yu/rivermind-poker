import { describe, expect, it } from 'vitest';

import { MultiplayerRequestError } from '../../services/multiplayerRequestError';
import { tableMomentSendOutcome } from './tableMomentSendOutcome';

describe('table moment send outcomes', () => {
  it.each(['room_stale', 'room_command_invalid', 'moment_hand_budget'] as const)(
    'discards %s without routing it to the table modal presenter',
    (code) => {
      expect(tableMomentSendOutcome(new MultiplayerRequestError(code, code, false)))
        .toEqual({ status: 'discarded' });
    },
  );

  it('treats duplicate idempotency keys as accepted', () => {
    expect(tableMomentSendOutcome(
      new MultiplayerRequestError('moment_duplicate', 'duplicate', false),
    )).toEqual({ status: 'accepted' });
  });

  it('keeps burst and transient failures at the FIFO head with retry-after', () => {
    expect(tableMomentSendOutcome(
      new MultiplayerRequestError('moment_burst', 'slow down', false, 275),
    )).toEqual({ retryAfterMs: 275, status: 'retry' });
    expect(tableMomentSendOutcome(
      new MultiplayerRequestError('multiplayer_network', 'offline', true),
    )).toEqual({ retryAfterMs: 1_000, status: 'retry' });
  });

  it('keeps terminal and unknown failures local to the tray', () => {
    expect(tableMomentSendOutcome(
      new MultiplayerRequestError('room_forbidden', 'forbidden', false),
    )).toEqual({ status: 'error' });
    expect(tableMomentSendOutcome(new Error('unexpected'))).toEqual({ status: 'error' });
  });
});
