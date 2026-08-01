import { describe, expect, it } from 'vitest';

import {
  analyzeBoardTexture,
  analyzeCoachHand,
  buildCoachAnalysisInput,
  parseCardLabel,
  parseCoachAnalysisInput,
  type CoachAnalysisInput,
  type CoachDecisionInput,
} from '../analysis';
import { applyAction, createHand } from '../engine';
import { seededRandom } from '../cards';
import type { Card, LegalActions, Rank, Suit } from '../types';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });

function callActions(toCall: number): LegalActions {
  return {
    canFold: true,
    canCheck: false,
    canCall: true,
    canRaise: true,
    toCall,
    minRaiseTo: 100,
    maxRaiseTo: 300,
    suggestedRaiseTo: 120,
  };
}

function decision(overrides: Partial<CoachDecisionInput> = {}): CoachDecisionInput {
  return {
    action: 'call',
    amount: 25,
    street: 'turn',
    board: [card(7, 'diamonds'), card(6, 'spades'), card(2, 'hearts'), card(13, 'clubs')],
    potBefore: 125,
    currentBet: 25,
    toCall: 25,
    heroStackBefore: 200,
    opponentStackBefore: 200,
    heroStreetBetBefore: 0,
    opponentStreetBetBefore: 25,
    legalActions: callActions(25),
    ...overrides,
  };
}

function input(overrides: Partial<CoachAnalysisInput> = {}): CoachAnalysisInput {
  return {
    version: 1,
    bigBlind: 2,
    heroCards: [card(9, 'clubs'), card(8, 'clubs')],
    board: [card(7, 'diamonds'), card(6, 'spades'), card(2, 'hearts'), card(13, 'clubs')],
    decisions: [decision()],
    ...overrides,
  };
}

