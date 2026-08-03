import type { AiDifficulty } from './aiProfiles';
import type { FairMultiwayDecisionState } from './fairness';
import { inferMultiwayRangeStrength } from './multiwayEquity';
import {
  multiwayDifficultyTuning,
  type MultiwayAiIdentity,
} from './multiwayAiProfiles';
import type { OpponentAdaptation } from './opponentMemory';
import type { PostflopCandidate, PostflopPlan } from './postflopStrategy';
import type { Street } from './types';

export interface PostflopEvContext {
  adaptation: OpponentAdaptation;
  averageOpponentRangeStrength: number;
  currentBet: number;
  equity: number;
  opponentCount: number;
  playerStreetBet: number;
  playersBehind: number;
  pot: number;
  street: Exclude<Street, 'preflop' | 'complete'>;
  tournamentRiskPremium: number;
}

export interface PostflopCandidateEv {
  candidate: PostflopCandidate;
  expectedValue: number;
  foldEquity: number;
  utility: number;
}

export interface AdvancedPostflopSelectionInput {
  adaptation: OpponentAdaptation;
  difficulty: Extract<AiDifficulty, 'elite' | 'nemesis'>;
  estimatedEquity: number;
  identity: MultiwayAiIdentity;
  identities?: Partial<Record<string, MultiwayAiIdentity>>;
  mix: number;
  plan: PostflopPlan;
  playerId: string;
  state: FairMultiwayDecisionState;
  tournamentRiskPremium: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function liveOpponentIds(state: FairMultiwayDecisionState, playerId: string): string[] {
  return state.activePlayerIds.filter((opponentId) => (
    opponentId !== playerId && !state.players[opponentId]?.folded
  ));
}

function opponentIdentity(
  state: FairMultiwayDecisionState,
  playerId: string,
  identities: Partial<Record<string, MultiwayAiIdentity>> | undefined,
): MultiwayAiIdentity | undefined {
  return identities?.[playerId];
}

function streetRealization(street: PostflopEvContext['street']): number {
  if (street === 'river') return 1;
  if (street === 'turn') return 0.95;
  return 0.9;
}

function estimatedAllFoldProbability(
  candidate: PostflopCandidate,
  context: PostflopEvContext,
): number {
  if (candidate.action.type !== 'raise') return 0;
  const sizeFraction = clamp(candidate.potFraction ?? 0.5, 0.2, 1.5);
  const rangeResistance = context.averageOpponentRangeStrength * 0.5;
  const facingRaisePenalty = context.currentBet > context.playerStreetBet ? 0.07 : 0;
  const playersBehindPenalty = context.playersBehind * 0.025;
  const readScale = clamp(
    Math.sqrt(context.adaptation.bluffFrequencyScale * context.adaptation.pressureFrequencyScale),
    0.84,
    1.16,
  );
  const individualFold = clamp(
    (0.46 + sizeFraction * 0.13 - rangeResistance - facingRaisePenalty - playersBehindPenalty)
      * readScale,
    0.07,
    0.72,
  );
  return clamp(Math.pow(individualFold, Math.max(1, context.opponentCount)), 0.002, 0.72);
}

/**
 * Estimates immediate chip EV from range equity, price, public range strength,
 * fold equity, and tournament risk. It deliberately avoids unseen cards and
 * does not claim solver-perfect future-street play.
 */
export function estimatePostflopCandidateEv(
  candidate: PostflopCandidate,
  context: PostflopEvContext,
): PostflopCandidateEv {
  const equity = clamp(context.equity, 0, 1);
  const pot = Math.max(1, context.pot);
  let expectedValue: number;
  let foldEquity = 0;

  if (candidate.action.type === 'fold') {
    expectedValue = 0;
  } else if (candidate.action.type === 'check') {
    const realization = streetRealization(context.street)
      + (context.playersBehind === 0 ? 0.04 : -Math.min(0.12, context.playersBehind * 0.035));
    expectedValue = equity * pot * clamp(realization, 0.62, 1);
  } else if (candidate.action.type === 'call') {
    const toCall = Math.max(0, context.currentBet - context.playerStreetBet);
    const readAdjustedEquity = clamp(equity + context.adaptation.callToleranceDelta, 0, 1);
    const realization = clamp(
      streetRealization(context.street)
        + (context.playersBehind === 0 ? 0.04 : 0)
        - context.playersBehind * 0.03,
      0.58,
      1,
    );
    expectedValue = readAdjustedEquity * (pot + toCall) * realization - toCall;
    expectedValue -= toCall * context.tournamentRiskPremium * 1.4;
  } else {
    const target = candidate.action.amount ?? context.currentBet;
    const incrementalCost = Math.max(0, target - context.playerStreetBet);
    const opponentCallCost = Math.max(0, target - context.currentBet);
    const sizeFraction = clamp(candidate.potFraction ?? 0.5, 0.2, 1.5);
    foldEquity = estimatedAllFoldProbability(candidate, context);
    const conditionalCallers = clamp(
      1 + (context.opponentCount - 1) * (1 - Math.pow(foldEquity, 1 / Math.max(1, context.opponentCount))) * 0.55,
      1,
      Math.min(2.4, context.opponentCount),
    );
    const calledEquity = clamp(
      equity
        - context.adaptation.valueThresholdDelta
        - Math.max(0, context.averageOpponentRangeStrength - 0.16) * 0.16
        - Math.max(0, sizeFraction - 0.75) * 0.025,
      0.015,
      0.985,
    );
    const winProfit = pot + opponentCallCost * conditionalCallers;
    const calledEv = calledEquity * winProfit - (1 - calledEquity) * incrementalCost;
    expectedValue = foldEquity * pot + (1 - foldEquity) * calledEv;
    expectedValue -= incrementalCost * context.tournamentRiskPremium * 1.8;
  }

  const roleScale = candidate.role === 'bluff'
    ? context.adaptation.bluffFrequencyScale
    : candidate.role === 'value'
      ? context.adaptation.valueFrequencyScale
      : candidate.role === 'protection' || candidate.role === 'draw'
        ? context.adaptation.pressureFrequencyScale
        : 1;
  const heuristicPrior = (candidate.score - 0.5) * pot * 0.1
    + Math.log(Math.max(0.7, roleScale)) * pot * 0.035;
  const utility = (expectedValue + heuristicPrior) / pot;
  return { candidate, expectedValue, foldEquity, utility };
}

export function advancedPostflopCandidateEvs(
  input: AdvancedPostflopSelectionInput,
): PostflopCandidateEv[] {
  const opponentIds = liveOpponentIds(input.state, input.playerId);
  const rangeStrengths = opponentIds.map((opponentId) => inferMultiwayRangeStrength(
    input.state,
    opponentId,
    opponentIdentity(input.state, opponentId, input.identities),
  ));
  const averageOpponentRangeStrength = rangeStrengths.length === 0
    ? 0.2
    : rangeStrengths.reduce((sum, strength) => sum + strength, 0) / rangeStrengths.length;
  const player = input.state.players[input.playerId];
  if (!player) throw new Error(`Advanced postflop selection is missing ${input.playerId}.`);
  if (input.state.street === 'preflop' || input.state.street === 'complete') {
    throw new Error('Advanced postflop selection requires a live postflop street.');
  }
  const tuning = multiwayDifficultyTuning(input.difficulty);
  const context: PostflopEvContext = {
    adaptation: {
      ...input.adaptation,
      bluffFrequencyScale: input.adaptation.bluffFrequencyScale
        * input.identity.bluffFrequency
        * tuning.bluffScale,
      callToleranceDelta: input.adaptation.callToleranceDelta
        + input.identity.callTolerance
        + tuning.callTolerance,
      pressureFrequencyScale: input.adaptation.pressureFrequencyScale
        * input.identity.aggression
        * tuning.aggressionScale,
      raiseSizeScale: input.adaptation.raiseSizeScale
        * input.identity.potFraction
        * tuning.sizingScale,
      valueFrequencyScale: input.adaptation.valueFrequencyScale
        * input.identity.aggression
        * tuning.aggressionScale,
    },
    averageOpponentRangeStrength,
    currentBet: input.state.currentBet,
    equity: input.estimatedEquity,
    opponentCount: opponentIds.length,
    playerStreetBet: player.streetBet,
    playersBehind: Math.max(0, input.state.pending.indexOf(input.playerId) >= 0
      ? input.state.pending.slice(input.state.pending.indexOf(input.playerId) + 1).length
      : 0),
    pot: input.state.pot,
    street: input.state.street,
    tournamentRiskPremium: clamp(input.tournamentRiskPremium, 0, 0.08),
  };
  return input.plan.candidates
    .map((candidate) => estimatePostflopCandidateEv(candidate, context))
    .sort((left, right) => right.utility - left.utility);
}

export function selectAdvancedPostflopAction(
  input: AdvancedPostflopSelectionInput,
): PostflopCandidate {
  const candidates = advancedPostflopCandidateEvs(input);
  const best = candidates[0];
  if (!best) throw new Error('Advanced postflop selection has no candidates.');
  const temperature = input.difficulty === 'nemesis' ? 8.2 : 8;
  const familyCounts = candidates.reduce<Record<string, number>>((counts, candidate) => ({
    ...counts,
    [candidate.candidate.action.type]: (counts[candidate.candidate.action.type] ?? 0) + 1,
  }), {});
  const weights = candidates.map((candidate) => ({
    candidate,
    // Several legal bet sizes represent one strategic action family. Dividing
    // by the family count prevents four raise sizes from receiving four times
    // the aggregate probability of a single check, call, or fold candidate.
    weight: Math.exp((candidate.utility - best.utility) * temperature)
      / Math.max(1, familyCounts[candidate.candidate.action.type] ?? 1),
  }));
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  let cursor = clamp(input.mix, 0, 0.999_999) * total;
  for (const item of weights) {
    cursor -= item.weight;
    if (cursor <= 0) return item.candidate.candidate;
  }
  return weights.at(-1)!.candidate.candidate;
}
