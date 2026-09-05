import { describe, expect, it } from 'vitest';

import { CATALOG_COMPLETE_LOCALES, translate, type AppLanguage } from './core';
import { englishMessages, type MessageKey } from './messages';
import '../test/draftCatalogFixture';

/**
 * Beginner-copy tier gate (plan §5 / slice 5): the `tutorial.*` namespace is
 * plain-language content. The main teaching path may not introduce advanced
 * abbreviations or jargon — the only allowed escapes are
 *  - the seat self-labels that teach "full term (SB/BB)" per plan §4, and
 *  - the optional math detail (tutorial.math.*), which the player explicitly
 *    opens and which stays arithmetic-only in plain language anyway.
 */

/** Jargon banned anywhere on the main tutorial path, in any locale. */
const BANNED_JARGON: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bGTO\b/i, label: 'GTO' },
  { pattern: /\bEV\b/, label: 'EV' },
  { pattern: /\bICM\b/, label: 'ICM' },
  { pattern: /\bSPR\b/, label: 'SPR' },
  { pattern: /\b3-bet\b/i, label: '3-bet' },
  { pattern: /\b4-bet\b/i, label: '4-bet' },
  { pattern: /\bC-bet\b/i, label: 'C-bet' },
  { pattern: /pot\s+odds/i, label: 'pot odds (use plain price language)' },
  { pattern: /equity/i, label: 'equity (main path uses everyday wording)' },
  { pattern: /range\s+advantage/i, label: 'range advantage' },
  { pattern: /范围优势/, label: '范围优势' },
  { pattern: /底池赔率/, label: '底池赔率' },
  { pattern: /3ベット|三ベット/, label: '3ベット/三ベット' },
];

/** Keys exempt from the main-path jargon scan. */
const JARGON_EXEMPT = [
  // Seat labels teach the abbreviation in parentheses by design (plan §4).
  'tutorial.seat.smallBlind',
  'tutorial.seat.bigBlind',
  'tutorial.a11y.dealerButton',
  // The optional math detail is behind an explicit toggle (plan §4/§5).
  'tutorial.math.show',
  'tutorial.math.hide',
  'tutorial.math.plain',
  'tutorial.math.detail',
];

/** All catalog-complete locales ship the tutorial namespace. */
const LOCALES = CATALOG_COMPLETE_LOCALES as readonly AppLanguage[];

/** Walks the English catalog and collects every tutorial.* key. */
function collectTutorialKeys(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(englishMessages).filter(([key]) => key.startsWith('tutorial.')),
  );
}

describe('beginner tutorial copy tier', () => {
  it('ships the full tutorial namespace in every catalog-complete locale', () => {
    const enKeys = Object.keys(collectTutorialKeys());
    expect(enKeys.length).toBeGreaterThan(80);
    for (const locale of LOCALES) {
      for (const key of enKeys) {
        const value = translate(locale, key as MessageKey).replace(/\{\{\w+\}\}/g, '');
        expect(value, `${locale} ${key} is untranslated`).not.toBe(key);
        expect(value.trim().length, `${locale} ${key} is blank`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps advanced jargon off the main teaching path in every locale', () => {
    const keys = Object.keys(collectTutorialKeys()).filter(
      (key) => !JARGON_EXEMPT.some((exempt) => key === exempt),
    );
    const violations: string[] = [];
    for (const locale of LOCALES) {
      for (const key of keys) {
        const value = translate(locale, key as MessageKey).replace(/\{\{\w+\}\}/g, '');
        for (const { pattern, label } of BANNED_JARGON) {
          if (pattern.test(value)) violations.push(`${locale} ${key}: ${label} in "${value}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('teaches the full term before the abbreviation in the seat labels', () => {
    for (const locale of LOCALES) {
      const smallBlind = translate(locale, 'tutorial.seat.smallBlind');
      const bigBlind = translate(locale, 'tutorial.seat.bigBlind');
      expect(smallBlind, `${locale} small blind label`).toMatch(/SB/);
      expect(bigBlind, `${locale} big blind label`).toMatch(/BB/);
      // The full term comes first: the abbreviation lives in a trailing
      // parenthesis, never as the whole label.
      expect(smallBlind.indexOf('SB')).toBeGreaterThan(0);
      expect(bigBlind.indexOf('BB')).toBeGreaterThan(0);
    }
  });

  it('keeps Simplified/Traditional tutorial copy free of mixed English', () => {
    // Review finding #21: zh copy must not splice English fragments ("继续
    // Poker basics") — the localized entry key or a fully localized phrase
    // only. Latin inside zh copy is limited to seat abbreviations (SB/BB) and
    // card-rank glyphs.
    const allowedLatin = new Set(['SB', 'BB']);
    const violations: string[] = [];
    for (const locale of ['zh-Hans', 'zh-Hant'] as const) {
      for (const key of Object.keys(collectTutorialKeys())) {
        const value = translate(locale, key as MessageKey).replace(/\{\{\w+\}\}/g, '');
        for (const match of value.matchAll(/[A-Za-z]{2,}/g)) {
          if (!allowedLatin.has(match[0])) {
            violations.push(`${locale} ${key}: English "${match[0]}" in "${value}"`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('states the plain-language chance before the percentage', () => {
    const plain = translate('en', 'tutorial.math.plain');
    const detail = translate('en', 'tutorial.math.detail', FLOP_VALUES);
    // "1 chance in 5" is the standalone plain line; the arithmetic stays in
    // the optional detail.
    expect(plain).toContain('1 chance in 5');
    expect(plain).not.toContain('÷');
    expect(detail).toContain('9 ÷ 47 ≈ 19%');
  });
});

const FLOP_VALUES = { call: 2, hearts: 9, percent: 19, pot: 15, price: 13, unseen: 47 } as const;
