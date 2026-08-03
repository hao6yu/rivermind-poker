import type { AiDifficulty } from './aiProfiles';
import { seededRandom } from './cards';
import {
  championshipOpponentDifficulty,
  championshipQualifies,
  type ChampionshipEvent,
  type ChampionshipEventId,
} from './championship';
import { createFairMultiwayDecisionState } from './fairness';
import { evaluateBest } from './evaluator';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from './multiway';
import { decideMultiwayAiAction } from './multiwayAi';
import { multiwayAiIdentityAt, multiwayDifficultyTuning } from './multiwayAiProfiles';
import { multiwayIdentityMap } from './multiwaySession';
import {
  applyOpponentObservation,
  createEmptyOpponentMemory,
  observePublicMultiwayHand,
  type OpponentMemory,
} from './opponentMemory';
import {
  createNextSitAndGoHand,
  createSitAndGo,
  sitAndGoCompletion,
  sitAndGoHeroPlace,
} from './tournament';

export interface ChampionshipSimulationOptions {
  heroDifficulty?: AiDifficulty;
  heroStrategy?: ChampionshipHeroStrategy;
  maxHands?: number;
  samplesPerDecision?: number;
  seed?: number;
}

export type ChampionshipHeroStrategy =
  | 'ai'
  | 'periodic_stealer'
  | 'tag'
  | 'calling_station'
  | 'maniac'
  | 'shove_bot';

