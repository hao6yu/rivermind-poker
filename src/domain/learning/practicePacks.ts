import type { CoachFocusArea } from '../poker/types';
import type { PracticePackId, ScenarioSpot } from './types';

export interface PracticePackDefinition {
  description: string;
  focusAreas: Array<Exclude<CoachFocusArea, 'none'>>;
  id: PracticePackId;
  progressActivityId: string;
  shortTitle: string;
  title: string;
}

export const practicePacks: PracticePackDefinition[] = [
  {
    id: 'preflop',
    title: 'Preflop decisions',
    shortTitle: 'Preflop',
    description: 'Open, defend, isolate, and respond to pressure with position in mind.',
    focusAreas: ['preflop'],
    progressActivityId: 'scenario-pack-preflop',
  },
  {
    id: 'preflop-enter',
    title: 'Enter the pot',
    shortTitle: 'Enter the pot',
    description: 'Choose when to open, isolate a limper, or stay out based on position.',
    focusAreas: ['preflop'],
    progressActivityId: 'scenario-pack-preflop-enter',
  },
  {
    id: 'preflop-pressure',
    title: 'Respond to pressure',
    shortTitle: 'Pressure',
    description: 'Defend, call, three-bet, or fold as the opener and price change.',
    focusAreas: ['preflop'],
    progressActivityId: 'scenario-pack-preflop-pressure',
  },
  {
    id: 'betting',
    title: 'Purposeful betting',
    shortTitle: 'Betting',
    description: 'Choose value, bluff, check, and sizing lines for a clear reason.',
    focusAreas: ['value-betting', 'bluffing', 'bet-sizing'],
    progressActivityId: 'scenario-pack-betting',
  },
  {
    id: 'odds',
    title: 'Calls, draws, and odds',
    shortTitle: 'Odds',
    description: 'Compare call prices with realistic equity and release overpriced draws.',
    focusAreas: ['calling', 'pot-odds', 'draws'],
    progressActivityId: 'scenario-pack-odds',
  },
];

export const preflopPracticePacks = practicePacks.filter(
  (pack) => pack.id === 'preflop-enter' || pack.id === 'preflop-pressure',
);

export const postflopPracticePacks = practicePacks.filter(
  (pack) => pack.id === 'betting' || pack.id === 'odds',
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

  const focus = scenario.focus.toLowerCase();
  if (focus.includes('draw')) return 'draws';
  if (focus.includes('odds') || focus.includes('price')) return 'pot-odds';
  if (focus.includes('call') || focus.includes('showdown')) return 'calling';
  if (focus.includes('bluff')) return 'bluffing';
  if (focus.includes('siz')) return 'bet-sizing';
  return 'value-betting';
}
