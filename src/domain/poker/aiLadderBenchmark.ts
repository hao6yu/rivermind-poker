import type { AiDifficulty } from './aiProfiles.ts';
import { decideAiAction } from './ai.ts';
import { seededRandom, type RandomSource } from './cards.ts';
import { applyAction, createHand } from './engine.ts';
import { createFairHeadsUpDecisionState, createFairMultiwayDecisionState } from './fairness.ts';
import { applyMultiwayAction, createMultiwayHand, type TablePlayerConfig } from './multiway.ts';
import { decideMultiwayAiAction } from './multiwayAi.ts';
import {
  MULTIWAY_AI_IDENTITIES,
  multiwayAiIdentityForName,
  type MultiwayAiIdentity,
  type MultiwayAiStyle,
} from './multiwayAiProfiles.ts';
import {
  applyOpponentObservation,
  createEmptyOpponentMemory,
  observePublicHeadsUpHand,
  type OpponentMemory,
} from './opponentMemory.ts';
import type { GameState, PlayerId } from './types.ts';

export const LADDER_SEEDS = {
  tuning: { headsUp: 777_001, sixMax: 424_242 },
  evaluation: { headsUp: 9_101_113, sixMax: 5_150_517 },
} as const;

export const DEFAULT_LADDER_PAIRS: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]> = [
  ['club', 'friendly'],
  ['sharp', 'club'],
  ['elite', 'sharp'],
  ['nemesis', 'elite'],
  ['elite', 'club'],
  ['nemesis', 'club'],
];

export interface LadderMatchupResult {
  matchup: string;
  higher: AiDifficulty;
  lower: AiDifficulty;
  hands: number;
  netBbForHigher: number;
  bbPer100: number;
  /** Half-width of the 2-standard-error band, BB per 100 hands of the higher tier. */
  plusMinusPer100: number;
  showdownPct: number;
  postflopRaiseStyles: { higher: Record<string, number>; lower: Record<string, number> };
}

export interface AdaptationRowResult {
  matchup: string;
  hands: number;
  netBbMemoryOff: number;
  netBbMemoryOn: number;
  adaptationGainBbPer100: number;
}

const STARTING_STACK = 1_000;
const SIX_MAX_SEATS = 6;
const STYLE_ORDER: readonly MultiwayAiStyle[] = ['balanced', 'patient', 'pressure', 'sticky', 'deceptive'];

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function summarize(
  matchup: string,
  higher: AiDifficulty,
  lower: AiDifficulty,
  perDeal: number[],
  handsPlayed: number,
  higherSeatHands: number,
  showdowns: number,
  styles: LadderMatchupResult['postflopRaiseStyles'],
): LadderMatchupResult {
  const n = perDeal.length;
  const total = perDeal.reduce((sum, value) => sum + value, 0);
  const mean = n === 0 ? 0 : total / n;
  const variance = n < 2 ? 0 : perDeal.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const standardError = Math.sqrt(variance / Math.max(1, n));
  const seatHandsPerDeal = higherSeatHands / Math.max(1, n);
  return {
    matchup,
    higher,
    lower,
    hands: handsPlayed,
    netBbForHigher: Math.round(total * 10) / 10,
    bbPer100: Math.round((total / Math.max(1, higherSeatHands)) * 1_000) / 10,
    plusMinusPer100: Math.round((2 * standardError / seatHandsPerDeal) * 1_000) / 10,
    showdownPct: Math.round((showdowns / Math.max(1, handsPlayed)) * 1_000) / 10,
    postflopRaiseStyles: styles,
  };
}

interface HeadsUpDealOutcome { delta: Record<PlayerId, number>; showdown: boolean; state: GameState }

