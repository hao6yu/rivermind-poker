import type { AiDifficulty } from './aiProfiles.ts';
import { cardKey, createDeck, type RandomSource } from './cards.ts';
import type { TablePosition } from './multiway.ts';
import { describeOpponentRead, type OpponentMemory } from './opponentMemory.ts';
import { HAND_CLASS_KEYS, type PreflopArchetype } from './preflopRanges.ts';
import { buildPreflopPlan, classifyPreflopHand, preflopGridCards, type PreflopFacing } from './preflopStrategy.ts';
import type { Card, Rank } from './types.ts';

export const COMBO_COUNT = 1_326;
export const RANGE_FLOOR = 0.02;

const DECK: readonly Card[] = createDeck();

/** Every unordered two-card combination, indexed by deck position pairs (i < j). */
export const COMBOS: ReadonlyArray<readonly [Card, Card]> = (() => {
  const combos: Array<readonly [Card, Card]> = [];
  for (let first = 0; first < DECK.length; first += 1) {
    for (let second = first + 1; second < DECK.length; second += 1) combos.push([DECK[first]!, DECK[second]!]);
  }
  return combos;
})();

const COMBO_INDICES_BY_CLASS: ReadonlyMap<string, readonly number[]> = (() => {
  const map = new Map<string, number[]>();
  COMBOS.forEach((combo, index) => {
    const key = classifyPreflopHand(combo).key;
    const bucket = map.get(key) ?? [];
    bucket.push(index);
    map.set(key, bucket);
  });
  return map;
})();

const RANK_BY_LABEL: Record<string, Rank> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

function gridCardsForKey(key: string): readonly [Card, Card] {
  const high = RANK_BY_LABEL[key[0]!]!;
  const low = RANK_BY_LABEL[key[1]!]!;
  if (key.length === 2) return preflopGridCards(high, low);
  return key.endsWith('s') ? preflopGridCards(high, low) : preflopGridCards(low, high);
}

export interface ComboRange { weights: Float64Array; total: number }

export interface PublicPreflopAction {
  type: 'raise' | 'call' | 'check';
  facing: PreflopFacing;
  raiseCount: number;
  raiseSizeBb?: number;
  raiserPosition?: TablePosition;
  callersAfterRaise: number;
  limperCount: number;
  canCheck: boolean;
}

export interface RangeModelSpot { position: TablePosition; playerCount: number; effectiveStackBb: number }

export interface RangeModelProfile {
  archetype: PreflopArchetype;
  tier: AiDifficulty;
  rangeTightness?: number;
  /** Scales the never-zero floor; a bluff-heavy identity keeps more junk alive. */
  bluffAllowance: number;
  /** 0 = ignore postflop actions, 1 = full authored response probabilities. */
  narrowingStrength: number;
  memory?: OpponentMemory;
  memoryStrength: number;
}

export interface MemoryShifts {
  /** Multiplies edge-hand entry; 1 = neutral. */
  wide: number;
  /** Positive moves continue mass toward raising; negative toward calling. */
  aggression: number;
  /** Positive moves fold mass toward calling for marginal hands; negative the reverse. */
  stickiness: number;
}

