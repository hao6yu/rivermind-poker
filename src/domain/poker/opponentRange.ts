import type { AiDifficulty } from './aiProfiles.ts';
import { cardKey, createDeck, type RandomSource } from './cards.ts';
import type { TablePosition } from './multiway.ts';
import { evaluateBest, type HandValue } from './evaluator.ts';
import type { FairHeadsUpDecisionState, FairMultiwayDecisionState } from './fairness.ts';
import { describeOpponentRead, type OpponentMemory } from './opponentMemory.ts';
import { drawLabelOnBoard } from './postflopStrategy.ts';
import { HAND_CLASS_KEYS, type PreflopArchetype } from './preflopRanges.ts';
import {
  buildPreflopPlan,
  classifyPreflopHand,
  preflopFacingFromPublicAction,
  preflopGridCards,
  type PreflopFacing,
} from './preflopStrategy.ts';
import type { Card, PlayerId, Rank } from './types.ts';

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
      // Mass moves between the raise and call legs in proportion to the smaller leg, so a
      // premium that mostly raises loses relatively more call mass (an aggressive player
      // rarely just calls with it) while a hand that only ever calls keeps its call leg.
      const mobile = Math.min(raise, call);
      if (shifts.aggression > 0) {
        const moved = mobile * shifts.aggression;
        raise += moved;
        call -= moved;
      } else if (shifts.aggression < 0) {
        const moved = mobile * -shifts.aggression;
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

export type ComboClass =
  | 'premium' | 'strong' | 'topPair' | 'weakPair' | 'pairPlusDraw'
  | 'draw' | 'weakDraw' | 'boardPlays' | 'air';
export type SizeBucket = 'small' | 'large' | 'overbet';

export interface FacingBetRow { fold: number; call: number; raise: number }
export interface CheckedToRow { betSmall: number; betLarge: number; check: number }
export interface ResponseTable {
  facing: Record<ComboClass, Record<SizeBucket, FacingBetRow>>;
  checkedTo: Record<ComboClass, CheckedToRow>;
}

export interface PublicPostflopAction {
  board: readonly Card[];
  type: 'raise' | 'call' | 'check';
  sizeBucket: SizeBucket;
  /** True when the action answered a live bet (call, or raise over a bet). */
  facingBet: boolean;
}

export function sizeBucketFor(betFraction: number): SizeBucket {
  if (betFraction <= 0.5) return 'small';
  if (betFraction <= 1) return 'large';
  return 'overbet';
}

const row = (fold: number, call: number, raise: number): FacingBetRow => ({ fold, call, raise });

/** Authored response probabilities. Rows sum to 1. Initial values; a tuning knob. */
export const BASE_RESPONSE_TABLE: ResponseTable = {
  facing: {
    premium: { small: row(0.02, 0.58, 0.40), large: row(0.03, 0.67, 0.30), overbet: row(0.04, 0.66, 0.30) },
    strong: { small: row(0.06, 0.72, 0.22), large: row(0.12, 0.73, 0.15), overbet: row(0.18, 0.70, 0.12) },
    topPair: { small: row(0.18, 0.70, 0.12), large: row(0.32, 0.60, 0.08), overbet: row(0.48, 0.48, 0.04) },
    weakPair: { small: row(0.42, 0.54, 0.04), large: row(0.64, 0.34, 0.02), overbet: row(0.80, 0.19, 0.01) },
    pairPlusDraw: { small: row(0.08, 0.62, 0.30), large: row(0.15, 0.62, 0.23), overbet: row(0.25, 0.60, 0.15) },
    draw: { small: row(0.20, 0.62, 0.18), large: row(0.35, 0.52, 0.13), overbet: row(0.50, 0.42, 0.08) },
    weakDraw: { small: row(0.55, 0.40, 0.05), large: row(0.75, 0.22, 0.03), overbet: row(0.88, 0.11, 0.01) },
    boardPlays: { small: row(0.50, 0.47, 0.03), large: row(0.70, 0.28, 0.02), overbet: row(0.85, 0.14, 0.01) },
    air: { small: row(0.88, 0.08, 0.04), large: row(0.94, 0.04, 0.02), overbet: row(0.97, 0.02, 0.01) },
  },
  checkedTo: {
    premium: { betSmall: 0.45, betLarge: 0.35, check: 0.20 },
    strong: { betSmall: 0.40, betLarge: 0.25, check: 0.35 },
    topPair: { betSmall: 0.38, betLarge: 0.12, check: 0.50 },
    weakPair: { betSmall: 0.22, betLarge: 0.03, check: 0.75 },
    pairPlusDraw: { betSmall: 0.38, betLarge: 0.22, check: 0.40 },
    draw: { betSmall: 0.30, betLarge: 0.20, check: 0.50 },
    weakDraw: { betSmall: 0.22, betLarge: 0.08, check: 0.70 },
    boardPlays: { betSmall: 0.12, betLarge: 0.03, check: 0.85 },
    air: { betSmall: 0.10, betLarge: 0.05, check: 0.85 },
  },
};

const MARGINAL_CLASSES: readonly ComboClass[] = ['topPair', 'weakPair', 'pairPlusDraw', 'draw', 'weakDraw', 'boardPlays'];
const AGGRESSION_CLASSES: readonly ComboClass[] = ['strong', ...MARGINAL_CLASSES];
const ALL_CLASSES: readonly ComboClass[] = ['premium', 'strong', 'topPair', 'weakPair', 'pairPlusDraw', 'draw', 'weakDraw', 'boardPlays', 'air'];
const BUCKETS: readonly SizeBucket[] = ['small', 'large', 'overbet'];

const CLASS_STRENGTH: Record<ComboClass, number> = {
  premium: 0.9, strong: 0.7, topPair: 0.5, pairPlusDraw: 0.45, weakPair: 0.3, draw: 0.35, weakDraw: 0.2, boardPlays: 0.15, air: 0.05,
};

/**
 * The authored rows with the memory shifts applied. Stickiness moves fold mass into
 * call mass for marginal classes; aggression moves call mass into raise mass and check
 * mass into small bets for strong and marginal classes. One table feeds both narrowing
 * and fold prediction so they can never disagree.
 */
export function responseTable(profile: RangeModelProfile): ResponseTable {
  const shifts = memoryShifts(profile);
  if (shifts.stickiness === 0 && shifts.aggression === 0) return BASE_RESPONSE_TABLE;
  const facing = {} as ResponseTable['facing'];
  const checkedTo = {} as ResponseTable['checkedTo'];
  for (const cls of ALL_CLASSES) {
    facing[cls] = {} as Record<SizeBucket, FacingBetRow>;
    for (const bucket of BUCKETS) {
      let { fold, call, raise } = BASE_RESPONSE_TABLE.facing[cls][bucket];
      if (MARGINAL_CLASSES.includes(cls)) {
        if (shifts.stickiness > 0) { const moved = fold * shifts.stickiness; fold -= moved; call += moved; }
        else if (shifts.stickiness < 0) { const moved = call * -shifts.stickiness; call -= moved; fold += moved; }
      }
      if (AGGRESSION_CLASSES.includes(cls)) {
        if (shifts.aggression > 0) { const moved = call * shifts.aggression * 0.5; call -= moved; raise += moved; }
        else if (shifts.aggression < 0) { const moved = raise * -shifts.aggression * 0.5; raise -= moved; call += moved; }
      }
      facing[cls][bucket] = { fold, call, raise };
    }
    let { betSmall, betLarge, check } = BASE_RESPONSE_TABLE.checkedTo[cls];
    if (AGGRESSION_CLASSES.includes(cls)) {
      if (shifts.aggression > 0) { const moved = check * shifts.aggression * 0.4; check -= moved; betSmall += moved; }
      else if (shifts.aggression < 0) { const moved = betSmall * -shifts.aggression * 0.4; betSmall -= moved; check += moved; }
    }
    checkedTo[cls] = { betSmall, betLarge, check };
  }
  return { facing, checkedTo };
}

function boardMadeValue(board: readonly Card[]): HandValue {
  if (board.length >= 5) return evaluateBest(board);
  const counts = new Map<number, number>();
  for (const card of board) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort(([rankA, countA], [rankB, countB]) => countB - countA || rankB - rankA);
  const ranks = board.map((card) => card.rank).sort((a, b) => b - a);
  if (groups[0]?.[1] === 4) return { category: 7, kickers: [groups[0][0]], name: 'Four of a kind' };
  if (groups[0]?.[1] === 3) return { category: 3, kickers: [groups[0][0]], name: 'Three of a kind' };
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    return { category: 2, kickers: [groups[0][0], groups[1][0]].sort((a, b) => b - a), name: 'Two pair' };
  }
  if (groups[0]?.[1] === 2) return { category: 1, kickers: [groups[0][0]], name: 'One pair' };
  return { category: 0, kickers: ranks, name: 'High card' };
}

