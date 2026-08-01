import type { AiDifficulty } from './aiProfiles';

export type MultiwayAiStyle = 'balanced' | 'patient' | 'pressure' | 'sticky' | 'deceptive';

export interface MultiwayAiIdentity {
  id: string;
  name: string;
  style: MultiwayAiStyle;
  label: string;
  summary: string;
  /** How selective this opponent's public action range should appear. */
  rangeTightness: number;
  /** Relative frequency of value bets and raises. */
  aggression: number;
  /** Extra equity slack allowed when continuing against a wager. */
  callTolerance: number;
  /** Relative frequency of low-equity pressure. */
  bluffFrequency: number;
  /** Baseline fraction of the pot used for bets and raises. */
  potFraction: number;
  /** Frequency with which a very strong hand takes a passive line. */
  slowPlayFrequency: number;
}

export interface MultiwayDifficultyTuning {
  difficulty: AiDifficulty;
  equitySamples: number;
  aggressionScale: number;
  bluffScale: number;
  sizingScale: number;
  callTolerance: number;
  riskPremium: number;
}

export const MULTIWAY_AI_IDENTITIES: readonly MultiwayAiIdentity[] = [
  {
    id: 'mara-balanced',
    name: 'Mara',
    style: 'balanced',
    label: 'Balanced',
    summary: 'Mixes value, restraint, and selective pressure without leaning on one pattern.',
    rangeTightness: 0.5,
    aggression: 1,
    callTolerance: 0.01,
    bluffFrequency: 1,
    potFraction: 0.66,
    slowPlayFrequency: 0.08,
  },
  {
    id: 'theo-patient',
    name: 'Theo',
    style: 'patient',
    label: 'Patient',
    summary: 'Enters fewer pots, respects multiway pressure, and raises a stronger range.',
    rangeTightness: 0.76,
    aggression: 0.9,
    callTolerance: -0.025,
    bluffFrequency: 0.62,
    potFraction: 0.72,
    slowPlayFrequency: 0.05,
  },
  {
    id: 'nova-pressure',
    name: 'Nova',
    style: 'pressure',
    label: 'Pressure',
    summary: 'Plays more hands, attacks capped ranges, and creates difficult decisions.',
    rangeTightness: 0.3,
    aggression: 1.22,
    callTolerance: 0.015,
    bluffFrequency: 1.38,
    potFraction: 0.7,
    slowPlayFrequency: 0.03,
  },
  {
    id: 'june-sticky',
    name: 'June',
    style: 'sticky',
    label: 'Sticky',
    summary: 'Calls wider, keeps pots manageable, and makes thin bluffs less attractive.',
    rangeTightness: 0.38,
    aggression: 0.72,
    callTolerance: 0.065,
    bluffFrequency: 0.42,
    potFraction: 0.55,
    slowPlayFrequency: 0.11,
  },
  {
    id: 'sol-deceptive',
    name: 'Sol',
    style: 'deceptive',
    label: 'Deceptive',
    summary: 'Uses delayed aggression, occasional traps, and well-timed polarized pressure.',
    rangeTightness: 0.56,
    aggression: 1.06,
    callTolerance: 0,
    bluffFrequency: 1.2,
    potFraction: 0.63,
    slowPlayFrequency: 0.2,
  },
];

export const MULTIWAY_DIFFICULTY_TUNING: Record<AiDifficulty, MultiwayDifficultyTuning> = {
  friendly: {
    difficulty: 'friendly',
    equitySamples: 72,
    aggressionScale: 0.72,
    bluffScale: 0.45,
    sizingScale: 0.88,
    callTolerance: 0.045,
    riskPremium: 0,
  },
  club: {
    difficulty: 'club',
    equitySamples: 144,
    aggressionScale: 1,
    bluffScale: 1,
    sizingScale: 1,
    callTolerance: 0.015,
    riskPremium: 0.008,
  },
  sharp: {
    difficulty: 'sharp',
    equitySamples: 240,
    aggressionScale: 1.16,
    bluffScale: 1.22,
    sizingScale: 1.12,
    callTolerance: 0,
    riskPremium: 0.016,
  },
};

export function multiwayAiIdentityAt(index: number): MultiwayAiIdentity {
  if (!Number.isInteger(index)) throw new Error('AI identity index must be an integer.');
  const normalized = ((index % MULTIWAY_AI_IDENTITIES.length) + MULTIWAY_AI_IDENTITIES.length)
    % MULTIWAY_AI_IDENTITIES.length;
  const identity = MULTIWAY_AI_IDENTITIES[normalized];
  if (!identity) throw new Error('A multiway AI identity could not be assigned.');
  return identity;
}

export function multiwayAiIdentityForSeat(seat: number): MultiwayAiIdentity {
  if (!Number.isInteger(seat) || seat < 0) throw new Error('AI seat must be a non-negative integer.');
  return multiwayAiIdentityAt(seat);
}

export function multiwayDifficultyTuning(difficulty: AiDifficulty): MultiwayDifficultyTuning {
  return MULTIWAY_DIFFICULTY_TUNING[difficulty];
}
