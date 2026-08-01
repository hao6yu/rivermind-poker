import type { Card, Rank, Suit } from './types.ts';

export type RandomSource = () => number;

const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const ranks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const suitSymbols: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

export const rankLabels: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

export function createDeck(): Card[] {
  return suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
}

export function shuffle<T>(values: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current === undefined || swap === undefined) continue;
    result[index] = swap;
    result[swapIndex] = current;
  }
  return result;
}

export function cardKey(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

export function cardLabel(card: Card): string {
  return `${rankLabels[card.rank]}${suitSymbols[card.suit]}`;
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'diamonds' || suit === 'hearts';
}

export function withoutCards(deck: readonly Card[], known: readonly Card[]): Card[] {
  const excluded = new Set(known.map(cardKey));
  return deck.filter((card) => !excluded.has(cardKey(card)));
}

export function seededRandom(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
