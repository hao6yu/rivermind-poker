import type { AiDifficulty } from './aiProfiles';
import { describeHand, evaluateBest } from './evaluator';
import type { Card, LegalActions, PlayerAction, Street, Suit } from './types';

export type PostflopRole = 'bluff' | 'control' | 'defense' | 'draw' | 'protection' | 'value';
export type PostflopStrength = 'weak' | 'marginal' | 'strong' | 'premium';
export type PostflopInitiative = 'player' | 'opponent' | 'none';

export interface PostflopStrategyInput {
  bigBlind: number;
  board: readonly Card[];
  cards: readonly Card[];
  currentBet: number;
  effectiveStack: number;
  equity: number;
  initiative: PostflopInitiative;
  legal: LegalActions;
  opponentCount: number;
  playerStreetBet: number;
  playersBehind: number;
  pot: number;
  /** Keeps beginner-facing advice aligned strictly with the displayed direct price. */
  requireDirectPriceEdge?: boolean;
  /** ICM-lite additional equity required at a qualification bubble. */
  tournamentRiskPremium?: number;
  street: Exclude<Street, 'preflop' | 'complete'>;
}

export interface PostflopCandidate {
  action: PlayerAction;
  detail: string;
  headline: string;
  potFraction?: number;
  role: PostflopRole;
  score: number;
}

export interface PostflopPlan {
  alternatives: PostflopCandidate[];
  bustedDrawLabel: string | null;
  /** Every legal candidate ordered by relative teaching score. */
  candidates: PostflopCandidate[];
  drawLabel: string | null;
  handLabel: string;
  primary: PostflopCandidate;
  requiredEquity: number;
  stackToPotRatio: number;
  strength: PostflopStrength;
  textureLabel: string;
}

export interface PostflopSelectionAdjustments {
  bluffFrequencyScale?: number;
  callToleranceDelta?: number;
  pressureFrequencyScale?: number;
  raiseSizeScale?: number;
  slowPlayFrequency?: number;
  valueFrequencyScale?: number;
}

const sizeChoices = [
  { fraction: 1 / 3, label: '⅓ pot' },
  { fraction: 1 / 2, label: '½ pot' },
  { fraction: 3 / 4, label: '¾ pot' },
  { fraction: 1, label: 'pot' },
] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatBb(chips: number, bigBlind: number): string {
  return `${Math.round((chips / Math.max(1, bigBlind)) * 10) / 10} BB`;
}

function straightCompletionRanks(cards: readonly Card[]): number[] {
  const ranks = new Set<number>(cards.map((card) => card.rank));
  if (ranks.has(14)) ranks.add(1);
  const completions = new Set<number>();
  for (let high = 5; high <= 14; high += 1) {
    const window = Array.from({ length: 5 }, (_, index) => high - index);
    const missing = window.filter((rank) => !ranks.has(rank));
    if (missing.length === 1) completions.add(missing[0] === 1 ? 14 : missing[0]!);
  }
  return [...completions];
}

function drawLabelOnBoard(cards: readonly Card[], board: readonly Card[]): string | null {
  const allCards = [...cards, ...board];
  const suitCounts = new Map<Suit, number>();
  allCards.forEach((card) => suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1));
  const flushDraw = [...suitCounts.entries()].some(([suit, count]) => (
    count === 4 && cards.some((card) => card.suit === suit)
  ));
  const straightRanks = straightCompletionRanks(allCards);
  const straightDraw = straightRanks.length >= 2 ? 'open-ended straight draw' : straightRanks.length === 1 ? 'gutshot' : null;
  if (flushDraw && straightDraw) return `combo draw (${straightDraw} + flush draw)`;
  if (flushDraw) return 'flush draw';
  return straightDraw;
}

function drawLabel(cards: readonly Card[], board: readonly Card[], street: PostflopStrategyInput['street']): string | null {
  if (street === 'river') return null;
  return drawLabelOnBoard(cards, board);
}

