import { describe, expect, it } from 'vitest';

import { practicePackById, practicePackForFocus, practicePacks } from '../practicePacks';

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
    expect(practicePacks).toHaveLength(3);
    expect(new Set(practicePacks.map((pack) => pack.progressActivityId)).size).toBe(practicePacks.length);
    for (const pack of practicePacks) {
      expect(practicePackById(pack.id)).toBe(pack);
      expect(pack.progressActivityId.length).toBeLessThanOrEqual(80);
      expect(pack.description.length).toBeGreaterThan(30);
    }
  });
});
