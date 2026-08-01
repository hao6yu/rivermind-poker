import { cardKey, createDeck, shuffle, withoutCards, type RandomSource } from './cards';
import { compareHandValues, evaluateBest } from './evaluator';
import type { MultiwayAiIdentity } from './multiwayAiProfiles';
import { multiwayAiIdentityForSeat } from './multiwayAiProfiles';
import type { MultiwayHandState, MultiwayPlayerState, TablePosition } from './multiway';
import type { Card } from './types';
import type { FairMultiwayDecisionState } from './fairness';

const GENERIC_HUMAN_RANGE: MultiwayAiIdentity = {
  id: 'generic-human-range',
  name: 'Player',
  style: 'balanced',
  label: 'Observed range',
  summary: 'A neutral range shaped only by public actions.',
  rangeTightness: 0.5,
  aggression: 1,
  callTolerance: 0,
  bluffFrequency: 1,
  potFraction: 0.66,
  slowPlayFrequency: 0,
};

export interface MultiwayEquityOptions {
  simulations?: number;
  random?: RandomSource;
  identities?: Partial<Record<string, MultiwayAiIdentity>>;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function positionRangeAdjustment(position: TablePosition | undefined): number {
  switch (position) {
    case 'UTG': return 0.045;
    case 'HJ': return 0.025;
    case 'CO': return -0.01;
    case 'BTN':
    case 'BTN/SB': return -0.025;
    case 'SB': return 0.015;
    case 'BB': return 0;
    default: return 0;
  }
}

function preflopHandStrength(cards: readonly Card[]): number {
  const first = cards[0];
  const second = cards[1];
  if (!first || !second) throw new Error('A range candidate requires two cards.');
  const high = Math.max(first.rank, second.rank);
  const low = Math.min(first.rank, second.rank);
  if (high === low) return clamp(0.54 + high / 30, 0, 1);

  const suited = first.suit === second.suit ? 0.055 : 0;
  const gap = high - low;
  const connected = gap === 1 ? 0.055 : gap === 2 ? 0.025 : 0;
  const broadway = high >= 11 && low >= 10 ? 0.09 : high >= 12 && low >= 9 ? 0.035 : 0;
  const gapPenalty = Math.max(0, gap - 3) * 0.018;
  return clamp((high + low) / 32 + suited + connected + broadway - gapPenalty - 0.18, 0, 1);
}

function rangeCandidateStrength(cards: readonly Card[], board: readonly Card[]): number {
  const preflop = preflopHandStrength(cards);
  if (board.length < 3) return preflop;
  const value = evaluateBest([...cards, ...board]);
  const categoryStrength = value.category / 8;
  const primaryKicker = (value.kickers[0] ?? 0) / 14;
  return clamp(categoryStrength * 0.76 + primaryKicker * 0.14 + preflop * 0.1, 0, 1);
}

/**
 * Converts only public information into a minimum sampled range strength.
 * Hidden cards from other seats are deliberately ignored.
 */
export function inferMultiwayRangeStrength(
  state: MultiwayHandState,
  playerId: string,
  identity?: MultiwayAiIdentity,
): number {
  const player = state.players[playerId];
  if (!player) throw new Error(`Player ${playerId} is missing from the hand state.`);
  const profile = identity ?? multiwayAiIdentityForSeat(player.seat);
  let strength = 0.025 + profile.rangeTightness * 0.09 + positionRangeAdjustment(player.position);

  state.history.forEach((record) => {
    if (record.playerId !== playerId) return;
    if (record.type === 'raise') {
      const sizingPressure = clamp(record.amount / Math.max(state.bigBlind * 10, record.potAfter), 0, 0.08);
      strength += (record.street === 'preflop' ? 0.15 : 0.12) + sizingPressure;
    } else if (record.type === 'call') {
      strength += record.street === 'preflop' ? 0.035 : 0.05;
    } else if (record.type === 'check') {
      strength -= 0.012;
    }
  });

  return clamp(strength, 0.02, 0.72);
}

function randomPair(pool: readonly Card[], random: RandomSource): [Card, Card] {
  if (pool.length < 2) throw new Error('Not enough unseen cards remain for an opponent hand.');
  const firstIndex = Math.floor(random() * pool.length);
  let secondIndex = Math.floor(random() * (pool.length - 1));
  if (secondIndex >= firstIndex) secondIndex += 1;
  const first = pool[firstIndex];
  const second = pool[secondIndex];
  if (!first || !second) throw new Error('An opponent range sample could not be drawn.');
  return [first, second];
}

function sampleRangeHand(
  pool: readonly Card[],
  board: readonly Card[],
  rangeStrength: number,
  random: RandomSource,
): [Card, Card] {
  const attempts = 4 + Math.round(rangeStrength * 8);
  let best: { cards: [Card, Card]; strength: number } | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const cards = randomPair(pool, random);
    const strength = rangeCandidateStrength(cards, board);
    if (!best || strength > best.strength) best = { cards, strength };
    const acceptance = strength >= rangeStrength
      ? 1
      : Math.max(0.035, 1 - (rangeStrength - strength) * 2.6);
    if (random() <= acceptance) return cards;
  }

