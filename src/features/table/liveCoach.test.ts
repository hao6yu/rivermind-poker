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
  it('uses the preflop chart immediately, even before equity finishes', () => {
    expect(buildLiveCoachRecommendation({
      bigBlind: 20,
      currentBet: 20,
      equity: null,
      legal: { ...legal, toCall: 20, minRaiseTo: 40, suggestedRaiseTo: 50 },
      opponentCount: 5,
      playerStreetBet: 0,
      playersBehind: 5,
      pot: 30,
      preflop: {
        cards: [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }],
        effectiveStackBb: 100,
        facing: 'unopened',
        playerCount: 6,
        position: 'UTG',
      },
      street: 'preflop',
    })).toMatchObject({ action: 'Raise', headline: 'Raise to 2.5 BB', target: 50 });
  });

  it('explains mixed preflop decisions in plain percentages', () => {
    const result = buildLiveCoachRecommendation({
      bigBlind: 20,
      currentBet: 60,
      equity: 0.3,
      legal: { ...legal, toCall: 40, minRaiseTo: 120, suggestedRaiseTo: 180 },
      opponentCount: 1,
      playerStreetBet: 20,
      playersBehind: 0,
      pot: 100,
      preflop: {
        cards: [{ rank: 14, suit: 'spades' }, { rank: 5, suit: 'spades' }],
        effectiveStackBb: 100,
        facing: 'raised',
        playerCount: 6,
        position: 'BTN',
      },
      street: 'preflop',
    });
    expect(result.detail).toContain('mixed spot');
    expect(result.detail).toContain('raise 20%');
  });

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
