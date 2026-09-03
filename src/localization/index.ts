export {
  LANGUAGE_PREFERENCES,
  isLanguagePreference,
  learningActivityMessageKey,
  practicePackMessageKey,
  resolveLanguage,
  resolveLanguageFromLocales,
  translate,
  translateCount,
  usesAuthoredCoachProse,
  type AppLanguage,
  type LanguagePreference,
  type TranslationValues,
} from './core';
export { LocalizationProvider, useLocalization } from './LocalizationProvider';
export { localeIntl, localizedOrdinalPlace, formatLocaleNumber } from './format';
export { LOCALES, SHIPPED_LOCALES, AI_COACH_LANGUAGES, type LocaleDefinition } from './registry';
export type { MessageKey } from './messages';
