import { describe, expect, it } from 'vitest';

import type { ChampionshipProgress } from '../../domain/poker/championship';
import { createEmptyChampionshipProgress } from '../../domain/poker/championship';
import type { SitAndGoCheckpoint } from '../../domain/poker/tournament';
import {
  AI_PLAY_STACK_PRESETS,
  championshipEntryFresh,
  difficultyLabel,
  effectivePracticePlayerCount,
  paceLabel,
  sitAndGoCheckpointForCount,
  stackChipsLabel,
} from './playPresentation';

describe('AI configurator presentation (3.11C)', () => {
  it('falls back to the largest offered seat the roster can fill', () => {
    // A friendly roster cannot seat nine: the nine request lands on six.
    expect(effectivePracticePlayerCount([2, 3, 6], 9)).toBe(6);
    // Selected counts that are offered pass through untouched.
    expect(effectivePracticePlayerCount([2, 3, 6, 9], 9)).toBe(9);
    expect(effectivePracticePlayerCount([2, 3, 6, 9], 3)).toBe(3);
    // Below the smallest offer lands on the smallest offer.
    expect(effectivePracticePlayerCount([6, 9], 2)).toBe(6);
    expect(effectivePracticePlayerCount([], 3)).toBe(2);
  });

  it('shows only the chip total for each stack preset (DT-09)', () => {
    const formatChips = (chips: number) => `${chips.toLocaleString('en-US')}`;
    const labels = AI_PLAY_STACK_PRESETS.map((preset) =>
      stackChipsLabel(preset.bb, 20, formatChips));
    // Practice and Sit & Go consume this same exported preset contract.
    expect(labels).toEqual(['800', '2,000', '4,000']);
    expect(AI_PLAY_STACK_PRESETS.find((preset) => preset.default)?.bb).toBe(100);
  });

  it('resolves difficulty and pace labels through the typed catalog', () => {
    const messages: Partial<Record<string, string>> = {
      'difficulty.nemesis': '宿敌',
      'pace.relaxed': '从容',
    };
    const t = ((key: string) => messages[key] ?? key) as Parameters<typeof difficultyLabel>[1];
    expect(difficultyLabel('nemesis', t)).toBe('宿敌');
    expect(paceLabel('relaxed', t)).toBe('从容');
  });
});

describe('Championship entry presentation (3.11C)', () => {
  it('offers Start only to a fresh player with no saved run', () => {
    const progress = createEmptyChampionshipProgress();
    const fresh = championshipEntryFresh(progress, false);
    expect(fresh).toBe(true);
    // A saved mid-event run means Continue, even with zero qualified events.
    expect(championshipEntryFresh(progress, true)).toBe(false);
  });

  it('keeps the Start label only until the first qualification', () => {
    const progress: ChampionshipProgress = {
      version: 2,
      events: [{
        eventId: 'local_3',
        bestPlace: 1,
        attempts: 1,
        lastPlayedAt: '2026-08-03T00:00:00.000Z',
        qualifiedAt: '2026-08-03T00:00:00.000Z',
      }],
    };
    expect(championshipEntryFresh(progress, false)).toBe(false);
  });
});

describe('Sit & Go checkpoint supply (3.11D)', () => {
  const checkpoint = (nextHandNumber: number, seats: number): SitAndGoCheckpoint => ({
    version: 1,
    savedAt: '2026-08-03T00:00:00.000Z',
    nextHandNumber,
    lastButtonSeat: 0,
    aiDifficulty: 'club',
    players: [
      { id: 'hero', name: 'You', seat: 0, stack: 1000, isHero: true },
      ...Array.from({ length: seats - 1 }, (_, index) => ({
        id: `ai-${index + 1}`,
        name: `Opponent ${index + 1}`,
        seat: index + 1,
        stack: 1000,
      })),
    ],
  });

  it('supplies each tournament seat count its own saved run', () => {
    const checkpoints = { 3: checkpoint(4, 3), 9: checkpoint(7, 9) };
    expect(sitAndGoCheckpointForCount(3, checkpoints)?.nextHandNumber).toBe(4);
    // A nine-seat checkpoint reaches the table exactly like three or six —
    // choosing Continue for nine must resume, not start fresh.
    expect(sitAndGoCheckpointForCount(9, checkpoints)?.nextHandNumber).toBe(7);
    expect(sitAndGoCheckpointForCount(6, checkpoints)).toBeNull();
  });

  it('never hands a tournament run to a non-tournament table', () => {
    const checkpoints = { 3: checkpoint(4, 3), 6: checkpoint(5, 6), 9: checkpoint(6, 9) };
    expect(sitAndGoCheckpointForCount(2, checkpoints)).toBeNull();
    expect(sitAndGoCheckpointForCount(3, {})).toBeNull();
  });
});