  if (!best) throw new Error('An opponent range sample could not be selected.');
  return best.cards;
}

function removeCards(pool: readonly Card[], cards: readonly Card[]): Card[] {
  const removed = new Set(cards.map(cardKey));
  return pool.filter((card) => !removed.has(cardKey(card)));
}

function liveOpponentIds(state: MultiwayHandState, playerId: string): string[] {
  return state.activePlayerIds.filter((opponentId) => (
    opponentId !== playerId && !state.players[opponentId]?.folded
  ));
}

function identityForOpponent(
  player: MultiwayPlayerState,
  identities: Partial<Record<string, MultiwayAiIdentity>> | undefined,
): MultiwayAiIdentity {
  return identities?.[player.id]
    ?? (player.isHero ? GENERIC_HUMAN_RANGE : multiwayAiIdentityForSeat(player.seat));
}

export function estimateMultiwayEquity(
  state: FairMultiwayDecisionState,
  playerId: string,
  options: MultiwayEquityOptions = {},
): number {
  const player = state.players[playerId];
  if (!player) throw new Error(`Player ${playerId} is missing from the hand state.`);
  if (player.holeCards.length !== 2) throw new Error('Multiway equity requires two hole cards.');
  if (state.board.length > 5) throw new Error('The board cannot contain more than five cards.');

  const opponentIds = liveOpponentIds(state, playerId);
  if (opponentIds.length === 0) throw new Error('Multiway equity requires at least one live opponent.');
  const random = options.random ?? Math.random;
  const simulations = Math.max(1, Math.round(options.simulations ?? 144));
  const unseenDeck = withoutCards(createDeck(), [...player.holeCards, ...state.board]);
  const runoutCount = 5 - state.board.length;
  const cardsNeeded = opponentIds.length * 2 + runoutCount;
  if (unseenDeck.length < cardsNeeded) throw new Error('Not enough unseen cards remain for multiway equity.');

  let score = 0;
  for (let simulation = 0; simulation < simulations; simulation += 1) {
    let pool = [...unseenDeck];
    const sampledHands: Record<string, [Card, Card]> = {};

    opponentIds.forEach((opponentId) => {
      const opponent = state.players[opponentId];
      if (!opponent) throw new Error(`Opponent ${opponentId} is missing from the hand state.`);
      const identity = identityForOpponent(opponent, options.identities);
      const rangeStrength = inferMultiwayRangeStrength(state, opponentId, identity);
      const cards = sampleRangeHand(pool, state.board, rangeStrength, random);
      sampledHands[opponentId] = cards;
      pool = removeCards(pool, cards);
    });

    const runout = shuffle(pool, random).slice(0, runoutCount);
    const finalBoard = [...state.board, ...runout];
    const playerValue = evaluateBest([...player.holeCards, ...finalBoard]);
    let winners = 1;
    let playerBest = true;

    opponentIds.forEach((opponentId) => {
      const opponentCards = sampledHands[opponentId];
      if (!opponentCards) throw new Error(`Opponent ${opponentId} was not sampled.`);
      const opponentValue = evaluateBest([...opponentCards, ...finalBoard]);
      const comparison = compareHandValues(opponentValue, playerValue);
      if (comparison > 0) playerBest = false;
      else if (comparison === 0) winners += 1;
    });

    if (playerBest) score += 1 / winners;
  }

  return score / simulations;
}