describe('deterministic poker coaching analysis', () => {
  it('parses ASCII and display card labels without accepting invalid cards', () => {
    expect(parseCardLabel('As')).toEqual(card(14, 'spades'));
    expect(parseCardLabel('10♥')).toEqual(card(10, 'hearts'));
    expect(parseCardLabel('td')).toEqual(card(10, 'diamonds'));
    expect(parseCardLabel('1s')).toBeNull();
  });

  it('rejects duplicate known cards and inconsistent call amounts', () => {
    const duplicate = input({
      heroCards: [card(9, 'clubs'), card(9, 'clubs')],
      decisions: [],
    });
    expect(parseCoachAnalysisInput(duplicate)).toBeNull();

    const inconsistent = input({
      decisions: [decision({ toCall: 30, legalActions: callActions(25) })],
    });
    expect(parseCoachAnalysisInput(inconsistent)).toBeNull();
  });

  it('proves a flush is impossible on a river board with only two spades', () => {
    const board = [
      card(13, 'spades'), card(12, 'hearts'), card(9, 'spades'), card(7, 'clubs'), card(2, 'diamonds'),
    ];
    const texture = analyzeBoardTexture(board);
    expect(texture.flushPossible).toBe(false);
    expect(texture.straightPossible).toBe(true);

    const analysis = analyzeCoachHand(input({
      heroCards: [card(4, 'clubs'), card(4, 'diamonds')],
      board,
      decisions: [],
    }));
    expect(analysis.opponentPossibleHandCategories).toContain('Straight');
    expect(analysis.opponentPossibleHandCategories).not.toContain('Flush');
  });

  it('counts overlapping straight and flush outs once for a combo draw', () => {
    const board = [card(7, 'hearts'), card(6, 'clubs'), card(2, 'hearts')];
    const analysis = analyzeCoachHand(input({
      heroCards: [card(9, 'hearts'), card(8, 'hearts')],
      board,
      decisions: [decision({
        street: 'flop',
        board,
        potBefore: 13.3,
        currentBet: 3.3,
        toCall: 3.3,
        amount: 3.3,
        legalActions: callActions(3.3),
      })],
    }));
    const verified = analysis.decisions[0];
    expect(verified?.draws.find((draw) => draw.type === 'straight')?.outs).toBe(8);
    expect(verified?.draws.find((draw) => draw.type === 'flush')?.outs).toBe(9);
    expect(verified?.drawCompletionOuts).toBe(15);
    expect(verified?.requiredEquityPct).toBe(19.9);
  });

  it('calculates a small turn-bet price without inventing a flush draw', () => {
    const analysis = analyzeCoachHand(input());
    const verified = analysis.decisions[0];
    expect(verified?.requiredEquityPct).toBe(16.7);
    expect(verified?.potBeforeLatestWager).toBe(100);
    expect(verified?.contestablePotBeforeCall).toBe(125);
    expect(verified?.draws.find((draw) => draw.type === 'straight')?.outs).toBe(8);
    expect(verified?.draws.some((draw) => draw.type === 'flush')).toBe(false);
  });

  it('calculates a pot-sized turn call as 33.3 percent with twelve unique draw outs', () => {
    const board = [card(13, 'hearts'), card(8, 'hearts'), card(2, 'clubs'), card(3, 'spades')];
    const analysis = analyzeCoachHand(input({
      heroCards: [card(14, 'hearts'), card(5, 'hearts')],
      board,
      decisions: [decision({
        board,
        potBefore: 160,
        currentBet: 80,
        toCall: 80,
        amount: 80,
        legalActions: callActions(80),
      })],
    }));
    const verified = analysis.decisions[0];
    expect(verified?.requiredEquityPct).toBe(33.3);
    expect(verified?.draws.find((draw) => draw.type === 'straight')?.outs).toBe(4);
    expect(verified?.draws.find((draw) => draw.type === 'flush')?.outs).toBe(9);
    expect(verified?.drawCompletionOuts).toBe(12);
    expect(verified?.chanceToHitCurrentDrawOutsNextCardPct).toBe(26.1);
  });

  it('excludes an unmatched overbet when the caller is all-in for less', () => {
    const board = [card(13, 'spades'), card(12, 'hearts'), card(9, 'spades'), card(7, 'clubs'), card(2, 'diamonds')];
    const analysis = analyzeCoachHand(input({
      heroCards: [card(4, 'clubs'), card(4, 'diamonds')],
      board,
      decisions: [decision({
        street: 'river',
        board,
        potBefore: 400,
        currentBet: 300,
        toCall: 100,
        amount: 100,
        heroStackBefore: 100,
        opponentStackBefore: 500,
        opponentStreetBetBefore: 300,
        legalActions: callActions(100),
      })],
    }));
    const verified = analysis.decisions[0];
    expect(verified?.unmatchedWagerExcluded).toBe(200);
    expect(verified?.contestablePotBeforeCall).toBe(200);
    expect(verified?.potAfterCall).toBe(300);
    expect(verified?.requiredEquityPct).toBe(33.3);
  });

  it('identifies the actual river hand without treating nearby ranks as straights', () => {
    const analysis = analyzeCoachHand(input({
      heroCards: [card(10, 'spades'), card(9, 'spades')],
      board: [
        card(8, 'clubs'), card(7, 'diamonds'), card(6, 'hearts'), card(2, 'spades'), card(13, 'diamonds'),
      ],
      decisions: [],
    }));
    expect(analysis.finalMadeHand?.category).toBe('Straight');
    expect(analysis.finalBoardTexture.flushPossible).toBe(false);
  });

  it('builds a compact review contract from a completed engine hand', () => {
    let game = createHand({ button: 'hero', random: seededRandom(30) });
    game = applyAction(game, 'hero', { type: 'call' });
    game = applyAction(game, 'villain', { type: 'check' });
    for (let street = 0; street < 3; street += 1) {
      game = applyAction(game, 'villain', { type: 'check' });
      game = applyAction(game, 'hero', { type: 'check' });
    }
    const contract = buildCoachAnalysisInput(game);
    expect(contract.decisions).toHaveLength(4);
    expect(contract.decisions[0]?.potBefore).toBe(30);
    expect(contract).not.toHaveProperty('opponentCards');
    expect(analyzeCoachHand(contract).opponentCards).toBeNull();
    expect(parseCoachAnalysisInput(contract)).not.toBeNull();
    expect(JSON.stringify(contract).length).toBeLessThan(10_000);
  });
});
