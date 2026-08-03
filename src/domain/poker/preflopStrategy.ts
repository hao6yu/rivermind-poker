import type { AiDifficulty } from './aiProfiles';
import type { TablePosition } from './multiway';
import type { Card, LegalActions, PlayerAction, Rank } from './types';

export const PREFLOP_RANKS: readonly Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

export type PreflopFacing = 'unopened' | 'limped' | 'raised';
export type PreflopStackBand = 'short' | 'medium' | 'deep';
export type PreflopRangeCategory = 'raise' | 'continue' | 'mix' | 'fold';
export type PreflopPlanAction = 'raise' | 'call' | 'check' | 'fold';

export interface PreflopHandClass {
  highRank: Rank;
  key: string;
  lowRank: Rank;
  pair: boolean;
  suited: boolean;
}

export interface PreflopRangeInput {
  canCheck?: boolean;
  cards: readonly Card[];
  callersAfterRaise?: number;
  effectiveStackBb: number;
  facing: PreflopFacing;
  limperCount?: number;
  playerCount: number;
  position: TablePosition;
  /** Public style prior for the acting range; 0 is loosest and 1 is tightest. */
  rangeTightness?: number;
  raiseCount?: number;
  raiseSizeBb?: number;
  raiserPosition?: TablePosition;
  tournamentMode?: boolean;
  /** ICM-lite additional equity required at a qualification bubble. */
  tournamentRiskPremium?: number;
  /** Earned tiers use solver-informed target range widths. */
  strategyTier?: AiDifficulty;
}

export interface PreflopFrequencies {
  call: number;
  check: number;
  fold: number;
  raise: number;
}

export interface PreflopPlan {
  category: PreflopRangeCategory;
  explanation: string;
  frequencies: PreflopFrequencies;
  hand: PreflopHandClass;
  jamPreferred: boolean;
  primaryAction: PreflopPlanAction;
  score: number;
  stackBand: PreflopStackBand;
}

export interface PreflopSizingInput {
  bigBlind: number;
  currentBet: number;
  legal: LegalActions;
  playerStreetBet: number;
  position: TablePosition;
  stackBand: PreflopStackBand;
  facing: PreflopFacing;
  limperCount?: number;
  jamPreferred?: boolean;
}

export interface PreflopDecisionAdjustment {
  continueFrequencyDelta?: number;
  raiseFrequencyScale?: number;
  raiseSizeScale?: number;
}

const rankLabels: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function frequencies(
  raise: number,
  call: number,
  check: number,
  fold: number,
): PreflopFrequencies {
  const total = raise + call + check + fold;
  if (total <= 0) return { raise: 0, call: 0, check: 0, fold: 1 };
  return {
    raise: raise / total,
    call: call / total,
    check: check / total,
    fold: fold / total,
  };
}

export function rankLabel(rank: Rank): string {
  return rankLabels[rank];
}

export function classifyPreflopHand(cards: readonly Card[]): PreflopHandClass {
  if (cards.length !== 2) throw new Error('A preflop hand must contain exactly two cards.');
  const [first, second] = [...cards].sort((left, right) => right.rank - left.rank);
  if (!first || !second) throw new Error('A preflop hand must contain exactly two cards.');
  const pair = first.rank === second.rank;
  const suited = !pair && first.suit === second.suit;
  return {
    highRank: first.rank,
    lowRank: second.rank,
    pair,
    suited,
    key: pair
      ? `${rankLabel(first.rank)}${rankLabel(second.rank)}`
      : `${rankLabel(first.rank)}${rankLabel(second.rank)}${suited ? 's' : 'o'}`,
  };
}

export function preflopGridCards(rowRank: Rank, columnRank: Rank): readonly [Card, Card] {
  if (rowRank === columnRank) {
    return [
      { rank: rowRank, suit: 'spades' },
      { rank: columnRank, suit: 'hearts' },
    ];
  }
  const highRank = Math.max(rowRank, columnRank) as Rank;
  const lowRank = Math.min(rowRank, columnRank) as Rank;
  const suited = rowRank > columnRank;
  return [
    { rank: highRank, suit: 'spades' },
    { rank: lowRank, suit: suited ? 'spades' : 'hearts' },
  ];
}

export function preflopStackBand(effectiveStackBb: number): PreflopStackBand {
  if (effectiveStackBb <= 25) return 'short';
  if (effectiveStackBb <= 60) return 'medium';
  return 'deep';
}

