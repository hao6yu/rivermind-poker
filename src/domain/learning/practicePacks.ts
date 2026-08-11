import type { CoachFocusArea } from '../poker/types';
import type { LearningDifficulty, PracticePackId, ScenarioSpot } from './types';

export interface PracticePackDefinition {
  description: string;
  difficulty: LearningDifficulty;
  focusAreas: Array<Exclude<CoachFocusArea, 'none'>>;
  id: PracticePackId;
  progressActivityId: string;
  shortTitle: string;
  title: string;
}

export const practicePacks: PracticePackDefinition[] = [
  {
    id: 'preflop',
    difficulty: 'beginner',
    title: 'Preflop decisions',
    shortTitle: 'Preflop',
    description: 'Open, defend, isolate, and respond to pressure with position in mind.',
    focusAreas: ['preflop'],
    progressActivityId: 'scenario-pack-preflop',
  },
  {
    id: 'preflop-enter',
    difficulty: 'beginner',
    title: 'Enter the pot',
    shortTitle: 'Enter the pot',
    description: 'Choose when to open, isolate a limper, or stay out based on position.',
    focusAreas: ['preflop'],
    progressActivityId: 'scenario-pack-preflop-enter',
  },
  {
    id: 'preflop-pressure',
    difficulty: 'beginner',
    title: 'Respond to pressure',
    shortTitle: 'Pressure',
    description: 'Defend, call, three-bet, or fold as the opener and price change.',
    focusAreas: ['preflop'],
    progressActivityId: 'scenario-pack-preflop-pressure',
  },
  {
    id: 'preflop-three-bet',
    difficulty: 'intermediate',
    title: 'Three-bet decisions',
    shortTitle: 'Three-bet pots',
    description: 'Build and face re-raises using range, position, sizing, and stack depth.',
    focusAreas: ['preflop'],
    progressActivityId: 'scenario-pack-preflop-three-bet',
  },
  {
    id: 'betting',
    difficulty: 'beginner',
    title: 'Purposeful betting',
    shortTitle: 'Betting',
    description: 'Choose value, bluff, check, and sizing lines for a clear reason.',
    focusAreas: ['value-betting', 'bluffing', 'bet-sizing'],
    progressActivityId: 'scenario-pack-betting',
  },
  {
    id: 'odds',
    difficulty: 'beginner',
    title: 'Calls, draws, and odds',
    shortTitle: 'Odds',
    description: 'Compare call prices with realistic equity and release overpriced draws.',
    focusAreas: ['calling', 'pot-odds', 'draws'],
    progressActivityId: 'scenario-pack-odds',
  },
  {
    id: 'postflop-range',
    difficulty: 'intermediate',
    title: 'Range and turn plans',
    shortTitle: 'Range plans',
    description: 'Use range advantage, nut advantage, player count, and turn changes to plan pressure.',
    focusAreas: ['value-betting', 'bluffing', 'bet-sizing'],
    progressActivityId: 'scenario-pack-postflop-range',
  },
  {
    id: 'postflop-river',
    difficulty: 'intermediate',
    title: 'River value and bluffs',
    shortTitle: 'River decisions',
    description: 'Choose thin value, polarized bets, disciplined bluffs, and price-aware bluff catches.',
    focusAreas: ['value-betting', 'bluffing', 'bet-sizing', 'calling'],
    progressActivityId: 'scenario-pack-postflop-river',
  },
  {
    id: 'tournament-short-stack',
    difficulty: 'intermediate',
    title: 'Short-stack tournament decisions',
    shortTitle: 'Short stacks',
    description: 'Choose efficient opens, reshoves, and all-in calls from the effective stack and positions.',
    focusAreas: ['preflop'],
    progressActivityId: 'scenario-pack-tournament-short-stack',
  },
  {
    id: 'tournament-bubble',
    difficulty: 'intermediate',
    title: 'Bubble pressure and ICM-lite',
    shortTitle: 'Bubble pressure',
    description: 'Adjust calls and first-in pressure using stack rank, coverage, and survival value.',
    focusAreas: ['preflop', 'calling'],
    progressActivityId: 'scenario-pack-tournament-bubble',
  },
  {
    id: 'opponent-adjustments',
    difficulty: 'intermediate',
    title: 'Evidence-based adjustments',
    shortTitle: 'Opponent reads',
    description: 'Use sample confidence to adjust value, bluffs, and defense against observed tendencies.',
    focusAreas: ['value-betting', 'bluffing', 'calling'],
    progressActivityId: 'scenario-pack-opponent-adjustments',
  },
  {
    id: 'advanced-math',
    difficulty: 'intermediate',
    title: 'Advanced decision math',
    shortTitle: 'Decision math',
    description: 'Apply implied odds, reverse implied odds, and break-even bluff thresholds.',
    focusAreas: ['pot-odds', 'draws', 'bluffing'],
    progressActivityId: 'scenario-pack-advanced-math',
  },
];

