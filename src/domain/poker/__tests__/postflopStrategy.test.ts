import { describe, expect, it } from 'vitest';

import { buildPostflopPlan, selectPostflopAction } from '../postflopStrategy';
import type { Card, LegalActions } from '../types';

const board: Card[] = [
  { rank: 13, suit: 'hearts' },
  { rank: 9, suit: 'hearts' },
  { rank: 4, suit: 'clubs' },
];

const checkedToLegal: LegalActions = {
  canCall: false,
  canCheck: true,
  canFold: false,
  canRaise: true,
  maxRaiseTo: 1_000,
  minRaiseTo: 20,
  suggestedRaiseTo: 60,
  toCall: 0,
};

function input(overrides: Partial<Parameters<typeof buildPostflopPlan>[0]> = {}) {
  return {
    bigBlind: 20,
    board,
    cards: [{ rank: 13, suit: 'spades' }, { rank: 12, suit: 'clubs' }] as Card[],
    currentBet: 0,
    effectiveStack: 900,
    equity: 0.68,
    initiative: 'player' as const,
    legal: checkedToLegal,
    opponentCount: 1,
    playerStreetBet: 0,
    playersBehind: 0,
    pot: 120,
    street: 'flop' as const,
    ...overrides,
  };
}

describe('shared postflop strategy', () => {
  it('recommends a legal value size and preserves a passive alternative', () => {
    const plan = buildPostflopPlan(input());

    expect(plan.handLabel).toBe('top pair');
    expect(plan.primary.action).toMatchObject({ type: 'raise' });
    expect(plan.primary.action.amount).toBeGreaterThanOrEqual(checkedToLegal.minRaiseTo);
    expect(plan.primary.action.amount).toBeLessThanOrEqual(checkedToLegal.maxRaiseTo);
    expect(plan.alternatives.some((candidate) => candidate.action.type === 'check')).toBe(true);
    expect(plan.primary.headline).toMatch(/Bet (⅓|½|¾|pot)/);
  });

  it('uses the displayed price to prefer folding a weak river bluff-catcher', () => {
    const facingBet: LegalActions = {
      canCall: true,
      canCheck: false,
      canFold: true,
      canRaise: true,
      maxRaiseTo: 900,
      minRaiseTo: 360,
      suggestedRaiseTo: 360,
      toCall: 140,
    };
    const plan = buildPostflopPlan(input({
      board: [...board, { rank: 2, suit: 'diamonds' }, { rank: 7, suit: 'spades' }],
      cards: [{ rank: 11, suit: 'clubs' }, { rank: 10, suit: 'diamonds' }],
      currentBet: 180,
      equity: 0.16,
      legal: facingBet,
      playerStreetBet: 40,
      pot: 320,
      street: 'river',
    }));

    expect(plan.requiredEquity).toBeCloseTo(140 / 460);
    expect(plan.primary.action.type).toBe('fold');
    expect(plan.alternatives.some((candidate) => candidate.action.type === 'call')).toBe(true);
  });

  it('recognizes a combo draw and keeps semi-bluff sizes bounded', () => {
    const plan = buildPostflopPlan(input({
      board: [
        { rank: 10, suit: 'spades' },
        { rank: 9, suit: 'spades' },
        { rank: 3, suit: 'hearts' },
      ],
      cards: [{ rank: 12, suit: 'spades' }, { rank: 11, suit: 'spades' }],
      equity: 0.51,
    }));

    expect(plan.drawLabel).toContain('combo draw');
    const raises = [plan.primary, ...plan.alternatives].filter((candidate) => candidate.action.type === 'raise');
    raises.forEach((candidate) => {
      expect(candidate.action.amount).toBeGreaterThanOrEqual(checkedToLegal.minRaiseTo);
      expect(candidate.action.amount).toBeLessThanOrEqual(checkedToLegal.maxRaiseTo);
    });
  });

  it('labels a turn three-flush correctly and avoids a large blockerless top-pair bet', () => {
    const plan = buildPostflopPlan(input({
      board: [
        { rank: 8, suit: 'spades' },
        { rank: 14, suit: 'hearts' },
        { rank: 7, suit: 'spades' },
        { rank: 5, suit: 'spades' },
      ],
      cards: [{ rank: 14, suit: 'diamonds' }, { rank: 12, suit: 'diamonds' }],
      equity: 0.78,
      pot: 220,
      street: 'turn',
    }));

    expect(plan.textureLabel).toContain('three-flush');
    expect(plan.textureLabel).not.toContain('monotone');
    expect(plan.primary.action.type).toBe('check');
    expect(plan.alternatives.filter((candidate) => candidate.action.type === 'raise').every((candidate) => (
      (candidate.potFraction ?? 0) <= 0.5
    ))).toBe(true);
  });

  it('checks weak-kicker top pair on a connected multiway board with players behind', () => {
    const plan = buildPostflopPlan(input({
      board: [
        { rank: 8, suit: 'clubs' },
        { rank: 11, suit: 'spades' },
        { rank: 10, suit: 'hearts' },
      ],
      cards: [{ rank: 6, suit: 'spades' }, { rank: 11, suit: 'hearts' }],
      equity: 0.5,
      initiative: 'opponent',
      opponentCount: 2,
      playersBehind: 2,
      pot: 148,
    }));

    expect(plan.handLabel).toBe('top pair');
    expect(plan.textureLabel).toContain('connected');
    expect(plan.primary.action.type).toBe('check');
  });

  it('understands ace-low connectedness and a five-flush river label', () => {
    const wheelPlan = buildPostflopPlan(input({
      board: [
        { rank: 14, suit: 'clubs' },
        { rank: 2, suit: 'diamonds' },
        { rank: 3, suit: 'hearts' },
      ],
    }));
    const flushBoardPlan = buildPostflopPlan(input({
      board: [
        { rank: 2, suit: 'spades' },
        { rank: 5, suit: 'spades' },
        { rank: 8, suit: 'spades' },
        { rank: 11, suit: 'spades' },
        { rank: 13, suit: 'spades' },
      ],
      cards: [{ rank: 14, suit: 'hearts' }, { rank: 12, suit: 'diamonds' }],
      street: 'river',
    }));

    expect(wheelPlan.textureLabel).toContain('connected');
    expect(flushBoardPlan.textureLabel).toContain('five-flush');
  });

  it('lets difficulty influence a bounded mixed choice without creating a new action', () => {
    const plan = buildPostflopPlan(input({ equity: 0.46 }));
    const friendly = selectPostflopAction(plan, 0.5, 'friendly');
    const sharp = selectPostflopAction(plan, 0.5, 'sharp');
    const candidates = [plan.primary, ...plan.alternatives];

    expect(candidates.some((candidate) => candidate.action.type === friendly.action.type)).toBe(true);
    expect(candidates.some((candidate) => candidate.action.type === sharp.action.type)).toBe(true);
  });

  it('is unchanged when unseen opponent cards change because they are not an input', () => {
    const first = buildPostflopPlan(input());
    const second = buildPostflopPlan(input());

    expect(second).toEqual(first);
  });
});
