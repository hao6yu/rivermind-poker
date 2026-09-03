import { describe, expect, it } from 'vitest';

import {
  isLanguagePreference,
  learningActivityMessageKey,
  practicePackMessageKey,
  resolveLanguage,
  resolveLanguageFromLocales,
  translate,
  translateCount,
} from './core';
import { AI_COACH_LANGUAGES, LANGUAGE_PREFERENCES, LOCALES, SHIPPED_LOCALES } from './registry';
import { localizedOrdinalPlace, localeIntl } from './format';

describe('localization core', () => {
  it('resolves Simplified and Traditional Chinese from script or region', () => {
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageScriptCode: 'Hans' }])).toBe('zh-Hans');
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageScriptCode: 'Hant' }])).toBe('zh-Hant');
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageRegionCode: 'HK' }])).toBe('zh-Hant');
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageRegionCode: 'CN' }])).toBe('zh-Hans');
  });

  it('maps every Spanish system locale to es-419 until a distinct es-ES catalog exists', () => {
    expect(resolveLanguageFromLocales([{ languageCode: 'es', languageRegionCode: 'MX' }])).toBe('es-419');
    expect(resolveLanguageFromLocales([{ languageCode: 'es', languageTag: 'es-419' }])).toBe('es-419');
    expect(resolveLanguageFromLocales([{ languageCode: 'es', languageRegionCode: 'ES' }])).toBe('es-419');
    expect(resolveLanguageFromLocales([{ languageCode: 'es', languageTag: 'es-US' }])).toBe('es-419');
  });

  it('resolves pt-BR but keeps other Portuguese regions explicitly on English', () => {
    expect(resolveLanguageFromLocales([{ languageCode: 'pt', languageRegionCode: 'BR' }])).toBe('pt-BR');
    expect(resolveLanguageFromLocales([{ languageCode: 'pt', languageTag: 'pt-BR' }])).toBe('pt-BR');
    expect(resolveLanguageFromLocales([{ languageCode: 'pt', languageRegionCode: 'PT' }])).toBe('en');
    expect(resolveLanguageFromLocales([{ languageCode: 'pt', languageTag: 'pt' }])).toBe('en');
  });

  it('falls back to English for unsupported or unavailable system locales', () => {
    expect(resolveLanguageFromLocales([])).toBe('en');
    expect(resolveLanguageFromLocales([{ languageCode: 'fr', languageTag: 'fr-FR' }])).toBe('en');
  });

  it('keeps an explicit app language independent from the system locale', () => {
    expect(resolveLanguage('zh-Hant', [{ languageCode: 'en' }])).toBe('zh-Hant');
    expect(resolveLanguage('es-419', [{ languageCode: 'en' }])).toBe('es-419');
    expect(resolveLanguage('pt-BR', [{ languageCode: 'es', languageRegionCode: 'MX' }])).toBe('pt-BR');
    expect(resolveLanguage('system', [{ languageCode: 'zh', languageRegionCode: 'TW' }])).toBe('zh-Hant');
  });

  it('validates persisted preferences across the whole registry', () => {
    expect(isLanguagePreference('system')).toBe(true);
    expect(isLanguagePreference('zh-Hant')).toBe(true);
    expect(isLanguagePreference('es-419')).toBe(true);
    expect(isLanguagePreference('pt-BR')).toBe(true);
    expect(isLanguagePreference('fr')).toBe(false);
    expect(isLanguagePreference('ja')).toBe(false);
    expect(translate('zh-Hans', 'home.learningProgress', { complete: 2, total: 6 })).toBe('2/6 节课程');
    expect(translate('zh-Hant', 'settings.languageCurrent', {
      language: '繁體中文',
    })).toBe('目前為 繁體中文');
  });

  it('keeps incomplete expansion locales out of the production picker', () => {
    expect(LANGUAGE_PREFERENCES).toEqual(['system', 'en', 'zh-Hans', 'zh-Hant']);
    expect(SHIPPED_LOCALES).toEqual(['en', 'zh-Hans', 'zh-Hant']);
    expect(LOCALES['es-419'].catalogComplete).toBe(false);
    expect(LOCALES['pt-BR'].catalogComplete).toBe(false);
  });

  it('exposes registry locale metadata as the single source of truth', () => {
    expect(localeIntl('es-419')).toBe('es-419');
    expect(localeIntl('pt-BR')).toBe('pt-BR');
    expect(LOCALES['es-419'].displayName).toBe('Español (Latinoamérica)');
    expect(LOCALES['pt-BR'].displayName).toBe('Português (Brasil)');
    expect(LOCALES['es-419'].nativeLocales).toEqual(['es-419']);
    expect(LOCALES['pt-BR'].storeLocales).toEqual({ appStore: 'pt-BR', googlePlay: 'pt-BR' });
    expect(LOCALES['es-419'].textDirection).toBe('ltr');
  });

  it('selects count forms per locale through the plural catalogs', () => {
    expect(translateCount('en', 'common.bigBlinds', 1)).toBe('1 big blind');
    expect(translateCount('en', 'common.bigBlinds', 0)).toBe('0 big blinds');
    expect(translateCount('en', 'common.bigBlinds', 2)).toBe('2 big blinds');
    expect(translateCount('en', 'common.bigBlinds', 100)).toBe('100 big blinds');
    expect(translateCount('en', 'decision.handCount.match', 1)).toBe('Strong baseline match across 1 decision');
    expect(translateCount('en', 'decision.handCount.match', 3)).toBe('Strong baseline match across 3 decisions');
    expect(translateCount('zh-Hans', 'decision.handCount.match', 1)).toBe('这 1 个决策');
    expect(translateCount('zh-Hans', 'decision.handCount.match', 3)).toBe('这 3 个决策');
    expect(translateCount('zh-Hant', 'decision.handCount.match', 1)).toBe('這 1 個決策');
    // Locales without plural entries fall back to the base template with count interpolated.
    expect(translateCount('es-419', 'common.players', 1)).toBe('1 players');
  });

  it('formats place ordinals per locale for compact result surfaces', () => {
    expect(localizedOrdinalPlace(1, 'en')).toBe('1st');
    expect(localizedOrdinalPlace(13, 'en')).toBe('13th');
    expect(localizedOrdinalPlace(2, 'zh-Hans')).toBe('第 2 名');
    expect(localizedOrdinalPlace(3, 'es-419')).toBe('3.º');
    expect(localizedOrdinalPlace(1, 'pt-BR')).toBe('1º');
  });

  it('keeps the screen usable when stale runtime data asks for an unknown key', () => {
    const missingKey = 'runtime.missing.message' as Parameters<typeof translate>[1];
    expect(translate('en', missingKey)).toBe(missingKey);
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