export function classifyCombo(combo: readonly [Card, Card], board: readonly Card[]): ComboClass {
  const value = evaluateBest([combo[0], combo[1], ...board]);
  const boardValue = boardMadeValue(board);
  // The board already makes a hand and the combo does not raise its category: a kicker on a
  // paired board, or any hand on a board that is itself two pair, a straight, or a flush.
  if (boardValue.category >= 1 && value.category <= boardValue.category) return 'boardPlays';
  const drawLabel = board.length < 5 ? drawLabelOnBoard(combo, board) : null;
  const strongDraw = drawLabel !== null && (drawLabel.includes('flush') || drawLabel.includes('open-ended'));
  if (value.category >= 4) return 'premium';
  if (value.category === 2 || value.category === 3) return 'strong';
  if (value.category === 1) {
    const pairRank = value.kickers[0] ?? 0;
    const boardHigh = Math.max(...board.map((card) => card.rank));
    const pocketPair = combo[0].rank === combo[1].rank;
    if (pocketPair && pairRank > boardHigh) return 'strong';
    if (strongDraw) return 'pairPlusDraw';
    return pairRank === boardHigh ? 'topPair' : 'weakPair';
  }
  if (strongDraw) return 'draw';
  if (drawLabel) return 'weakDraw';
  return 'air';
}