export function preflopFacingFromPublicAction(
  currentBet: number,
  bigBlind: number,
  history: readonly { street: string; type: string }[],
): PreflopFacing {
  if (currentBet > bigBlind) return 'raised';
  return history.some((action) => action.street === 'preflop' && action.type === 'call')
    ? 'limped'
    : 'unopened';
}

function handScore(hand: PreflopHandClass, stackBand: PreflopStackBand): number {
  if (hand.pair) {
    const pairStrength = (hand.highRank - 2) / 12;
    return clamp(0.6 + pairStrength * 0.4);
  }

  const highStrength = (hand.highRank - 2) / 12;
  const lowStrength = (hand.lowRank - 2) / 12;
  const gap = hand.highRank - hand.lowRank;
  const broadwayCount = Number(hand.highRank >= 10) + Number(hand.lowRank >= 10);
  const suitedConnectorAdjustment = hand.suited && gap <= 2
    ? stackBand === 'deep' ? 0.11 : stackBand === 'medium' ? 0.055 : -0.035
    : 0;
  const connectedBonus = gap === 1 ? 0.065 : gap === 2 ? 0.032 : gap === 3 ? 0.012 : 0;
  const suitedWheelAce = hand.suited && hand.highRank === 14 && hand.lowRank <= 5 ? 0.055 : 0;
  const weakOffsuitPenalty = !hand.suited && hand.lowRank <= 6 && gap >= 5 ? 0.035 : 0;

  return clamp(
    0.18
      + highStrength * 0.38
      + lowStrength * 0.2
      + (hand.suited ? 0.08 : 0)
      + connectedBonus
      + suitedConnectorAdjustment
      + broadwayCount * 0.035
      + (hand.highRank === 14 ? 0.04 : 0)
      + suitedWheelAce
      - weakOffsuitPenalty,
  );
}

interface WeightedPreflopClass {
  combos: number;
  hand: PreflopHandClass;
}

const weightedPreflopClasses: readonly WeightedPreflopClass[] = PREFLOP_RANKS.flatMap((highRank) => (
  PREFLOP_RANKS.flatMap((lowRank): WeightedPreflopClass[] => {
    if (lowRank > highRank) return [];
    if (highRank === lowRank) {
      return [{
        combos: 6,
        hand: { highRank, key: `${rankLabel(highRank)}${rankLabel(lowRank)}`, lowRank, pair: true, suited: false },
      }];
    }
    return [
      {
        combos: 4,
        hand: { highRank, key: `${rankLabel(highRank)}${rankLabel(lowRank)}s`, lowRank, pair: false, suited: true },
      },
      {
        combos: 12,
        hand: { highRank, key: `${rankLabel(highRank)}${rankLabel(lowRank)}o`, lowRank, pair: false, suited: false },
      },
    ];
  })
));

const TOTAL_PREFLOP_COMBOS = 1_326;

function scoreThresholdForComboFraction(
  fraction: number,
  stackBand: PreflopStackBand,
): number {
  const targetCombos = clamp(fraction, 0.01, 0.95) * TOTAL_PREFLOP_COMBOS;
  const ranked = weightedPreflopClasses
    .map((entry) => ({ ...entry, score: handScore(entry.hand, stackBand) }))
    .sort((left, right) => right.score - left.score || left.hand.key.localeCompare(right.hand.key));
  let cumulative = 0;
  for (const entry of ranked) {
    cumulative += entry.combos;
    if (cumulative >= targetCombos) return entry.score;
  }
  return ranked.at(-1)?.score ?? 0;
}

function advancedOpeningFraction(input: PreflopRangeInput): number {
  let fraction: number;
  switch (input.position) {
    case 'BTN/SB': fraction = 0.62; break;
    case 'BTN': fraction = input.playerCount <= 3 ? 0.48 : 0.43; break;
    case 'SB': fraction = input.playerCount <= 3 ? 0.48 : 0.42; break;
    case 'CO': fraction = 0.3; break;
    case 'HJ': fraction = 0.23; break;
    case 'UTG': fraction = input.playerCount <= 4 ? 0.24 : 0.19; break;
    case 'BB': return 0;
  }
  const identityDelta = (0.5 - clamp(input.rangeTightness ?? 0.5)) * 0.22;
  const riskDelta = clamp(input.tournamentRiskPremium ?? 0, 0, 0.08) * 0.8;
  const shortStackDelta = input.effectiveStackBb < 20 ? -0.035 : 0;
  return clamp(fraction + identityDelta - riskDelta + shortStackDelta, 0.1, 0.7);
}

