import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { estimateFieldEquity, estimateHeadsUpEquity } from '../equity';

describe('heads-up equity simulation', () => {
  it('recognizes pocket aces as a dominant preflop hand', () => {
    const equity = estimateHeadsUpEquity(
      [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }],
      [],
      800,
      seededRandom(42),
    );
    expect(equity).toBeGreaterThan(0.78);
  });

  it('estimates a deterministic share against a multi-player unknown field', () => {
    const first = estimateFieldEquity(
      [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }],
      [],
      5,
      200,
      seededRandom(43),
    );
    const second = estimateFieldEquity(
      [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }],
      [],
      5,
      200,
      seededRandom(43),
    );

    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0.25);
    expect(first).toBeLessThan(0.8);
  });
});
