import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { estimateHeadsUpEquity } from '../equity';

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
});