function bustedDrawLabel(cards: readonly Card[], board: readonly Card[], street: PostflopStrategyInput['street']): string | null {
  if (street !== 'river' || board.length < 5) return null;
  const turnDraw = drawLabelOnBoard(cards, board.slice(0, 4));
  if (!turnDraw) return null;
  const made = evaluateBest([...cards, ...board]);
  if (made.category >= 2) return null; // improved to two pair or better — not a busted-draw bluff
  return `busted ${turnDraw}`;
}

interface PostflopBoardTexture {
  dominantSuit: Suit | null;
  flushCount: number;
  label: string;
  wetness: number;
}

function boardTexture(board: readonly Card[]): PostflopBoardTexture {
  const suits = new Map<Suit, number>();
  board.forEach((card) => suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1));
  const dominant = [...suits.entries()].sort((left, right) => right[1] - left[1])[0];
  const maxSuit = dominant?.[1] ?? 0;
  const uniqueRanks = [...new Set(board.map((card) => card.rank))].sort((left, right) => left - right);
  const paired = uniqueRanks.length < board.length;
  const regularSpan = (uniqueRanks.at(-1) ?? 0) - (uniqueRanks[0] ?? 0);
  const aceLowRanks = uniqueRanks.includes(14)
    ? uniqueRanks.map((rank) => rank === 14 ? 1 : rank).sort((left, right) => left - right)
    : uniqueRanks;
  const aceLowSpan = (aceLowRanks.at(-1) ?? 0) - (aceLowRanks[0] ?? 0);
  const rankSpan = Math.min(regularSpan, aceLowSpan);
  const connected = uniqueRanks.length >= 3 && rankSpan <= 5;
  const veryConnected = uniqueRanks.length >= 3 && rankSpan <= 4;
  const tone = maxSuit >= 5
    ? 'five-flush'
    : maxSuit >= 4
    ? 'four-flush'
    : maxSuit === 3 && board.length === 3
      ? 'monotone'
      : maxSuit === 3 ? 'three-flush' : maxSuit === 2 ? 'two-tone' : '';
  const parts = [paired ? 'paired' : '', veryConnected ? 'connected' : connected ? 'coordinated' : '', tone]
    .filter(Boolean);
  const wetness = clamp(
    (maxSuit >= 4 ? 0.42 : maxSuit === 3 ? 0.3 : maxSuit === 2 ? 0.12 : 0)
      + (veryConnected ? 0.3 : connected ? 0.18 : 0)
      + (paired ? 0.09 : 0),
    0,
    1,
  );
  return {
    dominantSuit: dominant?.[0] ?? null,
    flushCount: maxSuit,
    label: parts.length > 0 ? `${parts.join(', ')} board` : 'dry, unpaired board',
    wetness,
  };
}

function classifyStrength(cards: readonly Card[], board: readonly Card[]): { label: string; strength: PostflopStrength } {
  if (cards.length !== 2 || board.length < 3) return { label: 'current hand', strength: 'weak' };
  const value = evaluateBest([...cards, ...board]);
  if (value.category >= 4) return { label: describeHand(value).toLowerCase(), strength: 'premium' };
  if (value.category >= 2) return { label: describeHand(value).toLowerCase(), strength: 'strong' };
  if (value.category === 1) {
    const pairRank = value.kickers[0] ?? 0;
    const boardHigh = Math.max(...board.map((card) => card.rank));
    const pocketPair = cards[0]?.rank === cards[1]?.rank;
    if (pocketPair && pairRank > boardHigh) return { label: 'overpair', strength: 'strong' };
    if (cards.some((card) => card.rank === boardHigh) && pairRank === boardHigh) {
      return { label: 'top pair', strength: 'marginal' };
    }
    return { label: describeHand(value).toLowerCase(), strength: 'marginal' };
  }
  return { label: describeHand(value).toLowerCase(), strength: 'weak' };
}

