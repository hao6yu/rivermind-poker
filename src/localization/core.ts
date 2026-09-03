import {
  FALLBACK_LANGUAGE,
  LOCALES,
  isLanguagePreference,
  normalizeLanguagePreference,
  pluralFormFor,
  resolveLanguage,
  resolveLanguageFromLocales,
  usesAuthoredCoachProse,
  type AppLanguage,
  type LanguagePreference,
  type LocaleDefinition,
  type SystemLocaleSnapshot,
} from './registry';
import { selectPluralForm } from './plurals';
import type { MessageKey } from './messages';

export type { AppLanguage, LanguagePreference, SystemLocaleSnapshot } from './registry';
export { isLanguagePreference, normalizeLanguagePreference, resolveLanguage, resolveLanguageFromLocales, usesAuthoredCoachProse } from './registry';

export type TranslationValues = Record<string, string | number>;

// Re-exported for existing imports; the registry owns the locale sets.
export { CATALOG_COMPLETE_LOCALES, LANGUAGE_PREFERENCES, SHIPPED_LOCALES } from './registry';

function interpolate(template: string, values: TranslationValues): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  ));
}

export function translate(
  language: AppLanguage,
  key: MessageKey,
  values: TranslationValues = {},
): string {
  let template = LOCALES[language].messageCatalog[key] ?? LOCALES[FALLBACK_LANGUAGE].messageCatalog[key];
  // Runtime data can outlive the bundle that produced it during an update or
  // development refresh. A missing key should remain visible for diagnosis,
  // but it must never blank an entire game screen.
  if (template === undefined) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // Dev-time authoring aid only, deliberately NOT a diagnostic event: a
      // missing catalog key is caught by the parity gates in CI, and a keyed
      // token here would add noise without changing what the player sees.
      console.warn(`[localization] Missing message: ${key}`);
    }
    return key;
  }
  // Count-aware selection is central: any caller that passes a numeric
  // `count` — through `t` or the `tCount` shorthand — gets the locale's
  // plural form for that key (see plurals.ts). Call sites can never forget
  // the plural layer, and a plural-covered key routed through plain `t`
  // still renders "1 jugador" rather than "1 jugadores".
  if (typeof values.count === 'number') {
    const forms = LOCALES[language].plurals[key];
    if (forms) {
      const selected = selectPluralForm(forms, values.count);
      if (selected !== undefined) template = selected;
    }
  }
  return interpolate(template, values);
}

/**
 * Count-aware message shorthand. The selection itself lives in
 * {@link translate} so both entry points share one code path; this wrapper
 * documents intent at count-bearing call sites.
 */
export function translateCount(
  language: AppLanguage,
  key: MessageKey,
  count: number,
  values: TranslationValues = {},
): string {
  return translate(language, key, { ...values, count });
}

