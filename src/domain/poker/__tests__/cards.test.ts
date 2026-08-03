import { describe, expect, it } from 'vitest';

import { cardKey, createDeck, seededRandom, shuffle } from '../cards';

describe('deck creation and shuffling', () => {
  it('creates exactly one of every Hold’em card', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardKey)).size).toBe(52);
  });

  it('uses a non-mutating Fisher–Yates permutation with injected entropy', () => {
    const deck = createDeck();
    const original = deck.map(cardKey);
    const shuffled = shuffle(deck, seededRandom(40_001));

    expect(deck.map(cardKey)).toEqual(original);
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled.map(cardKey))).toEqual(new Set(original));
    expect(shuffled.map(cardKey)).not.toEqual(original);
    expect(shuffle(deck, seededRandom(40_001))).toEqual(shuffled);
  });

  it('keeps varied generated deals complete and duplicate-free', () => {
    const firstCards = new Set<string>();
    for (let seed = 1; seed <= 500; seed += 1) {
      const deck = shuffle(createDeck(), seededRandom(seed));
      expect(new Set(deck.map(cardKey)).size).toBe(52);
      firstCards.add(cardKey(deck[0]!));
    }
    expect(firstCards.size).toBeGreaterThan(45);
  });
});
