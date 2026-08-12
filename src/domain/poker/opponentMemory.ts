import type { MultiwayHandState, TablePosition } from './multiway.ts';
import type { ActionType, GameState, Street } from './types.ts';

export const OPPONENT_MEMORY_VERSION = 1 as const;

export type PositionBucket = 'early' | 'middle' | 'late' | 'blind';

export interface PositionTendency {
  hands: number;
  voluntaryPreflopHands: number;
}

export interface OpponentMemory {
  version: typeof OPPONENT_MEMORY_VERSION;
  handsObserved: number;
  actionsObserved: number;
  preflopOpportunities: number;
  voluntaryPreflopHands: number;
  preflopRaises: number;
  facedBetOpportunities: number;
  foldsFacingBet: number;
  callsFacingBet: number;
  raisesFacingBet: number;
  postflopAggressiveActions: number;
  postflopPassiveActions: number;
  positions: Record<PositionBucket, PositionTendency>;
  lastUpdatedAt: string | null;
}

export interface PublicHeroAction {
  facingBet: boolean;
  street: Exclude<Street, 'complete'>;
  type: ActionType;
}

export interface HeroHandObservation {
  actions: PublicHeroAction[];
  position: PositionBucket;
}

export interface OpponentRead {
  confidence: number;
  confidenceLabel: 'Learning' | 'Early read' | 'Developing read' | 'Established read';
  confidenceTier: OpponentReadConfidenceTier;
  detail: string;
  foldToPressureRate: number;
  pattern: OpponentReadPattern;
  postflopAggressionRate: number;
  preflopRaiseRate: number;
  title: string;
  voluntaryPreflopRate: number;
}

export type OpponentReadConfidenceTier = 'learning' | 'early' | 'developing' | 'established';

export type OpponentReadPattern =
  | 'learning'
  | 'folds-under-pressure'
  | 'calls-pressure'
  | 'aggressive-entry'
  | 'position-aware'
  | 'wide-range'
  | 'selective-range'
  | 'postflop-pressure'
  | 'balanced';

export interface OpponentAdaptation {
  bluffFrequencyScale: number;
  callToleranceDelta: number;
  confidence: number;
  pressureFrequencyScale: number;
  raiseSizeScale: number;
  valueFrequencyScale: number;
  valueThresholdDelta: number;
}

const positionBuckets: readonly PositionBucket[] = ['early', 'middle', 'late', 'blind'];

function emptyPositionTendencies(): Record<PositionBucket, PositionTendency> {
  return {
    early: { hands: 0, voluntaryPreflopHands: 0 },
    middle: { hands: 0, voluntaryPreflopHands: 0 },
    late: { hands: 0, voluntaryPreflopHands: 0 },
    blind: { hands: 0, voluntaryPreflopHands: 0 },
  };
}

