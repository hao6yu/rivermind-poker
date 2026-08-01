import type { GameState } from './types';
import type { MultiwayHandState } from './multiway';

export function createPersistenceClientId(prefix: 'session' | 'hand'): string {
  const time = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 12);
  return `${prefix}_${time}_${entropy}`;
}

export function handClientId(sessionClientId: string, handNumber: number): string {
  return `${sessionClientId}:hand:${handNumber}`;
}

export function redactGameForPersistence(game: GameState): GameState {
  if (game.street !== 'complete' || !game.outcome) {
    throw new Error('Only completed hands can be persisted.');
  }
  const revealOpponent = game.outcome.showdown;
  return {
    ...game,
    players: {
      hero: {
        ...game.players.hero,
        holeCards: [...game.players.hero.holeCards],
      },
      villain: {
        ...game.players.villain,
        holeCards: revealOpponent ? [...game.players.villain.holeCards] : [],
      },
    },
    deck: [],
    board: [...game.board],
    pending: [],
    toAct: null,
    history: game.history.map((entry) => ({
      ...entry,
      decisionContext: {
        ...entry.decisionContext,
        board: [...entry.decisionContext.board],
        legalActions: { ...entry.decisionContext.legalActions },
      },
    })),
    outcome: { ...game.outcome },
  };
}

export function redactMultiwayGameForPersistence(game: MultiwayHandState): MultiwayHandState {
  if (game.street !== 'complete' || !game.outcome) {
    throw new Error('Only completed multiway hands can be persisted.');
  }
  const players = Object.fromEntries(game.tablePlayerIds.map((playerId) => {
    const player = game.players[playerId];
    if (!player) throw new Error(`Player ${playerId} is missing from the completed hand.`);
    const revealCards = player.isHero || (game.outcome?.showdown && !player.folded);
    return [playerId, {
      ...player,
      holeCards: revealCards ? [...player.holeCards] : [],
    }];
  }));
  return {
    ...game,
    players,
    deck: [],
    board: [...game.board],
    pending: [],
    toAct: null,
    tablePlayerIds: [...game.tablePlayerIds],
    activePlayerIds: [...game.activePlayerIds],
    dealOrder: [...game.dealOrder],
    preflopActionOrder: [...game.preflopActionOrder],
    postflopActionOrder: [...game.postflopActionOrder],
    actedAtBet: { ...game.actedAtBet },
    history: game.history.map((entry) => ({ ...entry })),
    outcome: {
      ...game.outcome,
      awards: game.outcome.awards.map((award) => ({
        ...award,
        eligiblePlayerIds: [...award.eligiblePlayerIds],
        winnerPlayerIds: [...award.winnerPlayerIds],
        shares: { ...award.shares },
      })),
      handDescriptions: game.outcome.handDescriptions ? { ...game.outcome.handDescriptions } : undefined,
      winnerPlayerIds: [...game.outcome.winnerPlayerIds],
    },
  };
}
