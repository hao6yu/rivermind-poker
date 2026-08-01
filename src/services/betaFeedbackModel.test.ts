import { describe, expect, it } from 'vitest';

import type { GameState } from '../domain/poker/types';
import { seededRandom } from '../domain/poker/cards';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../domain/poker/multiway';
import { createMultiwaySessionHand, decideSessionAiAction, seededMultiwayDecisionRandom } from '../domain/poker/multiwaySession';
import {
  createFeedbackHandContext,
  createMultiwayFeedbackHandContext,
  normalizeDiagnosticToken,
} from './betaFeedbackModel';

const completedHand: GameState = {
  handNumber: 3,
  button: 'hero',
  smallBlind: 10,
  bigBlind: 20,
  players: {
    hero: { id: 'hero', name: 'You', stack: 1900, holeCards: [{ rank: 14, suit: 'hearts' }, { rank: 13, suit: 'hearts' }], streetBet: 0, totalCommitted: 100, folded: false, allIn: false },
    villain: { id: 'villain', name: 'Mara', stack: 1900, holeCards: [{ rank: 12, suit: 'clubs' }, { rank: 11, suit: 'clubs' }], streetBet: 0, totalCommitted: 100, folded: true, allIn: false },
  },
  deck: [{ rank: 2, suit: 'spades' }],
  board: [{ rank: 10, suit: 'hearts' }, { rank: 8, suit: 'clubs' }, { rank: 2, suit: 'diamonds' }],
  street: 'complete',
  pot: 0,
  currentBet: 0,
  lastFullRaise: 20,
  pending: [],
  toAct: null,
  history: [],
  outcome: { winner: 'hero', message: 'You win.', potWon: 200, showdown: false },
};

function completedMultiwayHand(): MultiwayHandState {
  let game = createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, 3, seededRandom(718));
  for (let count = 0; !game.outcome && count < 120; count += 1) {
    const playerId = game.toAct;
    if (!playerId) throw new Error('Feedback fixture is missing a turn.');
    if (playerId === 'hero') {
      const legal = getMultiwayLegalActions(game, playerId);
      game = applyMultiwayAction(game, playerId, legal.canCheck ? { type: 'check' } : { type: 'call' });
    } else {
      game = applyMultiwayAction(
        game,
        playerId,
        decideSessionAiAction(game, playerId, 'club', seededMultiwayDecisionRandom(game, playerId)).action,
      );
    }
  }
  return game;
}

describe('beta feedback diagnostics', () => {
  it('sanitizes diagnostic identifiers', () => {
    expect(normalizeDiagnosticToken(' coach timeout / upstream ', 'unknown')).toBe('coach_timeout___upstream');
    expect(normalizeDiagnosticToken('   ', 'unknown')).toBe('unknown');
  });

  it('includes only cards a tester is allowed to attach', () => {
    const context = createFeedbackHandContext(completedHand, 'session_test');

    expect(context).toMatchObject({
      board: ['10♥', '8♣', '2♦'],
      clientId: 'session_test:hand:3',
      heroCards: ['A♥', 'K♥'],
      opponentCards: [],
    });
    expect(JSON.stringify(context)).not.toContain('2♠');
  });

  it('includes opponent cards only after showdown', () => {
    const showdown = {
      ...completedHand,
      outcome: { ...completedHand.outcome!, showdown: true },
    };

    expect(createFeedbackHandContext(showdown, 'session_test')?.opponentCards).toEqual(['Q♣', 'J♣']);
  });

  it('attaches multiway public actions without the undealt deck or folded cards', () => {
    const game = completedMultiwayHand();
    const context = createMultiwayFeedbackHandContext(game, 'session_multiway');

    expect(context?.clientId).toBe('session_multiway:hand:1');
    expect(context?.actions.length).toBeGreaterThan(0);
    expect(context?.heroCards).toHaveLength(2);
    expect(JSON.stringify(context)).not.toContain(JSON.stringify(game.deck));
    const expectedRevealedCards = game.outcome?.showdown
      ? game.activePlayerIds.filter((playerId) => playerId !== 'hero' && !game.players[playerId]?.folded).length * 2
      : 0;
    expect(context?.opponentCards).toHaveLength(expectedRevealedCards);
  });
});
