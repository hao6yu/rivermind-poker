import type { CoachFocusArea } from '../poker/types';
import type { PracticePackId } from './types';

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
