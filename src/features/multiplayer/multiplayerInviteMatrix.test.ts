import { describe, expect, it } from 'vitest';

import { isTerminalMultiplayerRecoveryError } from '../../services/multiplayerInviteRouting';
import { buildMultiplayerInviteUrl, parseMultiplayerInviteUrl } from '../../services/multiplayerInvite';
import { localizedMultiplayerErrorKey } from './multiplayerErrorPresentation';
import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
} from '../../localization/messages';

/**
 * P18-035 — the invite / `rivermind://` matrix rows that are provable without
 * a device, pinned end-to-end in one place: delivery URL → parse → localized
 * failure → recovery classification. The physical rows (cold/warm start on
 * real devices, TalkBack labels on the dialogs) execute through
 * `e2e/maestro/phase-18-5-deep-link-matrix.yaml` and remain the owner's
 * device pass; this file pins the logic those flows exercise so a device run
 * can only fail on platform behavior, not on product logic.
 */
describe('invite/deep-link matrix — logic rows (P18-035)', () => {
  it('row: well-formed invite round-trips and carries no private material', () => {
    const url = buildMultiplayerInviteUrl('4001234');
    expect(url).toBe('rivermind://join?code=4001234');
    expect(parseMultiplayerInviteUrl(url)).toEqual({ roomCode: '4001234' });
    expect(url).not.toContain('room_id');
    expect(url).not.toContain('token');
  });

  it('row: malformed link fails safely (null, never a throw or a partial join)', () => {
    for (const malformed of [
      'rivermind://join?code=1234567',
      'rivermind://join?code=4001234&extra=1',
      'rivermind://join?room=4001234',
      'rivermind://join',
      'https://rivermind.example/join?code=4001234',
      'rivermind://join?code=',
      'rivermind://join?code=400123%ZZ',
      'https://evil.example/join?code=4001234',
    ]) {
      expect(parseMultiplayerInviteUrl(malformed), malformed).toBeNull();
    }
  });

  it('row: expired / missing room joins present a localized failure, never raw server text', () => {
    expect(localizedMultiplayerErrorKey('room_not_found')).toBe('multiplayer.error.roomNotFound');
    for (const messages of [englishMessages, simplifiedChineseMessages, traditionalChineseMessages]) {
      expect(messages['multiplayer.error.roomNotFound'].length).toBeGreaterThan(0);
    }
    // An expired room is terminal for recovery: the stale local record is
    // cleared instead of retried forever.
    expect(isTerminalMultiplayerRecoveryError({ code: 'room_not_found' })).toBe(true);
  });

  it('row: wrong protocol lane fails closed with the upgrade message and clears recovery', () => {
    expect(localizedMultiplayerErrorKey('multiplayer_update_required'))
      .toBe('multiplayer.error.updateRequired');
    expect(isTerminalMultiplayerRecoveryError({ code: 'multiplayer_update_required' })).toBe(true);
    // The terminal classification is what clears the stale recovery record —
    // the lane constants themselves are pinned by the HTTP lifecycle tests.
    expect(isTerminalMultiplayerRecoveryError({ code: 'room_unsupported_state' })).toBe(true);
  });

  it('row: transient network failure keeps the recovery record (never terminal)', () => {
    expect(isTerminalMultiplayerRecoveryError({ code: 'multiplayer_network' })).toBe(false);
    expect(isTerminalMultiplayerRecoveryError(undefined)).toBe(false);
  });

  it('row: forbidden room access is terminal and localized in all three catalogs', () => {
    expect(isTerminalMultiplayerRecoveryError({ code: 'room_access' })).toBe(true);
    expect(isTerminalMultiplayerRecoveryError({ code: 'room_forbidden' })).toBe(true);
    for (const key of ['multiplayer.error.access'] as const) {
      for (const messages of [englishMessages, simplifiedChineseMessages, traditionalChineseMessages]) {
        expect(messages[key].length).toBeGreaterThan(0);
      }
    }
  });
});