const NEUTRAL_SHIFTS: MemoryShifts = { wide: 1, aggression: 0, stickiness: 0 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothedRate(successes: number, opportunities: number, prior: number, priorWeight: number): number {
  return (successes + prior * priorWeight) / Math.max(1, opportunities + priorWeight);
}

/**
 * Bounded shifts from the public memory read. These change which hands act, not
 * how much every hand acts: a uniform multiplier would vanish on normalization.
 */
export function memoryShifts(profile: RangeModelProfile): MemoryShifts {
  const memory = profile.memory;
  if (!memory || profile.memoryStrength <= 0) return NEUTRAL_SHIFTS;
  const read = describeOpponentRead(memory);
  const strength = clamp(profile.memoryStrength, 0, 1.3) * read.confidence;
  if (strength === 0) return NEUTRAL_SHIFTS;
  const callRate = smoothedRate(memory.callsFacingBet, memory.facedBetOpportunities, 0.42, 8);
  const shift = (rate: number, baseline: number) => clamp(((rate - baseline) / 0.25) * 0.5 * strength, -0.5, 0.5);
  return {
    wide: clamp(1 + shift(read.voluntaryPreflopRate, 0.42), 0.6, 1.6),
    aggression: clamp((shift(read.preflopRaiseRate, 0.22) + shift(read.postflopAggressionRate, 0.34)) / 2, -0.5, 0.5),
    stickiness: shift(callRate, 0.42),
  };
}

function finalize(weights: Float64Array): ComboRange {
  let total = 0;
  for (let index = 0; index < weights.length; index += 1) total += weights[index]!;
  return { weights, total };
}

export function uniformRange(blocked: readonly Card[]): ComboRange {
  const blockedKeys = new Set(blocked.map(cardKey));
  const weights = new Float64Array(COMBO_COUNT);
  COMBOS.forEach(([first, second], index) => {
    weights[index] = blockedKeys.has(cardKey(first)) || blockedKeys.has(cardKey(second)) ? 0 : 1;
  });
  return finalize(weights);
}

export function comboShare(range: ComboRange, predicate: (combo: readonly [Card, Card]) => boolean): number {
  if (range.total <= 0) return 0;
  let matched = 0;
  COMBOS.forEach((combo, index) => {
    if (predicate(combo)) matched += range.weights[index]!;
  });
  return matched / range.total;
}

/**
 * Multiplies every combo in a hand class by the authored frequency of the observed
 * preflop action for that class, resolved through the same plan builder the AI
 * uses for its own decisions. Memory moves mass between the raise and call legs
 * (aggression) and scales edge-hand entry (wide); continue mass per class is preserved.
 */
export function applyPreflopActions(
  range: ComboRange,
  actions: readonly PublicPreflopAction[],
  spot: RangeModelSpot,
  profile: RangeModelProfile,
): ComboRange {
  const weights = new Float64Array(range.weights);
  const floor = RANGE_FLOOR * clamp(profile.bluffAllowance, 0.25, 2);
  const shifts = memoryShifts(profile);
  for (const action of actions) {
    for (const key of HAND_CLASS_KEYS) {
      const plan = buildPreflopPlan({
        archetype: profile.archetype,
        canCheck: action.canCheck,
        cards: gridCardsForKey(key),
        callersAfterRaise: action.callersAfterRaise,
        effectiveStackBb: spot.effectiveStackBb,
        facing: action.facing,
        limperCount: action.limperCount,
        playerCount: spot.playerCount,
        position: spot.position,
        rangeTightness: profile.rangeTightness,
        raiseCount: action.raiseCount,
        raiseSizeBb: action.raiseSizeBb,
        raiserPosition: action.raiserPosition,
        strategyTier: profile.tier,
      });
      let raise = plan.frequencies.raise;
      let call = plan.frequencies.call;
      const check = plan.frequencies.check;
      if (shifts.aggression > 0) {
        const moved = call * shifts.aggression;
        raise += moved;
        call -= moved;
      } else if (shifts.aggression < 0) {
        const moved = raise * -shifts.aggression;
        raise -= moved;
        call += moved;
      }
      const continueMass = clamp(raise + call + check, 0, 1);
      const leg = action.type === 'raise' ? raise : action.type === 'call' ? call : check;
      // Edge hands (low continue mass) are what a loose or tight player changes;
      // premiums (continue mass near 1) are entered by everyone.
      const scaled = clamp(leg * Math.pow(shifts.wide, 1 - continueMass), 0, 1);
      const multiplier = Math.max(scaled, floor);
      for (const index of COMBO_INDICES_BY_CLASS.get(key) ?? []) weights[index] = weights[index]! * multiplier;
    }
  }
  return finalize(weights);
}
