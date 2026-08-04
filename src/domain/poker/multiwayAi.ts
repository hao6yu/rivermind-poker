import type { RandomSource } from './cards';
import type { AiDifficulty } from './aiProfiles';
import {
  multiwayAiIdentityForSeat,
  multiwayDifficultyTuning,
  type MultiwayAiIdentity,
} from './multiwayAiProfiles';
import { estimateMultiwayEquity } from './multiwayEquity';
import {
  getMultiwayLegalActions,
  type MultiwayHandState,
  type MultiwayLegalActions,
  type TablePosition,
} from './multiway';
import type { PlayerAction } from './types';
import type { FairMultiwayDecisionState } from './fairness';
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
  positionBucketForTablePosition,
} from './opponentMemory';
import { buildPostflopPlan, selectPostflopAction } from './postflopStrategy';
import { selectAdvancedPostflopAction } from './postflopEv';
import {
  buildTournamentPressure,
  type TournamentDecisionContext,
  type TournamentPressure,
} from './tournamentIntelligence';

export type MultiwayDecisionStyle = 'value' | 'pressure' | 'bluff' | 'control' | 'defense';

export interface MultiwayAiDecision {
  action: PlayerAction;
  estimatedEquity: number;
  potOdds: number;
  style: MultiwayDecisionStyle;
  rationale: string;
  identityId: string;
  opponentCount: number;
  playersBehind: number;
  stackToPotRatio: number;
  tournamentPressureLabel: string | null;
  tournamentRiskPremium: number;
}

export interface MultiwayAiDecisionOptions {
  difficulty?: AiDifficulty;
  identity?: MultiwayAiIdentity;
  identities?: Partial<Record<string, MultiwayAiIdentity>>;
  opponentMemory?: OpponentMemory;
  simulations?: number;
  tournament?: TournamentDecisionContext;
  random?: RandomSource;
}

const adaptationStrength: Record<AiDifficulty, number> = {
  friendly: 0.35,
  club: 0.7,
  sharp: 1,
  elite: 1.15,
  nemesis: 1.3,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedMix(mix: number): number {
  if (!Number.isFinite(mix)) return 0.5;
  return clamp(mix, 0, 0.999_999);
}

function profileRaiseScale(identity: MultiwayAiIdentity, valueLine: boolean): number {
  const source = valueLine ? identity.aggression : (identity.aggression + identity.bluffFrequency) / 2;
  return clamp(source, 0.72, 1.35);
}

function profileContinueDelta(identity: MultiwayAiIdentity): number {
  return clamp(identity.callTolerance + (0.5 - identity.rangeTightness) * 0.055, -0.05, 0.08);
}

function rescalePostflopRaise(
  action: PlayerAction,
  state: MultiwayHandState,
  legal: MultiwayLegalActions,
  identity: MultiwayAiIdentity,
  difficulty: AiDifficulty,
  adaptation: OpponentAdaptation,
): PlayerAction {
  if (action.type !== 'raise' || action.amount === undefined) return action;
  const tuning = multiwayDifficultyTuning(difficulty);
  const baselineIncrement = action.amount - state.currentBet;
  const scale = clamp(
    (identity.potFraction / 0.66) * tuning.sizingScale * adaptation.raiseSizeScale,
    0.82,
    1.28,
  );
  const target = Math.round(state.currentBet + baselineIncrement * scale);
  return {
    type: 'raise',
    amount: clamp(target, legal.minRaiseTo, legal.maxRaiseTo),
  };
}

function positionLeverage(position: TablePosition | undefined, postflop: boolean): number {
  switch (position) {
    case 'BTN': return postflop ? 0.065 : 0.05;
    case 'BTN/SB': return postflop ? -0.015 : 0.045;
    case 'CO': return 0.035;
    case 'HJ': return 0.012;
    case 'UTG': return -0.04;
    case 'SB': return -0.035;
    case 'BB': return postflop ? -0.025 : 0;
    default: return 0;
  }
}

function boardPressure(state: MultiwayHandState): number {
  if (state.board.length < 3) return 0;
  const suitCounts = new Map<string, number>();
  state.board.forEach((card) => suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1));
  const maxSuitCount = Math.max(...suitCounts.values());
  const flushPressure = maxSuitCount >= 4 ? 0.12 : maxSuitCount === 3 ? 0.07 : 0;
  const ranks = state.board.map((card) => card.rank);
  const uniqueRanks = [...new Set(ranks)].sort((left, right) => left - right);
  const pairedPressure = uniqueRanks.length < ranks.length ? 0.045 : 0;
  const connectedPressure = uniqueRanks.length >= 3
    && (uniqueRanks.at(-1) ?? 0) - (uniqueRanks[0] ?? 0) <= 5
    ? 0.055
    : 0;
  return flushPressure + pairedPressure + connectedPressure;
}

