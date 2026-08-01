import type { GameState } from './types';

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
