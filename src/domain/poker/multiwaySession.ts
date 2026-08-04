import { formatChips } from './moneyFormat';
import type { AiDifficulty } from './aiProfiles';
import { seededRandom } from './cards';
import {
  createMultiwayHand,
  getMultiwayLegalActions,
  nextButtonSeat,
  type MultiwayHandState,
  type MultiwayPlayerState,
  type TablePlayerConfig,
} from './multiway';
import { decideMultiwayAiAction, type MultiwayAiDecision } from './multiwayAi';
import {
  multiwayAiIdentityAt,
  multiwayAiIdentityForName,
  multiwayAiRoster,
  type MultiwayAiIdentity,
} from './multiwayAiProfiles';
import type { PracticeSessionConfig } from './session';
import type { OpponentMemory } from './opponentMemory';
import { createFairMultiwayDecisionState } from './fairness';
import type { TournamentDecisionContext } from './tournamentIntelligence';

export const TABLE_PLAYER_COUNT_OPTIONS = [2, 3, 6] as const;
export type TablePlayerCount = typeof TABLE_PLAYER_COUNT_OPTIONS[number];
export type MultiwayTablePlayerCount = Exclude<TablePlayerCount, 2>;

export type MultiwaySessionCompletionReason = 'target' | 'hero_bust' | 'table_winner';

export interface MultiwaySessionSummary {
  handsPlayed: number;
  heroWins: number;
  splitPots: number;
  netBb: number;
  heroStack: number;
  leaderName: string;
  leaderStack: number;
}

const heroId = 'hero';
const defaultBigBlind = 20;

function opponentIdentity(
  state: MultiwayHandState,
  playerId: string,
  difficulty: AiDifficulty = 'friendly',
): MultiwayAiIdentity {
  const opponentIndex = Number(playerId.replace('ai-', '')) - 1;
  if (!Number.isInteger(opponentIndex) || opponentIndex < 0) {
    throw new Error(`Opponent ${playerId} does not have a valid RiverMind identity.`);
  }
  const playerName = state.players[playerId]?.name;
  return playerName
    ? multiwayAiIdentityForName(playerName) ?? multiwayAiIdentityAt(opponentIndex, difficulty)
    : multiwayAiIdentityAt(opponentIndex, difficulty);
}

export function createMultiwayTablePlayers(
  playerCount: MultiwayTablePlayerCount,
  startingStack: number,
  difficulty: AiDifficulty = 'friendly',
  identityOffset = 0,
): TablePlayerConfig[] {
  if (playerCount !== 3 && playerCount !== 6) {
    throw new Error('Multiway practice supports three or six total players.');
  }
  const opponents = Array.from({ length: playerCount - 1 }, (_, index) => {
    const identity = multiwayAiIdentityAt(identityOffset + index, difficulty);
    return {
      id: `ai-${index + 1}`,
      name: identity.name,
      seat: index + 1,
      stack: startingStack,
    } satisfies TablePlayerConfig;
  });
  return [
    { id: heroId, name: 'You', seat: 0, stack: startingStack, isHero: true },
    ...opponents,
  ];
}

export function createMultiwaySessionHand(
  config: PracticeSessionConfig,
  playerCount: MultiwayTablePlayerCount,
  random: () => number = Math.random,
  difficulty: AiDifficulty = 'friendly',
): MultiwayHandState {
  const startingStack = config.startingStackBb * defaultBigBlind;
  const tableRoll = random();
  const identityOffset = Math.floor(tableRoll * multiwayAiRoster(difficulty).length);
  const players = createMultiwayTablePlayers(playerCount, startingStack, difficulty, identityOffset);
  const buttonIndex = Math.min(players.length - 1, Math.floor(tableRoll * players.length));
  return createMultiwayHand({
    players,
    buttonSeat: players[buttonIndex]?.seat,
    bigBlind: defaultBigBlind,
    smallBlind: defaultBigBlind / 2,
    random,
  });
}

