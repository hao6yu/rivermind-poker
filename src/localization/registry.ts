import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
  type MessageKey,
} from './messages';
import {
  setDraftCatalogRegistrar,
} from './draftCatalogs';
import {
  englishPlurals,
  japanesePlurals,
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
 * Phase 19 (`es-419`, `pt-BR`) status: their generated catalogs passed the
 * parity/placeholder/semantic gates (`catalogComplete: true`), but they remain
 * `releaseEnabled: false` first drafts pending the native poker-language
 * review contract (style guides §11; approval is recorded in
 * docs/PHASE_19_EXECUTION_RECORD.md). Release enablement is a separate flag so
 * translation completeness never by itself adds a language to the production
 * picker or system-locale resolution. Japanese (`ja`) is the Phase 19.5
 * draft (catalogComplete: true, releaseEnabled: false): its catalog loads
 * lazily through draftCatalogs.ts and stays out of production bundles.
 */
export type AppLanguage = 'en' | 'zh-Hans' | 'zh-Hant' | 'es-419' | 'pt-BR' | 'ja';
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
  /**
   * True only once the §11 native poker-language review approval is recorded
   * for a release. Draft locales stay out of SHIPPED_LOCALES, the language
   * picker, and system-locale resolution even when catalogComplete; an
   * explicit saved preference still resolves (preview builds).
   */
  releaseEnabled: boolean;
  /** Resolved message catalog. Incomplete locales resolve through English. */
  messageCatalog: Record<MessageKey, string>;
  /** Count-aware forms on top of the base templates. */
  plurals: MessagePluralCatalog;
}

export const FALLBACK_LANGUAGE: AppLanguage = 'en';

// Draft catalogs (es-419/pt-BR/ja) register into the LOCALES entries through
// this callback when their lazy chunk resolves (draftCatalogs.ts).
setDraftCatalogRegistrar((language, messages) => {
  LOCALES[language].messageCatalog = messages;
});

/**
 * Loads a draft locale's catalog chunk. Resolves immediately for released
 * locales (their catalogs are static). The provider calls this only when the
 * locale profile authorizes draft previews (internalPreviewLocalesEnabled)
 * or the player picks a draft in such a build.
 */
export function loadDraftLocaleCatalog(language: AppLanguage): Promise<void> {
  return loadDraftLocaleCatalogImpl(language);
}

import { loadDraftLocaleCatalog as loadDraftLocaleCatalogImpl } from './draftCatalogs';

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
    releaseEnabled: true,
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
    releaseEnabled: true,
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
    releaseEnabled: true,
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
    // App Store Connect metadata locale: Latin American Spanish maps to
    // Spanish (Mexico) per scope §L4 (es-419 stays correct for the in-app
    // locale and Google Play).
    storeLocales: { appStore: 'es-MX', googlePlay: 'es-419' },
    aiCoachSupported: true,
    catalogComplete: true,
    // First draft: the §11 native review has not approved this locale yet.
    releaseEnabled: false,
    // Draft catalogs load lazily (see draftCatalogs.ts): production builds
    // never fetch them, and translate() falls back to English per key until a
    // preview build registers the loaded catalog.
    messageCatalog: {} as Record<MessageKey, string>,
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
    catalogComplete: true,
    // First draft: the §11 native review has not approved this locale yet.
    releaseEnabled: false,
    // Lazy draft catalog — see the es-419 entry above.
    messageCatalog: {} as Record<MessageKey, string>,
    plurals: portuguesePlurals,
  },
  ja: {
    id: 'ja',
    displayName: '日本語',
    displayNameKey: 'language.ja',
    intlLocale: 'ja-JP',
    textDirection: 'ltr',
    nativeLocales: ['ja'],
    // App Store Connect metadata locale id `ja` (Japanese); Google Play `ja-JP`.
    storeLocales: { appStore: 'ja', googlePlay: 'ja-JP' },
    aiCoachSupported: true,
    catalogComplete: true,
    // Phase 19.5 first draft: every automated catalog gate passes, but the
    // qualified native Japanese poker-language review, device/accessibility
    // evidence, deployed-coach smoke tests, and store materials are pending
    // (docs/LOCALIZATION_JA_STYLE_GUIDE.md §13; scope §6 J1–J3). Japanese
    // stays out of SHIPPED_LOCALES, the production picker, and system-locale
    // resolution until that approval is recorded in
    // docs/PHASE_19_5_EXECUTION_RECORD.md.
    releaseEnabled: false,
    // Lazy draft catalog — see the es-419 entry above.
    messageCatalog: {} as Record<MessageKey, string>,
    plurals: japanesePlurals,
  },
};

