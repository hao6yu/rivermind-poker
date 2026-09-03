import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
  type MessageKey,
} from './messages';
import {
  englishPlurals,
  portuguesePlurals,
  selectPluralForm,
  simplifiedChinesePlurals,
  spanishPlurals,
  traditionalChinesePlurals,
  type MessagePluralCatalog,
} from './plurals';

/**
 * The typed locale registry — the single source of truth for supported
 * locales. Adding a locale means adding one entry here plus its catalogs;
 * screens never branch on locale identity.
 *
 * Phase 19 (`es-419`, `pt-BR`) entries start with `catalogComplete: false`,
 * which keeps them out of the production language picker until their full
 * catalogs pass the parity/semantic gates. Japanese (`ja`) is the separately
 * gated Phase 19.5 follow-up and is intentionally absent.
 */
export type AppLanguage = 'en' | 'zh-Hans' | 'zh-Hant' | 'es-419' | 'pt-BR';
export type LanguagePreference = 'system' | AppLanguage;
export type TranslationValues = Record<string, string | number>;

export interface SystemLocaleSnapshot {
  languageCode: string | null;
  languageRegionCode?: string | null;
  languageScriptCode?: string | null;
  languageTag?: string;
  regionCode?: string | null;
}

export interface StoreLocaleMapping {
  /** App Store Connect metadata localization id. */
  appStore: string;
  /** Google Play store listing locale. */
  googlePlay: string;
}

export interface LocaleDefinition {
  id: AppLanguage;
  /** The language's own name, rendered identically in every locale. */
  displayName: string;
  /** Catalog key of the self-name row (typed for the picker). */
  displayNameKey: MessageKey;
  /** Intl locale used for all date formatting through format.ts. */
  intlLocale: string;
  textDirection: 'ltr';
  /** Declared native locales (app.json supportedLocales entries). */
  nativeLocales: readonly string[];
  storeLocales: StoreLocaleMapping;
  /** Whether the Edge Function coach contract accepts this language. */
  aiCoachSupported: boolean;
  /**
   * True only once the locale's complete catalogs pass the parity, placeholder,
   * semantic, and leakage gates. Gates treat every catalogComplete locale as a
   * production candidate: no unexplained English fallback is allowed.
   */
  catalogComplete: boolean;
  /** Resolved message catalog. Incomplete locales resolve through English. */
  messageCatalog: Record<MessageKey, string>;
  /** Count-aware forms on top of the base templates. */
  plurals: MessagePluralCatalog;
}

export const FALLBACK_LANGUAGE: AppLanguage = 'en';

export const LOCALES: Record<AppLanguage, LocaleDefinition> = {
  en: {
    id: 'en',
    displayName: 'English',
    displayNameKey: 'language.en',
    intlLocale: 'en-US',
    textDirection: 'ltr',
    nativeLocales: ['en'],
    storeLocales: { appStore: 'en-US', googlePlay: 'en-US' },
    aiCoachSupported: true,
    catalogComplete: true,
    messageCatalog: englishMessages,
    plurals: englishPlurals,
  },
  'zh-Hans': {
    id: 'zh-Hans',
    displayName: '简体中文',
    displayNameKey: 'language.zhHans',
    intlLocale: 'zh-CN',
    textDirection: 'ltr',
    nativeLocales: ['zh-Hans'],
    storeLocales: { appStore: 'zh-Hans', googlePlay: 'zh-CN' },
    aiCoachSupported: true,
    catalogComplete: true,
    messageCatalog: simplifiedChineseMessages,
    plurals: simplifiedChinesePlurals,
  },
  'zh-Hant': {
    id: 'zh-Hant',
    displayName: '繁體中文',
    displayNameKey: 'language.zhHant',
    intlLocale: 'zh-TW',
    textDirection: 'ltr',
    nativeLocales: ['zh-Hant'],
    storeLocales: { appStore: 'zh-Hant', googlePlay: 'zh-TW' },
    aiCoachSupported: true,
    catalogComplete: true,
    messageCatalog: traditionalChineseMessages,
    plurals: traditionalChinesePlurals,
  },
  'es-419': {
    id: 'es-419',
    displayName: 'Español (Latinoamérica)',
    displayNameKey: 'language.es419',
    intlLocale: 'es-419',
    textDirection: 'ltr',
    nativeLocales: ['es-419'],
    storeLocales: { appStore: 'es-419', googlePlay: 'es-419' },
    aiCoachSupported: true,
    catalogComplete: false,
    messageCatalog: englishMessages,
    plurals: spanishPlurals,
  },
  'pt-BR': {
    id: 'pt-BR',
    displayName: 'Português (Brasil)',
    displayNameKey: 'language.ptBr',
    intlLocale: 'pt-BR',
    textDirection: 'ltr',
    nativeLocales: ['pt-BR'],
    storeLocales: { appStore: 'pt-BR', googlePlay: 'pt-BR' },
    aiCoachSupported: true,
    catalogComplete: false,
    messageCatalog: englishMessages,
    plurals: portuguesePlurals,
  },
};

