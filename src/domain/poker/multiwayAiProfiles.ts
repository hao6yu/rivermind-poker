import type { AiDifficulty } from './aiProfiles';

export type MultiwayAiStyle = 'balanced' | 'patient' | 'pressure' | 'sticky' | 'deceptive';

export interface MultiwayAiIdentity {
  id: string;
  name: string;
  /** Optional character flavor shown outside the compact table card. */
  title?: string;
  style: MultiwayAiStyle;
  level: AiDifficulty;
  avatarKey: string;
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

type PersonalityProfile = Omit<
  MultiwayAiIdentity,
  'id' | 'name' | 'level' | 'avatarKey'
>;

const PERSONALITY_PROFILES: Record<MultiwayAiStyle, PersonalityProfile> = {
  balanced: {
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
  patient: {
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
  pressure: {
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
  sticky: {
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
  deceptive: {
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
};

const roster = [
  { id: 'mara-balanced', name: 'Mara', style: 'balanced', level: 'friendly' },
  { id: 'theo-patient', name: 'Theo', style: 'patient', level: 'friendly' },
  { id: 'nova-pressure', name: 'Nova', style: 'pressure', level: 'friendly' },
  { id: 'june-sticky', name: 'June', style: 'sticky', level: 'friendly' },
  { id: 'sol-deceptive', name: 'Sol', style: 'deceptive', level: 'friendly' },
  { id: 'kai-balanced', name: 'Kai', style: 'balanced', level: 'club' },
  { id: 'iris-patient', name: 'Iris', style: 'patient', level: 'club' },
  { id: 'dex-pressure', name: 'Dex', style: 'pressure', level: 'club' },
  { id: 'lena-sticky', name: 'Lena', style: 'sticky', level: 'club' },
  { id: 'amir-deceptive', name: 'Amir', style: 'deceptive', level: 'club' },
  { id: 'rowan-balanced', name: 'Rowan', style: 'balanced', level: 'sharp' },
  { id: 'priya-patient', name: 'Priya', style: 'patient', level: 'sharp' },
  { id: 'zane-pressure', name: 'Zane', style: 'pressure', level: 'sharp' },
  { id: 'aya-sticky', name: 'Aya', style: 'sticky', level: 'sharp' },
  { id: 'victor-deceptive', name: 'Victor', style: 'deceptive', level: 'sharp' },
  { id: 'yoyo-patient', name: 'Yoyo', title: 'The Rookie', style: 'patient', level: 'friendly' },
  { id: 'auntie-chi-sticky', name: 'Auntie Chi', title: 'The Careful Caller', style: 'sticky', level: 'friendly' },
  { id: 'lulu-patient', name: 'Lulu', title: 'The Sentinel', style: 'patient', level: 'club' },
  { id: 'steve-patient', name: 'Steve', title: 'The Quiet Comic', style: 'patient', level: 'club' },
  { id: 'hao-patient', name: 'Hao', title: 'The Builder', style: 'patient', level: 'club' },
  { id: 'uncle-tu-patient', name: 'Uncle Tu', title: 'The Steady Hand', style: 'patient', level: 'club' },
  { id: 'vivian-sticky', name: 'Vivian', title: 'The Caller', style: 'sticky', level: 'sharp' },
  { id: 'mary-patient', name: 'Mary', title: 'The Pro', style: 'patient', level: 'sharp' },
  { id: 'bruce-pressure', name: 'Bruce', title: 'The Wild Card', style: 'pressure', level: 'sharp' },
  { id: 'gary-pressure', name: 'Gary', title: 'The Firestarter', style: 'pressure', level: 'sharp' },
  { id: 'mr-chi-sticky', name: 'Mr. Chi', title: 'The Defender', style: 'sticky', level: 'sharp' },
  { id: 'zhou-pressure', name: 'Zhou', title: 'The Table Boss', style: 'pressure', level: 'sharp' },
] as const satisfies readonly {
  id: string;
  name: string;
  title?: string;
  style: MultiwayAiStyle;
  level: AiDifficulty;
}[];

/** Named opponents spanning the five behavior profiles and three difficulty levels. */
export const MULTIWAY_AI_IDENTITIES: readonly MultiwayAiIdentity[] = roster.map((player) => ({
  ...PERSONALITY_PROFILES[player.style],
  ...player,
  avatarKey: player.id,
}));

const identitiesByDifficulty: Record<AiDifficulty, readonly MultiwayAiIdentity[]> = {
  friendly: MULTIWAY_AI_IDENTITIES.filter((identity) => identity.level === 'friendly'),
  club: MULTIWAY_AI_IDENTITIES.filter((identity) => identity.level === 'club'),
  sharp: MULTIWAY_AI_IDENTITIES.filter((identity) => identity.level === 'sharp'),
  elite: MULTIWAY_AI_IDENTITIES.filter((identity) => identity.level === 'sharp'),
  nemesis: MULTIWAY_AI_IDENTITIES.filter((identity) => identity.level === 'sharp'),
};

export const MULTIWAY_DIFFICULTY_TUNING: Record<AiDifficulty, MultiwayDifficultyTuning> = {
  friendly: {
    difficulty: 'friendly',
    equitySamples: 84,
    aggressionScale: 0.72,
    bluffScale: 0.45,
    sizingScale: 0.88,
    callTolerance: 0.045,
    riskPremium: 0,
  },
  club: {
    difficulty: 'club',
    equitySamples: 168,
    aggressionScale: 1,
    bluffScale: 1,
    sizingScale: 1,
    callTolerance: 0.015,
    riskPremium: 0.008,
  },
  sharp: {
    difficulty: 'sharp',
    equitySamples: 280,
    aggressionScale: 1.16,
    bluffScale: 1.22,
    sizingScale: 1.12,
    callTolerance: 0,
    riskPremium: 0.016,
  },
  elite: {
    difficulty: 'elite',
    equitySamples: 420,
    aggressionScale: 1.22,
    bluffScale: 1.3,
    sizingScale: 1.15,
    callTolerance: -0.002,
    riskPremium: 0.018,
  },
  nemesis: {
    difficulty: 'nemesis',
    equitySamples: 560,
    aggressionScale: 1.18,
    bluffScale: 1.18,
    sizingScale: 1.14,
    callTolerance: 0.002,
    riskPremium: 0.019,
  },
};

export function multiwayAiRoster(difficulty: AiDifficulty): readonly MultiwayAiIdentity[] {
  return identitiesByDifficulty[difficulty];
}

export function multiwayAiIdentityAt(
  index: number,
  difficulty: AiDifficulty = 'friendly',
): MultiwayAiIdentity {
  if (!Number.isInteger(index)) throw new Error('AI identity index must be an integer.');
  const identities = multiwayAiRoster(difficulty);
  const normalized = ((index % identities.length) + identities.length) % identities.length;
  const identity = identities[normalized];
  if (!identity) throw new Error('A multiway AI identity could not be assigned.');
  return identity;
}

export function multiwayAiIdentityForSeat(
  seat: number,
  difficulty: AiDifficulty = 'friendly',
): MultiwayAiIdentity {
  if (!Number.isInteger(seat) || seat < 0) throw new Error('AI seat must be a non-negative integer.');
  return multiwayAiIdentityAt(seat, difficulty);
}

/**
 * The roster ordered for browsing: the named characters lead, then the rest in
 * roster order. Seating reads MULTIWAY_AI_IDENTITIES directly, so this only
 * changes what a list shows — promoting a face here never changes who is dealt
 * into a table, which matters because the named characters are not evenly
 * spread across the five playing styles.
 */
export function multiwayAiRosterForDisplay(): readonly MultiwayAiIdentity[] {
  return [
    ...MULTIWAY_AI_IDENTITIES.filter((identity) => identity.title),
    ...MULTIWAY_AI_IDENTITIES.filter((identity) => !identity.title),
  ];
}

export function multiwayAiIdentityForName(name: string): MultiwayAiIdentity | null {
  return MULTIWAY_AI_IDENTITIES.find((identity) => identity.name === name) ?? null;
}

export function multiwayDifficultyTuning(difficulty: AiDifficulty): MultiwayDifficultyTuning {
  return MULTIWAY_DIFFICULTY_TUNING[difficulty];
}
