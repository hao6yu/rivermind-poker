import { describe, expect, it } from 'vitest';

import type { LegalActions } from '../../domain/poker/types';
import { buildLiveCoachRecommendation } from './liveCoach';

const legal: LegalActions = {
  canFold: true,
  canCheck: false,
  canCall: true,
  canRaise: true,
  toCall: 40,
  minRaiseTo: 120,
  maxRaiseTo: 2_000,
  suggestedRaiseTo: 160,
};

describe('live coach recommendation', () => {
  it('gives an exact raise target when equity is comfortably ahead of the price', () => {
    expect(buildLiveCoachRecommendation({
      bigBlind: 20,
      currentBet: 80,
      equity: 0.72,
      legal,
      opponentCount: 2,
      playerStreetBet: 40,
      playersBehind: 1,
      pot: 200,
      street: 'flop',
    })).toMatchObject({ action: 'Raise', headline: 'Raise to 8 BB', target: 160 });
  });

  it('distinguishes a close call from a fold using the displayed price', () => {
    const call = buildLiveCoachRecommendation({
      bigBlind: 20,
      currentBet: 40,
      equity: 0.18,
      legal: { ...legal, toCall: 20 },
      opponentCount: 2,
      playerStreetBet: 20,
      playersBehind: 0,
      pot: 100,
      street: 'turn',
    });
    const fold = buildLiveCoachRecommendation({
      bigBlind: 20,
      currentBet: 40,
      equity: 0.1,
      legal: { ...legal, toCall: 20 },
      opponentCount: 2,
      playerStreetBet: 20,
      playersBehind: 0,
      pot: 100,
      street: 'turn',
    });

    expect(call).toMatchObject({ action: 'Call', headline: 'Call 1 BB' });
    expect(fold).toMatchObject({ action: 'Fold', headline: 'Fold' });
  });

  it('uses a pot-relative amount for an unopened postflop value bet', () => {
    expect(buildLiveCoachRecommendation({
      bigBlind: 20,
      currentBet: 0,
      equity: 0.62,
      legal: { ...legal, canCheck: true, toCall: 0, minRaiseTo: 20, suggestedRaiseTo: 80 },
      opponentCount: 2,
      playerStreetBet: 0,
      playersBehind: 1,
      pot: 120,
      street: 'flop',
    })).toMatchObject({ action: 'Bet', headline: 'Bet ½ pot · 3 BB', target: 60 });
  });

  it('recommends a free check with a marginal hand', () => {
    expect(buildLiveCoachRecommendation({
      bigBlind: 20,
      currentBet: 0,
      equity: 0.31,
      legal: { ...legal, canCheck: true, toCall: 0 },
      opponentCount: 2,
      playerStreetBet: 0,
      playersBehind: 1,
      pot: 120,
      street: 'flop',
    })).toMatchObject({ action: 'Check', headline: 'Check' });
  });
});
