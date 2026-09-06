import type { RandomSource } from './cards';
import { estimateEquityAgainstRange, estimateHeadsUpEquity } from './equity';
import { getLegalActions } from './engine';
import { aiStrategyProfile, type AiDifficulty, type AiStrategyProfile } from './aiProfiles';
import type { AiDecision, GameState, PlayerId } from './types';
import type { FairHeadsUpDecisionState } from './fairness';
import type { MultiwayAiIdentity } from './multiwayAiProfiles';
import { sessionExploitScales, type SessionExploitRead } from './sessionExploitRead';
import {
  buildOpponentRange,
  continuingRange,
  createBoardClassifier,
  foldShare,
  rangeSpotFromHeadsUp,
  rangeStrength,
  responseTable,
  strongShare,
  type ComboRange,
  type SizeBucket,
} from './opponentRange';
import {
  buildPreflopPlan,
  preflopFacingFromPublicAction,
  selectPreflopAction,
} from './preflopStrategy';
import {
  buildOpponentAdaptation,
  createEmptyOpponentMemory,
  type OpponentAdaptation,
  type OpponentMemory,
} from './opponentMemory';
import { buildPostflopPlan, selectPostflopAction } from './postflopStrategy';
import { selectHeadsUpPostflopActionByEv, type PostflopEvContext } from './postflopEv';

function boardPressure(state: GameState): number {
  if (state.board.length < 3) return 0;
  const suitCounts = new Map<string, number>();
  for (const card of state.board) suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  const flushPressure = Math.max(...suitCounts.values()) >= 3 ? 0.08 : 0;
  const ranks = state.board.map((card) => card.rank);
  const paired = new Set(ranks).size < ranks.length ? 0.05 : 0;
  const spread = Math.max(...ranks) - Math.min(...ranks);
  const connected = spread <= 5 ? 0.05 : 0;
  return flushPressure + paired + connected;
}

function chooseRaiseTarget(
  state: GameState,
  playerId: PlayerId,
  equity: number,
  bluff: boolean,
  profile: AiStrategyProfile,
  adaptation: OpponentAdaptation,
): number {
  const legal = getLegalActions(state, playerId);
  const player = state.players[playerId];
  const pressure = boardPressure(state);
  const potFraction = bluff
    ? profile.bluffPotFraction + pressure * 0.4
    : equity > 0.78
      ? profile.strongValuePotFraction
      : profile.standardValuePotFraction;
  const adaptedPotFraction = potFraction * adaptation.raiseSizeScale;
  const desired = state.currentBet === 0
    ? Math.round(state.pot * adaptedPotFraction)
    : Math.round(state.currentBet + state.pot * adaptedPotFraction);
  return Math.max(legal.minRaiseTo, Math.min(player.streetBet + player.stack, desired));
}