function boardKey(board: readonly Card[]): string {
  return board.map(cardKey).join('|');
}

/** Caches classification per board so every range in one decision pays the evaluator once. */
export class BoardClassifier {
  private readonly cache = new Map<string, ComboClass[]>();

  classifyAll(board: readonly Card[]): readonly ComboClass[] {
    const key = boardKey(board);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const boardKeys = new Set(board.map(cardKey));
    const classes = COMBOS.map((combo) => (
      boardKeys.has(cardKey(combo[0])) || boardKeys.has(cardKey(combo[1])) ? 'air' : classifyCombo(combo, board)
    ));
    this.cache.set(key, classes);
    return classes;
  }
}

export function createBoardClassifier(): BoardClassifier {
  return new BoardClassifier();
}

function responseProbability(table: ResponseTable, cls: ComboClass, action: PublicPostflopAction): number {
  if (action.facingBet) {
    const facing = table.facing[cls][action.sizeBucket];
    return action.type === 'call' ? facing.call : action.type === 'raise' ? facing.raise : facing.fold;
  }
  const checked = table.checkedTo[cls];
  if (action.type === 'raise') return action.sizeBucket === 'small' ? checked.betSmall : checked.betLarge;
  return checked.check;
}

export function applyPostflopActions(
  range: ComboRange,
  actions: readonly PublicPostflopAction[],
  profile: RangeModelProfile,
  classifier: BoardClassifier,
): ComboRange {
  const strength = clamp(profile.narrowingStrength, 0, 1);
  if (strength === 0 || actions.length === 0) return range;
  const table = responseTable(profile);
  const weights = new Float64Array(range.weights);
  const floor = RANGE_FLOOR * clamp(profile.bluffAllowance, 0.25, 2);
  for (const action of actions) {
    if (action.board.length < 3) continue;
    const classes = classifier.classifyAll(action.board);
    for (let index = 0; index < COMBO_COUNT; index += 1) {
      if (weights[index] === 0) continue;
      const probability = responseProbability(table, classes[index]!, action);
      const interpolated = 1 - strength * (1 - probability);
      weights[index] = weights[index]! * Math.max(interpolated, floor);
    }
  }
  return finalize(weights);
}

