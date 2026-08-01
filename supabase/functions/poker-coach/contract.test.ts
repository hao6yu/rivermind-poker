import { describe, expect, it } from 'vitest';

import { parseHandReview } from './contract';

describe('coach request fairness contract', () => {
  it('drops undeclared hidden-card and outcome fields before OpenAI can receive them', () => {
    const parsed = parseHandReview({
      heroCards: ['A♠', 'K♠'],
      board: ['Q♠', 'J♠', '2♦'],
      street: 'flop',
      actionHistory: ['You raised to 60'],
      opponentCards: ['Q♥', 'Q♦'],
      deck: ['10♠'],
      result: 'Opponent showed Q♥ Q♦',
      potWon: 400,
    });

    expect(parsed).toEqual({
      heroCards: ['A♠', 'K♠'],
      board: ['Q♠', 'J♠', '2♦'],
      street: 'flop',
      actionHistory: ['You raised to 60'],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/opponentCards|deck|result|potWon|Q♥|Q♦/);
  });

  it('rejects an analysis contract that attempts to include opponent cards', () => {
    expect(parseHandReview({
      heroCards: ['A♠', 'K♠'],
      board: [],
      street: 'preflop',
      actionHistory: [],
      analysisInput: {
        version: 1,
        bigBlind: 20,
        heroCards: [{ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }],
        board: [],
        opponentCards: [{ rank: 2, suit: 'clubs' }, { rank: 2, suit: 'diamonds' }],
        decisions: [],
      },
    })).toBeNull();
  });
});
