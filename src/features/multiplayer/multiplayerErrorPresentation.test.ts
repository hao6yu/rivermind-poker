import { describe, expect, it } from 'vitest';

import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
} from '../../localization/messages';
import {
  localizedMultiplayerErrorKey,
  multiplayerRequestErrorCodes,
} from './multiplayerErrorPresentation';

describe('multiplayer error presentation', () => {
  it('has localized stable copy for every request error code', () => {
    expect(multiplayerRequestErrorCodes).toHaveLength(18);
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
