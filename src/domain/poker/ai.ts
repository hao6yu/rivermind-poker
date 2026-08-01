import type { RandomSource } from './cards';
import { estimateHeadsUpEquity } from './equity';
import { getLegalActions } from './engine';
import type { AiDecision, GameState, PlayerId } from './types';

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
): number {
  const legal = getLegalActions(state, playerId);
  const player = state.players[playerId];
  const pressure = boardPressure(state);
  const potFraction = bluff ? 0.55 + pressure : equity > 0.78 ? 0.82 : 0.66;
  const desired = state.currentBet === 0
    ? Math.round(state.pot * potFraction)
    : Math.round(state.currentBet + state.pot * potFraction);
  return Math.max(legal.minRaiseTo, Math.min(player.streetBet + player.stack, desired));
}

export function decideAiAction(
  state: GameState,
  playerId: PlayerId = 'villain',
  random: RandomSource = Math.random,
): AiDecision {
  const legal = getLegalActions(state, playerId);
  const equity = estimateHeadsUpEquity(state.players[playerId].holeCards, state.board, 220, random);
  const potOdds = legal.toCall > 0 ? legal.toCall / (state.pot + legal.toCall) : 0;
  const edge = equity - potOdds;
  const drawPressure = boardPressure(state);
  const mix = random();

  if (legal.canCall) {
    const priceIsBad = equity + 0.04 < potOdds;
    const bluffCatch = equity > potOdds - 0.025 && legal.toCall < state.pot * 0.7;
    if (priceIsBad && !bluffCatch && mix > 0.08 + drawPressure) {
      return {
        action: { type: 'fold' },
        estimatedEquity: equity,
        potOdds,
        style: 'defense',
        rationale: 'Equity falls below the price offered by the pot.',
      };
    }

    const valueRaise = legal.canRaise && (equity > 0.72 || edge > 0.24) && mix < 0.74;
    const pressureRaise = legal.canRaise && equity < 0.34 && mix < 0.07 + drawPressure;
    if (valueRaise || pressureRaise) {
      return {
        action: { type: 'raise', amount: chooseRaiseTarget(state, playerId, equity, pressureRaise) },
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

  const valueBet = legal.canRaise && equity > 0.61 && mix < 0.82;
  const bluffBet = legal.canRaise && equity < 0.38 && mix < 0.1 + drawPressure;
  const thinPressure = legal.canRaise && equity >= 0.45 && equity <= 0.61 && mix < 0.22;
  if (valueBet || bluffBet || thinPressure) {
    return {
      action: { type: 'raise', amount: chooseRaiseTarget(state, playerId, equity, bluffBet) },
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