export interface ChampionshipSimulationResult {
  decisions: number;
  decisionsByDifficulty: Record<AiDifficulty, number>;
  eventId: ChampionshipEventId;
  handsPlayed: number;
  heroPreflopRaises: number;
  heroStrategy: ChampionshipHeroStrategy;
  heroUncontestedWins: number;
  place: number;
  qualified: boolean;
  won: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function emptyDecisionCounts(): Record<AiDifficulty, number> {
  return { friendly: 0, club: 0, sharp: 0, elite: 0, nemesis: 0 };
}

function opponentIdentityIndex(playerId: string): number {
  const index = Number(playerId.replace('ai-', '')) - 1;
  if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid simulated opponent ${playerId}.`);
  return index;
}

function simulationDifficulty(
  event: ChampionshipEvent,
  playerId: string,
  heroDifficulty: AiDifficulty,
): AiDifficulty {
  return playerId === 'hero'
    ? heroDifficulty
    : championshipOpponentDifficulty(event, playerId);
}

function scriptedPreflopStrength(state: MultiwayHandState): number {
  const cards = state.players.hero?.holeCards ?? [];
  const first = cards[0];
  const second = cards[1];
  if (!first || !second) throw new Error('Scripted Championship hero has no hole cards.');
  const high = Math.max(first.rank, second.rank);
  const low = Math.min(first.rank, second.rank);
  if (high === low) return clamp(0.58 + high / 32, 0, 1);
  const suited = first.suit === second.suit ? 0.07 : 0;
  const connected = high - low === 1 ? 0.055 : high - low === 2 ? 0.025 : 0;
  const broadway = high >= 11 && low >= 10 ? 0.09 : 0;
  return clamp((high + low) / 32 + suited + connected + broadway - 0.2, 0, 1);
}

function legalRaise(state: MultiwayHandState, fraction = 0.6, allIn = false) {
  const legal = getMultiwayLegalActions(state, 'hero');
  const target = allIn
    ? legal.maxRaiseTo
    : state.street === 'preflop' && state.currentBet <= state.bigBlind
      ? Math.round(state.bigBlind * 2.5)
      : state.currentBet === 0
        ? Math.round(state.pot * fraction)
        : Math.round(state.currentBet + state.pot * fraction);
  return {
    type: 'raise' as const,
    amount: clamp(target, legal.minRaiseTo, legal.maxRaiseTo),
  };
}

function tagHeroAction(state: MultiwayHandState, random: () => number) {
  const legal = getMultiwayLegalActions(state, 'hero');
  if (state.street === 'preflop') {
    const strength = scriptedPreflopStrength(state);
    const facingRaise = state.currentBet > state.bigBlind;
    if (legal.canRaise && strength >= (facingRaise ? 0.78 : 0.59)) {
      return legalRaise(state, strength >= 0.9 ? 0.8 : 0.55);
    }
    if (legal.canCall && (strength >= (facingRaise ? 0.57 : 0.45)
      || (legal.toCall <= state.bigBlind && random() < 0.18))) return { type: 'call' as const };
    return legal.canCheck ? { type: 'check' as const } : { type: 'fold' as const };
  }
  const heroCards = state.players.hero?.holeCards ?? [];
  const madeHand = evaluateBest([...heroCards, ...state.board]);
  if (legal.canCall) {
    const cheap = legal.toCall <= state.pot * 0.32;
    if (madeHand.category >= 2 || (madeHand.category === 1 && cheap) || (cheap && random() < 0.18)) {
      if (legal.canRaise && madeHand.category >= 3 && random() < 0.65) return legalRaise(state, 0.7);
      return { type: 'call' as const };
    }
    return { type: 'fold' as const };
  }
  if (legal.canRaise && (madeHand.category >= 2 || (madeHand.category === 1 && random() < 0.28))) {
    return legalRaise(state, madeHand.category >= 3 ? 0.75 : 0.42);
  }
  return { type: 'check' as const };
}

function scriptedHeroAction(
  state: MultiwayHandState,
  strategy: Exclude<ChampionshipHeroStrategy, 'ai'>,
  random: () => number,
) {
  const legal = getMultiwayLegalActions(state, 'hero');
  if (strategy === 'periodic_stealer') {
    const unopened = state.street === 'preflop'
      && state.currentBet <= state.bigBlind
      && !state.history.some((action) => action.street === 'preflop' && action.type === 'raise');
    if (unopened && state.handNumber % 3 === 0 && legal.canRaise) return legalRaise(state, 0.5);
    return tagHeroAction(state, random);
  }
  if (strategy === 'tag') return tagHeroAction(state, random);
  if (strategy === 'calling_station') {
    if (state.street === 'preflop' && legal.canRaise && scriptedPreflopStrength(state) >= 0.88) {
      return legalRaise(state, 0.55);
    }
    if (legal.canCall) {
      const heroCards = state.players.hero?.holeCards ?? [];
      const madeCategory = state.street === 'preflop' ? 0 : evaluateBest([...heroCards, ...state.board]).category;
      if (legal.toCall <= state.pot * 0.85 || madeCategory >= 1) return { type: 'call' as const };
      return { type: 'fold' as const };
    }
    return { type: 'check' as const };
  }
  if (strategy === 'maniac') {
    if (legal.canRaise && random() < 0.68) return legalRaise(state, random() < 0.18 ? 1 : 0.72);
    if (legal.canCall) return { type: 'call' as const };
    return { type: 'check' as const };
  }
  const shoveCandidate = state.street === 'preflop'
    && legal.canRaise
    && (scriptedPreflopStrength(state) >= 0.62 || random() < 0.2);
  if (shoveCandidate) return legalRaise(state, 1, true);
  if (legal.canCall && legal.toCall <= state.bigBlind * 2) return { type: 'call' as const };
  return legal.canCheck ? { type: 'check' as const } : { type: 'fold' as const };
}

function playSimulationHand(
  initial: MultiwayHandState,
  event: ChampionshipEvent,
  heroDifficulty: AiDifficulty,
  seed: number,
  samplesPerDecision: number,
  heroStrategy: ChampionshipHeroStrategy,
  decisionsByDifficulty: Record<AiDifficulty, number>,
  opponentMemory: OpponentMemory,
): { decisions: number; heroPreflopRaises: number; state: MultiwayHandState } {
  let state = initial;
  let decisions = 0;
  let heroPreflopRaises = 0;
  for (let guard = 0; state.street !== 'complete' && guard < 320; guard += 1) {
    const playerId = state.toAct;
    if (!playerId) throw new Error(`Championship simulation ${event.id} has no player to act.`);
    const player = state.players[playerId];
    if (!player) throw new Error(`Championship simulation is missing ${playerId}.`);
    const difficulty = simulationDifficulty(event, playerId, heroDifficulty);
    const invitationDepthScale = event.invitational && playerId !== 'hero' ? 1.5 : 1;
    const precisionScale = multiwayDifficultyTuning(difficulty).equitySamples
      / multiwayDifficultyTuning('sharp').equitySamples
      * invitationDepthScale;
    const identity = playerId === 'hero'
      ? multiwayAiIdentityAt((seed + state.handNumber) % 5)
      : multiwayAiIdentityAt(opponentIdentityIndex(playerId));
    const decisionRandom = seededRandom(
      seed
        + state.handNumber * 1_000_003
        + state.history.length * 9_973
        + player.seat * 397,
    );
    const action = playerId === 'hero' && heroStrategy !== 'ai'
      ? scriptedHeroAction(state, heroStrategy, decisionRandom)
      : decideMultiwayAiAction(
        createFairMultiwayDecisionState(state, playerId),
        playerId,
        {
          difficulty,
          identities: multiwayIdentityMap(state),
          identity,
          opponentMemory,
          random: decisionRandom,
          simulations: Math.max(1, Math.round(samplesPerDecision * precisionScale)),
          tournament: { enabled: true, qualifyingPlace: event.qualifyingPlace },
        },
      ).action;
    decisions += 1;
    if (playerId !== 'hero' || heroStrategy === 'ai') decisionsByDifficulty[difficulty] += 1;
    if (playerId === 'hero' && state.street === 'preflop' && action.type === 'raise') heroPreflopRaises += 1;
    state = applyMultiwayAction(state, playerId, action);
  }
  if (state.street !== 'complete') {
    throw new Error(`Championship simulation ${event.id} exceeded the action guard.`);
  }
  return { decisions, heroPreflopRaises, state };
}

/**
 * Runs the production tournament engine with every seat controlled by a
 * deterministic AI. A Sharp hero is a useful repeatable proxy for a competent
 * aggressive tester; it is not intended to model a precise human skill level.
 */
export function simulateChampionshipTournament(
  event: ChampionshipEvent,
  options: ChampionshipSimulationOptions = {},
): ChampionshipSimulationResult {
  const seed = options.seed ?? 170_041;
  const samplesPerDecision = Math.max(1, Math.round(options.samplesPerDecision ?? 24));
  const maxHands = Math.max(1, Math.round(options.maxHands ?? 240));
  const heroDifficulty = options.heroDifficulty ?? 'sharp';
  const heroStrategy = options.heroStrategy ?? 'ai';
  const decisionsByDifficulty = emptyDecisionCounts();
  let decisions = 0;
  let heroPreflopRaises = 0;
  let heroUncontestedWins = 0;
  let opponentMemory = createEmptyOpponentMemory();
  let state = createSitAndGo(seededRandom(seed), event.playerCount, event.structureId);

  for (let handGuard = 0; handGuard < maxHands; handGuard += 1) {
    const played = playSimulationHand(
      state,
      event,
      heroDifficulty,
      seed,
      samplesPerDecision,
      heroStrategy,
      decisionsByDifficulty,
      opponentMemory,
    );
    decisions += played.decisions;
    heroPreflopRaises += played.heroPreflopRaises;
    state = played.state;
    opponentMemory = applyOpponentObservation(
      opponentMemory,
      observePublicMultiwayHand(state),
      `simulation-hand-${state.handNumber}`,
    );
    if (!state.outcome?.showdown && state.outcome?.winnerPlayerIds.includes('hero')) {
      heroUncontestedWins += 1;
    }
    if (sitAndGoCompletion(state)) {
      const place = sitAndGoHeroPlace(state);
      if (!place) throw new Error(`Championship simulation ${event.id} completed without a place.`);
      return {
        decisions,
        decisionsByDifficulty,
        eventId: event.id,
        handsPlayed: state.handNumber,
        heroPreflopRaises,
        heroStrategy,
        heroUncontestedWins,
        place,
        qualified: championshipQualifies(event, place),
        won: place === 1,
      };
    }
    state = createNextSitAndGoHand(
      state,
      seededRandom(seed + state.handNumber * 104_729),
      event.structureId,
    );
  }
  throw new Error(`Championship simulation ${event.id} exceeded ${maxHands} hands.`);
}

export function simulateChampionshipCorpus(
  event: ChampionshipEvent,
  runs: number,
  options: ChampionshipSimulationOptions = {},
): ChampionshipSimulationResult[] {
  const count = Math.max(1, Math.round(runs));
  const baseSeed = options.seed ?? 270_059;
  return Array.from({ length: count }, (_, index) => simulateChampionshipTournament(event, {
    ...options,
    seed: baseSeed + index * 65_537,
  }));
}
