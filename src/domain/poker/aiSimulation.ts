import { decideAiAction } from './ai';
import { createFairHeadsUpDecisionState } from './fairness';
import type { AiDifficulty } from './aiProfiles';
import { seededRandom } from './cards';
import { applyAction, createHand, getLegalActions } from './engine';
import type { AiDecision, GameState, PlayerAction } from './types';
import type { OpponentMemory } from './opponentMemory';

export interface AiSimulationMetrics {
  difficulty: AiDifficulty;
  hands: number;
  completedHands: number;
  decisions: number;
  facingBetDecisions: number;
  folds: number;
  calls: number;
  checks: number;
  raises: number;
  bluffs: number;
  valueRaises: number;
  showdowns: number;
  wins: number;
  aggressionRate: number;
  bluffRate: number;
  foldRateFacingBet: number;
  averageRaisePotFraction: number;
}

function scriptedHeroAction(state: GameState, roll: number): PlayerAction {
  const legal = getLegalActions(state, 'hero');
  if (legal.canCall) {
    if (legal.canRaise && roll < 0.14) {
      return { type: 'raise', amount: legal.suggestedRaiseTo };
    }
    if (legal.toCall <= state.pot * 0.65 || roll < 0.78) return { type: 'call' };
    return { type: 'fold' };
  }
  if (legal.canRaise && roll < 0.28) {
    return { type: 'raise', amount: legal.suggestedRaiseTo };
  }
  return { type: 'check' };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function simulateAiDifficulty(
  difficulty: AiDifficulty,
  hands = 60,
  seed = 28_731,
  opponentMemory?: OpponentMemory,
): AiSimulationMetrics {
  const counts = {
    completedHands: 0,
    decisions: 0,
    facingBetDecisions: 0,
    folds: 0,
    calls: 0,
    checks: 0,
    raises: 0,
    bluffs: 0,
    valueRaises: 0,
    showdowns: 0,
    wins: 0,
    totalRaisePotFraction: 0,
  };

  for (let handIndex = 0; handIndex < hands; handIndex += 1) {
    let state = createHand({
      button: handIndex % 2 === 0 ? 'hero' : 'villain',
      random: seededRandom(seed + handIndex * 97),
    });
    const heroRandom = seededRandom(seed + handIndex * 193 + 11);
    const aiRandom = seededRandom(seed + handIndex * 389 + 29);

    for (let actionIndex = 0; actionIndex < 40 && state.street !== 'complete'; actionIndex += 1) {
      if (state.toAct === 'hero') {
        state = applyAction(state, 'hero', scriptedHeroAction(state, heroRandom()));
        continue;
      }
      if (state.toAct !== 'villain') throw new Error('A live simulated hand has no player to act.');

      const legal = getLegalActions(state, 'villain');
      const potBefore = state.pot;
      const streetBetBefore = state.players.villain.streetBet;
      const decision: AiDecision = decideAiAction(
        createFairHeadsUpDecisionState(state, 'villain'),
        'villain',
        aiRandom,
        difficulty,
        opponentMemory,
      );
      counts.decisions += 1;
      if (legal.canCall) counts.facingBetDecisions += 1;
      if (decision.action.type === 'fold') counts.folds += 1;
      if (decision.action.type === 'call') counts.calls += 1;
      if (decision.action.type === 'check') counts.checks += 1;
      if (decision.action.type === 'raise') {
        counts.raises += 1;
        const additionalChips = Math.max(0, (decision.action.amount ?? streetBetBefore) - streetBetBefore);
        counts.totalRaisePotFraction += rate(additionalChips, potBefore);
      }
      if (decision.style === 'bluff') counts.bluffs += 1;
      if (decision.style === 'value') counts.valueRaises += 1;
      state = applyAction(state, 'villain', decision.action);
    }

    if (state.street !== 'complete') throw new Error(`Simulation did not finish hand ${handIndex + 1}.`);
    counts.completedHands += 1;
    if (state.outcome?.showdown) counts.showdowns += 1;
    if (state.outcome?.winner === 'villain') counts.wins += 1;
    if (state.players.hero.stack + state.players.villain.stack !== 2_000) {
      throw new Error(`Chip conservation failed in simulated hand ${handIndex + 1}.`);
    }
  }

  return {
    difficulty,
    hands,
    completedHands: counts.completedHands,
    decisions: counts.decisions,
    facingBetDecisions: counts.facingBetDecisions,
    folds: counts.folds,
    calls: counts.calls,
    checks: counts.checks,
    raises: counts.raises,
    bluffs: counts.bluffs,
    valueRaises: counts.valueRaises,
    showdowns: counts.showdowns,
    wins: counts.wins,
    aggressionRate: rate(counts.raises, counts.decisions),
    bluffRate: rate(counts.bluffs, counts.decisions),
    foldRateFacingBet: rate(counts.folds, counts.facingBetDecisions),
    averageRaisePotFraction: rate(counts.totalRaisePotFraction, counts.raises),
  };
}