function liveOpponentIds(state: MultiwayHandState, playerId: string): string[] {
  return state.activePlayerIds.filter((opponentId) => (
    opponentId !== playerId && !state.players[opponentId]?.folded
  ));
}

function countPlayersBehind(state: MultiwayHandState, playerId: string): number {
  const index = state.pending.indexOf(playerId);
  if (index < 0) return 0;
  return state.pending.slice(index + 1).filter((pendingId) => {
    const player = state.players[pendingId];
    return Boolean(player && !player.folded && !player.allIn);
  }).length;
}

function effectiveStackToPotRatio(
  state: MultiwayHandState,
  playerId: string,
  opponentIds: readonly string[],
): number {
  const player = state.players[playerId];
  if (!player) throw new Error(`Player ${playerId} is missing from the hand state.`);
  const deepestLiveOpponent = Math.max(
    0,
    ...opponentIds.map((opponentId) => state.players[opponentId]?.stack ?? 0),
  );
  const effectiveStack = Math.min(player.stack, deepestLiveOpponent);
  return effectiveStack / Math.max(state.pot, state.bigBlind);
}

function chooseRaiseTarget(
  state: MultiwayHandState,
  playerId: string,
  legal: MultiwayLegalActions,
  identity: MultiwayAiIdentity,
  difficulty: AiDifficulty,
  equity: number,
  valueThreshold: number,
  style: 'value' | 'pressure' | 'bluff',
  opponentCount: number,
  stackToPotRatio: number,
  adaptation: OpponentAdaptation,
): number {
  const player = state.players[playerId];
  if (!player) throw new Error(`Player ${playerId} is missing from the hand state.`);
  const tuning = multiwayDifficultyTuning(difficulty);
  const texture = boardPressure(state);
  const strengthBonus = style === 'value' && equity > valueThreshold + 0.14 ? 0.13 : 0;
  const bluffDiscount = style === 'bluff' ? 0.08 : 0;
  const fieldBonus = Math.min(0.12, Math.max(0, opponentCount - 1) * 0.035);
  const potFraction = clamp(
    identity.potFraction * tuning.sizingScale * adaptation.raiseSizeScale
      + texture * 0.45 + strengthBonus + fieldBonus - bluffDiscount,
    0.42,
    1.25,
  );
  let desired = state.currentBet === 0
    ? Math.round(state.pot * potFraction)
    : Math.round(state.currentBet + state.pot * potFraction);
  if (style === 'value' && stackToPotRatio <= 1.15 && equity > valueThreshold + 0.1) {
    desired = legal.maxRaiseTo;
  }
  return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, desired));
}

function decisionContext(
  state: MultiwayHandState,
  playerId: string,
  identityId: string,
  estimatedEquity: number,
  tournamentPressure?: TournamentPressure,
): Omit<MultiwayAiDecision, 'action' | 'style' | 'rationale'> {
  const legal = getMultiwayLegalActions(state, playerId);
  const opponentIds = liveOpponentIds(state, playerId);
  return {
    estimatedEquity,
    potOdds: legal.toCall > 0 ? legal.toCall / (state.pot + legal.toCall) : 0,
    identityId,
    opponentCount: opponentIds.length,
    playersBehind: countPlayersBehind(state, playerId),
    stackToPotRatio: effectiveStackToPotRatio(state, playerId, opponentIds),
    tournamentPressureLabel: tournamentPressure?.pressureLabel ?? null,
    tournamentRiskPremium: tournamentPressure?.riskPremium ?? 0,
  };
}