function playHeadsUpDeal(
  seed: number,
  dealIndex: number,
  tiers: Record<PlayerId, AiDifficulty>,
  styles: Record<PlayerId, Record<string, number>>,
  memory: Partial<Record<PlayerId, OpponentMemory>> = {},
): HeadsUpDealOutcome {
  let state = createHand({ button: dealIndex % 2 === 0 ? 'hero' : 'villain', random: seededRandom(seed) });
  const rng: Record<PlayerId, RandomSource> = { hero: seededRandom(seed * 7 + 1), villain: seededRandom(seed * 11 + 3) };
  for (let step = 0; step < 60 && state.street !== 'complete'; step += 1) {
    const actor = state.toAct;
    if (!actor) throw new Error('A live ladder hand has no player to act.');
    const decision = decideAiAction(createFairHeadsUpDecisionState(state, actor), actor, rng[actor], tiers[actor], memory[actor]);
    if (decision.action.type === 'raise' && state.street !== 'preflop') bump(styles[actor], decision.style);
    state = applyAction(state, actor, decision.action);
  }
  if (state.street !== 'complete') throw new Error(`Ladder deal ${dealIndex} did not finish.`);
  return {
    delta: {
      hero: (state.players.hero.stack - STARTING_STACK) / state.bigBlind,
      villain: (state.players.villain.stack - STARTING_STACK) / state.bigBlind,
    },
    showdown: state.outcome?.showdown ?? false,
    state,
  };
}

/** Duplicate deals: each seeded deal is played twice with the tiers swapped. */
export function runHeadsUpLadder(
  pairs: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>,
  deals: number,
  seed: number,
): LadderMatchupResult[] {
  return pairs.map(([higher, lower]) => {
    const perDeal: number[] = [];
    let showdowns = 0;
    const higherStyles: Record<string, number> = {};
    const lowerStyles: Record<string, number> = {};
    for (let deal = 0; deal < deals; deal += 1) {
      const dealSeed = seed + deal * 131;
      const first = playHeadsUpDeal(dealSeed, deal, { hero: higher, villain: lower }, { hero: higherStyles, villain: lowerStyles });
      const second = playHeadsUpDeal(dealSeed, deal, { hero: lower, villain: higher }, { hero: lowerStyles, villain: higherStyles });
      perDeal.push(first.delta.hero + second.delta.villain);
      showdowns += Number(first.showdown) + Number(second.showdown);
    }
    return summarize(`${higher} vs ${lower}`, higher, lower, perDeal, deals * 2, deals * 2, showdowns, { higher: higherStyles, lower: lowerStyles });
  });
}

/**
 * Sequential heads-up session on identical deals, higher tier in the villain seat,
 * run twice: without memory and with memory accumulated from the lower tier's public
 * actions. The difference isolates what adaptation is worth; card luck is identical.
 */
export function runAdaptationRows(
  pairs: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>,
  hands: number,
  seed: number,
): AdaptationRowResult[] {
  return pairs.map(([higher, lower]) => {
    const play = (withMemory: boolean): number => {
      let memory = createEmptyOpponentMemory();
      let net = 0;
      const styles = { hero: {} as Record<string, number>, villain: {} as Record<string, number> };
      for (let hand = 0; hand < hands; hand += 1) {
        const outcome = playHeadsUpDeal(seed + hand * 131, hand, { hero: lower, villain: higher }, styles, withMemory ? { villain: memory } : {});
        net += outcome.delta.villain;
        if (withMemory) memory = applyOpponentObservation(memory, observePublicHeadsUpHand(outcome.state), '2026-01-01T00:00:00.000Z');
      }
      return net;
    };
    const off = play(false);
    const on = play(true);
    return {
      matchup: `${higher} vs ${lower}`,
      hands,
      netBbMemoryOff: Math.round(off * 10) / 10,
      netBbMemoryOn: Math.round(on * 10) / 10,
      adaptationGainBbPer100: Math.round(((on - off) / hands) * 1_000) / 10,
    };
  });
}

function sixMaxPlayers(): TablePlayerConfig[] {
  return Array.from({ length: SIX_MAX_SEATS }, (_, seat) => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, stack: STARTING_STACK }));
}

