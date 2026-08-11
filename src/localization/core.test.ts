import { describe, expect, it } from 'vitest';

import {
  isLanguagePreference,
  learningActivityMessageKey,
  practicePackMessageKey,
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
    expect(learningActivityMessageKey('lesson-tournament-stack-zones', 'title')).toBe('activity.lesson-tournament-stack-zones.title');
    expect(learningActivityMessageKey('lesson-tournament-short-stack-opens', 'description')).toBe('activity.lesson-tournament-short-stack-opens.description');
    expect(learningActivityMessageKey('lesson-tournament-reshoves-calls', 'title')).toBe('activity.lesson-tournament-reshoves-calls.title');
    expect(learningActivityMessageKey('lesson-tournament-risk-premium', 'title')).toBe('activity.lesson-tournament-risk-premium.title');
    expect(learningActivityMessageKey('lesson-opponents-evidence', 'description')).toBe('activity.lesson-opponents-evidence.description');
    expect(learningActivityMessageKey('lesson-math-break-even-bluffs', 'title')).toBe('activity.lesson-math-break-even-bluffs.title');
    expect(learningActivityMessageKey('mission-tournament-bubble', 'description')).toBe('activity.mission-tournament-bubble.description');
    expect(learningActivityMessageKey('mission-opponent-adjustments', 'title')).toBe('activity.mission-opponent-adjustments.title');
    expect(learningActivityMessageKey('sheet-advanced-math', 'title')).toBe('activity.sheet-advanced-math.title');
    expect(practicePackMessageKey('tournament-bubble', 'title')).toBe('activity.pack-tournament-bubble.title');
    expect(practicePackMessageKey('opponent-adjustments', 'description')).toBe('activity.pack-opponent-adjustments.description');
    expect(practicePackMessageKey('advanced-math', 'title')).toBe('activity.pack-advanced-math.title');
    expect(learningActivityMessageKey('unknown', 'title')).toBeNull();
    expect(practicePackMessageKey('unknown', 'title')).toBeNull();
  });
});