function passiveCandidate(
  type: 'check' | 'call' | 'fold',
  input: PostflopStrategyInput,
  handLabel: string,
  draw: string | null,
  score: number,
): PostflopCandidate {
  if (type === 'fold') {
    return {
      action: { type },
      detail: `Folding protects your stack: ${handLabel}${draw ? ` with a ${draw}` : ''} does not clearly support this price against ${input.opponentCount} live range${input.opponentCount === 1 ? '' : 's'}.`,
      headline: 'Fold',
      role: 'defense',
      score,
    };
  }
  if (type === 'call') {
    const required = input.legal.toCall / Math.max(1, input.pot + input.legal.toCall);
    const belowPrice = input.equity < required;
    return {
      action: { type },
      detail: belowPrice
        ? `Calling keeps ${handLabel}${draw ? ` with a ${draw}` : ''} alive, but the estimate is ${Math.round((required - input.equity) * 100)} points below the price${input.playersBehind > 0 ? ` with ${input.playersBehind} player${input.playersBehind === 1 ? '' : 's'} still behind` : ''}.`
        : `${handLabel}${draw ? ` with a ${draw}` : ''} can continue at this price without inflating the pot against ${input.opponentCount} live range${input.opponentCount === 1 ? '' : 's'}.`,
      headline: `Call ${formatBb(input.legal.toCall, input.bigBlind)}`,
      role: 'defense',
      score,
    };
  }
  return {
    action: { type },
    detail: `Checking keeps the pot manageable with ${handLabel}${draw ? ` and a ${draw}` : ''}${input.playersBehind > 0 ? ` while ${input.playersBehind} player${input.playersBehind === 1 ? '' : 's'} can still act` : ''}.`,
    headline: 'Check',
    role: 'control',
    score,
  };
}

function aggressiveRole(
  strength: PostflopStrength,
  draw: string | null,
  equity: number,
  opponentCount: number,
  playersBehind: number,
): PostflopRole {
  if (strength === 'premium' || strength === 'strong') return 'value';
  const marginalValuePremium = 0.12
    + Math.max(0, opponentCount - 1) * 0.08
    + playersBehind * 0.02;
  if (strength === 'marginal'
    && equity >= 1 / Math.max(2, opponentCount + 1) + marginalValuePremium) return 'value';
  if (draw) return 'draw';
  if (strength === 'marginal') return 'protection';
  return 'bluff';
}

function preferredFraction(
  strength: PostflopStrength,
  draw: string | null,
  wetness: number,
  opponentCount: number,
  stackToPotRatio: number,
): number {
  if (stackToPotRatio <= 1.05 && (strength === 'premium' || strength === 'strong')) return 1;
  if (strength === 'premium') return wetness >= 0.35 || opponentCount > 1 ? 0.75 : 0.5;
  if (strength === 'strong') return wetness >= 0.28 || opponentCount > 1 ? 0.75 : 0.5;
  if (draw) return wetness >= 0.35 ? 0.75 : 0.5;
  if (strength === 'marginal') return 1 / 3;
  // Bluffs tell the same sizing story as the value range on this texture.
  return wetness >= 0.35 ? 0.75 : 0.5;
}