const learningActivityKeyById: Record<string, string> = {
  'lesson-hand-rankings': 'lesson-hand-rankings',
  'lesson-position-blinds': 'lesson-position-blinds',
  'lesson-actions-order': 'lesson-actions-order',
  'lesson-starting-hands': 'lesson-starting-hands',
  'lesson-outs-equity-odds': 'lesson-outs-equity-odds',
  'lesson-value-bluffs': 'lesson-value-bluffs',
  'lesson-preflop-opening-position': 'lesson-preflop-opening-position',
  'lesson-preflop-limpers': 'lesson-preflop-limpers',
  'lesson-preflop-facing-raise': 'lesson-preflop-facing-raise',
  'lesson-preflop-blind-defense': 'lesson-preflop-blind-defense',
  'lesson-preflop-three-bet-plan': 'lesson-preflop-three-bet-plan',
  'lesson-preflop-facing-three-bet': 'lesson-preflop-facing-three-bet',
  'lesson-postflop-board-texture': 'lesson-postflop-board-texture',
  'lesson-postflop-continuation-bets': 'lesson-postflop-continuation-bets',
  'lesson-postflop-value-sizing': 'lesson-postflop-value-sizing',
  'lesson-postflop-playing-draws': 'lesson-postflop-playing-draws',
  'lesson-postflop-river-decisions': 'lesson-postflop-river-decisions',
  'lesson-postflop-range-advantage': 'lesson-postflop-range-advantage',
  'lesson-postflop-three-bet-pots': 'lesson-postflop-three-bet-pots',
  'lesson-postflop-turn-barrels': 'lesson-postflop-turn-barrels',
  'lesson-postflop-river-polarization': 'lesson-postflop-river-polarization',
  'lesson-postflop-river-bluff-catchers': 'lesson-postflop-river-bluff-catchers',
  'lesson-tournament-stack-zones': 'lesson-tournament-stack-zones',
  'lesson-tournament-short-stack-opens': 'lesson-tournament-short-stack-opens',
  'lesson-tournament-reshoves-calls': 'lesson-tournament-reshoves-calls',
  'lesson-tournament-risk-premium': 'lesson-tournament-risk-premium',
  'lesson-tournament-stack-coverage': 'lesson-tournament-stack-coverage',
  'lesson-tournament-bubble-decisions': 'lesson-tournament-bubble-decisions',
  'lesson-opponents-evidence': 'lesson-opponents-evidence',
  'lesson-opponents-callers-folders': 'lesson-opponents-callers-folders',
  'lesson-opponents-aggression-traps': 'lesson-opponents-aggression-traps',
  'lesson-math-implied-odds': 'lesson-math-implied-odds',
  'lesson-math-reverse-implied-odds': 'lesson-math-reverse-implied-odds',
  'lesson-math-break-even-bluffs': 'lesson-math-break-even-bluffs',
  'trainer-percentages': 'trainer-percentages',
  'quiz-core-decisions': 'trainer-hand-quiz',
  'quiz-preflop-mastery': 'quiz-preflop-mastery',
  'quiz-postflop-mastery': 'quiz-postflop-mastery',
  'mission-preflop-enter-pot': 'mission-preflop-enter-pot',
  'mission-preflop-pressure': 'mission-preflop-pressure',
  'mission-postflop-cbet': 'mission-postflop-cbet',
  'mission-postflop-river': 'mission-postflop-river',
  'mission-tournament-bubble': 'mission-tournament-bubble',
  'mission-opponent-adjustments': 'mission-opponent-adjustments',
  'scenario-core-decisions': 'trainer-scenarios',
  'sheet-hand-rankings': 'sheet-hand-rankings',
  'sheet-position': 'sheet-position',
  'sheet-percentages': 'sheet-percentages',
  'sheet-preflop': 'sheet-preflop',
  'sheet-advanced-math': 'sheet-advanced-math',
};

export function learningActivityMessageKey(
  id: string,
  field: 'description' | 'title',
): MessageKey | null {
  const activityKey = learningActivityKeyById[id];
  if (!activityKey) return null;
  return `activity.${activityKey}.${field}` as MessageKey;
}

export function practicePackMessageKey(
  id: string,
  field: 'description' | 'title',
): MessageKey | null {
  if (id !== 'preflop'
    && id !== 'preflop-enter'
    && id !== 'preflop-pressure'
    && id !== 'preflop-three-bet'
    && id !== 'betting'
    && id !== 'odds'
    && id !== 'postflop-range'
    && id !== 'postflop-river'
    && id !== 'tournament-short-stack'
    && id !== 'tournament-bubble'
    && id !== 'opponent-adjustments'
    && id !== 'advanced-math') return null;
  return `activity.pack-${id}.${field}` as MessageKey;
}

/** Exposed for tooling and tests; screens read the registry through helpers. */
export function localeDefinition(language: AppLanguage): LocaleDefinition {
  return LOCALES[language];
}

// Keep the plural helper reachable for advanced callers without exposing
// the whole registry module to screens.
export { pluralFormFor };