export function selectAiActionForEquity(
  state: GameState,
  playerId: PlayerId,
  equity: number,
  difficulty: AiDifficulty,
  mix: number,
  adaptation: OpponentAdaptation = buildOpponentAdaptation(createEmptyOpponentMemory()),
): AiDecision {
  const legal = getLegalActions(state, playerId);
  const profile = aiStrategyProfile(difficulty);
  const potOdds = legal.toCall > 0 ? legal.toCall / (state.pot + legal.toCall) : 0;
  const edge = equity - potOdds;
  const drawPressure = boardPressure(state);

  if (legal.canCall) {
    const priceIsBad = equity + profile.foldBuffer < potOdds;
    const bluffCatch = equity > potOdds - profile.bluffCatchMargin - adaptation.callToleranceDelta
      && legal.toCall < state.pot * profile.bluffCatchMaxPotFraction;
    const badPriceContinueFrequency = profile.badPriceContinueBase
      + drawPressure * profile.badPriceTextureScale;
    if (priceIsBad && !bluffCatch && mix > badPriceContinueFrequency) {
      return {
        action: { type: 'fold' },
        estimatedEquity: equity,
        potOdds,
        style: 'defense',
        rationale: 'Equity falls below the price offered by the pot.',
      };
    }

    const valueRaise = legal.canRaise
      && (equity > profile.facingValueEquity + adaptation.valueThresholdDelta
        || edge > profile.facingValueEdge + adaptation.valueThresholdDelta)
      // Adaptation can scale this above 1, which would make the raise
      // unconditional and delete the check-back mass that keeps a strong range
      // unreadable. multiwayAi clamps its value frequency to the same 0.96.
      && mix < Math.min(0.96, profile.facingValueFrequency * adaptation.valueFrequencyScale);
    const pressureRaise = legal.canRaise
      && equity < profile.facingBluffMaxEquity
      && mix < (profile.facingBluffBase + drawPressure * profile.facingBluffTextureScale)
        * adaptation.bluffFrequencyScale;
    if (valueRaise || pressureRaise) {
      return {
        action: { type: 'raise', amount: chooseRaiseTarget(state, playerId, equity, pressureRaise, profile, adaptation) },
        estimatedEquity: equity,
        potOdds,
        style: pressureRaise ? 'bluff' : 'value',
        rationale: pressureRaise
          ? 'A low-frequency bluff attacks a range that should contain folds.'
          : 'A range advantage supports extracting more value.',
      };
    }

    return {
      action: { type: 'call' },
      estimatedEquity: equity,
      potOdds,
      style: edge > 0.08 ? 'defense' : 'control',
      rationale: 'Calling realizes equity without over-expanding the pot.',
    };
  }

  const valueBet = legal.canRaise
    && equity > profile.openValueEquity + adaptation.valueThresholdDelta
    && mix < Math.min(0.96, profile.openValueFrequency * adaptation.valueFrequencyScale);
  const bluffBet = legal.canRaise
    && equity < profile.openBluffMaxEquity
    && mix < (profile.openBluffBase + drawPressure * profile.openBluffTextureScale)
      * adaptation.bluffFrequencyScale;
  const thinPressure = legal.canRaise
    && equity >= profile.thinPressureMinEquity
    && equity <= profile.thinPressureMaxEquity
    && mix < profile.thinPressureFrequency * adaptation.pressureFrequencyScale;
  if (valueBet || bluffBet || thinPressure) {
    return {
      action: { type: 'raise', amount: chooseRaiseTarget(state, playerId, equity, bluffBet, profile, adaptation) },
      estimatedEquity: equity,
      potOdds,
      style: bluffBet ? 'bluff' : valueBet ? 'value' : 'pressure',
      rationale: bluffBet
        ? 'Board texture creates a credible low-frequency bluff.'
        : valueBet
          ? 'The hand is strong enough to build the pot.'
          : 'A small mixed-frequency bet denies free equity.',
    };
  }

  return {
    action: { type: 'check' },
    estimatedEquity: equity,
    potOdds,
    style: 'control',
    rationale: 'Checking protects the weaker part of the range and controls pot size.',
  };
}

export interface HeadsUpAiOptions {
  /** Roster identity for archetype, range tightness and slow play; balanced when omitted. */
  identity?: MultiwayAiIdentity;
  /** Nemesis-only per-session read on the human's public tendencies; ignored by other difficulties. */
  sessionRead?: SessionExploitRead;
}

const SIZE_BUCKETS: readonly SizeBucket[] = ['small', 'large', 'overbet'];

