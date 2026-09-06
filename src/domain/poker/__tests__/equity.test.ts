import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { estimateEquityAgainstRange, estimateFieldEquity, estimateHeadsUpEquity } from '../equity';
import { applyPreflopActions, uniformRange } from '../opponentRange';

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

describe('equity against a modeled range', () => {
  const hero = [{ rank: 10 as const, suit: 'hearts' as const }, { rank: 10 as const, suit: 'clubs' as const }];

  it('equals uniform equity when the blend is zero', () => {
    const range = uniformRange(hero);
    expect(estimateEquityAgainstRange(hero, [], range, 0, 400, seededRandom(3)))
      .toBeCloseTo(estimateHeadsUpEquity(hero, [], 400, seededRandom(3)), 6);
  });

  it('rates pocket tens lower against a 4-bet range than against a random hand', () => {
    const fourBettor = applyPreflopActions(uniformRange(hero), [
      { type: 'raise', facing: 'unopened', raiseCount: 0, callersAfterRaise: 0, limperCount: 0, canCheck: false },
      { type: 'raise', facing: 'raised', raiseCount: 2, raiseSizeBb: 9, raiserPosition: 'BB', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BTN/SB', playerCount: 2, effectiveStackBb: 100 }, {
      archetype: 'balanced', tier: 'club', bluffAllowance: 1, narrowingStrength: 1, memoryStrength: 0,
    });
    const versusRange = estimateEquityAgainstRange(hero, [], fourBettor, 1, 1_200, seededRandom(9));
    const versusRandom = estimateHeadsUpEquity(hero, [], 1_200, seededRandom(9));
    expect(versusRange).toBeLessThan(versusRandom - 0.1);
  });
});
