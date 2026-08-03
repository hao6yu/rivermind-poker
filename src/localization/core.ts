import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
  type MessageKey,
} from './messages';

export type AppLanguage = 'en' | 'zh-Hans' | 'zh-Hant';
export type LanguagePreference = 'system' | AppLanguage;
export type TranslationValues = Record<string, string | number>;

export interface SystemLocaleSnapshot {
  languageCode: string | null;
  languageRegionCode?: string | null;
  languageScriptCode?: string | null;
  languageTag?: string;
  regionCode?: string | null;
}

export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = [
  'system',
  'en',
  'zh-Hans',
  'zh-Hant',
];

const messages: Record<AppLanguage, Record<MessageKey, string>> = {
  en: englishMessages,
  'zh-Hans': simplifiedChineseMessages,
  'zh-Hant': traditionalChineseMessages,
};

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return LANGUAGE_PREFERENCES.includes(value as LanguagePreference);
}

export function resolveLanguageFromLocales(
  locales: readonly SystemLocaleSnapshot[],
): AppLanguage {
  const locale = locales[0];
  if (!locale || locale.languageCode?.toLowerCase() !== 'zh') return 'en';

  const script = locale.languageScriptCode?.toLowerCase();
  const tag = locale.languageTag?.toLowerCase() ?? '';
  if (script === 'hant' || tag.includes('-hant')) return 'zh-Hant';
  if (script === 'hans' || tag.includes('-hans')) return 'zh-Hans';

  const region = (locale.languageRegionCode ?? locale.regionCode)?.toUpperCase();
  return region === 'TW' || region === 'HK' || region === 'MO' ? 'zh-Hant' : 'zh-Hans';
}

export function resolveLanguage(
  preference: LanguagePreference,
  locales: readonly SystemLocaleSnapshot[],
): AppLanguage {
  return preference === 'system' ? resolveLanguageFromLocales(locales) : preference;
}

export function translate(
  language: AppLanguage,
  key: MessageKey,
  values: TranslationValues = {},
): string {
  const template = messages[language][key] ?? englishMessages[key];
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  ));
}

const learningActivityKeyById: Record<string, string> = {
  'lesson-hand-rankings': 'lesson-hand-rankings',
  'lesson-position-blinds': 'lesson-position-blinds',
  'lesson-actions-order': 'lesson-actions-order',
  'lesson-starting-hands': 'lesson-starting-hands',
  'lesson-outs-equity-odds': 'lesson-outs-equity-odds',
  'lesson-value-bluffs': 'lesson-value-bluffs',
  'trainer-percentages': 'trainer-percentages',
  'quiz-core-decisions': 'trainer-hand-quiz',
  'scenario-core-decisions': 'trainer-scenarios',
  'sheet-hand-rankings': 'sheet-hand-rankings',
  'sheet-position': 'sheet-position',
  'sheet-percentages': 'sheet-percentages',
  'sheet-preflop': 'sheet-preflop',
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
  if (id !== 'preflop' && id !== 'betting' && id !== 'odds') return null;
  return `activity.pack-${id}.${field}` as MessageKey;
}
