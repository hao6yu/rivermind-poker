import { createDeck, shuffle, withoutCards, type RandomSource } from './cards';
import { compareHandValues, evaluateBest } from './evaluator';
import type { Card } from './types';

export function estimateHeadsUpEquity(
  heroCards: readonly Card[],
  board: readonly Card[],
  simulations = 180,
  random: RandomSource = Math.random,
): number {
  return estimateFieldEquity(heroCards, board, 1, simulations, random);
}

/**
 * Estimates equity against uniformly sampled unknown hands. Only the acting
 * player's cards and the public board are accepted, so revealed opponent cards
 * can never influence coaching or post-hand grading.
 */
export function estimateFieldEquity(
  heroCards: readonly Card[],
  board: readonly Card[],
  opponentCount: number,
  simulations = 180,
  random: RandomSource = Math.random,
): number {
  if (heroCards.length !== 2) throw new Error('Equity requires two hole cards.');
  if (board.length > 5) throw new Error('The board cannot contain more than five cards.');
  if (!Number.isInteger(opponentCount) || opponentCount < 1 || opponentCount > 5) {
    throw new Error('Equity requires one to five unknown opponents.');
  }

  const available = withoutCards(createDeck(), [...heroCards, ...board]);
  const cardsNeeded = opponentCount * 2 + (5 - board.length);
  if (available.length < cardsNeeded) throw new Error('Not enough unknown cards remain.');

  let score = 0;
  const runs = Math.max(1, simulations);
  for (let simulation = 0; simulation < runs; simulation += 1) {
    const sample = shuffle(available, random).slice(0, cardsNeeded);
    const runout = sample.slice(opponentCount * 2);
    const finalBoard = [...board, ...runout];
    const heroValue = evaluateBest([...heroCards, ...finalBoard]);
    let heroIsBest = true;
    let winnerCount = 1;
    for (let opponentIndex = 0; opponentIndex < opponentCount; opponentIndex += 1) {
      const opponentCards = sample.slice(opponentIndex * 2, opponentIndex * 2 + 2);
      const opponentValue = evaluateBest([...opponentCards, ...finalBoard]);
      const comparison = compareHandValues(opponentValue, heroValue);
      if (comparison > 0) {
        heroIsBest = false;
        break;
      }
      if (comparison === 0) winnerCount += 1;
    }
    if (heroIsBest) score += 1 / winnerCount;
  }
  return score / runs;
}
