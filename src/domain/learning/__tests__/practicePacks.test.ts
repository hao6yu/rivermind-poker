import { describe, expect, it } from 'vitest';

import {
  advancedMathPracticePacks,
  intermediatePreflopPracticePacks,
  intermediatePostflopPracticePacks,
  postflopPracticePacks,
  intermediateRiverPracticePacks,
  opponentPracticePacks,
  practicePackById,
  practicePackForFocus,
  practicePacks,
  preflopPracticePacks,
  tournamentPracticePacks,
} from '../practicePacks';

describe('targeted practice packs', () => {
  it('maps every coach focus to one durable pack', () => {
    const expected = {
      preflop: 'preflop',
      'value-betting': 'betting',
      bluffing: 'betting',
      'bet-sizing': 'betting',
      calling: 'odds',
      'pot-odds': 'odds',
      draws: 'odds',
    } as const;

    for (const [focus, packId] of Object.entries(expected)) {
      expect(practicePackForFocus(focus)?.id).toBe(packId);
    }
    expect(practicePackForFocus(null)).toBeNull();
    expect(practicePackForFocus('none')).toBeNull();
    expect(practicePackForFocus('future-focus')).toBeNull();
  });

  it('uses unique persistence IDs that fit the learning progress schema', () => {
    expect(practicePacks).toHaveLength(12);
    expect(preflopPracticePacks.map((pack) => pack.id)).toEqual(['preflop-enter', 'preflop-pressure']);
    expect(intermediatePreflopPracticePacks.map((pack) => pack.id)).toEqual(['preflop-three-bet']);
    expect(postflopPracticePacks.map((pack) => pack.id)).toEqual(['betting', 'odds']);
    expect(intermediatePostflopPracticePacks.map((pack) => pack.id)).toEqual(['postflop-range']);
    expect(intermediateRiverPracticePacks.map((pack) => pack.id)).toEqual(['postflop-river']);
    expect(tournamentPracticePacks.map((pack) => pack.id)).toEqual(['tournament-short-stack', 'tournament-bubble']);
    expect(opponentPracticePacks.map((pack) => pack.id)).toEqual(['opponent-adjustments']);
    expect(advancedMathPracticePacks.map((pack) => pack.id)).toEqual(['advanced-math']);
    expect(new Set(practicePacks.map((pack) => pack.progressActivityId)).size).toBe(practicePacks.length);
    for (const pack of practicePacks) {
      expect(practicePackById(pack.id)).toBe(pack);
      expect(pack.progressActivityId.length).toBeLessThanOrEqual(80);
      expect(pack.description.length).toBeGreaterThan(30);
    }
  });
});