export function createEmptyOpponentMemory(): OpponentMemory {
  return {
    version: OPPONENT_MEMORY_VERSION,
    handsObserved: 0,
    actionsObserved: 0,
    preflopOpportunities: 0,
    voluntaryPreflopHands: 0,
    preflopRaises: 0,
    facedBetOpportunities: 0,
    foldsFacingBet: 0,
    callsFacingBet: 0,
    raisesFacingBet: 0,
    postflopAggressiveActions: 0,
    postflopPassiveActions: 0,
    positions: emptyPositionTendencies(),
    lastUpdatedAt: null,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothedRate(successes: number, opportunities: number, priorRate: number, priorWeight: number): number {
  return (successes + priorRate * priorWeight) / Math.max(1, opportunities + priorWeight);
}

export function positionBucketForTablePosition(position: TablePosition | undefined): PositionBucket {
  switch (position) {
    case 'BTN':
    case 'BTN/SB':
    case 'CO':
      return 'late';
    case 'HJ':
      return 'middle';
    case 'UTG':
      return 'early';
    case 'SB':
    case 'BB':
    default:
      return 'blind';
  }
}

function hasPriorStreetRaise(
  history: readonly { playerId?: string; player?: string; street: Street; type: ActionType }[],
  index: number,
  street: Street,
): boolean {
  return history.slice(0, index).some((action) => action.street === street && action.type === 'raise');
}

function boundedTendencyMemory(memory: OpponentMemory): OpponentMemory {
  const effectiveHandLimit = 80;
  if (memory.preflopOpportunities < effectiveHandLimit) return memory;
  const factor = (effectiveHandLimit - 1) / memory.preflopOpportunities;
  const scaledPositions = Object.fromEntries(positionBuckets.map((bucket) => [
    bucket,
    {
      hands: memory.positions[bucket].hands * factor,
      voluntaryPreflopHands: memory.positions[bucket].voluntaryPreflopHands * factor,
    },
  ])) as Record<PositionBucket, PositionTendency>;
  return {
    ...memory,
    preflopOpportunities: memory.preflopOpportunities * factor,
    voluntaryPreflopHands: memory.voluntaryPreflopHands * factor,
    preflopRaises: memory.preflopRaises * factor,
    facedBetOpportunities: memory.facedBetOpportunities * factor,
    foldsFacingBet: memory.foldsFacingBet * factor,
    callsFacingBet: memory.callsFacingBet * factor,
    raisesFacingBet: memory.raisesFacingBet * factor,
    postflopAggressiveActions: memory.postflopAggressiveActions * factor,
    postflopPassiveActions: memory.postflopPassiveActions * factor,
    positions: scaledPositions,
  };
}

/** Builds a deliberately card-free observation from a completed heads-up hand. */
export function observePublicHeadsUpHand(state: GameState): HeroHandObservation {
  const actions = state.history.flatMap((action, index): PublicHeroAction[] => {
    if (action.player !== 'hero' || action.street === 'complete') return [];
    return [{
      // Mirrors observePublicMultiwayHand. Preflop, `toCall` alone is not
      // enough: state.currentBet starts at the big blind, so the button — who
      // acts first on every heads-up hand — owes chips before anyone has
      // voluntarily wagered. An open-fold, open-raise or limp is not a response
      // to pressure. The heads-up DecisionContext carries no `preflopFacing`,
      // so derive the same signal from the public history. Postflop, currentBet
      // resets to 0 each street, so toCall > 0 already means a live bet.
      facingBet: action.street === 'preflop'
        ? hasPriorStreetRaise(state.history, index, 'preflop')
        : action.decisionContext.toCall > 0,
      street: action.street,
      type: action.type,
    }];
  });
  return {
    actions,
    position: state.button === 'hero' ? 'late' : 'blind',
  };
}

/** Builds a deliberately card-free observation from a completed multiway hand. */
export function observePublicMultiwayHand(state: MultiwayHandState): HeroHandObservation {
  const actions = state.history.flatMap((action, index): PublicHeroAction[] => {
    if (action.playerId !== 'hero' || action.street === 'complete') return [];
    return [{
      // decisionContext is always populated by applyMultiwayAction; the fallback below
      // only covers persisted hands recorded before that context existed.
      //
      // Preflop, `toCall` alone is not enough: state.currentBet starts at the big
      // blind, so every first-to-act player owes chips before anyone has voluntarily
      // wagered. `preflopFacing` distinguishes a genuine raise from the forced blind
      // (an 'unopened' or 'limped' pot is not pressure, even though toCall > 0), so
      // use it preflop. Postflop, currentBet resets to 0 each street, so toCall > 0
      // already means a real bet is live.
      facingBet: action.decisionContext
        ? action.street === 'preflop'
          ? action.decisionContext.preflopFacing === 'raised'
          : action.decisionContext.toCall > 0
        // Context-free persisted hands: a raise earlier on the same street is the
        // only public evidence of a live bet, and it agrees with the branch above
        // on every reachable state. The previous heuristic guessed per action type
        // instead, which dropped every genuine fold to a bet and counted first-in
        // limps as calls facing one.
        : hasPriorStreetRaise(state.history, index, action.street),
      street: action.street,
      type: action.type,
    }];
  });
  return {
    actions,
    position: positionBucketForTablePosition(state.players.hero?.position),
  };
}

export function applyOpponentObservation(
  memory: OpponentMemory,
  observation: HeroHandObservation,
  updatedAt = new Date().toISOString(),
): OpponentMemory {
  const tendency = boundedTendencyMemory(memory);
  const preflopActions = observation.actions.filter((action) => action.street === 'preflop');
  const voluntaryPreflop = preflopActions.some((action) => action.type === 'call' || action.type === 'raise');
  const preflopRaise = preflopActions.some((action) => action.type === 'raise');
  const facedActions = observation.actions.filter((action) => action.facingBet);
  const foldsFacingBet = facedActions.filter((action) => action.type === 'fold').length;
  const callsFacingBet = facedActions.filter((action) => action.type === 'call').length;
  const raisesFacingBet = facedActions.filter((action) => action.type === 'raise').length;
  const postflopActions = observation.actions.filter((action) => action.street !== 'preflop');
  const postflopAggressiveActions = postflopActions.filter((action) => action.type === 'raise').length;
  const postflopPassiveActions = postflopActions.filter(
    (action) => action.type === 'call' || action.type === 'check',
  ).length;
  const currentPosition = tendency.positions[observation.position];

  return {
    ...tendency,
    version: OPPONENT_MEMORY_VERSION,
    handsObserved: memory.handsObserved + 1,
    actionsObserved: memory.actionsObserved + observation.actions.length,
    preflopOpportunities: tendency.preflopOpportunities + 1,
    voluntaryPreflopHands: tendency.voluntaryPreflopHands + Number(voluntaryPreflop),
    preflopRaises: tendency.preflopRaises + Number(preflopRaise),
    facedBetOpportunities: tendency.facedBetOpportunities + facedActions.length,
    foldsFacingBet: tendency.foldsFacingBet + foldsFacingBet,
    callsFacingBet: tendency.callsFacingBet + callsFacingBet,
    raisesFacingBet: tendency.raisesFacingBet + raisesFacingBet,
    postflopAggressiveActions: tendency.postflopAggressiveActions + postflopAggressiveActions,
    postflopPassiveActions: tendency.postflopPassiveActions + postflopPassiveActions,
    positions: {
      ...tendency.positions,
      [observation.position]: {
        hands: currentPosition.hands + 1,
        voluntaryPreflopHands: currentPosition.voluntaryPreflopHands + Number(voluntaryPreflop),
      },
    },
    lastUpdatedAt: updatedAt,
  };
}

export function describeOpponentRead(memory: OpponentMemory): OpponentRead {
  const voluntaryPreflopRate = smoothedRate(
    memory.voluntaryPreflopHands,
    memory.preflopOpportunities,
    0.42,
    8,
  );
  const preflopRaiseRate = smoothedRate(memory.preflopRaises, memory.preflopOpportunities, 0.22, 9);
  const foldToPressureRate = smoothedRate(memory.foldsFacingBet, memory.facedBetOpportunities, 0.4, 8);
  const callFacingRate = smoothedRate(memory.callsFacingBet, memory.facedBetOpportunities, 0.42, 8);
  const postflopActionCount = memory.postflopAggressiveActions + memory.postflopPassiveActions;
  const postflopAggressionRate = smoothedRate(
    memory.postflopAggressiveActions,
    postflopActionCount,
    0.34,
    7,
  );
  const latePosition = memory.positions.late;
  const outOfPositionHands = memory.positions.early.hands
    + memory.positions.middle.hands
    + memory.positions.blind.hands;
  const outOfPositionVoluntary = memory.positions.early.voluntaryPreflopHands
    + memory.positions.middle.voluntaryPreflopHands
    + memory.positions.blind.voluntaryPreflopHands;
  const lateVoluntaryRate = smoothedRate(
    latePosition.voluntaryPreflopHands,
    latePosition.hands,
    0.46,
    5,
  );
  const outOfPositionVoluntaryRate = smoothedRate(outOfPositionVoluntary, outOfPositionHands, 0.38, 5);
  const confidence = clamp(memory.handsObserved / 20, 0, 1);
  const confidenceTier: OpponentReadConfidenceTier = memory.handsObserved < 3
    ? 'learning'
    : memory.handsObserved < 8
      ? 'early'
      : memory.handsObserved < 16
        ? 'developing'
        : 'established';
  const confidenceLabels: Record<OpponentReadConfidenceTier, OpponentRead['confidenceLabel']> = {
    learning: 'Learning',
    early: 'Early read',
    developing: 'Developing read',
    established: 'Established read',
  };
  const confidenceLabel = confidenceLabels[confidenceTier];

  let title = 'Still learning your game';
  let pattern: OpponentReadPattern = 'learning';
  let detail = memory.handsObserved === 0
    ? 'Play a few hands and RiverMind opponents will begin forming a cautious read from your visible choices.'
    : `The table has only ${memory.handsObserved} hand${memory.handsObserved === 1 ? '' : 's'} of public actions, so its adjustments remain very small.`;

  if (memory.handsObserved >= 3) {
    if (memory.facedBetOpportunities >= 3 && foldToPressureRate >= 0.55) {
      pattern = 'folds-under-pressure';
      title = 'Folds under pressure';
      detail = 'Opponents have seen you release several hands when facing a bet and may apply slightly more selective pressure.';
    } else if (memory.facedBetOpportunities >= 3 && callFacingRate >= 0.52) {
      pattern = 'calls-pressure';
      title = 'Calls pressure often';
      detail = 'Opponents expect you to continue more often, so they trim bluffs and value-bet a little more directly.';
    } else if (preflopRaiseRate >= 0.33 && voluntaryPreflopRate >= 0.48) {
      pattern = 'aggressive-entry';
      title = 'Enters pots aggressively';
      detail = 'Your public preflop raises suggest a wider pressure range, so opponents defend a little more carefully.';
    } else if (latePosition.hands >= 3
      && outOfPositionHands >= 3
      && lateVoluntaryRate - outOfPositionVoluntaryRate >= 0.18) {
      pattern = 'position-aware';
      title = 'Opens up in position';
      detail = 'You enter more pots near the button than from earlier seats, so opponents give your late-position range slightly less credit.';
    } else if (voluntaryPreflopRate >= 0.59) {
      pattern = 'wide-range';
      title = 'Plays many starting hands';
      detail = 'You enter more pots than the baseline, so opponents give your range slightly less automatic credit.';
    } else if (voluntaryPreflopRate <= 0.31) {
      pattern = 'selective-range';
      title = 'Waits for stronger hands';
      detail = 'Your selective preflop choices earn more respect when you enter a pot or raise.';
    } else if (postflopActionCount >= 4 && postflopAggressionRate >= 0.54) {
      pattern = 'postflop-pressure';
      title = 'Applies postflop pressure';
      detail = 'Your bets and raises show initiative after the flop, so opponents make slightly wider bluff-catching decisions.';
    } else {
      pattern = 'balanced';
      title = 'Showing a balanced pattern';
      detail = 'No single public tendency dominates yet. Opponents stay close to their normal style while gathering more evidence.';
    }
  }

  return {
    confidence,
    confidenceLabel,
    confidenceTier,
    detail,
    foldToPressureRate,
    pattern,
    postflopAggressionRate,
    preflopRaiseRate,
    title,
    voluntaryPreflopRate,
  };
}

export function buildOpponentAdaptation(
  memory: OpponentMemory,
  learningStrength = 1,
  currentPosition?: PositionBucket,
): OpponentAdaptation {
  const read = describeOpponentRead(memory);
  const boundedLearningStrength = clamp(learningStrength, 0, 1.3);
  const strength = boundedLearningStrength * read.confidence;
  const earnedTierScale = clamp((boundedLearningStrength - 1) / 0.3, 0, 1);
  const callFacingRate = smoothedRate(memory.callsFacingBet, memory.facedBetOpportunities, 0.42, 8);
  const pressureSignal = clamp((read.foldToPressureRate - 0.4) / 0.25, -1, 1);
  const stickySignal = clamp((callFacingRate - 0.42) / 0.25, -1, 1);
  const positionTendency = currentPosition ? memory.positions[currentPosition] : null;
  const positionVoluntaryRate = positionTendency
    ? smoothedRate(positionTendency.voluntaryPreflopHands, positionTendency.hands, 0.42, 6)
    : read.voluntaryPreflopRate;
  const positionRangeSignal = clamp((positionVoluntaryRate - read.voluntaryPreflopRate) / 0.25, -1, 1);
  const aggressionSignal = clamp(
    (read.preflopRaiseRate + read.postflopAggressionRate - 0.56) / 0.35 + positionRangeSignal * 0.45,
    -1,
    1,
  );

  if (strength === 0) {
    return {
      bluffFrequencyScale: 1,
      callToleranceDelta: 0,
      confidence: read.confidence,
      pressureFrequencyScale: 1,
      raiseSizeScale: 1,
      valueFrequencyScale: 1,
      valueThresholdDelta: 0,
    };
  }

  return {
    // Coefficients below are scaled up from the original (0.14, 0.1, 0.12, 0.05, 0.08,
    // 0.035, 0.018) so the widened clamp bounds are actually reachable at high
    // confidence/strength instead of the clamp being permanently slack. Shapes and
    // signal directions are unchanged from the original formulas.
    bluffFrequencyScale: clamp(
      1 + pressureSignal * 0.28 * strength - stickySignal * 0.2 * strength,
      0.6 - earnedTierScale * 0.04,
      1.6 + earnedTierScale * 0.04,
    ),
    callToleranceDelta: clamp(
      aggressionSignal * 0.07 * strength,
      -0.09 - earnedTierScale * 0.01,
      0.09 + earnedTierScale * 0.01,
    ),
    confidence: read.confidence,
    pressureFrequencyScale: clamp(
      1 + pressureSignal * 0.35 * strength,
      0.7 - earnedTierScale * 0.04,
      1.45 + earnedTierScale * 0.04,
    ),
    raiseSizeScale: clamp(
      1 + stickySignal * 0.12 * strength,
      0.9 - earnedTierScale * 0.02,
      1.15 + earnedTierScale * 0.02,
    ),
    valueFrequencyScale: clamp(
      1 + stickySignal * 0.2 * strength,
      0.85 - earnedTierScale * 0.04,
      1.25 + earnedTierScale * 0.04,
    ),
    valueThresholdDelta: clamp(
      -stickySignal * 0.036 * strength,
      -0.04 - earnedTierScale * 0.008,
      0.04 + earnedTierScale * 0.008,
    ),
  };
}

export function isOpponentMemory(value: unknown): value is OpponentMemory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const memory = value as Partial<OpponentMemory>;
  const numericFields: (keyof OpponentMemory)[] = [
    'handsObserved',
    'actionsObserved',
    'preflopOpportunities',
    'voluntaryPreflopHands',
    'preflopRaises',
    'facedBetOpportunities',
    'foldsFacingBet',
    'callsFacingBet',
    'raisesFacingBet',
    'postflopAggressiveActions',
    'postflopPassiveActions',
  ];
  return memory.version === OPPONENT_MEMORY_VERSION
    && numericFields.every((field) => Number.isFinite(memory[field]) && Number(memory[field]) >= 0)
    && (memory.lastUpdatedAt === null || typeof memory.lastUpdatedAt === 'string')
    && Boolean(memory.positions)
    && positionBuckets.every((bucket) => {
      const tendency = memory.positions?.[bucket];
      return Number.isFinite(tendency?.hands)
        && Number(tendency?.hands) >= 0
        && Number.isFinite(tendency?.voluntaryPreflopHands)
        && Number(tendency?.voluntaryPreflopHands) >= 0;
    });
}