function advancedContinueFraction(input: PreflopRangeInput): number {
  let fraction: number;
  if (input.position === 'BB') {
    switch (input.raiserPosition) {
      case 'BTN':
      case 'BTN/SB': fraction = 0.52; break;
      case 'CO': fraction = 0.44; break;
      case 'HJ': fraction = 0.37; break;
      case 'UTG': fraction = 0.31; break;
      case 'SB': fraction = 0.56; break;
      default: fraction = 0.42;
    }
  } else if (input.position === 'SB') {
    fraction = input.raiserPosition === 'BTN' ? 0.36 : input.raiserPosition === 'CO' ? 0.29 : 0.23;
  } else if (input.position === 'BTN' || input.position === 'CO') {
    fraction = input.raiserPosition === 'UTG' ? 0.2 : 0.28;
  } else {
    fraction = 0.19;
  }
  const openSize = Math.max(1.5, input.raiseSizeBb ?? 2.5);
  const sizeScale = Math.pow(2.5 / openSize, 0.72);
  const reraiseScale = Math.pow(0.66, Math.max(0, (input.raiseCount ?? 1) - 1));
  const callerScale = Math.pow(0.95, Math.max(0, input.callersAfterRaise ?? 0));
  const identityDelta = (0.5 - clamp(input.rangeTightness ?? 0.5)) * 0.08;
  const riskDelta = clamp(input.tournamentRiskPremium ?? 0, 0, 0.08) * 0.65;
  return clamp(fraction * sizeScale * reraiseScale * callerScale + identityDelta - riskDelta, 0.06, 0.62);
}

function advancedReraiseFraction(input: PreflopRangeInput, continueFraction: number): number {
  const lateOpen = input.raiserPosition === 'BTN'
    || input.raiserPosition === 'BTN/SB'
    || input.raiserPosition === 'CO'
    || input.raiserPosition === 'SB';
  const base = input.position === 'BB'
    ? lateOpen ? 0.12 : 0.075
    : input.position === 'SB' && lateOpen ? 0.1 : 0.065;
  const reraiseScale = Math.pow(0.58, Math.max(0, (input.raiseCount ?? 1) - 1));
  return clamp(Math.min(continueFraction * 0.42, base * reraiseScale), 0.035, 0.16);
}

function advancedOpeningPlan(
  input: PreflopRangeInput,
  hand: PreflopHandClass,
  score: number,
  stackBand: PreflopStackBand,
): PreflopPlan {
  const target = advancedOpeningFraction(input);
  const threshold = scoreThresholdForComboFraction(target, stackBand);
  const edge = score - threshold;
  const canLimp = input.position === 'BTN/SB' || input.position === 'SB';
  if (edge >= 0.075) {
    return buildPlan(hand, score, stackBand, frequencies(0.96, canLimp ? 0.03 : 0, 0, 0.01), `${hand.key} is in the pure ${Math.round(target * 100)}% solver-informed opening region from ${input.position}.`);
  }
  if (edge >= 0.018) {
    return buildPlan(hand, score, stackBand, frequencies(0.88, canLimp ? 0.08 : 0, 0, canLimp ? 0.04 : 0.12), `${hand.key} is a high-frequency open within the ${input.position} target range.`);
  }
  if (edge >= -0.018) {
    return buildPlan(hand, score, stackBand, frequencies(0.48, canLimp ? 0.24 : 0, 0, canLimp ? 0.28 : 0.52), `${hand.key} mixes at the edge of the ${input.position} target range.`);
  }
  return buildPlan(hand, score, stackBand, frequencies(0.015, canLimp ? 0.08 : 0, 0, canLimp ? 0.905 : 0.985), `${hand.key} falls below the solver-informed ${input.position} opening target.`);
}

