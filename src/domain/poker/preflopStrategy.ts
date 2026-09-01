import type { AiDifficulty } from './aiProfiles.ts';
import type { TablePosition } from './multiway.ts';
import {
  applyArchetype, applyOpenLimpAdjustment, applyOpenSizeScale, applyOvercallAdjustment, applyShortStack, applyTier,
  applyMultiLimpAdjustment, defenseTable, limpedTable, lookupBand, raiserBucket, rfiTable, vsFourBetTable, vsThreeBetTable,
  type BandFrequencies, type PreflopArchetype,
} from './preflopRanges.ts';
import type { Card, LegalActions, PlayerAction, Rank } from './types.ts';

export type { PreflopArchetype } from './preflopRanges.ts';

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
  /** Personality archetype driving real range-width differences. Defaults to 'balanced'. */
  archetype?: PreflopArchetype;
  canCheck?: boolean;
  cards: readonly Card[];
  callersAfterRaise?: number;
  effectiveStackBb: number;
  facing: PreflopFacing;
  limperCount?: number;
  playerCount: number;
  position: TablePosition;
  /**
   * Public style prior for the acting range; 0 is loosest and 1 is tightest.
   * Only shifts the tournament short-stack thresholds — flexible-range
   * personality flows through `archetype`.
   */
  rangeTightness?: number;
  raiseCount?: number;
  raiseSizeBb?: number;
  raiserPosition?: TablePosition;
  tournamentMode?: boolean;
  /** ICM-lite additional equity required at a qualification bubble. */
  tournamentRiskPremium?: number;
  /** Difficulty tier; shapes the looked-up band via `applyTier`. */
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
  /**
   * Legs the range table authors at a nonzero frequency for this exact spot.
   * Residual fold/check mass and the hand-written mixes in the push/fold
   * branches are excluded, so a consumer can tell a deliberate low-frequency
   * leg apart from an action the model never intends to take.
   */
  mixedLegs: readonly PreflopPlanAction[];
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
  /** Preflop raises already made; 2+ means the re-raise is a 4-bet or beyond. */
  raiseCount?: number;
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

/**
 * Short-handed tables lose seats from the top of the order, not the bottom:
 * `positionsByPlayerCount` deals 5-handed as BTN/SB/BB/UTG/CO and 4-handed as
 * BTN/SB/BB/UTG, so the seat still labelled UTG has four and three players
 * behind it — structurally a 6-max HJ and a 6-max CO. The range tables are
 * authored for 6-max, so read them at the seat with the same number of players
 * left to act. 3-handed and heads-up need no remap: BTN, SB and BB already have
 * the same players behind them as their 6-max namesakes.
 *
 * Nine-handed early and middle seats (UTG+1, MP, LJ) are conservatively mapped
 * into the existing authored 6-max buckets: the new early/middle seats read the
 * tightest early range until dedicated nine-handed solver tables exist. The UI
 * and saved decision context still retain the truthful displayed position.
 */
function seatEquivalent(position: TablePosition, playerCount: number): TablePosition {
  switch (position) {
    case 'UTG+1':
    case 'MP':
      return 'UTG';
    case 'LJ':
      return 'HJ';
    default:
      if (position !== 'UTG' || playerCount >= 6) return position;
      return playerCount <= 4 ? 'CO' : 'HJ';
  }
}

