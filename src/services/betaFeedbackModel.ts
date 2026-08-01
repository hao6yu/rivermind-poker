import { cardLabel } from '../domain/poker/cards';
import { handClientId } from '../domain/poker/persistence';
import type { GameState } from '../domain/poker/types';
import type { MultiwayHandState } from '../domain/poker/multiway';

export const feedbackCategories = ['gameplay', 'coach', 'ui', 'bug', 'other'] as const;

export type BetaFeedbackCategory = typeof feedbackCategories[number];

export interface AppDiagnosticEvent {
  code: string;
  occurredAt: string;
  retryable?: boolean;
  source: string;
}

export interface FeedbackHandContext {
  actions: Array<{
    amount: number;
    player: string;
    street: string;
    type: string;
  }>;
  board: string[];
  clientId: string;
  handNumber: number;
  heroCards: string[];
  opponentCards: string[];
  outcome: {
    potWon: number;
    showdown: boolean;
    winner: string;
  };
}

export function normalizeDiagnosticToken(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
  return normalized || fallback;
}

export function createFeedbackHandContext(
  game: GameState,
  sessionClientId: string,
): FeedbackHandContext | null {
  if (!game.outcome || game.street !== 'complete') return null;

  return {
    actions: game.history.map((action) => ({
      amount: action.amount,
      player: action.player,
      street: action.street,
      type: action.type,
    })),
    board: game.board.map(cardLabel),
    clientId: handClientId(sessionClientId, game.handNumber),
    handNumber: game.handNumber,
    heroCards: game.players.hero.holeCards.map(cardLabel),
    opponentCards: game.outcome.showdown
      ? game.players.villain.holeCards.map(cardLabel)
      : [],
    outcome: {
      potWon: game.outcome.potWon,
      showdown: game.outcome.showdown,
      winner: game.outcome.winner,
    },
  };
}

export function createMultiwayFeedbackHandContext(
  game: MultiwayHandState,
  sessionClientId: string,
): FeedbackHandContext | null {
  if (!game.outcome || game.street !== 'complete') return null;
  const heroWinner = game.outcome.winnerPlayerIds.includes('hero');
  return {
    actions: game.history.map((action) => ({
      amount: action.amount,
      player: action.playerId,
      street: action.street,
      type: action.type,
    })),
    board: game.board.map(cardLabel),
    clientId: handClientId(sessionClientId, game.handNumber),
    handNumber: game.handNumber,
    heroCards: game.players.hero?.holeCards.map(cardLabel) ?? [],
    opponentCards: game.outcome.showdown
      ? game.activePlayerIds.flatMap((playerId) => {
          const player = game.players[playerId];
          return playerId === 'hero' || !player || player.folded ? [] : player.holeCards.map(cardLabel);
        })
      : [],
    outcome: {
      potWon: game.outcome.totalPot,
      showdown: game.outcome.showdown,
      winner: heroWinner
        ? game.outcome.winnerPlayerIds.length > 1 ? 'tie' : 'hero'
        : 'villain',
    },
  };
}
