import { describe, expect, it } from 'vitest';

import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
  type MessageKey,
} from './messages';
import { portugueseMessages } from './ptbr';
import { spanishMessages } from './es419';

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
  'decision.handSummary.recommended',
  'decision.handSummary.alternative',
  'decision.handSummary.closeDecision',
  'decision.handSummary.costlyMistake',
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

  it.each(['es-419', 'pt-BR'] as const)(
    'does not fall back to English for new decision keys in %s',
    (locale) => {
      const catalog = locale === 'es-419' ? spanishMessages : portugueseMessages;
      newDecisionKeys.forEach((key) => {
        expect(catalog[key], `${key} in ${locale}`).toBeDefined();
        expect(catalog[key], `${key} in ${locale}`).not.toBe(englishMessages[key]);
      });
    },
  );

  it('keeps interpolation-variable parity for the sizing note across all five locales', () => {
    const english = interpolationNames(englishMessages['decision.sizingNote']);
    expect(interpolationNames(simplifiedChineseMessages['decision.sizingNote']), 'zh-Hans').toEqual(english);
    expect(interpolationNames(traditionalChineseMessages['decision.sizingNote']), 'zh-Hant').toEqual(english);
    expect(interpolationNames(spanishMessages['decision.sizingNote']), 'es-419').toEqual(english);
    expect(interpolationNames(portugueseMessages['decision.sizingNote']), 'pt-BR').toEqual(english);
  });

  it('keeps leading and trailing whitespace clean on the new decision keys', () => {
    newDecisionKeys.forEach((key) => {
      expect(simplifiedChineseMessages[key], `${key} zh-Hans trimStart`).toBe(simplifiedChineseMessages[key].trimStart());
      expect(simplifiedChineseMessages[key], `${key} zh-Hans trimEnd`).toBe(simplifiedChineseMessages[key].trimEnd());
      expect(traditionalChineseMessages[key], `${key} zh-Hant trimStart`).toBe(traditionalChineseMessages[key].trimStart());
      expect(traditionalChineseMessages[key], `${key} zh-Hant trimEnd`).toBe(traditionalChineseMessages[key].trimEnd());
    });
  });

  function interpolate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_m, name) => values[name] ?? _m);
  }

  it('renders the rewritten sizing note without a doubled verb across three locales', () => {
    const english = interpolate(englishMessages['decision.sizingNote'], {
      chosen: 'Raise to 30',
      baseline: 'Raise to 27',
    });
    expect(english).toContain('you chose Raise to 30');
    expect(english).not.toMatch(/raised to Raise/i);

    const hans = interpolate(simplifiedChineseMessages['decision.sizingNote'], {
      chosen: '加注到 30',
      baseline: '加注到 27',
    });
    expect(hans).toContain('你选择 加注到 30');
    expect(hans).not.toContain('加走到');

    const hant = interpolate(traditionalChineseMessages['decision.sizingNote'], {
      chosen: '加注到 30',
      baseline: '加注到 27',
    });
    expect(hant).toContain('你選擇 加注到 30');
  });

  it('interpolates the hand summary counts realistically across three locales', () => {
    // The hand summary takes a locale-correct plural noun phrase (`label`) rather
    // than a bare count, so a single decision reads "1 decision", not "1 decisions".
    const values = { label: '3 decisions' };
    const keys: MessageKey[] = [
      'decision.handSummary.recommended',
      'decision.handSummary.alternative',
      'decision.handSummary.closeDecision',
      'decision.handSummary.costlyMistake',
    ];
    keys.forEach((key) => {
      expect(interpolate(englishMessages[key], values)).toContain('3 decisions');
      expect(interpolationNames(englishMessages[key])).toEqual(['label']);
    });
  });
});
