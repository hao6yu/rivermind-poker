import { describe, expect, it } from 'vitest';

import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
  type MessageKey,
} from './messages';

/**
 * Phase 16 Slice 0 review copy lives beside the presentation classification.
 * These keys must be present and genuinely translated in every locale — a
 * missing Chinese entry would silently fall back to English and reveal the
 * new Recommended / Acceptable alternative copy to a Simplified or Traditional
 * player unchanged.
 */
const newDecisionKeys: MessageKey[] = [
  'decision.classification.recommended',
  'decision.classification.alternative',
  'decision.classification.mistake',
  'decision.summary.recommended',
  'decision.summary.alternative',
  'decision.sizingNote',
];

function interpolationNames(message: string): string[] {
  return Array.from(message.matchAll(/\{\{(\w+)\}\}/g), ([, name]) => name!).sort();
}

describe('decision review classification localization (Phase 16 Slice 0)', () => {
  it.each(['zh-Hans', 'zh-Hant'] as const)(
    'does not fall back to English for new decision keys in %s',
    (locale) => {
      const catalog = locale === 'zh-Hans' ? simplifiedChineseMessages : traditionalChineseMessages;
      newDecisionKeys.forEach((key) => {
        expect(catalog[key], `${key} in ${locale}`).toBeDefined();
        expect(catalog[key], `${key} in ${locale}`).not.toBe(englishMessages[key]);
      });
    },
  );

  it('keeps new keys present and translated in all three locales', () => {
    newDecisionKeys.forEach((key) => {
      expect(englishMessages[key], key).toBeDefined();
      expect(simplifiedChineseMessages[key], key).toBeDefined();
      expect(traditionalChineseMessages[key], key).toBeDefined();
    });
  });

  it('keeps interpolation-variable parity for the sizing note across locales', () => {
    const english = interpolationNames(englishMessages['decision.sizingNote']);
    expect(interpolationNames(simplifiedChineseMessages['decision.sizingNote']), 'zh-Hans').toEqual(english);
    expect(interpolationNames(traditionalChineseMessages['decision.sizingNote']), 'zh-Hant').toEqual(english);
  });

  it('keeps leading and trailing whitespace clean on the new decision keys', () => {
    newDecisionKeys.forEach((key) => {
      expect(simplifiedChineseMessages[key], `${key} zh-Hans trimStart`).toBe(simplifiedChineseMessages[key].trimStart());
      expect(simplifiedChineseMessages[key], `${key} zh-Hans trimEnd`).toBe(simplifiedChineseMessages[key].trimEnd());
      expect(traditionalChineseMessages[key], `${key} zh-Hant trimStart`).toBe(traditionalChineseMessages[key].trimStart());
      expect(traditionalChineseMessages[key], `${key} zh-Hant trimEnd`).toBe(traditionalChineseMessages[key].trimEnd());
    });
  });
});
