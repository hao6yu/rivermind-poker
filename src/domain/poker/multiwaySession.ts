import type { AiDifficulty } from './aiProfiles';
import { seededRandom } from './cards';
import {
  createMultiwayHand,
  nextButtonSeat,
  type MultiwayHandState,
  type MultiwayPlayerState,
  type TablePlayerConfig,
} from './multiway';
import { decideMultiwayAiAction, type MultiwayAiDecision } from './multiwayAi';
import {
  multiwayAiIdentityAt,
  type MultiwayAiIdentity,
} from './multiwayAiProfiles';
import type { PracticeSessionConfig } from './session';
import type { OpponentMemory } from './opponentMemory';

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

function opponentIdentity(playerId: string): MultiwayAiIdentity {
  const opponentIndex = Number(playerId.replace('ai-', '')) - 1;
  if (!Number.isInteger(opponentIndex) || opponentIndex < 0) {
    throw new Error(`Opponent ${playerId} does not have a valid RiverMind identity.`);
  }
  return multiwayAiIdentityAt(opponentIndex);
}

export function createMultiwayTablePlayers(
  playerCount: MultiwayTablePlayerCount,
  startingStack: number,
): TablePlayerConfig[] {
  if (playerCount !== 3 && playerCount !== 6) {
    throw new Error('Multiway practice supports three or six total players.');
  }
  const opponents = Array.from({ length: playerCount - 1 }, (_, index) => {
    const identity = multiwayAiIdentityAt(index);
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
): MultiwayHandState {
  const startingStack = config.startingStackBb * defaultBigBlind;
  return createMultiwayHand({
    players: createMultiwayTablePlayers(playerCount, startingStack),
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
): Partial<Record<string, MultiwayAiIdentity>> {
  return Object.fromEntries(
    state.tablePlayerIds
      .filter((playerId) => playerId !== heroId)
      .map((playerId) => [playerId, opponentIdentity(playerId)]),
  );
}

export function decideSessionAiAction(
  state: MultiwayHandState,
  playerId: string,
  difficulty: AiDifficulty,
  random: () => number = Math.random,
  opponentMemory?: OpponentMemory,
): MultiwayAiDecision {
  return decideMultiwayAiAction(state, playerId, {
    difficulty,
    identity: opponentIdentity(playerId),
    identities: multiwayIdentityMap(state),
    opponentMemory,
    random,
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

export function multiwayOutcomeMessage(state: MultiwayHandState): string {
  if (!state.outcome) return 'Hand in progress';
  const winners = state.outcome.winnerPlayerIds.map((playerId) => state.players[playerId]?.name ?? playerId);
  const heroWon = state.outcome.winnerPlayerIds.includes(heroId);
  const split = state.outcome.winnerPlayerIds.length > 1;
  if (split) return `${winners.join(' and ')} split the pot.`;
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
    return state.buttonPlayerId === heroId ? 'You have the button' : `${button} has the button`;
  }
  const actor = state.players[action.playerId]?.name ?? action.playerId;
  const heroAction = action.playerId === heroId;
  const amountBb = Math.round((action.amount / state.bigBlind) * 10) / 10;
  if (action.type === 'raise') {
    const priorAggression = state.history.slice(0, -1).some(
      (entry) => entry.street === action.street && entry.type === 'raise',
    );
    const verb = action.street !== 'preflop' && !priorAggression
      ? heroAction ? 'bet' : 'bets'
      : heroAction ? 'raise to' : 'raises to';
    return `${actor} ${verb} ${amountBb} BB`;
  }
  if (action.type === 'call') return `${actor} ${heroAction ? 'call' : 'calls'} ${amountBb} BB`;
  return `${actor} ${action.type === 'check' ? heroAction ? 'check' : 'checks' : heroAction ? 'fold' : 'folds'}`;
}

export function multiwayAiPacingMs(state: MultiwayHandState, playerId: string): number {
  const player = state.players[playerId];
  const seat = player?.seat ?? 0;
  // Keep a completed action visible long enough for a new player to follow it,
  // while avoiding a long pause at a six-player table.
  return 650 + ((state.handNumber * 47 + state.history.length * 71 + seat * 31) % 280);
}