/** Weighted share of the range that folds to a bet of this size on this board. */
export function foldShare(
  range: ComboRange,
  board: readonly Card[],
  bucket: SizeBucket,
  table: ResponseTable,
  classifier: BoardClassifier,
): number {
  if (range.total <= 0 || board.length < 3) return 0;
  const classes = classifier.classifyAll(board);
  let folded = 0;
  for (let index = 0; index < COMBO_COUNT; index += 1) {
    const weight = range.weights[index]!;
    if (weight > 0) folded += weight * table.facing[classes[index]!][bucket].fold;
  }
  return folded / range.total;
}

/** The part of the range that calls or raises a bet of this size; equity against it is equity when called. */
export function continuingRange(
  range: ComboRange,
  board: readonly Card[],
  bucket: SizeBucket,
  table: ResponseTable,
  classifier: BoardClassifier,
): ComboRange {
  const weights = new Float64Array(range.weights);
  if (board.length >= 3) {
    const classes = classifier.classifyAll(board);
    for (let index = 0; index < COMBO_COUNT; index += 1) {
      if (weights[index] === 0) continue;
      const facing = table.facing[classes[index]!][bucket];
      weights[index] = weights[index]! * (facing.call + facing.raise);
    }
  }
  return finalize(weights);
}

/** Share of premium and strong combos; the capped-range signal. */
export function strongShare(range: ComboRange, board: readonly Card[], classifier: BoardClassifier): number {
  if (range.total <= 0 || board.length < 3) return 0;
  const classes = classifier.classifyAll(board);
  let strong = 0;
  for (let index = 0; index < COMBO_COUNT; index += 1) {
    const cls = classes[index]!;
    if (cls === 'premium' || cls === 'strong') strong += range.weights[index]!;
  }
  return strong / range.total;
}

export function rangeStrength(range: ComboRange, board: readonly Card[], classifier: BoardClassifier): number {
  if (range.total <= 0 || board.length < 3) return 0.2;
  const classes = classifier.classifyAll(board);
  let strength = 0;
  for (let index = 0; index < COMBO_COUNT; index += 1) strength += range.weights[index]! * CLASS_STRENGTH[classes[index]!];
  return strength / range.total;
}

export interface RangeSampler {
  sample(excluded: ReadonlySet<string>, random: RandomSource): readonly [Card, Card];
}

/** Cumulative-weight sampler with rejection of combos that collide with excluded cards. */
export function createRangeSampler(range: ComboRange): RangeSampler {
  const cumulative = new Float64Array(COMBO_COUNT);
  let running = 0;
  for (let index = 0; index < COMBO_COUNT; index += 1) {
    running += range.weights[index]!;
    cumulative[index] = running;
  }
  const total = running;
  const live = (index: number, excluded: ReadonlySet<string>): boolean => {
    const combo = COMBOS[index]!;
    return range.weights[index]! > 0 && !excluded.has(cardKey(combo[0])) && !excluded.has(cardKey(combo[1]));
  };
  const draw = (random: RandomSource): number => {
    const target = random() * total;
    let low = 0;
    let high = COMBO_COUNT - 1;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (cumulative[mid]! < target) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  return {
    sample(excluded, random) {
      if (total <= 0) throw new Error('Cannot sample from an empty range.');
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const index = draw(random);
        if (live(index, excluded)) return COMBOS[index]!;
      }
      const start = draw(random);
      for (let offset = 0; offset < COMBO_COUNT; offset += 1) {
        const index = (start + offset) % COMBO_COUNT;
        if (live(index, excluded)) return COMBOS[index]!;
      }
      throw new Error('No live combo remains after excluding known cards.');
    },
  };
}

export interface RangeSpotActions {
  spot: RangeModelSpot;
  preflop: PublicPreflopAction[];
  postflop: PublicPostflopAction[];
}