function identityForStyle(style: MultiwayAiStyle): MultiwayAiIdentity {
  const identity = MULTIWAY_AI_IDENTITIES.find((candidate) => candidate.style === style && candidate.level === 'club');
  if (!identity) throw new Error(`No club-level ${style} identity exists in the roster.`);
  return identity;
}

function playSixMaxDeal(
  seed: number,
  dealIndex: number,
  tiers: readonly AiDifficulty[],
  higher: AiDifficulty,
  identity: MultiwayAiIdentity,
  styles: LadderMatchupResult['postflopRaiseStyles'],
): { higherDeltaBb: number; showdown: boolean } {
  const players = sixMaxPlayers();
  const identities = Object.fromEntries(players.map((player) => [player.id, identity]));
  let state = createMultiwayHand({ players, buttonSeat: dealIndex % SIX_MAX_SEATS, random: seededRandom(seed) });
  const rng = players.map((_, seat) => seededRandom(seed * 13 + seat * 7 + 1));
  for (let step = 0; step < 240 && state.street !== 'complete'; step += 1) {
    const actor = state.toAct;
    if (!actor) throw new Error('A live ladder table has no player to act.');
    const seat = state.players[actor]?.seat;
    if (seat === undefined) throw new Error(`Seat for ${actor} is missing.`);
    const decision = decideMultiwayAiAction(createFairMultiwayDecisionState(state, actor), actor, {
      difficulty: tiers[seat], identity, identities, random: rng[seat],
    });
    if (decision.action.type === 'raise' && state.street !== 'preflop') bump(tiers[seat] === higher ? styles.higher : styles.lower, decision.style);
    state = applyMultiwayAction(state, actor, decision.action);
  }
  if (state.street !== 'complete') throw new Error(`Ladder table deal ${dealIndex} did not finish.`);
  const higherDeltaBb = players.reduce((sum, player) => (
    tiers[player.seat] === higher ? sum + ((state.players[player.id]?.stack ?? STARTING_STACK) - STARTING_STACK) / state.bigBlind : sum
  ), 0);
  return { higherDeltaBb, showdown: Boolean(state.outcome?.showdown) };
}

/** Six seats, alternating tiers, one personality in every seat, pattern flipped per deal. */
export function runSixMaxLadder(
  pairs: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>,
  deals: number,
  seed: number,
  styleName?: string,
): LadderMatchupResult[] {
  const identity = styleName
    ? identityForStyle(styleName as MultiwayAiStyle)
    : multiwayAiIdentityForName('Kai');
  if (!identity) throw new Error('The balanced benchmark identity is missing from the roster.');
  return pairs.map(([higher, lower]) => {
    const patternA = Array.from({ length: SIX_MAX_SEATS }, (_, seat) => (seat % 2 === 0 ? higher : lower));
    const patternB = Array.from({ length: SIX_MAX_SEATS }, (_, seat) => (seat % 2 === 0 ? lower : higher));
    const perDeal: number[] = [];
    let showdowns = 0;
    const styles = { higher: {} as Record<string, number>, lower: {} as Record<string, number> };
    for (let deal = 0; deal < deals; deal += 1) {
      const dealSeed = seed + deal * 211;
      const first = playSixMaxDeal(dealSeed, deal, patternA, higher, identity, styles);
      const second = playSixMaxDeal(dealSeed, deal, patternB, higher, identity, styles);
      perDeal.push(first.higherDeltaBb + second.higherDeltaBb);
      showdowns += Number(first.showdown) + Number(second.showdown);
    }
    const label = styleName ? `${higher} vs ${lower} [${styleName}]` : `${higher} vs ${lower}`;
    return summarize(label, higher, lower, perDeal, deals * 2, deals * SIX_MAX_SEATS, showdowns, styles);
  });
}

export function runSixMaxStyleRows(
  pairs: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>,
  deals: number,
  seed: number,
): LadderMatchupResult[] {
  return pairs.flatMap(([higher, lower]) => STYLE_ORDER.map((style) => runSixMaxLadder([[higher, lower]], deals, seed, style)[0]!));
}