export function selectMultiwayAiActionForEquity(
  state: MultiwayHandState,
  playerId: string,
  equity: number,
  difficulty: AiDifficulty,
  identity: MultiwayAiIdentity,
  mix: number,
  adaptation: OpponentAdaptation = buildOpponentAdaptation(createEmptyOpponentMemory()),
): MultiwayAiDecision {
  if (state.toAct !== playerId) throw new Error(`It is not ${playerId}'s turn.`);
  const legal = getMultiwayLegalActions(state, playerId);
  if (!legal.canCall && !legal.canCheck) throw new Error(`Player ${playerId} has no legal AI action.`);

  const tuning = multiwayDifficultyTuning(difficulty);
  const context = decisionContext(state, playerId, identity.id, clamp(equity, 0, 1));
  const fairShare = 1 / (context.opponentCount + 1);
  const position = positionLeverage(state.players[playerId]?.position, state.street !== 'preflop');
  const fieldRisk = Math.max(0, context.opponentCount - 1) * 0.006 + context.playersBehind * 0.009;
  const riskPremium = tuning.riskPremium + fieldRisk - position * 0.12;
  const callThreshold = context.potOdds + riskPremium
    - identity.callTolerance
    - tuning.callTolerance
    - adaptation.callToleranceDelta;
  const randomMix = normalizedMix(mix);
  const texture = boardPressure(state);
  const shortStackValueDiscount = context.stackToPotRatio < 1.5 ? 0.045 : 0;
  const aggressionDiscount = (identity.aggression * tuning.aggressionScale - 1) * 0.045;
  const openValueThreshold = clamp(
    fairShare + 0.2 - position * 0.2 - shortStackValueDiscount - aggressionDiscount
      + adaptation.valueThresholdDelta,
    0.34,
    0.7,
  );
  const facingValueThreshold = clamp(openValueThreshold + 0.075, 0.4, 0.78);
  const valueFrequency = clamp(
    0.62 * identity.aggression * tuning.aggressionScale * adaptation.valueFrequencyScale,
    0.28,
    0.96,
  );
  const fieldBluffScale = 1 / (1 + Math.max(0, context.opponentCount - 1) * 0.62 + context.playersBehind * 0.32);
  const positionBluffScale = 1 + Math.max(0, position) * 3.2;
  const bluffFrequency = (0.045 + texture * 0.42)
    * identity.bluffFrequency
    * tuning.bluffScale
    * fieldBluffScale
    * positionBluffScale
    * adaptation.bluffFrequencyScale;
  const slowPlay = equity > facingValueThreshold + 0.14 && randomMix < identity.slowPlayFrequency;

  if (legal.canCall) {
    const mixedContinueFrequency = clamp(
      0.08 + Math.max(0, identity.callTolerance + tuning.callTolerance) * 2.4 + texture * 0.3,
      0.05,
      0.38,
    );
    const belowPrice = equity < callThreshold;
    if (belowPrice && randomMix > mixedContinueFrequency) {
      return {
        ...context,
        action: { type: 'fold' },
        style: 'defense',
        rationale: context.playersBehind > 0
          ? 'The price and players still behind make continuing too optimistic.'
          : 'The estimated range equity does not justify the offered price.',
      };
    }

    const valueRaise = legal.canRaise
      && !slowPlay
      && equity >= facingValueThreshold
      && randomMix < valueFrequency;
    const bluffRaise = legal.canRaise
      && equity < fairShare * 0.9
      && randomMix < bluffFrequency * 0.58;
    if (valueRaise || bluffRaise) {
      const style = bluffRaise ? 'bluff' : 'value';
      return {
        ...context,
        action: {
          type: 'raise',
          amount: chooseRaiseTarget(
            state,
            playerId,
            legal,
            identity,
            difficulty,
            equity,
            facingValueThreshold,
            style,
            context.opponentCount,
            context.stackToPotRatio,
            adaptation,
          ),
        },
        style,
        rationale: bluffRaise
          ? 'Selective pressure targets a strong but non-nut multiway range.'
          : 'The hand is strong enough to raise for value against several continuing ranges.',
      };
    }

    return {
      ...context,
      action: { type: 'call' },
      style: slowPlay ? 'control' : 'defense',
      rationale: slowPlay
        ? 'A passive line protects a very strong hand and keeps weaker ranges involved.'
        : 'Calling realizes equity while respecting the remaining field and stack depth.',
    };
  }

  const valueBet = legal.canRaise
    && equity >= openValueThreshold
    && randomMix >= identity.slowPlayFrequency
    && randomMix < valueFrequency;
  const bluffBet = legal.canRaise
    && equity < fairShare * 0.92
    && randomMix < bluffFrequency;
  const pressureFrequency = clamp(
    0.1 * identity.aggression * tuning.aggressionScale * fieldBluffScale * positionBluffScale
      * adaptation.pressureFrequencyScale,
    0.025,
    0.32,
  );
  const pressureBet = legal.canRaise
    && equity >= fairShare - 0.025
    && equity < openValueThreshold
    && randomMix < pressureFrequency;

  if (valueBet || bluffBet || pressureBet) {
    const style = bluffBet ? 'bluff' : valueBet ? 'value' : 'pressure';
    return {
      ...context,
      action: {
        type: 'raise',
        amount: chooseRaiseTarget(
          state,
          playerId,
          legal,
          identity,
          difficulty,
          equity,
          openValueThreshold,
          style,
          context.opponentCount,
          context.stackToPotRatio,
          adaptation,
        ),
      },
      style,
      rationale: bluffBet
        ? 'Position and board pressure support a low-frequency multiway bluff.'
        : valueBet
          ? 'The hand is ahead of enough continuing ranges to build the pot.'
          : 'A measured bet denies equity without treating the hand as a monster.',
    };
  }

  return {
    ...context,
    action: { type: 'check' },
    style: 'control',
    rationale: context.playersBehind > 0
      ? 'Checking avoids over-expanding the pot with players still behind.'
      : 'Checking keeps the weaker part of the range protected.',
  };
}