export const preflopPracticePacks = practicePacks.filter(
  (pack) => pack.id === 'preflop-enter' || pack.id === 'preflop-pressure',
);

export const intermediatePreflopPracticePacks = practicePacks.filter(
  (pack) => pack.id === 'preflop-three-bet',
);

export const postflopPracticePacks = practicePacks.filter(
  (pack) => pack.id === 'betting' || pack.id === 'odds',
);

export const intermediatePostflopPracticePacks = practicePacks.filter(
  (pack) => pack.id === 'postflop-range',
);

export const intermediateRiverPracticePacks = practicePacks.filter(
  (pack) => pack.id === 'postflop-river',
);

export const tournamentPracticePacks = practicePacks.filter(
  (pack) => pack.id === 'tournament-short-stack' || pack.id === 'tournament-bubble',
);

export const opponentPracticePacks = practicePacks.filter(
  (pack) => pack.id === 'opponent-adjustments',
);

export const advancedMathPracticePacks = practicePacks.filter(
  (pack) => pack.id === 'advanced-math',
);

export function practicePackById(id: PracticePackId): PracticePackDefinition {
  const pack = practicePacks.find((candidate) => candidate.id === id);
  if (!pack) throw new Error(`Unknown practice pack: ${id}`);
  return pack;
}

export function practicePackForFocus(
  focus?: string | null,
): PracticePackDefinition | null {
  if (!focus || focus === 'none') return null;
  return practicePacks.find((pack) => pack.focusAreas.includes(
    focus as Exclude<CoachFocusArea, 'none'>,
  )) ?? null;
}

export function reviewFocusAreaForScenario(
  scenario: ScenarioSpot,
  preferredFocus?: string | null,
): Exclude<CoachFocusArea, 'none'> {
  const knownFocusAreas: Array<Exclude<CoachFocusArea, 'none'>> = [
    'preflop', 'value-betting', 'bluffing', 'calling', 'bet-sizing', 'pot-odds', 'draws',
  ];
  if (knownFocusAreas.includes(preferredFocus as Exclude<CoachFocusArea, 'none'>)) {
    return preferredFocus as Exclude<CoachFocusArea, 'none'>;
  }
  if (scenario.practicePacks.some((id) => id.startsWith('preflop'))) return 'preflop';
  if (scenario.practicePacks.includes('tournament-short-stack')) return 'preflop';
  if (scenario.practicePacks.includes('tournament-bubble')) return 'calling';
  if (scenario.practicePacks.includes('opponent-adjustments')) {
    const focus = scenario.focus.toLowerCase();
    if (focus.includes('call') || focus.includes('defen')) return 'calling';
    if (focus.includes('bluff') || focus.includes('pressure')) return 'bluffing';
    return 'value-betting';
  }
  if (scenario.practicePacks.includes('advanced-math')) {
    return scenario.focus.toLowerCase().includes('bluff') ? 'bluffing' : 'pot-odds';
  }

  const focus = scenario.focus.toLowerCase();
  if (focus.includes('draw')) return 'draws';
  if (focus.includes('odds') || focus.includes('price')) return 'pot-odds';
  if (focus.includes('call') || focus.includes('showdown')) return 'calling';
  if (focus.includes('bluff')) return 'bluffing';
  if (focus.includes('siz')) return 'bet-sizing';
  return 'value-betting';
}
