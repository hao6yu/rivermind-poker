import { describe, expect, it } from 'vitest';

import type { TablePosition } from '../multiway';
import {
  PREFLOP_RANKS,
  buildPreflopPlan,
  classifyPreflopHand,
  preflopGridCards,
  selectPreflopAction,
  type PreflopFacing,
} from '../preflopStrategy';
import type { Card, LegalActions } from '../types';

function cards(high: Card['rank'], low: Card['rank'], suited = false): readonly Card[] {
  return [
    { rank: high, suit: 'spades' },
    { rank: low, suit: suited ? 'spades' : 'hearts' },
  ];
}

function plan(
  hand: readonly Card[],
  position: TablePosition,
  facing: PreflopFacing = 'unopened',
  effectiveStackBb = 100,
  playerCount = 6,
) {
  return buildPreflopPlan({ cards: hand, effectiveStackBb, facing, playerCount, position, canCheck: position === 'BB' && facing === 'limped' });
}

describe('preflop strategy', () => {
  it('classifies canonical hand keys regardless of card order', () => {
    expect(classifyPreflopHand(cards(14, 13, true)).key).toBe('AKs');
    expect(classifyPreflopHand([...cards(14, 13)].reverse()).key).toBe('AKo');
    expect(classifyPreflopHand(cards(9, 9)).key).toBe('99');
  });

  it('opens wider in late position than under the gun', () => {
    expect(plan(cards(13, 10), 'UTG').primaryAction).toBe('fold');
    expect(plan(cards(13, 10), 'BTN').primaryAction).toBe('raise');
  });

  it('values suited connectivity more when stacks are deep', () => {
    const deep = plan(cards(7, 6, true), 'BTN', 'unopened', 100);
    const short = plan(cards(7, 6, true), 'BTN', 'unopened', 20);
    expect(deep.frequencies.raise).toBeGreaterThan(short.frequencies.raise);
    expect(deep.primaryAction).toBe('raise');
    expect(short.primaryAction).toBe('fold');
  });

  it('raises premium pairs from every opening position and depth', () => {
    const positions: TablePosition[] = ['BTN/SB', 'BTN', 'SB', 'CO', 'HJ', 'UTG'];
    for (const position of positions) {
      for (const depth of [20, 40, 100]) {
        expect(plan(cards(14, 14), position, 'unopened', depth).primaryAction).toBe('raise');
      }
    }
  });

  it('uses suited wheel aces as a selective deep-stack 3-bet bluff', () => {
    const suited = plan(cards(14, 5, true), 'BTN', 'raised', 100);
    const offsuit = plan(cards(14, 5), 'BTN', 'raised', 100);
    expect(suited.frequencies.raise).toBeGreaterThan(offsuit.frequencies.raise);
    expect(suited.category).toBe('mix');
  });

  it('defends the big blind wider than an early position seat', () => {
    const hand = cards(12, 9, true);
    expect(plan(hand, 'BB', 'raised').frequencies.call).toBeGreaterThan(plan(hand, 'UTG', 'raised').frequencies.call);
  });

  it('tightens the blind defense when the open is much larger', () => {
    const hand = cards(10, 7, true);
    const normal = buildPreflopPlan({
      cards: hand,
      effectiveStackBb: 100,
      facing: 'raised',
      playerCount: 6,
      position: 'BB',
      raiseSizeBb: 2.5,
    });
    const large = buildPreflopPlan({
      cards: hand,
      effectiveStackBb: 100,
      facing: 'raised',
      playerCount: 6,
      position: 'BB',
      raiseSizeBb: 5,
    });
    expect(normal.primaryAction).toBe('call');
    expect(large.primaryAction).toBe('fold');
  });

  it('produces valid frequencies for all 169 hands across common contexts', () => {
    const contexts: Array<[TablePosition, PreflopFacing, number]> = [
      ['UTG', 'unopened', 100],
      ['BTN', 'unopened', 40],
      ['BB', 'raised', 100],
      ['SB', 'limped', 20],
    ];
    for (const row of PREFLOP_RANKS) {
      for (const column of PREFLOP_RANKS) {
        for (const [position, facing, depth] of contexts) {
          const result = plan(preflopGridCards(row, column), position, facing, depth);
          const values = Object.values(result.frequencies);
          expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
          expect(values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
        }
      }
    }
  });

  it('always returns a legal action and clamps raise sizing', () => {
    const legal: LegalActions = {
      canCall: true,
      canCheck: false,
      canFold: true,
      canRaise: true,
      maxRaiseTo: 180,
      minRaiseTo: 120,
      suggestedRaiseTo: 140,
      toCall: 40,
    };
    const premium = plan(cards(14, 14), 'BB', 'raised', 100);
    const action = selectPreflopAction(premium, 0, legal, {
      bigBlind: 20,
      currentBet: 80,
      facing: 'raised',
      legal,
      playerStreetBet: 20,
      position: 'BB',
      stackBand: premium.stackBand,
    });
    expect(action).toEqual({ type: 'raise', amount: 180 });
  });
});