export function decideAiAction(
  state: FairHeadsUpDecisionState,
  playerId: PlayerId = 'villain',
  random: RandomSource = Math.random,
  difficulty: AiDifficulty = 'club',
  opponentMemory?: OpponentMemory,
  options: HeadsUpAiOptions = {},
): AiDecision {
  const profile = aiStrategyProfile(difficulty);
  const player = state.players[playerId];
  const opponentId: PlayerId = playerId === 'hero' ? 'villain' : 'hero';
  const opponent = state.players[opponentId];
  const identity = options.identity;
  const exploit = profile.sessionRead && options.sessionRead
    ? sessionExploitScales(options.sessionRead)
    : { cbetScale: 1, threeBetScale: 1, riverValueScale: 1 };
  const classifier = createBoardClassifier();
  const rangeProfile = {
    archetype: 'balanced' as const,
    tier: 'club' as const,
    bluffAllowance: 1,
    narrowingStrength: profile.narrowingStrength,
    memory: opponentMemory,
    memoryStrength: profile.memoryStrength,
  };
  const opponentRange: ComboRange | null = profile.rangeBlend > 0
    ? buildOpponentRange(rangeSpotFromHeadsUp(state, opponentId), player.holeCards, state.board, rangeProfile, classifier)
    : null;
  const equity = opponentRange
    ? estimateEquityAgainstRange(player.holeCards, state.board, opponentRange, profile.rangeBlend, profile.equitySamples, random)
    : estimateHeadsUpEquity(player.holeCards, state.board, profile.equitySamples, random);
  const adaptation = buildOpponentAdaptation(
    opponentMemory ?? createEmptyOpponentMemory(),
    profile.memoryStrength,
    state.button === 'hero' ? 'late' : 'blind',
  );
  if (state.street === 'preflop') {
    const legal = getLegalActions(state, playerId);
    const position = state.button === playerId ? 'BTN/SB' : 'BB';
    const facing = preflopFacingFromPublicAction(state.currentBet, state.bigBlind, state.history);
    const preflopRaises = state.history.filter((action) => (
      action.street === 'preflop' && action.type === 'raise'
    )).length;
    const effectiveStackBb = Math.min(
      player.stack + player.streetBet,
      opponent.stack + opponent.streetBet,
    ) / state.bigBlind;
    const plan = buildPreflopPlan({
      archetype: identity?.style ?? 'balanced',
      rangeTightness: identity?.rangeTightness,
      canCheck: legal.canCheck,
      toCallBb: legal.toCall / state.bigBlind,
      potBb: state.pot / state.bigBlind,
      cards: player.holeCards,
      effectiveStackBb,
      facing,
      playerCount: 2,
      position,
      strategyTier: difficulty,
      raiseCount: preflopRaises,
      raiseSizeBb: facing === 'raised' ? state.currentBet / state.bigBlind : undefined,
    });
    const action = selectPreflopAction(plan, random(), legal, {
      bigBlind: state.bigBlind,
      currentBet: state.currentBet,
      facing,
      legal,
      playerStreetBet: player.streetBet,
      position,
      raiseCount: preflopRaises,
      stackBand: plan.stackBand,
    }, difficulty, {
      continueFrequencyDelta: facing === 'raised' ? adaptation.callToleranceDelta : 0,
      raiseFrequencyScale: (plan.score >= 0.84
        ? adaptation.valueFrequencyScale
        : facing === 'raised' ? adaptation.bluffFrequencyScale : adaptation.pressureFrequencyScale)
        * (facing === 'raised' ? exploit.threeBetScale : 1),
      raiseSizeScale: adaptation.raiseSizeScale,
    });
    const potOdds = legal.toCall > 0 ? legal.toCall / (state.pot + legal.toCall) : 0;
    return {
      action,
      estimatedEquity: equity,
      potOdds,
      style: action.type === 'raise'
        ? plan.score >= 0.84 ? 'value' : facing === 'raised' ? 'bluff' : 'pressure'
        : action.type === 'call' || action.type === 'fold' ? 'defense' : 'control',
      rationale: plan.explanation,
    };
  }
  if (state.street !== 'complete') {
    const legal = getLegalActions(state, playerId);
    const lastAggressor = [...state.history].reverse().find((action) => action.type === 'raise');
    const initiative = state.currentBet > player.streetBet
      ? 'opponent'
      : lastAggressor?.player === playerId ? 'player' : lastAggressor ? 'opponent' : 'none';
    const table = responseTable(rangeProfile);
    const foldShareBySize = opponentRange
      ? Object.fromEntries(SIZE_BUCKETS.map((bucket) => [bucket, foldShare(opponentRange, state.board, bucket, table, classifier)])) as Record<SizeBucket, number>
      : undefined;
    // Floor for production depth; never above the caller's own sample count so low-sample corpora stay fast.
    const calledSamples = Math.max(Math.round(profile.equitySamples * 0.4), Math.min(60, profile.equitySamples));
    const calledEquityBySize = profile.evSelector && opponentRange && legal.canRaise
      ? Object.fromEntries(SIZE_BUCKETS.map((bucket) => [
        bucket,
        estimateEquityAgainstRange(
          player.holeCards, state.board,
          continuingRange(opponentRange, state.board, bucket, table, classifier),
          1, calledSamples, random,
        ),
      ])) as Record<SizeBucket, number>
      : undefined;
    const plan = buildPostflopPlan({
      bigBlind: state.bigBlind,
      board: state.board,
      cards: player.holeCards,
      currentBet: state.currentBet,
      effectiveStack: Math.min(player.stack, opponent.stack),
      equity,
      initiative,
      legal,
      opponentCount: 1,
      playerStreetBet: player.streetBet,
      playersBehind: state.pending.indexOf(playerId) >= 0
        ? Math.max(0, state.pending.length - state.pending.indexOf(playerId) - 1)
        : 0,
      pot: state.pot,
      street: state.street,
      foldShareBySize,
      extraSizeFractions: profile.overbetCandidate && state.street === 'river' && opponentRange
        && strongShare(opponentRange, state.board, classifier) < 0.25
        ? [1.25, 1.5]
        : undefined,
    });
    const mix = random();
    const adjustments = {
      bluffFrequencyScale: adaptation.bluffFrequencyScale * (identity?.bluffFrequency ?? 1),
      callToleranceDelta: adaptation.callToleranceDelta + (identity?.callTolerance ?? 0),
      pressureFrequencyScale: adaptation.pressureFrequencyScale * (identity?.aggression ?? 1)
        * (state.street === 'flop' && initiative === 'player' && state.currentBet === 0 ? exploit.cbetScale : 1),
      raiseSizeScale: adaptation.raiseSizeScale * (identity ? Math.max(0.9, Math.min(1.12, identity.potFraction / 0.66)) : 1),
      slowPlayFrequency: identity?.slowPlayFrequency ?? 0,
      valueFrequencyScale: adaptation.valueFrequencyScale * (identity?.aggression ?? 1)
        * (state.street === 'river' ? exploit.riverValueScale : 1),
    };
    const selected = profile.evSelector && (difficulty === 'elite' || difficulty === 'nemesis')
      ? selectHeadsUpPostflopActionByEv({
        plan,
        mix,
        difficulty,
        context: {
          adaptation: {
            ...adaptation,
            bluffFrequencyScale: adjustments.bluffFrequencyScale,
            callToleranceDelta: adjustments.callToleranceDelta,
            pressureFrequencyScale: adjustments.pressureFrequencyScale,
            raiseSizeScale: adjustments.raiseSizeScale,
            valueFrequencyScale: adjustments.valueFrequencyScale,
          },
          averageOpponentRangeStrength: opponentRange ? rangeStrength(opponentRange, state.board, classifier) : 0.2,
          calledEquityBySize,
          currentBet: state.currentBet,
          equity,
          opponentCount: 1,
          playerStreetBet: player.streetBet,
          playersBehind: 0,
          pot: state.pot,
          street: state.street,
          tournamentRiskPremium: 0,
        } satisfies PostflopEvContext,
      })
      : selectPostflopAction(plan, mix, difficulty, adjustments);
    return {
      action: selected.action,
      estimatedEquity: equity,
      potOdds: plan.requiredEquity,
      style: selected.role === 'draw' || selected.role === 'protection'
        ? 'pressure'
        : selected.role,
      rationale: selected.detail,
    };
  }
  return selectAiActionForEquity(state, playerId, equity, difficulty, random(), adaptation);
}