function aggressiveCandidates(
  input: PostflopStrategyInput,
  handLabel: string,
  strength: PostflopStrength,
  draw: string | null,
  texture: PostflopBoardTexture,
  stackToPotRatio: number,
  bustedDraw: string | null,
): PostflopCandidate[] {
  if (!input.legal.canRaise) return [];
  const vulnerableToBoardFlush = strength === 'marginal'
    && texture.flushCount >= 3
    && texture.dominantSuit !== null
    && !input.cards.some((card) => card.suit === texture.dominantSuit);
  const role = vulnerableToBoardFlush
    ? 'protection'
    : aggressiveRole(strength, draw, input.equity, input.opponentCount, input.playersBehind);
  const fairShare = 1 / Math.max(2, input.opponentCount + 1);
  const edge = input.equity - fairShare;
  const preferred = role === 'value' && strength === 'marginal'
    ? texture.wetness >= 0.28 || input.opponentCount > 1 ? 0.75 : 0.5
    : preferredFraction(strength, draw, texture.wetness, input.opponentCount, stackToPotRatio);
  const seenTargets = new Set<number>();
  const candidates: PostflopCandidate[] = [];
  const addCandidate = (fraction: number, sizeLabel: string, allIn = false) => {
    const rawTarget = allIn
      ? input.legal.maxRaiseTo
      : input.currentBet === 0
        ? input.playerStreetBet + input.pot * fraction
        : input.currentBet + (input.pot + input.legal.toCall) * fraction;
    const target = clamp(Math.round(rawTarget), input.legal.minRaiseTo, input.legal.maxRaiseTo);
    if (!allIn && target >= input.legal.maxRaiseTo) return;
    if (seenTargets.has(target)) return;
    seenTargets.add(target);
    const actualFraction = input.currentBet === 0
      ? (target - input.playerStreetBet) / Math.max(1, input.pot)
      : (target - input.currentBet) / Math.max(1, input.pot + input.legal.toCall);
    const fieldPenalty = Math.max(0, input.opponentCount - 1) * (role === 'value' ? 0.005 : 0.045)
      + input.playersBehind * (role === 'value' ? 0.01 : 0.04);
    const roleBoost = role === 'value'
      ? strength === 'premium' ? 0.35 : 0.24
      : role === 'draw' ? 0.1
        : role === 'protection' ? 0.015
          // A river bluff has to fold out every live range, so the busted-draw
          // boost is a heads-up privilege: it decays per extra opponent and
          // bottoms out at the generic bluff discount. The decay must outpace
          // the edge term, whose 1/(opponents+1) fair share shrinks faster
          // than a busted draw's near-zero equity and would otherwise make
          // multiway bluffs score better than heads-up ones.
          : bustedDraw
            ? Math.max(-0.11, 0.16 - Math.max(0, input.opponentCount - 1) * 0.16)
            : input.playersBehind === 0 && input.opponentCount === 1 && texture.wetness < 0.3 ? 0.035 : -0.11;
    const initiativeBoost = input.initiative === 'player' && input.currentBet === 0 ? 0.035 : 0;
    const vulnerableOverpairPenalty = handLabel === 'overpair' && input.legal.toCall > 0
      ? 0.18 + texture.wetness * 0.5 + Math.max(0, input.opponentCount - 1) * 0.05
      : 0;
    const boardFlushPenalty = vulnerableToBoardFlush ? 0.12 : 0;
    const sizeFit = Math.abs(actualFraction - preferred) * 0.28;
    const jamPenalty = allIn && stackToPotRatio > 1.25 ? 0.3 : 0;
    const score = 0.43 + edge * 0.72 + roleBoost + initiativeBoost
      - fieldPenalty - sizeFit - jamPenalty - vulnerableOverpairPenalty - boardFlushPenalty;
    const reason = role === 'value'
      ? `${handLabel} is strong enough to build value. ${sizeLabel} fits this ${texture.label} and the ${input.opponentCount === 1 ? 'single continuing range' : `${input.opponentCount} live ranges`}.`
      : role === 'draw'
        ? `The ${draw} gives this semi-bluff ways to improve. ${sizeLabel} adds fold pressure without treating the draw as a made hand.`
        : role === 'protection'
          ? `${sizeLabel} can charge overcards and weaker draws, but ${handLabel} is not strong enough for a large pot by default.`
          : bustedDraw
            ? `${sizeLabel} turns the ${bustedDraw} into a bluff; the made-hand range checks back too often to let this go.`
            : `${sizeLabel} is a selective bluff on this ${texture.label}; checking remains important so this line is not overused.`;
    candidates.push({
      action: { type: 'raise', amount: target },
      detail: reason,
      headline: allIn
        ? `${input.currentBet === 0 ? 'Bet' : 'Raise'} all-in · ${formatBb(target, input.bigBlind)}`
        : input.currentBet === 0
          ? `Bet ${sizeLabel} · ${formatBb(target, input.bigBlind)}`
          : `Raise to ${formatBb(target, input.bigBlind)} · ${sizeLabel}`,
      potFraction: actualFraction,
      role,
      score,
    });
  };

  sizeChoices.forEach(({ fraction, label }) => addCandidate(fraction, label));
  if (stackToPotRatio <= 1.05
    && (strength === 'premium'
      || (strength === 'strong' && handLabel !== 'overpair' && input.opponentCount <= 2))) {
    addCandidate(1.25, 'all-in', true);
  }
  return candidates;
}

