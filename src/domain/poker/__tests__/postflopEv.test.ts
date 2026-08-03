import { describe, expect, it } from 'vitest';

import { buildOpponentAdaptation, createEmptyOpponentMemory } from '../opponentMemory';
import { estimatePostflopCandidateEv, type PostflopEvContext } from '../postflopEv';
import type { PostflopCandidate } from '../postflopStrategy';

const neutral = buildOpponentAdaptation(createEmptyOpponentMemory());

function context(overrides: Partial<PostflopEvContext> = {}): PostflopEvContext {
  return {
    adaptation: neutral,
    averageOpponentRangeStrength: 0.2,
    currentBet: 60,
    equity: 0.3,
    opponentCount: 1,
    playerStreetBet: 0,
    playersBehind: 0,
    pot: 100,
    street: 'turn',
    tournamentRiskPremium: 0,
    ...overrides,
  };
}

function candidate(
  type: PostflopCandidate['action']['type'],
  amount?: number,
  role: PostflopCandidate['role'] = 'defense',
  potFraction?: number,
): PostflopCandidate {
  return {
    action: amount === undefined ? { type } : { type, amount },
    detail: 'test candidate',
    headline: type,
    potFraction,
    role,
    score: 0.5,
  };
}

describe('advanced postflop action EV', () => {
  it('rejects a clearly losing call instead of using aggression as difficulty', () => {
    const fold = estimatePostflopCandidateEv(candidate('fold'), context({ equity: 0.18 }));
    const call = estimatePostflopCandidateEv(candidate('call'), context({ equity: 0.18 }));

    expect(fold.expectedValue).toBe(0);
    expect(call.expectedValue).toBeLessThan(0);
    expect(fold.utility).toBeGreaterThan(call.utility);
  });

  it('prefers building value with high range equity', () => {
    const valueContext = context({ currentBet: 0, equity: 0.82, playerStreetBet: 0, pot: 120 });
    const check = estimatePostflopCandidateEv(candidate('check', undefined, 'control'), valueContext);
    const raise = estimatePostflopCandidateEv(candidate('raise', 90, 'value', 0.75), valueContext);

    expect(raise.expectedValue).toBeGreaterThan(check.expectedValue);
    expect(raise.utility).toBeGreaterThan(check.utility);
  });

  it('reduces bluff fold equity as more live ranges remain', () => {
    const bluff = candidate('raise', 80, 'bluff', 0.75);
    const headsUp = estimatePostflopCandidateEv(bluff, context({ currentBet: 0, equity: 0.24, opponentCount: 1 }));
    const multiway = estimatePostflopCandidateEv(bluff, context({ currentBet: 0, equity: 0.24, opponentCount: 3, playersBehind: 2 }));

    expect(multiway.foldEquity).toBeLessThan(headsUp.foldEquity);
    expect(multiway.utility).toBeLessThan(headsUp.utility);
  });

  it('charges additional risk for tournament chips without changing card equity', () => {
    const valueRaise = candidate('raise', 140, 'value', 0.75);
    const chipEv = estimatePostflopCandidateEv(valueRaise, context({ equity: 0.64 }));
    const bubbleEv = estimatePostflopCandidateEv(valueRaise, context({ equity: 0.64, tournamentRiskPremium: 0.06 }));

    expect(bubbleEv.expectedValue).toBeLessThan(chipEv.expectedValue);
  });

  it('defends a little wider after a bounded read identifies persistent aggression', () => {
    const passive = estimatePostflopCandidateEv(candidate('call'), context({ equity: 0.36 }));
    const aggressiveRead = estimatePostflopCandidateEv(candidate('call'), context({
      adaptation: { ...neutral, callToleranceDelta: 0.035 },
      equity: 0.36,
    }));

    expect(aggressiveRead.expectedValue).toBeGreaterThan(passive.expectedValue);
  });
});
