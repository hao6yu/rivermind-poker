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
import {
  AI_COACH_LANGUAGES,
  CATALOG_COMPLETE_LOCALES,
  LANGUAGE_PREFERENCES,
  LOCALES,
  SHIPPED_LOCALES,
} from './registry';
import { localizedOrdinalPlace, localeIntl } from './format';

describe('localization core', () => {
  it('resolves Simplified and Traditional Chinese from script or region', () => {
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageScriptCode: 'Hans' }])).toBe('zh-Hans');
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageScriptCode: 'Hant' }])).toBe('zh-Hant');
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageRegionCode: 'HK' }])).toBe('zh-Hant');
    expect(resolveLanguageFromLocales([{ languageCode: 'zh', languageRegionCode: 'CN' }])).toBe('zh-Hans');
  });

  it('resolves every Spanish system locale to es-419 once release-enabled', () => {
    // The mapping itself is frozen: every Spanish system locale targets
    // es-419 until a distinct es-ES catalog exists. es-419 was release-enabled
    // by owner decision on 2026-09-15 (docs/PHASE_19_EXECUTION_RECORD.md), so
    // the mappings are live.
    expect(resolveLanguageFromLocales([{ languageCode: 'es', languageRegionCode: 'MX' }])).toBe('es-419');
    expect(resolveLanguageFromLocales([{ languageCode: 'es', languageTag: 'es-419' }])).toBe('es-419');
    expect(resolveLanguageFromLocales([{ languageCode: 'es', languageRegionCode: 'ES' }])).toBe('es-419');
    expect(resolveLanguageFromLocales([{ languageCode: 'es', languageTag: 'es-US' }])).toBe('es-419');
  });

  it('resolves pt-BR from Brazilian Portuguese system locales; other Portuguese stays English', () => {
    expect(resolveLanguageFromLocales([{ languageCode: 'pt', languageRegionCode: 'BR' }])).toBe('pt-BR');
    expect(resolveLanguageFromLocales([{ languageCode: 'pt', languageTag: 'pt-BR' }])).toBe('pt-BR');
    // Bare `pt` and other Portuguese regions (e.g. pt-PT) stay English — that
    // fallback is explicit, not accidental.
    expect(resolveLanguageFromLocales([{ languageCode: 'pt', languageRegionCode: 'PT' }])).toBe('en');
    expect(resolveLanguageFromLocales([{ languageCode: 'pt', languageTag: 'pt' }])).toBe('en');
  });

  it('falls back to English for unsupported or unavailable system locales', () => {
    expect(resolveLanguageFromLocales([])).toBe('en');
    expect(resolveLanguageFromLocales([{ languageCode: 'fr', languageTag: 'fr-FR' }])).toBe('en');
  });

  it('keeps an explicit app language independent from the system locale', () => {
    expect(resolveLanguage('zh-Hant', [{ languageCode: 'en' }])).toBe('zh-Hant');
    // Draft locales need the preview flag for an explicit preference (covered
    // above); system resolution stays deterministic.
    expect(resolveLanguage('system', [{ languageCode: 'zh', languageRegionCode: 'TW' }])).toBe('zh-Hant');
  });

  it('validates persisted preferences across the whole registry', () => {
    expect(isLanguagePreference('system')).toBe(true);
    expect(isLanguagePreference('zh-Hant')).toBe(true);
    expect(isLanguagePreference('es-419')).toBe(true);
    expect(isLanguagePreference('pt-BR')).toBe(true);
    // Phase 19.5: ja is a typed draft preference (preview builds only).
    expect(isLanguagePreference('ja')).toBe(true);
    expect(isLanguagePreference('fr')).toBe(false);
    expect(translate('zh-Hans', 'home.learningProgress', { complete: 2, total: 6 })).toBe('2/6 节课程');
    expect(translate('zh-Hant', 'settings.languageCurrent', {
      language: '繁體中文',
    })).toBe('目前為 繁體中文');
  });

  it('resolves the released Phase 19/19.5 locales from the system', () => {
    // es-419/pt-BR/ja were release-enabled by owner decision on 2026-09-15
    // (docs/PHASE_19_EXECUTION_RECORD.md), so system resolution is live for
    // every shipped locale.
    expect(resolveLanguageFromLocales([{ languageCode: 'es', languageRegionCode: 'MX' }])).toBe('es-419');
    expect(resolveLanguageFromLocales([{ languageCode: 'es', languageTag: 'es-419' }])).toBe('es-419');
    expect(resolveLanguageFromLocales([{ languageCode: 'pt', languageRegionCode: 'BR' }])).toBe('pt-BR');
    expect(resolveLanguageFromLocales([{ languageCode: 'ja', languageRegionCode: 'JP' }])).toBe('ja');
    expect(resolveLanguageFromLocales([{ languageCode: 'ja', languageTag: 'ja-JP' }])).toBe('ja');
    expect(resolveLanguage('ja', [{ languageCode: 'en' }])).toBe('ja');
  });

  it('keeps the draft-sanitize path available for future draft locales', () => {
    // All current locales are release-enabled, so the sanitize branch only
    // fires for FUTURE draft locales. Simulate one by temporarily disabling a
    // registry entry, then restore it — the production contract (a stale
    // draft preference resolves like `system`) stays pinned.
    const japanese = LOCALES.ja as { releaseEnabled: boolean };
    japanese.releaseEnabled = false;
    try {
      const spanishDevice = [{ languageCode: 'es', languageRegionCode: 'MX' }];
      // A stale draft preference resolves like `system` — on this Spanish
      // device, that is the released es-419.
      expect(resolveLanguage('ja', spanishDevice)).toBe('es-419');
      // Preview builds pass the flag to keep the draft preference.
      expect(resolveLanguage('ja', spanishDevice, true)).toBe('ja');
      // Release-enabled locales always resolve from an explicit preference.
      expect(resolveLanguage('es-419', spanishDevice)).toBe('es-419');
      expect(resolveLanguage('zh-Hant', [{ languageCode: 'en' }])).toBe('zh-Hant');
    } finally {
      japanese.releaseEnabled = true;
    }
  });

  it('ships every catalog-complete locale in the production surfaces', () => {
    expect(LANGUAGE_PREFERENCES).toEqual(['system', 'en', 'zh-Hans', 'zh-Hant', 'es-419', 'pt-BR', 'ja']);
    expect(SHIPPED_LOCALES).toEqual(['en', 'zh-Hans', 'zh-Hant', 'es-419', 'pt-BR', 'ja']);
    // Every shipped locale also passes the automated translation gates, so
    // the gate suites keep iterating the full set.
    expect(CATALOG_COMPLETE_LOCALES).toEqual(['en', 'zh-Hans', 'zh-Hant', 'es-419', 'pt-BR', 'ja']);
    expect(LOCALES['es-419'].catalogComplete).toBe(true);
    expect(LOCALES['es-419'].releaseEnabled).toBe(true);
    expect(LOCALES['pt-BR'].catalogComplete).toBe(true);
    expect(LOCALES['pt-BR'].releaseEnabled).toBe(true);
    expect(LOCALES.ja.catalogComplete).toBe(true);
    expect(LOCALES.ja.releaseEnabled).toBe(true);
    expect(LOCALES.ja.displayName).toBe('日本語');
    expect(LOCALES.ja.intlLocale).toBe('ja-JP');
    expect(LOCALES.ja.storeLocales).toEqual({ appStore: 'ja', googlePlay: 'ja-JP' });
  });

  it('exposes registry locale metadata as the single source of truth', () => {
    expect(localeIntl('es-419')).toBe('es-419');
    expect(localeIntl('pt-BR')).toBe('pt-BR');
    expect(LOCALES['es-419'].displayName).toBe('Español (Latinoamérica)');
    expect(LOCALES['pt-BR'].displayName).toBe('Português (Brasil)');
    expect(LOCALES['es-419'].nativeLocales).toEqual(['es-419']);
    // App Store Connect metadata locale is Spanish (Mexico); es-419 remains
    // the in-app and Google Play locale (scope §L4).
    expect(LOCALES['es-419'].storeLocales).toEqual({ appStore: 'es-MX', googlePlay: 'es-419' });
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
    // Phase 19 locales carry their own singular/plural forms.
    expect(translateCount('es-419', 'common.players', 1)).toBe('1 jugador');
    expect(translateCount('es-419', 'common.players', 3)).toBe('3 jugadores');
    expect(translateCount('es-419', 'common.bigBlinds', 1)).toBe('1 ciega grande');
    expect(translateCount('es-419', 'common.bigBlinds', 0)).toBe('0 ciegas grandes');
    expect(translateCount('pt-BR', 'common.bigBlinds', 1)).toBe('1 big blind');
    expect(translateCount('pt-BR', 'common.bigBlinds', 3)).toBe('3 big blinds');
    // The migrated count surfaces replace the old parenthetical "(s)" copy.
    expect(translateCount('en', 'championship.bestRuns', 1, { place: '1st' })).toBe('Best 1st · 1 run');
    expect(translateCount('en', 'championship.bestRuns', 4, { place: '1st' })).toBe('Best 1st · 4 runs');
    expect(translateCount('es-419', 'championship.bestRuns', 0, { place: '1.ª' })).toBe('Mejor 1.ª · 0 partidas');
    expect(translateCount('es-419', 'championship.bestRuns', 1, { place: '1.ª' })).toBe('Mejor 1.ª · 1 partida');
    expect(translateCount('pt-BR', 'championship.bestRuns', 2, { place: '1º' })).toBe('Melhor 1º · 2 partidas');
    expect(translateCount('en', 'opponentRead.eyebrow', 1, { confidence: 'some' })).toBe('1 hand · some');
    expect(translateCount('en', 'opponentRead.eyebrow', 12, { confidence: 'some' })).toBe('12 hands · some');
    expect(translateCount('es-419', 'opponentRead.eyebrow', 1, { confidence: 'some' })).toBe('1 mano · some');
    expect(translateCount('es-419', 'opponentRead.eyebrow', 12, { confidence: 'some' })).toBe('12 manos · some');
    expect(translateCount('pt-BR', 'opponentRead.eyebrow', 0, { confidence: 'some' })).toBe('0 mãos · some');
    expect(translateCount('pt-BR', 'opponentRead.eyebrow', 2, { confidence: 'some' })).toBe('2 mãos · some');
    // The live multiway coach surfaces (the free-check branch renders only for
    // playersBehind > 0, but the plural forms must hold for zero as well).
    expect(translateCount('en', 'multiway.coach.freeCheck', 1)).toBe('You can check for free; 1 player can still act if you bet.');
    expect(translateCount('en', 'multiway.coach.freeCheck', 2)).toBe('You can check for free; 2 players can still act if you bet.');
    expect(translateCount('es-419', 'multiway.coach.freeCheck', 1)).toBe('Puedes pasar gratis; si apuestas, todavía puede actuar 1 jugador.');
    expect(translateCount('es-419', 'multiway.coach.freeCheck', 0)).toBe('Puedes pasar gratis; si apuestas, todavía pueden actuar 0 jugadores.');
    expect(translateCount('es-419', 'multiway.coach.freeCheck', 2)).toBe('Puedes pasar gratis; si apuestas, todavía pueden actuar 2 jugadores.');
    expect(translateCount('pt-BR', 'multiway.coach.freeCheck', 1)).toBe('Você pode passar de graça; se apostar, ainda pode agir 1 jogador.');
    expect(translateCount('pt-BR', 'multiway.coach.freeCheck', 2)).toBe('Você pode passar de graça; se apostar, ainda podem agir 2 jogadores.');
    expect(translateCount('en', 'multiplayer.moment.trayBudget', 1)).toBe('1 left this hand');
    expect(translateCount('es-419', 'multiplayer.moment.trayBudget', 1)).toBe('Queda 1 en esta mano');
    expect(translateCount('pt-BR', 'multiway.level', 1, { level: 2, smallBlind: '10', bigBlind: '20' })).toBe('Nível 2 · resta 1 · 10/20');
    expect(translateCount('pt-BR', 'multiway.level', 3, { level: 2, smallBlind: '10', bigBlind: '20' })).toBe('Nível 2 · restam 3 · 10/20');
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