function advancedFacingRaisePlan(
  input: PreflopRangeInput,
  hand: PreflopHandClass,
  score: number,
  stackBand: PreflopStackBand,
): PreflopPlan {
  const continueFraction = advancedContinueFraction(input);
  const reraiseFraction = advancedReraiseFraction(input, continueFraction);
  const continueThreshold = scoreThresholdForComboFraction(continueFraction, stackBand);
  const reraiseThreshold = scoreThresholdForComboFraction(reraiseFraction, stackBand);
  const continueEdge = score - continueThreshold;
  const blockerBluff = stackBand === 'deep' && isSuitedWheelAce(hand);
  if (score >= reraiseThreshold || isPremium(hand)) {
    const raiseFrequency = (input.raiseCount ?? 1) > 1 ? 0.56 : 0.64;
    return buildPlan(hand, score, stackBand, frequencies(raiseFrequency, 0.31, 0, 1 - raiseFrequency - 0.31), `${hand.key} sits in the solver-informed value re-raise region.`);
  }
  if (blockerBluff && continueEdge >= -0.06) {
    return buildPlan(hand, score, stackBand, frequencies(0.28, input.position === 'BB' ? 0.42 : 0.24, 0, input.position === 'BB' ? 0.3 : 0.48), `${hand.key} mixes a blocker re-raise with a call against this opening range.`);
  }
  if (continueEdge >= 0.055) {
    return buildPlan(hand, score, stackBand, frequencies(0.09, 0.86, 0, 0.05), `${hand.key} is comfortably inside the ${Math.round(continueFraction * 100)}% continuing target.`);
  }
  if (continueEdge >= 0) {
    return buildPlan(hand, score, stackBand, frequencies(0.05, 0.72, 0, 0.23), `${hand.key} continues at mixed frequency near the target boundary.`);
  }
  if (continueEdge >= -0.025 && input.position === 'BB') {
    return buildPlan(hand, score, stackBand, frequencies(0.025, 0.42, 0, 0.555), `${hand.key} is a price-sensitive big-blind mix at the edge of the target range.`);
  }
  const normalSingleRaise = (input.raiseCount ?? 1) === 1 && (input.raiseSizeBb ?? 2.5) <= 2.75;
  const tailCall = normalSingleRaise
    ? input.position === 'BB' ? 0.13 : 0.09
    : input.position === 'BB' ? 0.08 : 0.05;
  return buildPlan(hand, score, stackBand, frequencies(0.005, tailCall, 0, 0.995 - tailCall), `${hand.key} is outside the solver-informed continuing target for this price.`);
}

function openingThreshold(position: TablePosition, playerCount: number): number {
  switch (position) {
    case 'BTN/SB': return 0.54;
    case 'BTN': return playerCount <= 3 ? 0.59 : 0.62;
    case 'SB': return playerCount <= 3 ? 0.64 : 0.68;
    case 'CO': return 0.71;
    case 'HJ': return 0.77;
    case 'UTG': return playerCount <= 4 ? 0.79 : 0.81;
    case 'BB': return 1;
  }
}

function callingThreshold(position: TablePosition): number {
  switch (position) {
    case 'BB': return 0.62;
    case 'BTN/SB': return 0.66;
    case 'SB': return 0.7;
    case 'BTN': return 0.73;
    case 'CO': return 0.76;
    case 'HJ': return 0.79;
    case 'UTG': return 0.81;
  }
}

function raiserPositionAdjustment(position: TablePosition | undefined): number {
  switch (position) {
    case 'UTG': return 0.045;
    case 'HJ': return 0.025;
    case 'BB': return 0.018;
    case 'SB': return 0.008;
    case 'CO': return 0;
    case 'BTN':
    case 'BTN/SB': return -0.025;
    default: return 0;
  }
}

function rangeThresholdAdjustment(rangeTightness: number | undefined): number {
  return (clamp(rangeTightness ?? 0.5) - 0.5) * 0.14;
}

function isPremium(hand: PreflopHandClass): boolean {
  return (hand.pair && hand.highRank >= 11)
    || (hand.highRank === 14 && hand.lowRank >= 12);
}

function isSuitedWheelAce(hand: PreflopHandClass): boolean {
  return hand.suited && hand.highRank === 14 && hand.lowRank <= 5;
}

function primaryActionFor(frequency: PreflopFrequencies): PreflopPlanAction {
  const actions: Array<[PreflopPlanAction, number]> = [
    ['raise', frequency.raise],
    ['call', frequency.call],
    ['check', frequency.check],
    ['fold', frequency.fold],
  ];
  return actions.reduce((best, current) => current[1] > best[1] ? current : best)[0];
}

function categoryFor(frequency: PreflopFrequencies): PreflopRangeCategory {
  const strongest = Math.max(frequency.raise, frequency.call, frequency.check, frequency.fold);
  if (strongest < 0.7) return 'mix';
  if (frequency.raise === strongest) return 'raise';
  if (frequency.fold === strongest) return 'fold';
  return 'continue';
}