export function createNextMultiwaySessionHand(
  state: MultiwayHandState,
  random: () => number = Math.random,
): MultiwayHandState {
  if (!state.outcome) throw new Error('Finish the current hand before dealing the next one.');
  const players = state.tablePlayerIds.map((playerId) => {
    const player = state.players[playerId];
    if (!player) throw new Error(`Player ${playerId} is missing from the completed hand.`);
    return {
      id: player.id,
      name: player.name,
      seat: player.seat,
      stack: player.stack,
      isHero: player.isHero,
    } satisfies TablePlayerConfig;
  });
  const livePlayers = players.filter((player) => player.stack > 0);
  if (livePlayers.length < 2) throw new Error('The table has a winner and cannot deal another hand.');
  return createMultiwayHand({
    players,
    handNumber: state.handNumber + 1,
    buttonSeat: nextButtonSeat(players, state.buttonSeat),
    bigBlind: state.bigBlind,
    smallBlind: state.smallBlind,
    random,
  });
}

export function multiwayIdentityMap(
  state: MultiwayHandState,
  difficulty: AiDifficulty = 'friendly',
): Partial<Record<string, MultiwayAiIdentity>> {
  return Object.fromEntries(
    state.tablePlayerIds
      .filter((playerId) => playerId !== heroId)
      .map((playerId) => [playerId, opponentIdentity(state, playerId, difficulty)]),
  );
}

export function decideSessionAiAction(
  state: MultiwayHandState,
  playerId: string,
  difficulty: AiDifficulty,
  random: () => number = Math.random,
  opponentMemory?: OpponentMemory,
  tournament?: TournamentDecisionContext,
  simulations?: number,
): MultiwayAiDecision {
  return decideMultiwayAiAction(createFairMultiwayDecisionState(state, playerId), playerId, {
    difficulty,
    identity: opponentIdentity(state, playerId, difficulty),
    identities: multiwayIdentityMap(state, difficulty),
    opponentMemory,
    random,
    simulations,
    tournament,
  });
}

export function seededMultiwayDecisionRandom(state: MultiwayHandState, playerId: string): () => number {
  const player = state.players[playerId];
  const playerSeed = player?.seat ?? 0;
  return seededRandom(
    state.handNumber * 1_000_003
      + state.history.length * 9_973
      + state.board.length * 397
      + playerSeed * 53,
  );
}

export function multiwaySessionCompletionReason(
  state: MultiwayHandState,
  config: PracticeSessionConfig,
): MultiwaySessionCompletionReason | null {
  if (!state.outcome) return null;
  const hero = state.players[heroId];
  if (!hero || hero.stack < state.bigBlind) return 'hero_bust';
  const livePlayers = state.tablePlayerIds.filter((playerId) => (state.players[playerId]?.stack ?? 0) > 0);
  if (livePlayers.length < 2) return 'table_winner';
  if (config.handTarget !== 'open' && state.handNumber >= config.handTarget) return 'target';
  return null;
}

export function multiwayPlayerAward(state: MultiwayHandState, playerId: string): number {
  return state.outcome?.awards.reduce(
    (total, award) => total + (award.shares[playerId] ?? 0),
    0,
  ) ?? 0;
}

/** A walk occurs when every other live player folds preflop to the big blind. */
export function multiwayIsWalk(state: MultiwayHandState): boolean {
  const winnerId = state.outcome?.winnerPlayerIds.length === 1
    ? state.outcome.winnerPlayerIds[0]
    : null;
  return Boolean(
    winnerId
      && !state.outcome?.showdown
      && winnerId === state.bigBlindPlayerId
      && state.history.length > 0
      && state.history.every((action) => action.street === 'preflop' && action.type === 'fold')
      && state.history.every((action) => action.playerId !== winnerId),
  );
}

export function multiwayOutcomeMessage(state: MultiwayHandState): string {
  if (!state.outcome) return 'Hand in progress';
  const winners = state.outcome.winnerPlayerIds.map((playerId) => state.players[playerId]?.name ?? playerId);
  const heroWon = state.outcome.winnerPlayerIds.includes(heroId);
  const split = state.outcome.winnerPlayerIds.length > 1;
  if (split) return `${winners.join(' and ')} split the pot.`;
  if (multiwayIsWalk(state)) {
    const opponentCount = state.history.length;
    const subject = opponentCount === 1 ? 'The other player folds' : `All ${opponentCount} opponents fold`;
    return heroWon
      ? `${subject} before the flop. As the big blind, you win the blinds without acting.`
      : `${subject} before the flop. ${winners[0] ?? 'The big blind'} wins the blinds without acting.`;
  }
  if (heroWon) {
    const hand = state.outcome.handDescriptions?.[heroId];
    return hand ? `You win with ${hand}.` : 'Everyone folds. You take the pot.';
  }
  const winner = winners[0] ?? 'An opponent';
  const winnerId = state.outcome.winnerPlayerIds[0];
  const hand = winnerId ? state.outcome.handDescriptions?.[winnerId] : undefined;
  return hand ? `${winner} wins with ${hand}.` : `${winner} takes the pot.`;
}

