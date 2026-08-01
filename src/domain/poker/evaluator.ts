import type { Card, Rank } from './types.ts';

export interface HandValue {
  category: number;
  kickers: number[];
  name: string;
}

const categoryNames = [
  'High card',
  'One pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
];

function straightHigh(ranks: number[]): number | null {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    const window = unique.slice(index, index + 5);
    if (window.every((rank, offset) => rank === (window[0] ?? 0) - offset)) {
      return window[0] ?? null;
    }
  }
  return null;
}

export function evaluateFive(cards: readonly Card[]): HandValue {
  if (cards.length !== 5) throw new Error('Exactly five cards are required.');

  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const straight = straightHigh(ranks);

  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    ([rankA, countA], [rankB, countB]) => countB - countA || rankB - rankA,
  );

  let category = 0;
  let kickers: number[] = ranks;

  if (flush && straight !== null) {
    category = 8;
    kickers = [straight];
  } else if (groups[0]?.[1] === 4) {
    category = 7;
    kickers = [groups[0][0], groups[1]?.[0] ?? 0];
  } else if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) {
    category = 6;
    kickers = [groups[0][0], groups[1][0]];
  } else if (flush) {
    category = 5;
  } else if (straight !== null) {
    category = 4;
    kickers = [straight];
  } else if (groups[0]?.[1] === 3) {
    category = 3;
    kickers = [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)];
  } else if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    category = 2;
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    kickers = [...pairs, groups[2]?.[0] ?? 0];
  } else if (groups[0]?.[1] === 2) {
    category = 1;
    kickers = [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)];
  }

  return { category, kickers, name: categoryNames[category] ?? 'Unknown hand' };
}

export function compareHandValues(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return Math.sign(a.category - b.category);
  const length = Math.max(a.kickers.length, b.kickers.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a.kickers[index] ?? 0) - (b.kickers[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function combinations<T>(values: readonly T[], count: number): T[][] {
  const results: T[][] = [];
  const visit = (start: number, chosen: T[]) => {
    if (chosen.length === count) {
      results.push(chosen);
      return;
    }
    for (let index = start; index <= values.length - (count - chosen.length); index += 1) {
      const value = values[index];
      if (value !== undefined) visit(index + 1, [...chosen, value]);
    }
  };
  visit(0, []);
  return results;
}

export function evaluateBest(cards: readonly Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error('Five to seven cards are required.');
  let best: HandValue | null = null;
  for (const group of combinations(cards, 5)) {
    const value = evaluateFive(group);
    if (best === null || compareHandValues(value, best) > 0) best = value;
  }
  if (best === null) throw new Error('Unable to evaluate the hand.');
  return best;
}

export function describeHand(value: HandValue): string {
  const highRank = value.kickers[0] as Rank | undefined;
  const labels: Partial<Record<Rank, string>> = {
    11: 'Jacks',
    12: 'Queens',
    13: 'Kings',
    14: 'Aces',
  };
  if (value.category === 0 && highRank !== undefined) return `${value.name}, ${highRank === 14 ? 'ace' : highRank}-high`;
  if (value.category === 1 && highRank !== undefined) return `Pair of ${labels[highRank] ?? `${highRank}s`}`;
  return value.name;
}
