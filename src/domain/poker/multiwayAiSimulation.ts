import type { AiDifficulty } from './aiProfiles';
import { seededRandom } from './cards';
import { decideMultiwayAiAction } from './multiwayAi';
import {
  MULTIWAY_AI_IDENTITIES,
  multiwayAiIdentityForSeat,
  type MultiwayAiIdentity,
} from './multiwayAiProfiles';
import {
  applyMultiwayAction,
  createMultiwayHand,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type TablePlayerConfig,
} from './multiway';
import type { PlayerAction } from './types';

export interface MultiwayAiSimulationMetrics {
  difficulty: AiDifficulty;
  tableSize: number;
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
  aggressionRate: number;
  bluffRate: number;
  foldRateFacingBet: number;
  identityDecisionCounts: Record<string, number>;
}

export interface MultiwayAiSimulationOptions {
  hands?: number;
  seed?: number;
  samplesPerDecision?: number;
}

function tablePlayers(count: number): TablePlayerConfig[] {
  return Array.from({ length: count }, (_, seat) => {
    const identity = multiwayAiIdentityForSeat(seat);
    return {
      id: seat === 0 ? 'hero' : `ai-${seat}`,
      name: seat === 0 ? 'You' : identity.name,
      seat,
      stack: 1_000,
      isHero: seat === 0,
    };
  });
}

function identityMap(state: MultiwayHandState): Partial<Record<string, MultiwayAiIdentity>> {
  return Object.fromEntries(state.activePlayerIds
    .filter((playerId) => playerId !== 'hero')
    .map((playerId) => {
      const player = state.players[playerId];
      if (!player) throw new Error(`Player ${playerId} is missing from the hand state.`);
      return [playerId, multiwayAiIdentityForSeat(player.seat)];
    }));
}

function scriptedHeroAction(state: MultiwayHandState, roll: number): PlayerAction {
  const legal = getMultiwayLegalActions(state, 'hero');
  if (legal.canCall) {
    if (legal.canRaise && roll < 0.12) return { type: 'raise', amount: legal.suggestedRaiseTo };
    if (legal.toCall <= state.pot * 0.55 || roll < 0.72) return { type: 'call' };
    return { type: 'fold' };
  }
  if (legal.canRaise && roll < 0.23) return { type: 'raise', amount: legal.suggestedRaiseTo };
  return { type: 'check' };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function totalChips(state: MultiwayHandState): number {
  return state.tablePlayerIds.reduce(
    (total, playerId) => total + (state.players[playerId]?.stack ?? 0),
    state.pot,
  );
}

export function simulateMultiwayAiTable(
  difficulty: AiDifficulty,
  tableSize: number,
  options: MultiwayAiSimulationOptions = {},
): MultiwayAiSimulationMetrics {
  const hands = Math.max(1, Math.round(options.hands ?? 16));
  const seed = options.seed ?? 71_419;
  const samplesPerDecision = Math.max(1, Math.round(options.samplesPerDecision ?? 28));
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
  };
  const identityDecisionCounts = Object.fromEntries(
    MULTIWAY_AI_IDENTITIES.map((identity) => [identity.id, 0]),
  );

  for (let handIndex = 0; handIndex < hands; handIndex += 1) {
    let state = createMultiwayHand({
      players: tablePlayers(tableSize),
      buttonSeat: handIndex % tableSize,
      handNumber: handIndex + 1,
      random: seededRandom(seed + handIndex * 101),
    });
    const actionRandom = seededRandom(seed + handIndex * 307 + 17);
    const identities = identityMap(state);

    for (let actionIndex = 0; actionIndex < 240 && state.street !== 'complete'; actionIndex += 1) {
      const playerId = state.toAct;
      if (!playerId) throw new Error(`Simulated hand ${handIndex + 1} has no player to act.`);
      if (playerId === 'hero') {
        state = applyMultiwayAction(state, playerId, scriptedHeroAction(state, actionRandom()));
        continue;
      }

      const player = state.players[playerId];
      if (!player) throw new Error(`Player ${playerId} is missing from simulated hand ${handIndex + 1}.`);
      const identity = identities[playerId] ?? multiwayAiIdentityForSeat(player.seat);
      const legal = getMultiwayLegalActions(state, playerId);
      const decision = decideMultiwayAiAction(state, playerId, {
        difficulty,
        identity,
        identities,
        simulations: samplesPerDecision,
        random: actionRandom,
      });
      counts.decisions += 1;
      identityDecisionCounts[identity.id] = (identityDecisionCounts[identity.id] ?? 0) + 1;
      if (legal.canCall) counts.facingBetDecisions += 1;
      if (decision.action.type === 'fold') counts.folds += 1;
      if (decision.action.type === 'call') counts.calls += 1;
      if (decision.action.type === 'check') counts.checks += 1;
      if (decision.action.type === 'raise') counts.raises += 1;
      if (decision.style === 'bluff') counts.bluffs += 1;
      if (decision.style === 'value') counts.valueRaises += 1;
      state = applyMultiwayAction(state, playerId, decision.action);
    }

    if (state.street !== 'complete') throw new Error(`Simulation did not finish hand ${handIndex + 1}.`);
    if (totalChips(state) !== tableSize * 1_000) {
      throw new Error(`Chip conservation failed in simulated hand ${handIndex + 1}.`);
    }
    counts.completedHands += 1;
    if (state.outcome?.showdown) counts.showdowns += 1;
  }

  return {
    difficulty,
    tableSize,
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
    aggressionRate: rate(counts.raises, counts.decisions),
    bluffRate: rate(counts.bluffs, counts.decisions),
    foldRateFacingBet: rate(counts.folds, counts.facingBetDecisions),
    identityDecisionCounts,
  };
}