function openingThreshold(position: TablePosition, playerCount: number): number {
  switch (position) {
    case 'BTN/SB': return 0.54;
    case 'BTN': return playerCount <= 3 ? 0.59 : 0.62;
    case 'SB': return playerCount <= 3 ? 0.64 : 0.68;
    case 'CO': return 0.71;
    case 'HJ': return 0.77;
    // Conservative nine-handed bucket: the new early/middle seats read the
    // tightest authored early range. `seatEquivalent` normally performs this
    // mapping before these switches; the cases keep the switch exhaustive.
    case 'LJ': return 0.77;
    // Reached only at 6+ players; below that `seatEquivalent` maps UTG onto the
    // seat with the same number of players behind it.
    case 'UTG':
    case 'UTG+1':
    case 'MP': return 0.81;
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
    case 'HJ':
    case 'LJ': return 0.79;
    case 'UTG':
    case 'UTG+1':
    case 'MP': return 0.81;
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
  mixedLegs: readonly PreflopPlanAction[] = [],
): PreflopPlan {
  return {
    category: categoryFor(frequency),
    explanation,
    frequencies: frequency,
    hand,
    jamPreferred,
    mixedLegs,
    primaryAction: primaryActionFor(frequency),
    score,
    stackBand,
  };
}

/**
 * Looks the hand class up in an explicit range table for the spot, then applies
 * bounded, explainable modifiers (open size, overcallers, stack depth, bubble
 * risk, personality archetype, difficulty tier). Tournament stacks at or below
 * 15 BB keep their own push/fold and re-shove logic above. Only the acting
 * player's cards and public table information are consulted.
 */
export function buildPreflopPlan(input: PreflopRangeInput): PreflopPlan {
  const hand = classifyPreflopHand(input.cards);
  const stackBand = preflopStackBand(input.effectiveStackBb);
  const score = handScore(hand, stackBand);
  const identityAdjustment = rangeThresholdAdjustment(input.rangeTightness);
  const tournamentRisk = clamp(input.tournamentRiskPremium ?? 0, 0, 0.08);
  // Strategy reads use the 6-max-equivalent seat; every explanation string keeps
  // naming `input.position`, the seat the player actually sees.
  const seat = seatEquivalent(input.position, input.playerCount);
  const raiserSeat = input.raiserPosition
    ? seatEquivalent(input.raiserPosition, input.playerCount)
    : undefined;

  if (input.tournamentMode && input.effectiveStackBb <= 10) {
    if (input.facing === 'unopened') {
      let threshold = openingThreshold(seat, input.playerCount)
        + identityAdjustment
        + tournamentRisk
        - 0.09;
      if (hand.pair) threshold -= 0.1;
      const edge = score - threshold;
      if (edge >= 0.04) {
        return buildPlan(hand, score, stackBand, frequencies(0.94, 0, 0, 0.06), `${hand.key} is strong enough to move all-in from ${input.position} at ${Math.round(input.effectiveStackBb * 10) / 10} big blinds deep.`, true);
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

    const shoveThreshold = callingThreshold(seat)
      + identityAdjustment
      + raiserPositionAdjustment(raiserSeat)
      + tournamentRisk
      + Math.max(0, (input.raiseCount ?? 1) - 1) * 0.075;
    if (isPremium(hand) || score >= shoveThreshold) {
      return buildPlan(hand, score, stackBand, frequencies(0.82, 0.15, 0, 0.03), `${hand.key} is strong enough to move all-in over the raise at ${Math.round(input.effectiveStackBb * 10) / 10} big blinds deep.`, true);
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
      `${hand.key} is strong enough to re-shove a ${Math.round(input.effectiveStackBb * 10) / 10} big blind tournament stack over the raise.`,
      true,
    );
  }

  const tier = input.strategyTier;
  const facing = input.facing;

  if (facing === 'unopened' && seat === 'BB') {
    return buildPlan(hand, score, stackBand, frequencies(0, 0, 1, 0), `Checking ${hand.key} takes the free flop from the big blind.`);
  }

  const table = facing === 'unopened'
    ? rfiTable(seat)
    : facing === 'limped'
      ? limpedTable(seat)
      : (input.raiseCount ?? 1) >= 3
        ? vsFourBetTable()
        : (input.raiseCount ?? 1) === 2
          ? vsThreeBetTable()
          : defenseTable(seat, raiserBucket(raiserSeat));

  const lookedUp = lookupBand(table, hand.key);
  // Population bands model how the AI player pool plays, not how anyone
  // should play. Callers that model an opponent (any strategyTier or
  // archetype) receive them; the neutral baseline the coach, grading, and
  // range explorer consume treats those hands as outside the range.
  const modelsOpponent = input.strategyTier !== undefined || input.archetype !== undefined;
  const rawBand = lookedUp && (!lookedUp.population || modelsOpponent) ? lookedUp : null;
  if (!rawBand) {
    const outside = facing === 'unopened'
      ? `${hand.key} is outside the ${input.position} opening range.`
      : facing === 'limped'
        ? `${hand.key} is too weak to over-limp as a default.`
        : `${hand.key} is outside the continuing range against this action.`;
    return buildPlan(
      hand, score, stackBand,
      input.canCheck ? frequencies(0, 0, 1, 0) : frequencies(0, 0, 0, 1),
      input.canCheck ? `Checking ${hand.key} takes the free flop without inflating the pot.` : outside,
    );
  }

  let band: BandFrequencies = rawBand;
  if (facing === 'raised') {
    // The vs-3-bet and vs-4-bet tables are already conditioned on the re-raise,
    // so scaling them by the bet size again would double-count the price.
    if ((input.raiseCount ?? 1) < 2) band = applyOpenSizeScale(band, input.raiseSizeBb);
    band = applyOvercallAdjustment(band, hand.key, input.callersAfterRaise ?? 0);
    if (tournamentRisk > 0) {
      band = { ...band, raise: band.raise * (1 - tournamentRisk * 4), call: band.call * (1 - tournamentRisk * 5) };
    }
  } else if (facing === 'limped') {
    band = applyMultiLimpAdjustment(band, input.limperCount);
  } else {
    band = applyOpenLimpAdjustment(band, input.playerCount, tier);
  }
  band = applyShortStack(band, hand.key, stackBand);
  band = applyArchetype(band, input.archetype, facing);
  // The tier `wide` trim models entry discipline — a stronger player enters
  // fewer speculative pots. A big blind closing the action against a single
  // raise is not making a speculative entry: the price is what makes the wide
  // band correct, and stronger tiers should defend it more, not less. Facing a
  // 3-bet the big blind neither closes the action nor gets that price, so the
  // trim applies there as normal. `wide` is restored for the explanation below.
  const closingForPrice = facing === 'raised'
    && seat === 'BB'
    && (input.raiseCount ?? 1) <= 1;
  band = { ...applyTier(closingForPrice ? { ...band, wide: false } : band, tier), wide: band.wide };

  // Bands authored at raise + call >= 0.98 are "never fold" bands (the premium
  // top of every defense table). First-in tables author their premium tops a
  // touch lower — 0.95-0.97, the remainder being deliberate entry variance —
  // while their wide edges sit far below at 0.35-0.5, so 0.95 cleanly selects
  // the same premium tops there. Price, archetype and tier shrink shape a
  // premium band's raise:call mix, but must not leak fold mass beyond the
  // authored rate into a hand that is never folded — so restore the authored
  // continue mass at the modified mix. Bands authored below the threshold keep
  // the fold growth their modifiers intend.
  const neverFoldThreshold = facing === 'unopened' ? 0.95 : 0.98;
  const rawSum = Math.min(0.98, rawBand.raise + rawBand.call);
  const modifiedSum = band.raise + band.call;
  if (rawBand.raise + rawBand.call >= neverFoldThreshold && modifiedSum > 0 && modifiedSum < rawSum) {
    const rescale = rawSum / modifiedSum;
    band = { raise: band.raise * rescale, call: band.call * rescale, wide: band.wide };
  }

  const raise = Math.max(0, Math.min(0.98, band.raise));
  // With a free check there is nothing to call: any authored flat/over-limp
  // mass (the big blind closing a limped pot) belongs on the check leg, not
  // on an action the engine will never offer.
  const call = input.canCheck ? 0 : Math.max(0, Math.min(0.98 - raise, band.call));
  const passiveRemainder = Math.max(0, 1 - raise - call);
  const check = input.canCheck ? passiveRemainder : 0;
  const fold = input.canCheck ? 0 : passiveRemainder;

  const explanation = facing === 'unopened'
    ? band.wide
      ? `${hand.key} sits on the edge of the ${input.position} opening range.`
      : `${hand.key} is inside the ${input.position} opening range.`
    : facing === 'limped'
      ? input.canCheck
        ? raise > 0.5
          ? `${hand.key} is strong enough to raise the limpers for value.`
          : `Checking ${hand.key} takes the free flop behind the limpers; a raise stays in the mix.`
        : raise >= call
          ? `${hand.key} is strong enough to raise the limpers for value.`
          : `${hand.key} plays well enough to continue behind the limpers.`
      : raise > call
        ? `${hand.key} belongs in the re-raise range against this action.`
        : band.wide
          ? `${hand.key} is a close defense; the price and position break the tie.`
          : `${hand.key} is inside the continuing range from ${input.position}.`;

  // Post-clamp, so a leg that price, tier or archetype drove to zero is not
  // listed. `check` is never authored — like fold, it is residual mass.
  const mixedLegs: PreflopPlanAction[] = [];
  if (raise > 0) mixedLegs.push('raise');
  if (call > 0) mixedLegs.push('call');

  return buildPlan(
    hand, score, stackBand, frequencies(raise, call, check, fold), explanation, false, mixedLegs,
  );
}

export function preferredPreflopRaiseTo(input: PreflopSizingInput): number {
  const { bigBlind, currentBet, legal, playerStreetBet, position, stackBand, facing } = input;
  if (input.jamPreferred) return legal.maxRaiseTo;
  let target: number;
  if (facing === 'raised') {
    const inPosition = position === 'BTN' || position === 'CO' || position === 'HJ';
    // A 4-bet (or beyond) is already facing a large bet, so it uses a much
    // smaller multiple than the first re-raise over an open.
    const reraiseFactor = (input.raiseCount ?? 1) >= 2 ? 2.4 : inPosition ? 3 : 3.5;
    target = currentBet * reraiseFactor;
  } else if (facing === 'limped') {
    target = bigBlind * (3 + Math.max(1, input.limperCount ?? 1));
  } else {
    target = bigBlind * (stackBand === 'deep' ? 2.5 : stackBand === 'medium' ? 2.3 : 2.2);
  }
  const rounded = Math.round(target);
  const maximum = Math.max(playerStreetBet, legal.maxRaiseTo);
  return Math.min(maximum, Math.max(legal.minRaiseTo, rounded));
}

/**
 * Range shape (including difficulty tier) is decided in `buildPreflopPlan`; the
 * only post-hoc movement here is the bounded opponent-adaptation delta.
 */
function adjustedFrequencies(
  plan: PreflopPlan,
  _difficulty: AiDifficulty,
  adjustment: PreflopDecisionAdjustment,
  _sizing: PreflopSizingInput,
): PreflopFrequencies {
  const base = plan.frequencies;
  const continueDelta = clamp(adjustment.continueFrequencyDelta ?? 0, -0.1, 0.1);
  const raiseScale = clamp(adjustment.raiseFrequencyScale ?? 1, 0.72, 1.35);
  const continueViaCall = base.call >= base.check;
  const continueWeight = continueViaCall ? base.call : base.check;
  const movedToContinue = Math.min(base.fold, Math.max(0, continueDelta));
  const movedToFold = Math.min(continueWeight, Math.max(0, -continueDelta));
  const scaledRaise = base.raise * raiseScale;
  const movedRaiseToContinue = Math.max(0, base.raise - scaledRaise);
  return frequencies(
    scaledRaise,
    base.call + (continueViaCall ? movedToContinue - movedToFold + movedRaiseToContinue : 0),
    base.check + (!continueViaCall ? movedToContinue - movedToFold + movedRaiseToContinue : 0),
    base.fold - movedToContinue + movedToFold,
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
    // Bounds match buildOpponentAdaptation's raiseSizeScale range (0.9-1.15, plus up to
    // a 0.02 earned-tier bonus at each end): [0.88, 1.17]. Keep this in sync so preflop
    // sizing gets the same adaptation headroom as postflop instead of being truncated.
    const scale = difficultyScale * clamp(adjustment.raiseSizeScale ?? 1, 0.88, 1.17);
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