export function decideMultiwayAiAction(
  state: FairMultiwayDecisionState,
  playerId: string,
  options: MultiwayAiDecisionOptions = {},
): MultiwayAiDecision {
  if (state.toAct !== playerId) throw new Error(`It is not ${playerId}'s turn.`);
  const player = state.players[playerId];
  if (!player) throw new Error(`Player ${playerId} is missing from the hand state.`);
  const difficulty = options.difficulty ?? 'club';
  const identity = options.identity ?? multiwayAiIdentityForSeat(player.seat, difficulty);
  const tuning = multiwayDifficultyTuning(difficulty);
  const random = options.random ?? Math.random;
  const estimatedEquity = estimateMultiwayEquity(state, playerId, {
    simulations: options.simulations ?? tuning.equitySamples,
    random,
    identities: options.identities,
  });
  const adaptation = buildOpponentAdaptation(
    options.opponentMemory ?? createEmptyOpponentMemory(),
    adaptationStrength[difficulty],
    positionBucketForTablePosition(state.players.hero?.position),
  );
  const tournamentPressure = buildTournamentPressure(state, playerId, options.tournament);
  if (state.street === 'preflop' && player.position) {
    const legal = getMultiwayLegalActions(state, playerId);
    const opponentIds = liveOpponentIds(state, playerId);
    const facing = preflopFacingFromPublicAction(state.currentBet, state.bigBlind, state.history);
    const lastAggressorId = [...state.history].reverse().find((action) => (
      action.street === 'preflop' && action.type === 'raise'
    ))?.playerId;
    const lastAggressor = lastAggressorId ? state.players[lastAggressorId] : undefined;
    const preflopRaises = state.history.filter((action) => (
      action.street === 'preflop' && action.type === 'raise'
    ));
    const latestRaiseIndex = preflopRaises.length > 0
      ? state.history.lastIndexOf(preflopRaises.at(-1)!)
      : -1;
    const callersAfterRaise = latestRaiseIndex < 0 ? 0 : state.history.slice(latestRaiseIndex + 1)
      .filter((action) => action.street === 'preflop' && action.type === 'call').length;
    const relevantOpponentChips = facing === 'raised' && lastAggressor
      ? lastAggressor.stack + lastAggressor.streetBet
      : Math.max(
      state.bigBlind,
      ...opponentIds.map((opponentId) => {
        const opponent = state.players[opponentId];
        return opponent ? opponent.stack + opponent.streetBet : 0;
      }),
    );
    const effectiveStackBb = Math.min(player.stack + player.streetBet, relevantOpponentChips) / state.bigBlind;
    const limperCount = state.history.filter((action) => action.street === 'preflop' && action.type === 'call').length;
    const plan = buildPreflopPlan({
      canCheck: legal.canCheck,
      cards: player.holeCards,
      callersAfterRaise,
      effectiveStackBb,
      facing,
      limperCount,
      playerCount: state.activePlayerIds.length,
      position: player.position,
      rangeTightness: identity.rangeTightness,
      raiseCount: preflopRaises.length,
      raiseSizeBb: facing === 'raised' ? state.currentBet / state.bigBlind : undefined,
      raiserPosition: lastAggressor?.position,
      strategyTier: difficulty,
      tournamentMode: options.tournament?.enabled,
      tournamentRiskPremium: tournamentPressure.riskPremium,
    });
    const marginalReraiseScale = facing === 'raised' && plan.score < 0.84
      ? preflopRaises.length > 1 ? 0.62 : 0.82
      : 1;
    const action = selectPreflopAction(plan, random(), legal, {
      bigBlind: state.bigBlind,
      currentBet: state.currentBet,
      facing,
      legal,
      limperCount,
      playerStreetBet: player.streetBet,
      position: player.position,
      stackBand: plan.stackBand,
      jamPreferred: plan.jamPreferred,
    }, difficulty, {
      continueFrequencyDelta: facing === 'raised'
        ? profileContinueDelta(identity) + adaptation.callToleranceDelta
        : profileContinueDelta(identity) * 0.35,
      raiseFrequencyScale: profileRaiseScale(identity, plan.score >= 0.84)
        * marginalReraiseScale
        * (plan.score >= 0.84
          ? adaptation.valueFrequencyScale
          : facing === 'raised' ? adaptation.bluffFrequencyScale : adaptation.pressureFrequencyScale),
      raiseSizeScale: adaptation.raiseSizeScale * clamp(identity.potFraction / 0.66, 0.9, 1.12),
    });
    const context = decisionContext(state, playerId, identity.id, estimatedEquity, tournamentPressure);
    return {
      ...context,
      action,
      style: action.type === 'raise'
        ? plan.score >= 0.84 ? 'value' : facing === 'raised' ? 'bluff' : 'pressure'
        : action.type === 'call' || action.type === 'fold' ? 'defense' : 'control',
      rationale: plan.explanation,
    };
  }
  if (state.street !== 'preflop' && state.street !== 'complete') {
    const legal = getMultiwayLegalActions(state, playerId);
    const opponentIds = liveOpponentIds(state, playerId);
    const playersBehind = countPlayersBehind(state, playerId);
    const context = decisionContext(state, playerId, identity.id, estimatedEquity, tournamentPressure);
    const lastAggressor = [...state.history].reverse().find((action) => action.type === 'raise');
    const initiative = state.currentBet > player.streetBet
      ? 'opponent'
      : lastAggressor?.playerId === playerId ? 'player' : lastAggressor ? 'opponent' : 'none';
    const plan = buildPostflopPlan({
      bigBlind: state.bigBlind,
      board: state.board,
      cards: player.holeCards,
      currentBet: state.currentBet,
      effectiveStack: context.stackToPotRatio * Math.max(state.pot, state.bigBlind),
      equity: estimatedEquity,
      initiative,
      legal,
      opponentCount: opponentIds.length,
      playerStreetBet: player.streetBet,
      playersBehind,
      pot: state.pot,
      street: state.street,
      tournamentRiskPremium: tournamentPressure.riskPremium,
    });
    const selectionMix = random();
    const selected = difficulty === 'elite' || difficulty === 'nemesis'
      ? selectAdvancedPostflopAction({
        adaptation,
        difficulty,
        estimatedEquity,
        identity,
        identities: options.identities,
        mix: selectionMix,
        plan,
        playerId,
        state,
        tournamentRiskPremium: tournamentPressure.riskPremium,
      })
      : selectPostflopAction(plan, selectionMix, difficulty, {
      bluffFrequencyScale: adaptation.bluffFrequencyScale * identity.bluffFrequency * tuning.bluffScale,
      callToleranceDelta: adaptation.callToleranceDelta + identity.callTolerance + tuning.callTolerance,
      pressureFrequencyScale: adaptation.pressureFrequencyScale * identity.aggression * tuning.aggressionScale,
      raiseSizeScale: adaptation.raiseSizeScale * identity.potFraction * tuning.sizingScale,
      slowPlayFrequency: identity.slowPlayFrequency,
      valueFrequencyScale: adaptation.valueFrequencyScale * identity.aggression * tuning.aggressionScale,
      });
    return {
      ...context,
      action: rescalePostflopRaise(selected.action, state, legal, identity, difficulty, adaptation),
      style: selected.role === 'draw' || selected.role === 'protection'
        ? 'pressure'
        : selected.role,
      rationale: selected.detail,
    };
  }
  return selectMultiwayAiActionForEquity(
    state,
    playerId,
    estimatedEquity,
    difficulty,
    identity,
    random(),
    adaptation,
  );
}
