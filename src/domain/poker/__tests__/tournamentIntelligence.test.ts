import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { createMultiwayHand } from '../multiway';
import { buildPostflopPlan } from '../postflopStrategy';
import { buildPreflopPlan, selectPreflopAction } from '../preflopStrategy';
import { buildTournamentPressure } from '../tournamentIntelligence';
import type { Card, LegalActions } from '../types';

const cards = (high: Card['rank'], low: Card['rank'], suited = false): Card[] => [
  { rank: high, suit: 'spades' },
  { rank: low, suit: suited ? 'spades' : 'hearts' },
];

function qualificationBubble() {
  return createMultiwayHand({
    players: [
      { id: 'hero', name: 'You', seat: 0, stack: 900, isHero: true },
      { id: 'ai-1', name: 'Mara', seat: 1, stack: 1_200 },
      { id: 'ai-2', name: 'Theo', seat: 2, stack: 600 },
      { id: 'ai-3', name: 'Nova', seat: 3, stack: 300 },
      { id: 'ai-4', name: 'June', seat: 4, stack: 0 },
      { id: 'ai-5', name: 'Sol', seat: 5, stack: 0 },
    ],
    buttonSeat: 0,
    bigBlind: 20,
    smallBlind: 10,
    random: seededRandom(41_001),
  });
}

describe('tournament intelligence', () => {
  it('uses public stack rank to apply bounded qualification-bubble pressure', () => {
    const game = qualificationBubble();
    const context = { enabled: true, qualifyingPlace: 3 };
    const leader = buildTournamentPressure(game, 'ai-1', context);
    const middle = buildTournamentPressure(game, 'hero', context);
    const shortest = buildTournamentPressure(game, 'ai-3', context);

    expect(middle).toMatchObject({ bubble: true, livePlayers: 4, qualifyingPlace: 3, stackRank: 2 });
    expect(middle.riskPremium).toBeGreaterThan(leader.riskPremium);
    expect(middle.riskPremium).toBeGreaterThan(shortest.riskPremium);
    expect(JSON.stringify(middle)).not.toMatch(/holeCards|deck|board/);
  });

  it('moves a playable eight-big-blind button hand all-in and folds trash', () => {
    const playable = buildPreflopPlan({
      cards: cards(14, 11, true),
      effectiveStackBb: 8,
      facing: 'unopened',
      playerCount: 6,
      position: 'BTN',
      tournamentMode: true,
    });
    const trash = buildPreflopPlan({
      cards: cards(7, 2),
      effectiveStackBb: 8,
      facing: 'unopened',
      playerCount: 6,
      position: 'BTN',
      tournamentMode: true,
    });
    const legal: LegalActions = {
      canCall: true,
      canCheck: false,
      canFold: true,
      canRaise: true,
      maxRaiseTo: 160,
      minRaiseTo: 40,
      suggestedRaiseTo: 50,
      toCall: 20,
    };
    const action = selectPreflopAction(playable, 0, legal, {
      bigBlind: 20,
      currentBet: 20,
      facing: 'unopened',
      jamPreferred: playable.jamPreferred,
      legal,
      playerStreetBet: 0,
      position: 'BTN',
      stackBand: playable.stackBand,
    });

    expect(playable.jamPreferred).toBe(true);
    expect(action).toEqual({ type: 'raise', amount: 160 });
    expect(trash.primaryAction).toBe('fold');
  });

  it('re-shoves a premium 12 BB stack instead of using a deep-stack 3-bet size', () => {
    const plan = buildPreflopPlan({
      cards: cards(10, 10),
      effectiveStackBb: 12,
      facing: 'raised',
      playerCount: 6,
      position: 'BB',
      raiseSizeBb: 2.5,
      tournamentMode: true,
    });

    expect(plan.primaryAction).toBe('raise');
    expect(plan.jamPreferred).toBe(true);
    expect(plan.explanation).toContain('re-shove');
  });

  it('makes marginal postflop calls more conservative on a qualification bubble', () => {
    const legal: LegalActions = {
      canCall: true,
      canCheck: false,
      canFold: true,
      canRaise: false,
      maxRaiseTo: 0,
      minRaiseTo: 0,
      suggestedRaiseTo: 0,
      toCall: 60,
    };
    const base = {
      bigBlind: 20,
      board: [
        { rank: 13, suit: 'hearts' },
        { rank: 9, suit: 'clubs' },
        { rank: 4, suit: 'spades' },
        { rank: 2, suit: 'diamonds' },
      ] as Card[],
      cards: cards(10, 9),
      currentBet: 100,
      effectiveStack: 420,
      equity: 0.31,
      initiative: 'opponent' as const,
      legal,
      opponentCount: 1,
      playerStreetBet: 40,
      playersBehind: 0,
      pot: 180,
      street: 'turn' as const,
    };
    const chipEv = buildPostflopPlan(base);
    const bubble = buildPostflopPlan({ ...base, tournamentRiskPremium: 0.035 });
    const score = (plan: typeof chipEv, action: 'call' | 'fold') => (
      plan.candidates.find((candidate) => candidate.action.type === action)?.score ?? 0
    );

    expect(score(bubble, 'fold')).toBeGreaterThan(score(chipEv, 'fold'));
    expect(score(bubble, 'call')).toBeLessThan(score(chipEv, 'call'));
  });
});