/** Locales complete enough to be production candidates (drives the gates). */
export const SHIPPED_LOCALES: readonly AppLanguage[] = Object.values(LOCALES)
  .filter((locale) => locale.catalogComplete)
  .map((locale) => locale.id);

/** Locales whose Edge Function coach contract accepts the language. */
export const AI_COACH_LANGUAGES: readonly AppLanguage[] = Object.values(LOCALES)
  .filter((locale) => locale.aiCoachSupported)
  .map((locale) => locale.id);

/**
 * The picker list: System plus every complete locale. Incomplete locales stay
 * hidden from production until their gates pass (scope §5 L2).
 */
export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = [
  'system',
  ...SHIPPED_LOCALES,
];

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || (typeof value === 'string' && value in LOCALES);
}

/**
 * Deterministic system-locale resolution, documented per scope §2:
 *   - every Spanish system locale maps to `es-419` until a distinct es-ES
 *     catalog exists;
 *   - `pt-BR` resolves to `pt-BR`; bare `pt` and other Portuguese regions
 *     (e.g. `pt-PT`) stay English — that fallback is explicit, not accidental;
 *   - Chinese resolves by script, then by region (TW/HK/MO → Traditional);
 *   - unknown or missing locales resolve to English.
 */
export function resolveLanguageFromLocales(
  locales: readonly SystemLocaleSnapshot[],
): AppLanguage {
  const locale = locales[0];
  if (!locale) return FALLBACK_LANGUAGE;

  const languageCode = locale.languageCode?.toLowerCase();
  const tag = locale.languageTag?.toLowerCase() ?? '';

  if (languageCode === 'zh') {
    const script = locale.languageScriptCode?.toLowerCase();
    if (script === 'hant' || tag.includes('-hant')) return 'zh-Hant';
    if (script === 'hans' || tag.includes('-hans')) return 'zh-Hans';
    const region = (locale.languageRegionCode ?? locale.regionCode)?.toUpperCase();
    return region === 'TW' || region === 'HK' || region === 'MO' ? 'zh-Hant' : 'zh-Hans';
  }

  if (languageCode === 'es') return 'es-419';

  if (languageCode === 'pt') {
    const region = (locale.languageRegionCode ?? locale.regionCode)?.toUpperCase();
    if (region === 'BR' || tag.includes('-br') || tag === 'pt-br') return 'pt-BR';
    return FALLBACK_LANGUAGE;
  }

  return FALLBACK_LANGUAGE;
}

export function resolveLanguage(
  preference: LanguagePreference,
  locales: readonly SystemLocaleSnapshot[],
): AppLanguage {
  return preference === 'system' ? resolveLanguageFromLocales(locales) : preference;
}

/**
 * Deterministic coach prose is authored in English only; every other shipped
 * locale renders the localized presentation templates through the catalog.
 * Centralized here so no screen branches on locale identity.
 */
export function usesAuthoredCoachProse(language: AppLanguage): boolean {
  return language === 'en';
}

/** Count-aware form selection for fixture tests and the translate API. */
export function pluralFormFor(
  language: AppLanguage,
  key: MessageKey,
  count: number,
): string | null {
  const forms = LOCALES[language].plurals[key];
  return forms ? selectPluralForm(forms, count) : null;
}
