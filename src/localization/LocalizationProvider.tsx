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

import {
  isLanguagePreference,
  learningActivityMessageKey,
  practicePackMessageKey,
  resolveLanguage,
  translate,
  type AppLanguage,
  type LanguagePreference,
  type TranslationValues,
} from './core';
import type { MessageKey } from './messages';

const STORAGE_KEY = 'rivermind.languagePreference';

interface LocalizationContextValue {
  language: AppLanguage;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  t: (key: MessageKey, values?: TranslationValues) => string;
  activityText: (
    activity: { description: string; id: string; title: string },
    field: 'description' | 'title',
  ) => string;
  practicePackText: (
    pack: { description: string; id: string; title: string },
    field: 'description' | 'title',
  ) => string;
}

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

function readPreference(): LanguagePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLanguagePreference(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function LocalizationProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(readPreference);
  const [systemLocales, setSystemLocales] = useState(getLocales);
  const language = resolveLanguage(preference, systemLocales);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setSystemLocales(getLocales());
    });
    return () => subscription.remove();
  }, []);

  const setPreference = useCallback((next: LanguagePreference) => {
    setPreferenceState(next);
    if (next === 'system') setSystemLocales(getLocales());
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The preference still applies for this session if device storage is unavailable.
    }
  }, []);

  const t = useCallback(
    (key: MessageKey, values?: TranslationValues) => translate(language, key, values),
    [language],
  );
  const activityText = useCallback((
    activity: { description: string; id: string; title: string },
    field: 'description' | 'title',
  ) => {
    const key = learningActivityMessageKey(activity.id, field);
    return key ? translate(language, key) : activity[field];
  }, [language]);
  const practicePackText = useCallback((
    pack: { description: string; id: string; title: string },
    field: 'description' | 'title',
  ) => {
    const key = practicePackMessageKey(pack.id, field);
    return key ? translate(language, key) : pack[field];
  }, [language]);

  const value = useMemo(() => ({
    activityText,
    language,
    practicePackText,
    preference,
    setPreference,
    t,
  }), [activityText, language, practicePackText, preference, setPreference, t]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization(): LocalizationContextValue {
  const value = useContext(LocalizationContext);
  if (!value) throw new Error('useLocalization must be used inside LocalizationProvider.');
  return value;
}
