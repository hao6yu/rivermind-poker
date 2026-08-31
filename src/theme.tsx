import 'expo-sqlite/localStorage/install';

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  darkPalette,
  lightPalette,
  type ResolvedTheme,
  type ThemePalette,
  type ThemePreference,
} from './themePalette';

export type { ResolvedTheme, ThemePalette, ThemePreference } from './themePalette';
export { darkPalette, lightPalette } from './themePalette';

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: ResolvedTheme;
  palette: ThemePalette;
  setPreference: (preference: ThemePreference) => void;
}

const STORAGE_KEY = 'rivermind.themePreference';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const scheme: ResolvedTheme = preference === 'system' ? systemScheme ?? 'light' : preference;
  const palette = scheme === 'dark' ? darkPalette : lightPalette;

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The preference still applies for this session if device storage is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, scheme, palette, setPreference }),
    [palette, preference, scheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider.');
  return value;
}