function buildPlan(
  hand: PreflopHandClass,
  score: number,
  stackBand: PreflopStackBand,
  frequency: PreflopFrequencies,
  explanation: string,
  jamPreferred = false,
): PreflopPlan {
  return {
    category: categoryFor(frequency),
    explanation,
    frequencies: frequency,
    hand,
    jamPreferred,
    primaryAction: primaryActionFor(frequency),
    score,
    stackBand,
  };
}

/**
 * A compact, explainable beginner baseline rather than a solver chart. It uses
 * only the acting player's cards and public table information.
 */
export function buildPreflopPlan(input: PreflopRangeInput): PreflopPlan {
  const hand = classifyPreflopHand(input.cards);
  const stackBand = preflopStackBand(input.effectiveStackBb);
  const score = handScore(hand, stackBand);
  const identityAdjustment = rangeThresholdAdjustment(input.rangeTightness);
  const tournamentRisk = clamp(input.tournamentRiskPremium ?? 0, 0, 0.08);
  const advancedTier = input.strategyTier === 'elite' || input.strategyTier === 'nemesis';

  if (input.tournamentMode && input.effectiveStackBb <= 10) {
    if (input.facing === 'unopened') {
      let threshold = openingThreshold(input.position, input.playerCount)
        + identityAdjustment
        + tournamentRisk
        - 0.09;
      if (hand.pair) threshold -= 0.1;
      const edge = score - threshold;
      if (edge >= 0.04) {
        return buildPlan(hand, score, stackBand, frequencies(0.94, 0, 0, 0.06), `${hand.key} is strong enough to move all-in from ${input.position} at ${Math.round(input.effectiveStackBb * 10) / 10} BB.`, true);
      }
      if (edge >= 0) {
        return buildPlan(hand, score, stackBand, frequencies(0.48, 0, 0, 0.52), `${hand.key} is a mixed all-in near the edge of the ${input.position} push-or-fold range.`, true);
      }
      return buildPlan(hand, score, stackBand, frequencies(0.02, 0, 0, 0.98), `${hand.key} is below the ${input.position} push-or-fold range at this stack depth.`);
    }

    if (input.facing === 'limped') {
      const jamThreshold = 0.68 + identityAdjustment + tournamentRisk;
      if (isPremium(hand) || score >= jamThreshold) {
        return buildPlan(
          hand,
          score,
          stackBand,
          frequencies(0.9, input.canCheck ? 0 : 0.06, input.canCheck ? 0.06 : 0, 0.04),
          `${hand.key} is strong enough to move all-in over the limper${(input.limperCount ?? 1) === 1 ? '' : 's'} at this stack depth.`,
          true,
        );
      }
      if (input.canCheck) {
        return buildPlan(hand, score, stackBand, frequencies(0.03, 0, 0.97, 0), `Checking ${hand.key} takes the free flop instead of risking a critical stack.`);
      }
      return buildPlan(hand, score, stackBand, frequencies(0.03, 0.08, 0, 0.89), `${hand.key} is not strong enough to commit a critical stack over the limper${(input.limperCount ?? 1) === 1 ? '' : 's'}.`);
    }

    const shoveThreshold = callingThreshold(input.position)
      + identityAdjustment
      + raiserPositionAdjustment(input.raiserPosition)
      + tournamentRisk
      + Math.max(0, (input.raiseCount ?? 1) - 1) * 0.075;
    if (isPremium(hand) || score >= shoveThreshold) {
      return buildPlan(hand, score, stackBand, frequencies(0.82, 0.15, 0, 0.03), `${hand.key} is strong enough to move all-in over the raise at ${Math.round(input.effectiveStackBb * 10) / 10} BB.`, true);
    }
    return buildPlan(hand, score, stackBand, frequencies(0.01, 0.06, 0, 0.93), `${hand.key} is below the short-stack continue range against this raise.`);
  }

  if (
    input.tournamentMode
    && input.effectiveStackBb <= 15
    && input.facing === 'raised'
    && (isPremium(hand) || (hand.pair && hand.highRank >= 9) || score >= 0.9)
  ) {
    return buildPlan(
      hand,
      score,
      stackBand,
      frequencies(0.74, 0.2, 0, 0.06),
      `${hand.key} is strong enough to re-shove a ${Math.round(input.effectiveStackBb * 10) / 10} BB tournament stack over the raise.`,
      true,
    );
  }

  if (advancedTier && input.facing === 'unopened') {
    return advancedOpeningPlan(input, hand, score, stackBand);
  }

  if (advancedTier && input.facing === 'raised') {
    return advancedFacingRaisePlan(input, hand, score, stackBand);
  }

  if (input.facing === 'unopened') {
    let threshold = openingThreshold(input.position, input.playerCount) + identityAdjustment;
    if (hand.pair) threshold -= stackBand === 'deep' ? 0.11 : stackBand === 'medium' ? 0.055 : 0;
    const edge = score - threshold;
    if (edge >= 0.1) {
      const premiumJam = Boolean(input.tournamentMode && input.effectiveStackBb <= 12 && isPremium(hand));
      return buildPlan(
        hand,
        score,
        stackBand,
        frequencies(0.95, 0, 0, 0.05),
        premiumJam
          ? `${hand.key} is strong enough to move all-in from ${input.position} with ${Math.round(input.effectiveStackBb * 10) / 10} BB.`
          : `${hand.key} is comfortably inside the opening range from ${input.position}.`,
        premiumJam,
      );
    }
    if (edge >= 0) {
      return buildPlan(hand, score, stackBand, frequencies(0.78, input.position === 'BTN/SB' ? 0.12 : 0, 0, input.position === 'BTN/SB' ? 0.1 : 0.22), `${hand.key} is a standard open from ${input.position}, with a little room to mix.`);
    }
    if (edge >= -0.05) {
      return buildPlan(hand, score, stackBand, frequencies(0.34, input.position === 'BTN/SB' ? 0.2 : 0, 0, input.position === 'BTN/SB' ? 0.46 : 0.66), `${hand.key} sits on the edge of the ${input.position} opening range.`);
    }
    return buildPlan(hand, score, stackBand, frequencies(0.04, input.position === 'BTN/SB' ? 0.16 : 0, 0, input.position === 'BTN/SB' ? 0.8 : 0.96), `${hand.key} is below the starter opening range from ${input.position}.`);
  }

  if (input.facing === 'limped') {
    const extraLimpers = Math.max(0, (input.limperCount ?? 1) - 1);
    const isolationThreshold = identityAdjustment + extraLimpers * 0.012;
    if (input.canCheck) {
      if (isPremium(hand) || score >= 0.84 + isolationThreshold) {
        return buildPlan(hand, score, stackBand, frequencies(0.82, 0, 0.18, 0), `${hand.key} is strong enough to raise the limpers for value.`);
      }
      if (score >= 0.68 + isolationThreshold) {
        return buildPlan(hand, score, stackBand, frequencies(0.36, 0, 0.64, 0), `${hand.key} can mix an isolation raise with a free flop.`);
      }
      return buildPlan(hand, score, stackBand, frequencies(0.06, 0, 0.94, 0), `Checking ${hand.key} takes the free flop without inflating the pot.`);
    }
    if (isPremium(hand) || score >= 0.84 + isolationThreshold) {
      return buildPlan(hand, score, stackBand, frequencies(0.84, 0.16, 0, 0), `${hand.key} should usually isolate the limpers for value.`);
    }
    if (score >= 0.63 + identityAdjustment + extraLimpers * 0.006) {
      return buildPlan(hand, score, stackBand, frequencies(0.2, 0.68, 0, 0.12), `${hand.key} plays well enough to continue behind the limpers.`);
    }
    return buildPlan(hand, score, stackBand, frequencies(0.03, 0.16, 0, 0.81), `${hand.key} is too weak to over-limp as a default.`);
  }

  const raiseCount = Math.max(1, input.raiseCount ?? 1);
  if (isPremium(hand)) {
    const facingReraise = raiseCount > 1;
    return buildPlan(
      hand,
      score,
      stackBand,
      facingReraise ? frequencies(0.64, 0.24, 0, 0.12) : frequencies(0.8, 0.2, 0, 0),
      `${hand.key} belongs in the value ${facingReraise ? 're-raise' : '3-bet'} range against this action.`,
    );
  }
  if (isSuitedWheelAce(hand) && stackBand === 'deep') {
    return buildPlan(hand, score, stackBand, frequencies(0.2, input.position === 'BB' ? 0.42 : 0.22, 0, input.position === 'BB' ? 0.38 : 0.58), `${hand.key} can occasionally 3-bet as a blocker bluff, but folding remains fine.`);
  }

  let threshold = callingThreshold(input.position)
    + identityAdjustment
    + raiserPositionAdjustment(input.raiserPosition)
    + Math.max(0, raiseCount - 1) * 0.075
    + Math.max(0, input.callersAfterRaise ?? 0) * 0.012;
  if (stackBand === 'deep' && hand.suited && hand.highRank - hand.lowRank <= 3) threshold -= 0.045;
  if (stackBand === 'short' && !hand.pair) threshold += 0.035;
  const raiseSizeBb = input.raiseSizeBb ?? 2.5;
  threshold += clamp((raiseSizeBb - 2.5) * 0.035, -0.035, 0.12);
  const raiseDescription = input.raiseSizeBb
    ? `${Math.round(input.raiseSizeBb * 10) / 10} BB open`
    : 'normal open';
  const edge = score - threshold;
  if (edge >= 0.1) {
    return buildPlan(hand, score, stackBand, frequencies(0.3, 0.65, 0, 0.05), `${hand.key} is strong enough to continue against this ${raiseDescription}.`);
  }
  if (edge >= 0) {
    return buildPlan(hand, score, stackBand, frequencies(0.12, 0.7, 0, 0.18), `${hand.key} is inside the continuing range from ${input.position}.`);
  }
  if (edge >= -0.055) {
    return buildPlan(hand, score, stackBand, frequencies(0.06, input.position === 'BB' ? 0.44 : 0.26, 0, input.position === 'BB' ? 0.5 : 0.68), `${hand.key} is a close defense; position and the raise size should break the tie.`);
  }
  return buildPlan(hand, score, stackBand, frequencies(0.01, input.position === 'BB' ? 0.12 : 0.04, 0, input.position === 'BB' ? 0.87 : 0.95), `${hand.key} is below the default continuing range against a raise.`);
}

