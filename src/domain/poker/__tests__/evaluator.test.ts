import { describe, expect, it } from 'vitest';

import { compareHandValues, evaluateBest, evaluateFive } from '../evaluator';
import type { Card, Rank, Suit } from '../types';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });

describe('poker hand evaluator', () => {
  it('ranks a royal flush above four of a kind', () => {
    const royal = evaluateFive([
      card(14, 'spades'), card(13, 'spades'), card(12, 'spades'), card(11, 'spades'), card(10, 'spades'),
    ]);
    const quads = evaluateFive([
      card(9, 'spades'), card(9, 'hearts'), card(9, 'diamonds'), card(9, 'clubs'), card(14, 'clubs'),
    ]);
    expect(royal.name).toBe('Straight flush');
    expect(compareHandValues(royal, quads)).toBe(1);
  });

  it('recognizes the wheel as a five-high straight', () => {
    const wheel = evaluateFive([
      card(14, 'spades'), card(2, 'hearts'), card(3, 'diamonds'), card(4, 'clubs'), card(5, 'spades'),
    ]);
    expect(wheel.name).toBe('Straight');
    expect(wheel.kickers).toEqual([5]);
  });

  it('selects the best five-card hand from seven cards', () => {
    const result = evaluateBest([
      card(14, 'spades'), card(14, 'hearts'), card(13, 'spades'), card(13, 'hearts'),
      card(13, 'diamonds'), card(2, 'clubs'), card(3, 'clubs'),
    ]);
    expect(result.name).toBe('Full house');
    expect(result.kickers).toEqual([13, 14]);
  });
});
