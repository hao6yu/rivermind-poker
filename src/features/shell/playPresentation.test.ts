import { describe, expect, it } from 'vitest';

import type { ChampionshipProgress } from '../../domain/poker/championship';
import { createEmptyChampionshipProgress } from '../../domain/poker/championship';
import {
  championshipEntryFresh,
  difficultyLabel,
  effectivePracticePlayerCount,
  paceLabel,
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

  it('shows chips and big blinds together for stack presets', () => {
    const formatChips = (chips: number) => `${chips.toLocaleString('en-US')}`;
    expect(stackChipsLabel(40, 20, formatChips)).toBe('800');
    expect(stackChipsLabel(100, 20, formatChips)).toBe('2,000');
    expect(stackChipsLabel(60, 20, formatChips)).toBe('1,200');
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
