/**
 * Phase 18.5 (S8/P18-046) — the named design-scale tokens.
 *
 * Every shared primitive consumes this module, and the style-scale scan
 * (`src/theme/styleScaleScan.ts`) audits literal usage against it. The scale
 * is deliberately small: a value that is not here either rounds to one that
 * is, or belongs on the documented measured-layout exception list (table
 * geometry is measured, not chosen).
 *
 * Spacing is a 4-point scale. Radii are a small named set plus a pill.
 * Control heights cover the three interactive sizes the product uses.
 * Typography tiers pair a size with its line height so text never sets a
 * bare size again.
 */

/** The 4-point spacing scale. `hairline`/`xxs` are the only sub-4 values and
 * exist for 1-2pt optical alignment around borders and dense table plaques. */
export const SPACING = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  huge: 32,
  vast: 40,
  giga: 48,
} as const;
export type SpacingToken = keyof typeof SPACING;

/** The small radius set plus the fully-round pill. */
export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;
export type RadiusToken = keyof typeof RADIUS;

/**
 * Interactive control heights. `compact` rows live inside dense table chrome;
 * `standard` is the default tappable row/chip height; `primary` is the main
 * call-to-action height. All three clear the 44pt minimum touch target —
 * compact rows must pair with `hitSlop` or an expanded hit area when the
 * rendered control itself is shorter than 44.
 */
export const CONTROL_HEIGHT = {
  compact: 36,
  standard: 44,
  primary: 52,
} as const;
export type ControlHeightToken = keyof typeof CONTROL_HEIGHT;

/**
 * Typography tiers: one named size per role, each with its line height.
 * Table plaques use `plaque` explicitly so the felt can opt into the same
 * contract as the shell.
 */
export const TYPOGRAPHY = {
  /** Small decorative numerals inside table plaques (dense felt only). */
  plaqueNumeral: { fontSize: 9, lineHeight: 12 },
  micro: { fontSize: 10, lineHeight: 13 },
  eyebrow: { fontSize: 11, lineHeight: 14 },
  caption: { fontSize: 12, lineHeight: 16 },
  body: { fontSize: 13, lineHeight: 18 },
  bodyLarge: { fontSize: 14, lineHeight: 19 },
  lede: { fontSize: 15, lineHeight: 20 },
  sectionTitle: { fontSize: 16, lineHeight: 21 },
  title: { fontSize: 17, lineHeight: 22 },
  pageTitle: { fontSize: 20, lineHeight: 26 },
  display: { fontSize: 22, lineHeight: 28 },
} as const;
export type TypographyToken = keyof typeof TYPOGRAPHY;

/**
 * Per-scheme elevation. Level 0 renders no shadow. Dark surfaces need a
 * stronger shadow to read as raised against the near-black background
 * (P18-023), so the dark scheme raises opacity and radius at every level
 * above 0 and uses a true black shadow color.
 */
export interface ElevationLevel {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android API elevation; the platform approximates the same visual. */
  elevation: number;
}

export interface ElevationSet {
  level0: ElevationLevel;
  level1: ElevationLevel;
  level2: ElevationLevel;
  level3: ElevationLevel;
}

/**
 * The elevation contract for one scheme. `shadowColorHex` comes from the
 * active palette (`palette.shadow`) so contrast stays token-owned; dark mode
 * passes the deeper `#000000` shadow it already declares.
 */
export function elevationForScheme(scheme: 'light' | 'dark', shadowColorHex: string): ElevationSet {
  const none: ElevationLevel = {
    shadowColor: shadowColorHex,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  };
  const dark = scheme === 'dark';
  return {
    level0: none,
    level1: {
      shadowColor: shadowColorHex,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: dark ? 0.45 : 0.14,
      shadowRadius: dark ? 4 : 3,
      elevation: dark ? 3 : 2,
    },
    level2: {
      shadowColor: shadowColorHex,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: dark ? 0.55 : 0.18,
      shadowRadius: dark ? 8 : 6,
      elevation: dark ? 6 : 4,
    },
    level3: {
      shadowColor: shadowColorHex,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: dark ? 0.65 : 0.24,
      shadowRadius: dark ? 14 : 10,
      elevation: dark ? 10 : 8,
    },
  };
}

/**
 * Centralized text-scaling ceilings (P18-046). The product honors OS font
 * scaling (P18-027 removed the `allowFontScaling={false}` antipattern); each
 * surface class declares how far scaling may go so large-text layouts stay
 * legible without breaking dense chrome. Table plaques cap lower than shell
 * copy because the felt is collision-measured.
 */
export const TEXT_SCALE_CEILING = {
  /** Free-flowing shell copy (home, learn, profile prose). */
  shell: 1.6,
  /** Cards, list rows, menu descriptions. */
  card: 1.5,
  /** Buttons, chips, tabs, and other controls. */
  control: 1.35,
  /** Table plaques, board labels, pot/turn pills. */
  tablePlaque: 1.2,
  /** Player-facing numerals that must not reflow (card ranks, pot amounts). */
  numeral: 1.1,
} as const;
export type TextScaleCeilingToken = keyof typeof TEXT_SCALE_CEILING;

/** The allowed `maxFontSizeMultiplier` values, for the scan. */
export const TEXT_SCALE_CEILING_VALUES: readonly number[] = Object.values(TEXT_SCALE_CEILING);