function meaningfulAlternatives(primary: PostflopCandidate, candidates: PostflopCandidate[]): PostflopCandidate[] {
  const result: PostflopCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate === primary) continue;
    const sameAction = candidate.action.type === primary.action.type;
    if (sameAction && result.some((item) => item.action.type === candidate.action.type)) continue;
    result.push(candidate);
    if (result.length === 2) break;
  }
  return result;
}

/**
 * Ranks legal postflop lines from public information and the acting player's own cards.
 * Scores are relative teaching heuristics, never solver EV or a guarantee of optimal play.
 */
export function buildPostflopPlan(input: PostflopStrategyInput): PostflopPlan {
  if (input.board.length < 3 || input.board.length > 5) {
    throw new Error('Postflop strategy requires a three- to five-card board.');
  }
  const hand = classifyStrength(input.cards, input.board);
  const draw = drawLabel(input.cards, input.board, input.street);
  const bustedDraw = bustedDrawLabel(input.cards, input.board, input.street);
  const texture = boardTexture(input.board);
  const requiredEquity = input.legal.toCall > 0
    ? input.legal.toCall / Math.max(1, input.pot + input.legal.toCall)
    : 0;
  const margin = input.equity - requiredEquity - clamp(input.tournamentRiskPremium ?? 0, 0, 0.08);
  const pricedOut = input.requireDirectPriceEdge === true && input.legal.toCall > 0 && margin < 0;
  const stackToPotRatio = input.effectiveStack / Math.max(input.pot, input.bigBlind);
  const candidates: PostflopCandidate[] = [];

  if (input.legal.canFold && input.legal.toCall > 0) {
    const foldScore = 0.5 - margin * 1.35
      + (input.playersBehind > 0 ? 0.035 : 0)
      + (hand.strength === 'weak' ? 0.08 : hand.strength === 'premium' ? -0.35 : 0)
      + (draw ? -0.09 : 0)
      + (pricedOut ? 0.1 + clamp(-margin * 2, 0, 0.12) : 0);
    candidates.push(passiveCandidate('fold', input, hand.label, draw, foldScore));
  }
  if (input.legal.canCall && input.legal.toCall > 0) {
    const callScore = 0.48 + margin * 0.5
      + (draw && !pricedOut ? 0.08 : 0)
      + (hand.strength === 'premium' ? 0.12 : hand.strength === 'strong' ? 0.06 : 0)
      + (input.opponentCount === 1 && input.playersBehind === 0 ? 0.04 : 0)
      - input.playersBehind * 0.025
      - (pricedOut ? 0.05 : 0);
    candidates.push(passiveCandidate('call', input, hand.label, draw, callScore));
  }
  if (input.legal.canCheck) {
    const checkScore = 0.58
      + (hand.strength === 'weak' ? 0.14 : hand.strength === 'marginal' ? 0.08 : hand.strength === 'premium' ? -0.2 : -0.05)
      + (draw ? 0.025 : 0)
      + input.playersBehind * 0.02;
    candidates.push(passiveCandidate('check', input, hand.label, draw, checkScore));
  }
  candidates.push(...aggressiveCandidates(input, hand.label, hand.strength, draw, texture, stackToPotRatio, bustedDraw));
  if (candidates.length === 0) throw new Error('No legal postflop candidates were available.');

  const ranked = [...candidates].sort((left, right) => right.score - left.score);
  const primary = ranked[0]!;
  return {
    alternatives: meaningfulAlternatives(primary, ranked),
    bustedDrawLabel: bustedDraw,
    candidates: ranked,
    drawLabel: draw,
    handLabel: hand.label,
    primary,
    requiredEquity,
    stackToPotRatio,
    strength: hand.strength,
    textureLabel: texture.label,
  };
}