export function rangeSpotFromHeadsUp(state: FairHeadsUpDecisionState, opponentId: PlayerId): RangeSpotActions {
  const opponent = state.players[opponentId];
  const other = state.players[opponentId === 'hero' ? 'villain' : 'hero'];
  const position: TablePosition = state.button === opponentId ? 'BTN/SB' : 'BB';
  const preflop: PublicPreflopAction[] = [];
  const postflop: PublicPostflopAction[] = [];
  let effectiveStackBb = Math.min(opponent.stack + opponent.totalCommitted, other.stack + other.totalCommitted) / state.bigBlind;
  state.history.forEach((record, index) => {
    if (record.player !== opponentId || record.type === 'fold' || record.street === 'complete') return;
    const context = record.decisionContext;
    if (preflop.length + postflop.length === 0) {
      effectiveStackBb = Math.min(
        context.playerStackBefore + context.playerStreetBetBefore,
        context.opponentStackBefore + context.opponentStreetBetBefore,
      ) / state.bigBlind;
    }
    if (record.street === 'preflop') {
      const prefix = state.history.slice(0, index);
      const raisesBefore = prefix.filter((entry) => entry.street === 'preflop' && entry.type === 'raise');
      const lastRaiser = raisesBefore.at(-1)?.player;
      preflop.push({
        type: record.type,
        facing: preflopFacingFromPublicAction(context.currentBet, state.bigBlind, prefix),
        raiseCount: raisesBefore.length,
        raiseSizeBb: context.currentBet > state.bigBlind ? context.currentBet / state.bigBlind : undefined,
        raiserPosition: lastRaiser === undefined ? undefined : state.button === lastRaiser ? 'BTN/SB' : 'BB',
        callersAfterRaise: 0,
        limperCount: prefix.filter((entry) => entry.street === 'preflop' && entry.type === 'call').length,
        canCheck: context.legalActions.canCheck,
      });
      return;
    }
    const potBefore = Math.max(1, context.potBefore);
    const fraction = record.type === 'raise' ? (record.amount - context.currentBet) / potBefore : context.toCall / potBefore;
    postflop.push({
      board: context.board,
      type: record.type,
      sizeBucket: record.type === 'raise' && context.currentBet > 0 && fraction <= 1 ? 'large' : sizeBucketFor(fraction),
      facingBet: context.toCall > 0,
    });
  });
  return { spot: { position, playerCount: 2, effectiveStackBb }, preflop, postflop };
}

export function buildOpponentRange(
  line: RangeSpotActions,
  viewerCards: readonly Card[],
  board: readonly Card[],
  profile: RangeModelProfile,
  classifier: BoardClassifier,
): ComboRange {
  const prior = uniformRange([...viewerCards, ...board]);
  const preflop = applyPreflopActions(prior, line.preflop, line.spot, profile);
  return applyPostflopActions(preflop, line.postflop, profile, classifier);
}

export function rangeSpotFromMultiway(state: FairMultiwayDecisionState, opponentId: string): RangeSpotActions {
  const opponent = state.players[opponentId];
  if (!opponent) throw new Error(`Player ${opponentId} is missing from the hand state.`);
  const position: TablePosition = opponent.position ?? 'BB';
  const preflop: PublicPreflopAction[] = [];
  const postflop: PublicPostflopAction[] = [];
  let effectiveStackBb = (opponent.stack + opponent.totalCommitted) / state.bigBlind;
  let playerCount = state.activePlayerIds.length;
  state.history.forEach((record) => {
    if (record.playerId !== opponentId || record.type === 'fold' || record.street === 'complete') return;
    const context = record.decisionContext;
    // Hands persisted before decision contexts existed carry no public spot; skip them.
    if (!context) return;
    if (preflop.length + postflop.length === 0) {
      effectiveStackBb = context.effectiveStack / state.bigBlind;
      playerCount = context.playerCount;
    }
    if (record.street === 'preflop') {
      preflop.push({
        type: record.type,
        facing: context.preflopFacing,
        raiseCount: context.preflopRaiseCount ?? (context.preflopFacing === 'raised' ? 1 : 0),
        raiseSizeBb: context.preflopFacing === 'raised' ? context.currentBet / state.bigBlind : undefined,
        raiserPosition: context.preflopRaiserPosition,
        callersAfterRaise: context.preflopCallersAfterRaise ?? 0,
        limperCount: context.limperCount,
        canCheck: context.legalActions.canCheck,
      });
      return;
    }
    const potBefore = Math.max(1, context.potBefore);
    const fraction = record.type === 'raise' ? (record.amount - context.currentBet) / potBefore : context.toCall / potBefore;
    postflop.push({
      board: context.board,
      type: record.type,
      sizeBucket: record.type === 'raise' && context.currentBet > 0 && fraction <= 1 ? 'large' : sizeBucketFor(fraction),
      facingBet: context.toCall > 0,
    });
  });
  return { spot: { position, playerCount, effectiveStackBb }, preflop, postflop };
}