export function summarizeMultiwaySession(
  games: readonly MultiwayHandState[],
  config: PracticeSessionConfig,
  bigBlind: number,
): MultiwaySessionSummary {
  const completed = games.filter((game) => Boolean(game.outcome));
  const latest = completed.at(-1);
  const startingStack = config.startingStackBb * bigBlind;
  const heroStack = latest?.players[heroId]?.stack ?? startingStack;
  const finalPlayers = latest?.tablePlayerIds.map((playerId) => latest.players[playerId]).filter(
    (player): player is MultiwayPlayerState => Boolean(player),
  ) ?? [];
  const leader = [...finalPlayers].sort((left, right) => right.stack - left.stack || left.seat - right.seat)[0];
  return {
    handsPlayed: completed.length,
    heroWins: completed.filter((game) => game.outcome?.winnerPlayerIds.includes(heroId)).length,
    splitPots: completed.filter((game) => (game.outcome?.winnerPlayerIds.length ?? 0) > 1).length,
    netBb: Math.round(((heroStack - startingStack) / bigBlind) * 10) / 10,
    heroStack,
    leaderName: leader?.name ?? 'You',
    leaderStack: leader?.stack ?? heroStack,
  };
}

export function multiwayLatestActionLabel(state: MultiwayHandState): string {
  const action = state.history.at(-1);
  if (!action) {
    const button = state.players[state.buttonPlayerId]?.name ?? 'Player';
    const dealer = state.buttonPlayerId === heroId ? 'You' : button;
    const smallBlind = state.smallBlindPlayerId === heroId
      ? 'You'
      : state.players[state.smallBlindPlayerId]?.name ?? 'Player';
    const bigBlind = state.bigBlindPlayerId === heroId
      ? 'You'
      : state.players[state.bigBlindPlayerId]?.name ?? 'Player';
    return `D ${dealer} · SB ${smallBlind} · BB ${bigBlind}`;
  }
  const actor = state.players[action.playerId]?.name ?? action.playerId;
  const heroAction = action.playerId === heroId;
  const amount = formatChips(action.amount);
  if (action.type === 'raise') {
    const priorAggression = state.history.slice(0, -1).some(
      (entry) => entry.street === action.street && entry.type === 'raise',
    );
    const verb = action.street !== 'preflop' && !priorAggression
      ? heroAction ? 'bet' : 'bets'
      : heroAction ? 'raise to' : 'raises to';
    return `${actor} ${verb} ${amount}`;
  }
  if (action.type === 'call') return `${actor} ${heroAction ? 'call' : 'calls'} ${amount}`;
  return `${actor} ${action.type === 'check' ? heroAction ? 'check' : 'checks' : heroAction ? 'fold' : 'folds'}`;
}

/** How long a player wants to sit with each opponent action before the next one. */
export type TablePace = 'brisk' | 'normal' | 'relaxed';

const PACE_SCALE: Record<TablePace, number> = { brisk: 0.55, normal: 1, relaxed: 1.45 };

/**
 * The delay before a seat acts, which is also how long the previous action
 * stays on screen — so this is what makes a table readable. Folds move quickly,
 * a live bet buys more room, and later streets get more still.
 *
 * `pace` scales the whole curve rather than replacing it, so the relative
 * weighting survives whichever speed a player picks; brisk keeps a floor so
 * even the fastest setting cannot snap through an action unseen.
 */
export function multiwayAiPacingMs(
  state: MultiwayHandState,
  playerId: string,
  pace: TablePace = 'normal',
): number {
  const player = state.players[playerId];
  const seat = player?.seat ?? 0;
  const legal = getMultiwayLegalActions(state, playerId);
  const variation = (state.handNumber * 47 + state.history.length * 71 + seat * 31) % 220;
  const base = state.street === 'preflop'
    ? state.currentBet <= state.bigBlind ? 420 + variation : 680 + variation
    : (legal.toCall > 0 ? 760 : 560)
      + (state.street === 'river' ? 180 : state.street === 'turn' ? 100 : 0)
      + variation;
  return Math.max(200, Math.round(base * PACE_SCALE[pace]));
}
