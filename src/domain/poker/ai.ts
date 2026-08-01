import type { RandomSource } from './cards';
import { estimateHeadsUpEquity } from './equity';
import { getLegalActions } from './engine';
import { aiStrategyProfile, type AiDifficulty, type AiStrategyProfile } from './aiProfiles';
import type { AiDecision, GameState, PlayerId } from './types';
import {
  buildOpponentAdaptation,
  createEmptyOpponentMemory,
  type OpponentAdaptation,
  type OpponentMemory,
} from './opponentMemory';

const adaptationStrength: Record<AiDifficulty, number> = {
  friendly: 0.35,
  club: 0.7,
  sharp: 1,
};

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
      && mix < profile.facingValueFrequency * adaptation.valueFrequencyScale;
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
    && mix < profile.openValueFrequency * adaptation.valueFrequencyScale;
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

export function decideAiAction(
  state: GameState,
  playerId: PlayerId = 'villain',
  random: RandomSource = Math.random,
  difficulty: AiDifficulty = 'club',
  opponentMemory?: OpponentMemory,
): AiDecision {
  const profile = aiStrategyProfile(difficulty);
  const equity = estimateHeadsUpEquity(
    state.players[playerId].holeCards,
    state.board,
    profile.equitySamples,
    random,
  );
  const adaptation = buildOpponentAdaptation(
    opponentMemory ?? createEmptyOpponentMemory(),
    adaptationStrength[difficulty],
    state.button === 'hero' ? 'late' : 'blind',
  );
  return selectAiActionForEquity(state, playerId, equity, difficulty, random(), adaptation);
}