export function preferredPreflopRaiseTo(input: PreflopSizingInput): number {
  const { bigBlind, currentBet, legal, playerStreetBet, position, stackBand, facing } = input;
  if (input.jamPreferred) return legal.maxRaiseTo;
  let target: number;
  if (facing === 'raised') {
    const inPosition = position === 'BTN' || position === 'CO' || position === 'HJ';
    target = currentBet * (inPosition ? 3 : 3.5);
  } else if (facing === 'limped') {
    target = bigBlind * (3 + Math.max(1, input.limperCount ?? 1));
  } else {
    target = bigBlind * (stackBand === 'deep' ? 2.5 : stackBand === 'medium' ? 2.3 : 2.2);
  }
  const rounded = Math.round(target);
  const maximum = Math.max(playerStreetBet, legal.maxRaiseTo);
  return Math.min(maximum, Math.max(legal.minRaiseTo, rounded));
}

function adjustedFrequencies(
  plan: PreflopPlan,
  difficulty: AiDifficulty,
  adjustment: PreflopDecisionAdjustment,
  sizing: PreflopSizingInput,
): PreflopFrequencies {
  const { raise, call, check, fold } = plan.frequencies;
  let difficultyAdjusted: PreflopFrequencies;
  if (difficulty === 'friendly') {
    const reducedRaise = raise * 0.66;
    const moved = raise - reducedRaise;
    difficultyAdjusted = frequencies(reducedRaise, call + moved * 0.72 + fold * 0.05, check + moved * 0.28, fold * 0.95);
  } else if (difficulty === 'sharp' || difficulty === 'elite' || difficulty === 'nemesis') {
    const raiseCap = difficulty === 'nemesis' ? 0.11 : difficulty === 'elite' ? 0.105 : 0.09;
    const raiseShare = difficulty === 'nemesis' ? 0.165 : difficulty === 'elite' ? 0.16 : 0.14;
    const addedRaise = Math.min(raiseCap, (call + check) * raiseShare);
    const passive = call + check;
    difficultyAdjusted = frequencies(
      raise + addedRaise,
      passive > 0 ? call - addedRaise * (call / passive) : call,
      passive > 0 ? check - addedRaise * (check / passive) : check,
      fold,
    );
  } else {
    difficultyAdjusted = plan.frequencies;
  }

  // Normal-sized opens should create contested pots rather than automatic
  // folds. These bounded recoveries widen first-in ranges and move part of the
  // defense range into calls/3-bets without making oversized raises cheap.
  if (sizing.facing === 'unopened') {
    const openRecovery = difficulty === 'friendly'
      ? 0.08
      : difficulty === 'nemesis' ? 0.15 : difficulty === 'elite' ? 0.14 : 0.12;
    const recoveredFold = difficultyAdjusted.fold * openRecovery;
    difficultyAdjusted = frequencies(
      difficultyAdjusted.raise + recoveredFold,
      difficultyAdjusted.call,
      difficultyAdjusted.check,
      difficultyAdjusted.fold - recoveredFold,
    );
  } else if (sizing.facing === 'raised') {
    const openSizeBb = sizing.currentBet / Math.max(1, sizing.bigBlind);
    const smallOpenScale = clamp(5 - openSizeBb);
    const defenseRecovery = difficulty === 'nemesis' ? 0.15 : difficulty === 'elite' ? 0.14 : 0.12;
    const recoveredFold = difficultyAdjusted.fold * defenseRecovery * smallOpenScale;
    const raiseShare = difficulty === 'nemesis'
      ? 0.3
      : difficulty === 'elite' ? 0.28 : difficulty === 'sharp' ? 0.24 : difficulty === 'club' ? 0.2 : 0.12;
    difficultyAdjusted = frequencies(
      difficultyAdjusted.raise + recoveredFold * raiseShare,
      difficultyAdjusted.call + recoveredFold * (1 - raiseShare),
      difficultyAdjusted.check,
      difficultyAdjusted.fold - recoveredFold,
    );
  }

  const continueDelta = clamp(adjustment.continueFrequencyDelta ?? 0, -0.1, 0.1);
  const raiseScale = clamp(adjustment.raiseFrequencyScale ?? 1, 0.72, 1.35);
  const continueViaCall = difficultyAdjusted.call >= difficultyAdjusted.check;
  const continueWeight = continueViaCall ? difficultyAdjusted.call : difficultyAdjusted.check;
  const movedToContinue = Math.min(difficultyAdjusted.fold, Math.max(0, continueDelta));
  const movedToFold = Math.min(continueWeight, Math.max(0, -continueDelta));
  const scaledRaise = difficultyAdjusted.raise * raiseScale;
  const movedRaiseToContinue = Math.max(0, difficultyAdjusted.raise - scaledRaise);
  return frequencies(
    scaledRaise,
    difficultyAdjusted.call + (continueViaCall ? movedToContinue - movedToFold + movedRaiseToContinue : 0),
    difficultyAdjusted.check + (!continueViaCall ? movedToContinue - movedToFold + movedRaiseToContinue : 0),
    difficultyAdjusted.fold - movedToContinue + movedToFold,
  );
}

