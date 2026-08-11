import { describe, expect, it } from 'vitest';

import {
  isLanguagePreference,
  learningActivityMessageKey,
  resolveLanguage,
  resolveLanguageFromLocales,
  translate,
} from './core';

describe('localization core', () => {
  it('resolves Simplified and Traditional Chinese from script or region', () => {
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageScriptCode: 'Hans' }])).toBe('zh-Hans');
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageScriptCode: 'Hant' }])).toBe('zh-Hant');
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageRegionCode: 'HK' }])).toBe('zh-Hant');
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageRegionCode: 'CN' }])).toBe('zh-Hans');
  });

  it('falls back to English for unsupported or unavailable system locales', () => {
    expect(resolveLanguageFromLocales([])).toBe('en');
    expect(resolveLanguageFromLocales([{ languageCode: 'fr', languageTag: 'fr-FR' }])).toBe('en');
  });

  it('keeps an explicit app language independent from the system locale', () => {
    expect(resolveLanguage('zh-Hant', [{ languageCode: 'en' }])).toBe('zh-Hant');
    expect(resolveLanguage('system', [{ languageCode: 'zh', languageRegionCode: 'TW' }])).toBe('zh-Hant');
  });

  it('validates persisted preferences and interpolates translated values', () => {
    expect(isLanguagePreference('system')).toBe(true);
    expect(isLanguagePreference('zh-Hant')).toBe(true);
    expect(isLanguagePreference('fr')).toBe(false);
    expect(translate('zh-Hans', 'home.learningProgress', { complete: 2, total: 6 })).toBe('2/6 节课程');
    expect(translate('zh-Hant', 'settings.languageCurrent', {
      language: '繁體中文',
    })).toBe('目前為 繁體中文');
  });

  it('maps stable learning ids to localized metadata keys', () => {
    expect(learningActivityMessageKey('lesson-hand-rankings', 'title')).toBe('activity.lesson-hand-rankings.title');
    expect(learningActivityMessageKey('mission-preflop-enter-pot', 'title')).toBe('activity.mission-preflop-enter-pot.title');
    expect(learningActivityMessageKey('mission-postflop-cbet', 'title')).toBe('activity.mission-postflop-cbet.title');
    expect(learningActivityMessageKey('mission-postflop-river', 'description')).toBe('activity.mission-postflop-river.description');
    expect(learningActivityMessageKey('quiz-preflop-mastery', 'description')).toBe('activity.quiz-preflop-mastery.description');
    expect(learningActivityMessageKey('lesson-postflop-board-texture', 'title')).toBe('activity.lesson-postflop-board-texture.title');
    expect(learningActivityMessageKey('quiz-postflop-mastery', 'description')).toBe('activity.quiz-postflop-mastery.description');
    expect(learningActivityMessageKey('unknown', 'title')).toBeNull();
  });
});
