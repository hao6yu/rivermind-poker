import { describe, expect, it } from 'vitest';

import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
  type MessageKey,
} from './messages';
import { portugueseMessages } from './ptbr';
import { spanishMessages } from './es419';
import {
  phase16EnglishMessages,
  phase16SimplifiedMessages,
  phase16TraditionalMessages,
} from './phase16Messages';

/**
 * The cross-cutting localization contract (Slice 3.11): every locale resolves
 * the same key set with the same interpolation placeholders. The Simplified
 * and Traditional maps spread the English catalog as a runtime fallback, so
 * missing overrides would fail silently — these tests make that loud.
 */

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]!).sort();
}

function keySet(record: Record<string, string>): string[] {
  return Object.keys(record).sort();
}

describe('localization catalog parity', () => {
  it('declares the same key set in every phase-16 locale map', () => {
    expect(keySet(phase16SimplifiedMessages)).toEqual(keySet(phase16EnglishMessages));
    expect(keySet(phase16TraditionalMessages)).toEqual(keySet(phase16EnglishMessages));
  });

  it('overrides every catalog key in Simplified and Traditional Chinese', () => {
    // Keys whose localized value intentionally matches English: language
    // self-names render in their own language in every locale, numeric-choice
    // labels and placeholder-only compositions carry no translatable words,
    // and `multiplayer.lobby.ai` is the protocol-stable AI badge. Nothing else
    // may opt out of localization.
    const sharedValueAllowlist = new Set<string>([
      'language.en',
      'language.zhHans',
      'language.zhHant',
      // Phase 19 language self-names render in their own language in every locale.
      'language.es419',
      'language.ptBr',
      'multiway.practiceLevel',
      'championship.lineupTier',
      'guided.calibration.calibration-pot-odds.choice.20-percent',
      'guided.calibration.calibration-pot-odds.choice.25-percent',
      'guided.calibration.calibration-pot-odds.choice.33-percent',
      'guided.calibration.calibration-bluff-threshold.choice.25-percent',
      'guided.calibration.calibration-bluff-threshold.choice.50-percent',
      'multiplayer.option.chips',
      'multiplayer.join.placeholder',
      'multiplayer.lobby.ai',
    ]);
    const keys = Object.keys(englishMessages) as MessageKey[];
    expect(keys.length).toBeGreaterThan(400);
    for (const key of keys) {
      if (sharedValueAllowlist.has(key)) continue;
      // A missing override silently resolves to the English template through
      // the spread fallback; requiring a different value makes that loud.
      expect(simplifiedChineseMessages[key], `${key} (zh-Hans) is untranslated`).not.toBe(englishMessages[key]);
      expect(traditionalChineseMessages[key], `${key} (zh-Hant) is untranslated`).not.toBe(englishMessages[key]);
    }
  });

  it('overrides every catalog key in Spanish and Brazilian Portuguese', () => {
    // Same contract as the Chinese maps, with the Phase 19 additions: pt-BR
    // keeps the glossary-decided unit name "big blinds" identical to English
    // (style guide §4–§5). Everything else must be genuinely translated.
    const sharedValueAllowlist = new Set<string>([
      'language.en',
      // Language self-names are protocol-stable in every locale, matching the
      // sync script's SHARED_VALUE_ALLOWLIST.
      'language.zhHans',
      'language.zhHant',
      'language.es419',
      'language.ptBr',
      'multiway.practiceLevel',
      'championship.lineupTier',
      'guided.calibration.calibration-pot-odds.choice.20-percent',
      'guided.calibration.calibration-pot-odds.choice.25-percent',
      'guided.calibration.calibration-pot-odds.choice.33-percent',
      'guided.calibration.calibration-bluff-threshold.choice.25-percent',
      'guided.calibration.calibration-bluff-threshold.choice.50-percent',
      'multiplayer.option.chips',
      'multiplayer.join.placeholder',
      'multiplayer.lobby.ai',
    ]);
    const ptValueAllowlist = new Set([...sharedValueAllowlist, 'common.bigBlinds']);
    const keys = Object.keys(englishMessages) as MessageKey[];
    expect(keys.length).toBeGreaterThan(400);
    for (const key of keys) {
      if (sharedValueAllowlist.has(key)) continue;
      expect(spanishMessages[key], `${key} (es-419) is untranslated`).not.toBe(englishMessages[key]);
      if (ptValueAllowlist.has(key)) continue;
      expect(portugueseMessages[key], `${key} (pt-BR) is untranslated`).not.toBe(englishMessages[key]);
    }
  });

  it('uses identical interpolation placeholders across locales', () => {
    const keys = Object.keys(englishMessages) as MessageKey[];
    for (const key of keys) {
      const en = placeholders(englishMessages[key]);
      expect(placeholders(simplifiedChineseMessages[key]), `${key} (zh-Hans)`).toEqual(en);
      expect(placeholders(traditionalChineseMessages[key]), `${key} (zh-Hant)`).toEqual(en);
      expect(placeholders(spanishMessages[key]), `${key} (es-419)`).toEqual(en);
      expect(placeholders(portugueseMessages[key]), `${key} (pt-BR)`).toEqual(en);
    }
  });

  it('resolves the exact English key set with no extra keys in the Phase 19 maps', () => {
    const keys = Object.keys(englishMessages).sort();
    expect(Object.keys(spanishMessages).sort()).toEqual(keys);
    expect(Object.keys(portugueseMessages).sort()).toEqual(keys);
  });

  it('localizes the avatar editor keys instead of inheriting English', () => {
    const keys: MessageKey[] = [
      'common.close',
      'profile.identity.editAvatar',
      'settings.avatarEditorTitle',
      'settings.avatarPreviewHint',
      'settings.avatarChoosePhoto',
      'settings.avatarTakePhoto',
      'settings.avatarUseInitials',
    ];
    for (const key of keys) {
      expect(simplifiedChineseMessages[key]).not.toBe(englishMessages[key]);
      expect(traditionalChineseMessages[key]).not.toBe(englishMessages[key]);
    }
  });

  it('does not carry removed avatar prose keys', () => {
    // Slice 3.11A removed the storage/sharing prose from the identity UI.
    expect(Object.prototype.hasOwnProperty.call(phase16EnglishMessages, 'settings.avatarDescription')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(phase16EnglishMessages, 'settings.avatarPrivacyNote')).toBe(false);
  });
});