/** Locales enabled for a release (drives the picker and system resolution). */
export const SHIPPED_LOCALES: readonly AppLanguage[] = Object.values(LOCALES)
  .filter((locale) => locale.releaseEnabled)
  .map((locale) => locale.id);

/**
 * Locales whose catalogs passed every automated gate. Translation-gate suites
 * iterate these regardless of release enablement so a draft locale's quality
 * ratchet never stalls while it waits for native review.
 */
export const CATALOG_COMPLETE_LOCALES: readonly AppLanguage[] = Object.values(LOCALES)
  .filter((locale) => locale.catalogComplete)
  .map((locale) => locale.id);

/** Locales whose Edge Function coach contract accepts the language. */
export const AI_COACH_LANGUAGES: readonly AppLanguage[] = Object.values(LOCALES)
  .filter((locale) => locale.aiCoachSupported)
  .map((locale) => locale.id);

/**
 * The production picker list: System plus every release-enabled locale. Draft
 * locales (catalogComplete but not yet releaseEnabled) stay hidden from
 * production until the native review sign-off is recorded (style guides §11).
 * Authorized internal-preview builds use {@link languagePreferencesFor} to
 * expose the draft locales as well (review remediation #5).
 */
export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = [
  'system',
  ...SHIPPED_LOCALES,
];

/** Draft locales an authorized internal-preview build may pick. */
export function internalPreviewDraftLocales(): readonly AppLanguage[] {
  return CATALOG_COMPLETE_LOCALES.filter(
    (locale) => !SHIPPED_LOCALES.includes(locale),
  );
}

/**
 * The picker list for the active locale profile: System + released locales,
 * plus the catalog-complete drafts only in authorized internal-preview
 * builds (see src/localization/internalPreview.ts).
 */
export function languagePreferencesFor(internalPreviewLocales: boolean): readonly LanguagePreference[] {
  return internalPreviewLocales
    ? ['system', ...SHIPPED_LOCALES, ...internalPreviewDraftLocales()]
    : LANGUAGE_PREFERENCES;
}

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
 *   - unknown or missing locales resolve to English;
 *   - draft locales (catalogComplete but not releaseEnabled) resolve to
 *     English from the system locale; explicit saved preferences for draft
 *     locales are sanitized the same way unless the caller enables the
 *     preview flag (see {@link resolveLanguage}).
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

  if (languageCode === 'es') {
    return LOCALES['es-419'].releaseEnabled ? 'es-419' : FALLBACK_LANGUAGE;
  }

  if (languageCode === 'pt') {
    const region = (locale.languageRegionCode ?? locale.regionCode)?.toUpperCase();
    if (region === 'BR' || tag.includes('-br') || tag === 'pt-br') {
      return LOCALES['pt-BR'].releaseEnabled ? 'pt-BR' : FALLBACK_LANGUAGE;
    }
    return FALLBACK_LANGUAGE;
  }

  if (languageCode === 'ja') {
    // Every `ja-*` system locale resolves to Japanese only while the locale
    // is release-enabled; draft-gated Japanese resolves to English like the
    // other draft locales.
    return LOCALES.ja.releaseEnabled ? 'ja' : FALLBACK_LANGUAGE;
  }

  return FALLBACK_LANGUAGE;
}

/**
 * Normalizes a stored or incoming preference against release enablement.
 *
 * A preference for a DRAFT locale (`releaseEnabled: false`) normalizes to
 * `system` unless the caller passes `previewDraftLocales` — production builds
 * never pass it, so a stale test-build preference is rewritten instead of
 * merely being overridden at resolution time (the settings surface must not
 * present a disabled locale as the current choice). Development builds pass
 * the preview flag to load and keep draft preferences.
 */
export function normalizeLanguagePreference(
  preference: LanguagePreference,
  previewDraftLocales: boolean,
): LanguagePreference {
  if (preference === 'system') return 'system';
  if (!previewDraftLocales && !LOCALES[preference].releaseEnabled) return 'system';
  return preference;
}

/**
 * Resolves the effective language for a saved preference.
 *
 * Explicit preferences for release-enabled locales always win; draft-locale
 * preferences are normalized to `system` first (see
 * {@link normalizeLanguagePreference}), so resolution follows the device
 * locale unless a preview build opted in.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  locales: readonly SystemLocaleSnapshot[],
  previewDraftLocales = false,
): AppLanguage {
  const normalized = normalizeLanguagePreference(preference, previewDraftLocales);
  return normalized === 'system'
    ? resolveLanguageFromLocales(locales)
    : normalized;
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