export function selectPreflopAction(
  plan: PreflopPlan,
  mix: number,
  legal: LegalActions,
  sizing: PreflopSizingInput,
  difficulty: AiDifficulty = 'club',
  adjustment: PreflopDecisionAdjustment = {},
): PlayerAction {
  const frequency = adjustedFrequencies(plan, difficulty, adjustment, sizing);
  const normalizedMix = clamp(Number.isFinite(mix) ? mix : 0.5, 0, 0.999_999);
  const candidates: Array<[PreflopPlanAction, number]> = [
    ['raise', frequency.raise],
    ['call', frequency.call],
    ['check', frequency.check],
    ['fold', frequency.fold],
  ];
  let cursor = 0;
  let selected: PreflopPlanAction = 'fold';
  for (const [action, weight] of candidates) {
    cursor += weight;
    if (normalizedMix < cursor) {
      selected = action;
      break;
    }
  }

  if (selected === 'raise' && legal.canRaise) {
    if (sizing.jamPreferred) return { type: 'raise', amount: legal.maxRaiseTo };
    const baseline = preferredPreflopRaiseTo(sizing);
    const difficultyScale = difficulty === 'friendly'
      ? 0.9
      : difficulty === 'nemesis' ? 1.14 : difficulty === 'elite' ? 1.12 : difficulty === 'sharp' ? 1.1 : 1;
    const scale = difficultyScale * clamp(adjustment.raiseSizeScale ?? 1, 0.9, 1.12);
    const amount = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(baseline * scale)));
    return { type: 'raise', amount };
  }
  if (selected === 'call' && legal.canCall) return { type: 'call' };
  if (selected === 'check' && legal.canCheck) return { type: 'check' };
  if (selected === 'fold' && legal.canFold) return { type: 'fold' };
  if (legal.canCheck) return { type: 'check' };
  if (legal.canCall) return { type: 'call' };
  if (legal.canRaise) return { type: 'raise', amount: preferredPreflopRaiseTo(sizing) };
  return { type: 'fold' };
}
