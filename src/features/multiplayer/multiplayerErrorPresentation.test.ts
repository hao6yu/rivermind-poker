import { describe, expect, it } from 'vitest';

import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
} from '../../localization/messages';
import {
  localizedMultiplayerErrorKey,
  multiplayerRequestErrorCodes,
  TABLE_ERROR_ALERT_QUIET_WINDOW_MS,
  shouldShowTableErrorAlert,
} from './multiplayerErrorPresentation';

describe('multiplayer error presentation', () => {
  it('has localized stable copy for every request error code', () => {
    // 24 codes: R4 added room_unsupported_state for persisted rooms this
    // build cannot read safely.
    expect(multiplayerRequestErrorCodes).toHaveLength(24);
    multiplayerRequestErrorCodes.forEach((code) => {
      const key = localizedMultiplayerErrorKey(code);
      expect(englishMessages[key]).toBeTruthy();
      expect(simplifiedChineseMessages[key]).toBeTruthy();
      expect(traditionalChineseMessages[key]).toBeTruthy();
      expect(simplifiedChineseMessages[key]).not.toBe(englishMessages[key]);
      expect(traditionalChineseMessages[key]).not.toBe(englishMessages[key]);
    });
  });
});

describe('table error alert dedupe (A2 gate finding 1)', () => {
  it('shows the first error', () => {
    expect(shouldShowTableErrorAlert(null, 'multiplayer.error.generic', 1_000)).toBe(true);
  });

  it('suppresses an identical consecutive error inside the quiet window', () => {
    const last = { at: 1_000, key: 'multiplayer.error.generic' };
    expect(shouldShowTableErrorAlert(last, 'multiplayer.error.generic', 5_000)).toBe(false);
    expect(shouldShowTableErrorAlert(last, 'multiplayer.error.generic', 1_000 + TABLE_ERROR_ALERT_QUIET_WINDOW_MS - 1)).toBe(false);
  });

  it('shows again after the quiet window elapses', () => {
    const last = { at: 1_000, key: 'multiplayer.error.generic' };
    expect(shouldShowTableErrorAlert(last, 'multiplayer.error.generic', 1_000 + TABLE_ERROR_ALERT_QUIET_WINDOW_MS + 1)).toBe(true);
  });

  it('always shows a different error immediately', () => {
    const last = { at: 1_000, key: 'multiplayer.error.generic' };
    expect(shouldShowTableErrorAlert(last, 'multiplayer.error.roomNotFound', 2_000)).toBe(true);
  });
});
