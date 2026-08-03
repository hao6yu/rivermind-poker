import { describe, expect, it } from 'vitest';

import { parseHandReview } from './contract';

describe('coach request fairness contract', () => {
  it('drops undeclared hidden-card and outcome fields before OpenAI can receive them', () => {
    const parsed = parseHandReview({
      heroCards: ['A♠', 'K♠'],
      board: ['Q♠', 'J♠', '2♦'],
      street: 'flop',
      actionHistory: ['You raised to 60'],
      language: 'zh-Hant',
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
      language: 'zh-Hant',
    });
    expect(JSON.stringify(parsed)).not.toMatch(/opponentCards|deck|result|potWon|Q♥|Q♦/);
  });

  it('accepts only the three supported output languages', () => {
    const base = {
      heroCards: ['A♠', 'K♠'],
      board: [],
      street: 'preflop',
      actionHistory: [],
    };
    expect(parseHandReview({ ...base, language: 'en' })?.language).toBe('en');
    expect(parseHandReview({ ...base, language: 'zh-Hans' })?.language).toBe('zh-Hans');
    expect(parseHandReview({ ...base, language: 'zh-Hant' })?.language).toBe('zh-Hant');
    expect(parseHandReview({ ...base, language: 'fr' })).toBeNull();
    expect(parseHandReview(base)?.language).toBe('en');
  });

  it('rejects an analysis contract that attempts to include opponent cards', () => {
    expect(parseHandReview({
      heroCards: ['A♠', 'K♠'],
      board: [],
      street: 'preflop',
      actionHistory: [],
      language: 'en',
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
