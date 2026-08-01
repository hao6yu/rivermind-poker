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

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemePalette {
  background: string;
  surface: string;
  surfaceRaised: string;
  soft: string;
  accentSoft: string;
  aquaSoft: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primaryText: string;
  aqua: string;
  aquaText: string;
  table: string;
  tableDeep: string;
  tableLine: string;
  tableText: string;
  card: string;
  cardText: string;
  cardRed: string;
  danger: string;
  shadow: string;
  scrim: string;
}

const lightPalette: ThemePalette = {
  background: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceRaised: '#FBFBFE',
  soft: '#F0F1F7',
  accentSoft: '#EEF0FF',
  aquaSoft: '#E6F8F5',
  text: '#171A24',
  muted: '#747989',
  border: '#E5E7EF',
  primary: '#5963E9',
  primaryText: '#FFFFFF',
  aqua: '#25A999',
  aquaText: '#0B564D',
  table: '#242836',
  tableDeep: '#181B26',
  tableLine: '#3D4358',
  tableText: '#F8F9FF',
  card: '#FFFFFF',
  cardText: '#141823',
  cardRed: '#D1465A',
  danger: '#BD4052',
  shadow: '#262B43',
  scrim: 'rgba(17, 20, 31, 0.34)',
};

const darkPalette: ThemePalette = {
  background: '#0B0D12',
  surface: '#151820',
  surfaceRaised: '#1B1E28',
  soft: '#21242E',
  accentSoft: '#242743',
  aquaSoft: '#15342F',
  text: '#F5F6FB',
  muted: '#A8ADBA',
  border: '#292D38',
  primary: '#9097FF',
  primaryText: '#10121A',
  aqua: '#65DDCD',
  aquaText: '#D8FFF8',
  table: '#1A1D27',
  tableDeep: '#10121A',
  tableLine: '#373C4D',
  tableText: '#F8F9FF',
  card: '#F5F6F9',
  cardText: '#141823',
  cardRed: '#BD3E52',
  danger: '#FF7D8E',
  shadow: '#000000',
  scrim: 'rgba(0, 0, 0, 0.58)',
};

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
