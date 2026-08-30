/**
 * The semantic theme tokens, extracted from the React provider so pure tests
 * (contrast corpus, token audits) can import them without react-native.
 * Every visible string and icon must resolve through one of these tokens; the
 * platform default foreground is never an accepted fallback (Slice 3.11A).
 */

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
  /** Foreground for text or icons rendered directly on an `aqua` fill. */
  onAqua: string;
  amber: string;
  amberText: string;
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

export const lightPalette: ThemePalette = {
  background: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceRaised: '#FBFBFE',
  soft: '#F0F1F7',
  accentSoft: '#EEF0FF',
  aquaSoft: '#E6F8F5',
  text: '#171A24',
  // Secondary copy must clear 4.5:1 on every light surface it appears on,
  // including `soft`; the previous value fell to 3.85:1 there.
  muted: '#62687A',
  border: '#E5E7EF',
  primary: '#5963E9',
  primaryText: '#FFFFFF',
  // Darkened so the accent clears 3:1 against light backgrounds and its own
  // `onAqua` foreground clears 4.5:1.
  aqua: '#188080',
  aquaText: '#0B564D',
  onAqua: '#FFFFFF',
  amber: '#9A6E1B',
  amberText: '#FFFFFF',
  table: '#125345',
  tableDeep: '#0A3028',
  tableLine: '#377566',
  tableText: '#F7FFFC',
  card: '#FFFFFF',
  cardText: '#141823',
  cardRed: '#D1465A',
  danger: '#BD4052',
  shadow: '#262B43',
  scrim: 'rgba(17, 20, 31, 0.34)',
};

export const darkPalette: ThemePalette = {
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
  onAqua: '#10201E',
  amber: '#E3A04C',
  amberText: '#1A1508',
  table: '#0F4338',
  tableDeep: '#08271F',
  tableLine: '#2D685A',
  tableText: '#F7FFFC',
  card: '#F5F6F9',
  cardText: '#141823',
  cardRed: '#BD3E52',
  danger: '#FF7D8E',
  shadow: '#000000',
  scrim: 'rgba(0, 0, 0, 0.58)',
};
