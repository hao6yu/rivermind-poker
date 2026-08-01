import { createDeck, shuffle, withoutCards, type RandomSource } from './cards';
import { compareHandValues, evaluateBest } from './evaluator';
import type { Card } from './types';

export function estimateHeadsUpEquity(
  heroCards: readonly Card[],
  board: readonly Card[],
  simulations = 180,
  random: RandomSource = Math.random,
): number {
  if (heroCards.length !== 2) throw new Error('Equity requires two hole cards.');
  if (board.length > 5) throw new Error('The board cannot contain more than five cards.');

  const available = withoutCards(createDeck(), [...heroCards, ...board]);
  const cardsNeeded = 2 + (5 - board.length);
  if (available.length < cardsNeeded) throw new Error('Not enough unknown cards remain.');

  let score = 0;
  const runs = Math.max(1, simulations);
  for (let simulation = 0; simulation < runs; simulation += 1) {
    const sample = shuffle(available, random).slice(0, cardsNeeded);
    const opponentCards = sample.slice(0, 2);
    const runout = sample.slice(2);
    const finalBoard = [...board, ...runout];
    const heroValue = evaluateBest([...heroCards, ...finalBoard]);
    const opponentValue = evaluateBest([...opponentCards, ...finalBoard]);
    const comparison = compareHandValues(heroValue, opponentValue);
    score += comparison > 0 ? 1 : comparison === 0 ? 0.5 : 0;
  }
  return score / runs;
}
