export type AiDifficulty = 'friendly' | 'club' | 'sharp' | 'elite' | 'nemesis';

export interface AiStrategyProfile {
  id: AiDifficulty;
  label: string;
  summary: string;
  equitySamples: number;
  reactionDelayMs: number;
  foldBuffer: number;
  bluffCatchMargin: number;
  bluffCatchMaxPotFraction: number;
  badPriceContinueBase: number;
  badPriceTextureScale: number;
  facingValueEquity: number;
  facingValueEdge: number;
  facingValueFrequency: number;
  facingBluffMaxEquity: number;
  facingBluffBase: number;
  facingBluffTextureScale: number;
  openValueEquity: number;
  openValueFrequency: number;
  openBluffMaxEquity: number;
  openBluffBase: number;
  openBluffTextureScale: number;
  thinPressureMinEquity: number;
  thinPressureMaxEquity: number;
  thinPressureFrequency: number;
  standardValuePotFraction: number;
  strongValuePotFraction: number;
  bluffPotFraction: number;
}

export const AI_STRATEGY_PROFILES: Record<AiDifficulty, AiStrategyProfile> = {
  friendly: {
    id: 'friendly',
    label: 'Friendly',
    summary: 'More checks, wider calls, and gentler pressure while you learn.',
    equitySamples: 116,
    reactionDelayMs: 560,
    foldBuffer: 0.08,
    bluffCatchMargin: 0.06,
    bluffCatchMaxPotFraction: 0.9,
    badPriceContinueBase: 0.22,
    badPriceTextureScale: 0.35,
    facingValueEquity: 0.78,
    facingValueEdge: 0.3,
    facingValueFrequency: 0.48,
    facingBluffMaxEquity: 0.3,
    facingBluffBase: 0.025,
    facingBluffTextureScale: 0.3,
    openValueEquity: 0.68,
    openValueFrequency: 0.62,
    openBluffMaxEquity: 0.32,
    openBluffBase: 0.035,
    openBluffTextureScale: 0.25,
    thinPressureMinEquity: 0.5,
    thinPressureMaxEquity: 0.6,
    thinPressureFrequency: 0.08,
    standardValuePotFraction: 0.58,
    strongValuePotFraction: 0.72,
    bluffPotFraction: 0.48,
  },
  club: {
    id: 'club',
    label: 'Club',
    summary: 'Balanced value, defense, and mixed bluffs for regular practice.',
    equitySamples: 252,
    reactionDelayMs: 720,
    foldBuffer: 0.04,
    bluffCatchMargin: 0.025,
    bluffCatchMaxPotFraction: 0.7,
    badPriceContinueBase: 0.08,
    badPriceTextureScale: 1,
    facingValueEquity: 0.72,
    facingValueEdge: 0.24,
    facingValueFrequency: 0.74,
    facingBluffMaxEquity: 0.34,
    facingBluffBase: 0.07,
    facingBluffTextureScale: 1,
    openValueEquity: 0.61,
    openValueFrequency: 0.82,
    openBluffMaxEquity: 0.38,
    openBluffBase: 0.1,
    openBluffTextureScale: 1,
    thinPressureMinEquity: 0.45,
    thinPressureMaxEquity: 0.61,
    thinPressureFrequency: 0.22,
    standardValuePotFraction: 0.66,
    strongValuePotFraction: 0.82,
    bluffPotFraction: 0.55,
  },
  sharp: {
    id: 'sharp',
    label: 'Sharp',
    summary: 'Tighter price discipline, thinner value, and stronger mixed pressure.',
    equitySamples: 480,
    reactionDelayMs: 900,
    foldBuffer: 0.015,
    bluffCatchMargin: 0.01,
    bluffCatchMaxPotFraction: 0.82,
    badPriceContinueBase: 0.025,
    badPriceTextureScale: 0.25,
    facingValueEquity: 0.67,
    facingValueEdge: 0.18,
    facingValueFrequency: 0.86,
    facingBluffMaxEquity: 0.4,
    facingBluffBase: 0.11,
    facingBluffTextureScale: 1.1,
    openValueEquity: 0.57,
    openValueFrequency: 0.9,
    openBluffMaxEquity: 0.42,
    openBluffBase: 0.135,
    openBluffTextureScale: 1.1,
    thinPressureMinEquity: 0.42,
    thinPressureMaxEquity: 0.62,
    thinPressureFrequency: 0.34,
    standardValuePotFraction: 0.72,
    strongValuePotFraction: 0.9,
    bluffPotFraction: 0.62,
  },
  elite: {
    id: 'elite',
    label: 'Elite',
    summary: 'Higher-precision equity, disciplined defense, and balanced pressure for Championship play.',
    equitySamples: 720,
    reactionDelayMs: 960,
    foldBuffer: 0.008,
    bluffCatchMargin: 0.006,
    bluffCatchMaxPotFraction: 0.88,
    badPriceContinueBase: 0.018,
    badPriceTextureScale: 0.2,
    facingValueEquity: 0.64,
    facingValueEdge: 0.16,
    facingValueFrequency: 0.9,
    facingBluffMaxEquity: 0.42,
    facingBluffBase: 0.125,
    facingBluffTextureScale: 1.15,
    openValueEquity: 0.55,
    openValueFrequency: 0.93,
    openBluffMaxEquity: 0.44,
    openBluffBase: 0.15,
    openBluffTextureScale: 1.15,
    thinPressureMinEquity: 0.4,
    thinPressureMaxEquity: 0.63,
    thinPressureFrequency: 0.4,
    standardValuePotFraction: 0.74,
    strongValuePotFraction: 0.94,
    bluffPotFraction: 0.64,
  },
  nemesis: {
    id: 'nemesis',
    label: 'Nemesis',
    summary: 'Maximum precision and adaptation with a low-error, highly mixed strategy.',
    equitySamples: 1_000,
    reactionDelayMs: 1_020,
    foldBuffer: 0.004,
    bluffCatchMargin: 0.004,
    bluffCatchMaxPotFraction: 0.92,
    badPriceContinueBase: 0.012,
    badPriceTextureScale: 0.18,
    facingValueEquity: 0.62,
    facingValueEdge: 0.145,
    facingValueFrequency: 0.93,
    facingBluffMaxEquity: 0.44,
    facingBluffBase: 0.14,
    facingBluffTextureScale: 1.2,
    openValueEquity: 0.53,
    openValueFrequency: 0.95,
    openBluffMaxEquity: 0.46,
    openBluffBase: 0.165,
    openBluffTextureScale: 1.2,
    thinPressureMinEquity: 0.38,
    thinPressureMaxEquity: 0.64,
    thinPressureFrequency: 0.45,
    standardValuePotFraction: 0.76,
    strongValuePotFraction: 0.98,
    bluffPotFraction: 0.66,
  },
};

/** Elite and Nemesis are earned Championship opponents, not setup presets. */
export const AI_DIFFICULTY_OPTIONS = (['friendly', 'club', 'sharp'] as const).map(
  (difficulty) => AI_STRATEGY_PROFILES[difficulty],
);

export function aiStrategyProfile(difficulty: AiDifficulty): AiStrategyProfile {
  return AI_STRATEGY_PROFILES[difficulty];
}
