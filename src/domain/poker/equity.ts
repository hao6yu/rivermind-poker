import { cardKey, createDeck, shuffle, withoutCards, type RandomSource } from './cards';
import { compareHandValues, evaluateBest } from './evaluator';
import { createRangeSampler, type ComboRange } from './opponentRange';
import type { Card } from './types';

/** A full nine-seat table leaves at most eight unknown opponents. */
export const MAX_FIELD_OPPONENTS = 8;

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
 *
 * Supports up to eight unknown opponents so a nine-seat hand can be graded
 * against its true opponent count (D01). Callers must never shrink the count
 * to stay inside an older limit: an unsupported estimate is reported as
 * ungraded by the caller, never approximated with fewer opponents.
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
  if (!Number.isInteger(opponentCount) || opponentCount < 1 || opponentCount > MAX_FIELD_OPPONENTS) {
    throw new Error(`Equity requires one to ${MAX_FIELD_OPPONENTS} unknown opponents.`);
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

/**
 * Equity where the single opponent's hand is drawn from a modeled public-action range
 * with probability `rangeBlend`, uniformly otherwise. Blend 0 reproduces
 * `estimateHeadsUpEquity` exactly for the same random source.
 */
export function estimateEquityAgainstRange(
  heroCards: readonly Card[],
  board: readonly Card[],
  range: ComboRange,
  rangeBlend: number,
  simulations = 180,
  random: RandomSource = Math.random,
): number {
  if (heroCards.length !== 2) throw new Error('Equity requires two hole cards.');
  if (board.length > 5) throw new Error('The board cannot contain more than five cards.');
  const blend = Math.max(0, Math.min(1, rangeBlend));
  if (blend === 0 || range.total <= 0) return estimateHeadsUpEquity(heroCards, board, simulations, random);
  const sampler = createRangeSampler(range);
  const known = new Set([...heroCards, ...board].map(cardKey));
  const available = withoutCards(createDeck(), [...heroCards, ...board]);
  const runoutCount = 5 - board.length;
  let score = 0;
  const runs = Math.max(1, simulations);
  for (let simulation = 0; simulation < runs; simulation += 1) {
    let opponentCards: readonly Card[];
    let pool: Card[];
    if (random() < blend) {
      opponentCards = sampler.sample(known, random);
      pool = withoutCards(available, opponentCards);
    } else {
      const shuffled = shuffle(available, random);
      opponentCards = shuffled.slice(0, 2);
      pool = shuffled.slice(2);
    }
    const finalBoard = [...board, ...shuffle(pool, random).slice(0, runoutCount)];
    const comparison = compareHandValues(evaluateBest([...opponentCards, ...finalBoard]), evaluateBest([...heroCards, ...finalBoard]));
    if (comparison < 0) score += 1;
    else if (comparison === 0) score += 0.5;
  }
  return score / runs;
}