/** Selects a nearby legal line, with bounded difficulty and public-read adjustments. */
export function selectPostflopAction(
  plan: PostflopPlan,
  mix: number,
  difficulty: AiDifficulty,
  adjustments: PostflopSelectionAdjustments = {},
): PostflopCandidate {
  const candidates = [plan.primary, ...plan.alternatives];
  const normalizedMix = clamp(Number.isFinite(mix) ? mix : 0.5, 0, 0.999_999);
  const slowPlayFrequency = clamp(adjustments.slowPlayFrequency ?? 0, 0, 0.28);
  if (
    (plan.strength === 'strong' || plan.strength === 'premium')
    && plan.primary.role === 'value'
    && normalizedMix < slowPlayFrequency
  ) {
    const passiveTrap = candidates.find((candidate) => (
      candidate.action.type === 'check' || candidate.action.type === 'call'
    ));
    if (passiveTrap) return passiveTrap;
  }
  const difficultyRaiseBias = difficulty === 'friendly'
    ? -0.12
    : difficulty === 'nemesis' ? 0.112 : difficulty === 'elite' ? 0.108 : difficulty === 'sharp' ? 0.09 : 0;
  const difficultyFoldBias = difficulty === 'friendly' ? -0.12 : 0;
  const selectionTemperature = difficulty === 'friendly'
    ? 5.7
    : difficulty === 'nemesis' ? 6.8 : difficulty === 'elite' ? 6.5 : difficulty === 'sharp' ? 6.1 : 5.8;
  const weighted = candidates.map((candidate) => {
    let score = candidate.score;
    if (candidate.action.type === 'raise') {
      const frequencyScale = candidate.role === 'value'
        ? adjustments.valueFrequencyScale ?? 1
        : candidate.role === 'bluff'
          ? adjustments.bluffFrequencyScale ?? 1
          : adjustments.pressureFrequencyScale ?? 1;
      score += difficultyRaiseBias + Math.log(Math.max(0.5, frequencyScale)) * 0.18;
      score += ((adjustments.raiseSizeScale ?? 1) - 1) * (candidate.potFraction ?? 0) * 0.18;
      if (candidate.role === 'bluff') {
        score += difficulty === 'nemesis'
          ? 0.25
          : difficulty === 'elite' ? 0.245 : difficulty === 'sharp' ? 0.22 : difficulty === 'friendly' ? -0.12 : -0.04;
      }
      if (difficulty === 'friendly') score -= (candidate.potFraction ?? 0) * 0.14;
      if (difficulty === 'sharp' || difficulty === 'elite' || difficulty === 'nemesis') {
        const sizingPressure = difficulty === 'nemesis' ? 0.205 : difficulty === 'elite' ? 0.2 : 0.18;
        score += (candidate.potFraction ?? 0) * sizingPressure;
      }
    }
    if (candidate.action.type === 'fold') score += difficultyFoldBias - (adjustments.callToleranceDelta ?? 0);
    if (candidate.action.type === 'call' && difficulty === 'friendly') score += 0.055;
    return { candidate, weight: Math.exp(score * selectionTemperature) };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = normalizedMix * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item.candidate;
    }
  }
  return weighted.at(-1)!.candidate;
}
