import 'expo-sqlite/localStorage/install';

import { getLocales } from 'expo-localization';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { internalPreviewLocalesEnabled } from './internalPreview';
import { isDraftCatalogLanguage, isDraftCatalogLoaded, loadDraftLocaleCatalog } from './draftCatalogs';

import type {
  CheatSheetDefinition,
  LessonDefinition,
  TrainerDefinition,
  ScenarioSpot,
} from '../domain/learning/types';
import {
  isLanguagePreference,
  learningActivityMessageKey,
  normalizeLanguagePreference,
  practicePackMessageKey,
  resolveLanguage,
  translate,
  translateCount,
  type AppLanguage,
  type LanguagePreference,
  type TranslationValues,
} from './core';
import type { MessageKey } from './messages';
import {
  localizeCheatSheetContent,
  localizeLessonContent,
  localizeTrainerContent,
} from './learningContent';
import { localizeScenarioContent } from './scenarioContent';

const STORAGE_KEY = 'rivermind.languagePreference';

interface LocalizationContextValue {
  language: AppLanguage;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  t: (key: MessageKey, values?: TranslationValues) => string;
  /** Count-aware translation: selects the locale's plural form for `count`. */
  tCount: (key: MessageKey, count: number, values?: TranslationValues) => string;
  activityText: (
    activity: { description: string; id: string; title: string },
    field: 'description' | 'title',
  ) => string;
  cheatSheetContent: (sheet: CheatSheetDefinition) => CheatSheetDefinition;
  lessonContent: (lesson: LessonDefinition) => LessonDefinition;
  practicePackText: (
    pack: { description: string; id: string; title: string },
    field: 'description' | 'title',
  ) => string;
  scenarioContent: (scenario: ScenarioSpot) => ScenarioSpot;
  trainerContent: (trainer: TrainerDefinition) => TrainerDefinition;
}

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

function readPreference(previewDraftLocales: boolean): LanguagePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // A stale saved draft locale is normalized to 'system' in production —
    // not merely overridden at resolution time — so the settings surface
    // never presents a disabled locale as the current choice and the picker
    // keeps a selected row.
    const parsed = isLanguagePreference(saved) ? saved : 'system';
    return normalizeLanguagePreference(parsed, previewDraftLocales);
  } catch {
    return 'system';
  }
}

export function LocalizationProvider({ children }: PropsWithChildren) {
  // The locale build profile decides whether draft locales are exercisable:
  // builds carrying the internal-preview profile keep draft preferences;
  // production — including a dev server started without the profile env var —
  // normalizes them to 'system' (review remediation #5 — the EAS preview
  // profile is production-like, so __DEV__ alone was never sufficient).
  const previewDraftLocales = internalPreviewLocalesEnabled();
  const [preference, setPreferenceState] = useState<LanguagePreference>(
    () => readPreference(previewDraftLocales),
  );
  const [systemLocales, setSystemLocales] = useState(getLocales);
  const language = resolveLanguage(preference, systemLocales, previewDraftLocales);
  // Draft catalogs resolve on demand: when the profile authorizes drafts and
  // the resolved language is a draft, load its per-profile catalog graph then
  // re-render with the registered catalog. Production never reaches this
  // (drafts sanitize away).
  const [draftCatalogVersion, setDraftCatalogVersion] = useState(0);
  useEffect(() => {
    if (!previewDraftLocales || !isDraftCatalogLanguage(language) || isDraftCatalogLoaded(language)) return;
    let cancelled = false;
    loadDraftLocaleCatalog(language)
      .then(() => {
        if (!cancelled) setDraftCatalogVersion((version) => version + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [previewDraftLocales, language]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setSystemLocales(getLocales());
    });
    return () => subscription.remove();
  }, []);

  const setPreference = useCallback((next: LanguagePreference) => {
    const sanitized = normalizeLanguagePreference(next, previewDraftLocales);
    setPreferenceState(sanitized);
    if (sanitized === 'system') setSystemLocales(getLocales());
    try {
      localStorage.setItem(STORAGE_KEY, sanitized);
    } catch {
      // The preference still applies for this session if device storage is unavailable.
    }
  }, [previewDraftLocales]);

  // draftCatalogVersion is a dependency of every catalog-reading callback
  // (review finding round 2, #2): when a draft chunk finishes loading, the
  // callbacks must be recreated and the memoized context value replaced so
  // context consumers re-render with the registered catalog instead of
  // staying on the English fallback.
  const t = useCallback(
    (key: MessageKey, values?: TranslationValues) => translate(language, key, values),
    [language, draftCatalogVersion],
  );
  const tCount = useCallback(
    (key: MessageKey, count: number, values?: TranslationValues) => translateCount(language, key, count, values),
    [language, draftCatalogVersion],
  );
  const activityText = useCallback((
    activity: { description: string; id: string; title: string },
    field: 'description' | 'title',
  ) => {
    const key = learningActivityMessageKey(activity.id, field);
    return key ? translate(language, key) : activity[field];
  }, [language, draftCatalogVersion]);
  const practicePackText = useCallback((
    pack: { description: string; id: string; title: string },
    field: 'description' | 'title',
  ) => {
    const key = practicePackMessageKey(pack.id, field);
    return key ? translate(language, key) : pack[field];
  }, [language, draftCatalogVersion]);
  const lessonContent = useCallback((lesson: LessonDefinition) => localizeLessonContent(
    lesson,
    language,
    activityText(lesson, 'title'),
    activityText(lesson, 'description'),
  ), [activityText, language, draftCatalogVersion]);
  const trainerContent = useCallback((trainer: TrainerDefinition) => localizeTrainerContent(
    trainer,
    language,
    activityText(trainer, 'title'),
    activityText(trainer, 'description'),
  ), [activityText, language, draftCatalogVersion]);
  const cheatSheetContent = useCallback((sheet: CheatSheetDefinition) => localizeCheatSheetContent(
    sheet,
    language,
    activityText(sheet, 'title'),
    activityText(sheet, 'description'),
  ), [activityText, language]);
  const scenarioContent = useCallback(
    (scenario: ScenarioSpot) => localizeScenarioContent(scenario, language),
    [language, draftCatalogVersion],
  );

  const value = useMemo(() => ({
    activityText,
    cheatSheetContent,
    language,
    lessonContent,
    practicePackText,
    preference,
    scenarioContent,
    setPreference,
    t,
    tCount,
    trainerContent,
  }), [activityText, cheatSheetContent, draftCatalogVersion, language, lessonContent, practicePackText, preference, scenarioContent, setPreference, t, tCount, trainerContent]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization(): LocalizationContextValue {
  const value = useContext(LocalizationContext);
  if (!value) throw new Error('useLocalization must be used inside LocalizationProvider.');
  return value;
}
