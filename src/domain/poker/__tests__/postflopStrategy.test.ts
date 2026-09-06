import { describe, expect, it } from 'vitest';

import { buildPostflopPlan, selectPostflopAction } from '../postflopStrategy';
import type { PostflopPlan, PostflopStrategyInput } from '../postflopStrategy';
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

function selectedActionRate(
  plan: PostflopPlan,
  difficulty: 'club' | 'sharp',
  action: 'call' | 'check' | 'fold' | 'raise',
): number {
  const samples = 1_000;
  const selections = Array.from({ length: samples }, (_, index) => (
    selectPostflopAction(plan, (index + 0.5) / samples, difficulty).action.type
  ));
  return selections.filter((selection) => selection === action).length / samples;
}

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
  it('reduces clearly underpriced river calls as difficulty increases', () => {
    const plan = buildPostflopPlan(input({
      board: [...board, { rank: 2, suit: 'spades' }, { rank: 8, suit: 'diamonds' }],
      cards: [{ rank: 14, suit: 'clubs' }, { rank: 3, suit: 'diamonds' }],
      equity: 0.08, street: 'river', pot: 200, currentBet: 100,
      legal: { ...checkedToLegal, canCheck: false, canCall: true, canFold: true, canRaise: false, toCall: 100 },
    }));
    expect(plan.primary.action.type).toBe('fold');
    const calls = (difficulty: 'friendly' | 'club' | 'elite' | 'nemesis') => Array.from({ length: 10000 }, (_, i) =>
      selectPostflopAction(plan, (i + 0.5) / 10000, difficulty).action.type).filter((action) => action === 'call').length;
    expect(calls('club')).toBeLessThan(calls('friendly'));
    expect(calls('elite')).toBeLessThan(calls('club'));
    expect(calls('nemesis')).toBeLessThanOrEqual(calls('elite'));
  });

  it('does not apply terminal-price discipline to draws with future betting available', () => {
    const spot = input({ equity: 0.2, pot: 200, currentBet: 100,
      legal: { ...checkedToLegal, canCheck: false, canCall: true, canFold: true, toCall: 100 } });
    expect(buildPostflopPlan(spot).terminalCallDeficit).toBe(0);
    expect(buildPostflopPlan({ ...spot, effectiveStack: 100 }).terminalCallDeficit).toBeGreaterThan(0.1);
  });
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

  it('checks a locked board straight instead of treating shared cards as personal value', () => {
    const plan = buildPostflopPlan(input({
      board: [
        { rank: 10, suit: 'clubs' },
        { rank: 11, suit: 'hearts' },
        { rank: 12, suit: 'clubs' },
        { rank: 13, suit: 'hearts' },
        { rank: 14, suit: 'clubs' },
      ],
      cards: [{ rank: 3, suit: 'diamonds' }, { rank: 2, suit: 'spades' }],
      equity: 0.5,
      pot: 200,
      street: 'river',
    }));

    expect(plan.handLabel).toBe('shared straight');
    expect(plan.strength).toBe('marginal');
    expect(plan.primary.action.type).toBe('check');
    expect(plan.candidates.filter((candidate) => candidate.action.type === 'raise'))
      .not.toContainEqual(expect.objectContaining({ role: 'value' }));
    expect(selectedActionRate(plan, 'club', 'raise')).toBe(0);
    expect(selectedActionRate(plan, 'sharp', 'raise')).toBe(0);
  });

  it('folds a blockerless board flush below the price instead of raising it for value', () => {
    const plan = buildPostflopPlan(input({
      board: [
        { rank: 2, suit: 'spades' },
        { rank: 5, suit: 'spades' },
        { rank: 8, suit: 'spades' },
        { rank: 11, suit: 'spades' },
        { rank: 13, suit: 'spades' },
      ],
      cards: [{ rank: 14, suit: 'hearts' }, { rank: 12, suit: 'diamonds' }],
      currentBet: 180,
      equity: 0.18,
      legal: {
        canCall: true,
        canCheck: false,
        canFold: true,
        canRaise: true,
        maxRaiseTo: 900,
        minRaiseTo: 360,
        suggestedRaiseTo: 360,
        toCall: 140,
      },
      playerStreetBet: 40,
      pot: 320,
      street: 'river',
    }));

    expect(plan.handLabel).toBe('shared flush');
    expect(plan.primary.action.type).toBe('fold');
    expect(plan.candidates.filter((candidate) => candidate.action.type === 'raise'))
      .not.toContainEqual(expect.objectContaining({ role: 'value' }));
    expect(selectedActionRate(plan, 'club', 'raise')).toBe(0);
    expect(selectedActionRate(plan, 'sharp', 'raise')).toBe(0);
  });

  it('lets difficulty influence a bounded mixed choice without creating a new action', () => {
    const plan = buildPostflopPlan(input({ equity: 0.46 }));
    const friendly = selectPostflopAction(plan, 0.5, 'friendly');
    const sharp = selectPostflopAction(plan, 0.5, 'sharp');
    const candidates = [plan.primary, ...plan.alternatives];

    expect(candidates.some((candidate) => candidate.action.type === friendly.action.type)).toBe(true);
    expect(candidates.some((candidate) => candidate.action.type === sharp.action.type)).toBe(true);
  });

  it('normalizes multiple bet sizes as one action family when mixing', () => {
    const raiseHalf = {
      action: { type: 'raise' as const, amount: 100 },
      detail: 'Half-pot value bet.',
      headline: 'Bet half pot',
      potFraction: 0.5,
      role: 'value' as const,
      score: 0.5,
    };
    const raiseThreeQuarter = {
      ...raiseHalf,
      action: { type: 'raise' as const, amount: 150 },
      detail: 'Three-quarter-pot value bet.',
      headline: 'Bet three-quarter pot',
      potFraction: 0.75,
    };
    const check = {
      action: { type: 'check' as const },
      detail: 'Check back.',
      headline: 'Check',
      role: 'control' as const,
      score: 0.5,
    };
    const plan: PostflopPlan = {
      alternatives: [raiseThreeQuarter, check],
      bustedDrawLabel: null,
      candidates: [raiseHalf, raiseThreeQuarter, check],
      drawLabel: null,
      handLabel: 'top pair',
      primary: raiseHalf,
      requiredEquity: 0,
      stackToPotRatio: 4,
      strength: 'marginal',
      textureLabel: 'dry, unpaired board',
    };
    const raises = Array.from({ length: 100 }, (_, index) => (
      selectPostflopAction(plan, index / 100, 'club').action.type === 'raise'
    )).filter(Boolean).length;

    expect(raises).toBeGreaterThanOrEqual(49);
    expect(raises).toBeLessThanOrEqual(51);
  });

  it('lets a deceptive profile occasionally trap with a strong value hand', () => {
    const plan = buildPostflopPlan(input({
      cards: [{ rank: 14, suit: 'spades' }, { rank: 14, suit: 'hearts' }],
      board: [
        { rank: 14, suit: 'diamonds' },
        { rank: 8, suit: 'clubs' },
        { rank: 2, suit: 'spades' },
      ],
      equity: 0.94,
      legal: checkedToLegal,
    }));
    const direct = selectPostflopAction(plan, 0.05, 'club', { slowPlayFrequency: 0 });
    const deceptive = selectPostflopAction(plan, 0.05, 'club', { slowPlayFrequency: 0.2 });

    expect(direct.action.type).toBe('raise');
    expect(deceptive.action.type).toBe('check');
  });

  it('turns a pressure profile into more selective bluffs than a sticky profile', () => {
    const plan = buildPostflopPlan(input({
      cards: [{ rank: 7, suit: 'spades' }, { rank: 6, suit: 'clubs' }],
      board: [
        { rank: 14, suit: 'diamonds' },
        { rank: 9, suit: 'clubs' },
        { rank: 2, suit: 'spades' },
      ],
      equity: 0.13,
      initiative: 'none',
    }));
    const pressureRaises = Array.from({ length: 100 }, (_, index) => (
      selectPostflopAction(plan, index / 100, 'club', {
        bluffFrequencyScale: 1.38,
        pressureFrequencyScale: 1.22,
      }).action.type === 'raise'
    )).filter(Boolean).length;
    const stickyRaises = Array.from({ length: 100 }, (_, index) => (
      selectPostflopAction(plan, index / 100, 'club', {
        bluffFrequencyScale: 0.42,
        pressureFrequencyScale: 0.72,
      }).action.type === 'raise'
    )).filter(Boolean).length;

    expect(pressureRaises).toBeGreaterThan(stickyRaises);
  });

  it('bluffs busted draws on the river at a meaningful frequency', () => {
    // Hero Q♠J♠ on A♠K♠4♥ | 7♦ | 2♣ — flush draw + gutshot on the turn, bricked river.
    const riverInput: PostflopStrategyInput = {
      bigBlind: 20,
      board: [
        { rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }, { rank: 4, suit: 'hearts' },
        { rank: 7, suit: 'diamonds' }, { rank: 2, suit: 'clubs' },
      ],
      cards: [{ rank: 12, suit: 'spades' }, { rank: 11, suit: 'spades' }],
      currentBet: 0, effectiveStack: 900, equity: 0.1, initiative: 'none',
      legal: { canCall: false, canCheck: true, canFold: false, canRaise: true,
        minRaiseTo: 20, maxRaiseTo: 900, suggestedRaiseTo: 132, toCall: 0 },
      opponentCount: 1, playerStreetBet: 0, playersBehind: 0, pot: 200, street: 'river',
    };
    const plan = buildPostflopPlan(riverInput);
    expect(plan.bustedDrawLabel).toMatch(/flush/);
    const bluff = plan.candidates.find((candidate) => candidate.role === 'bluff');
    expect(bluff).toBeDefined();
    // Score close enough to check that a bluff-leaning profile actually picks it sometimes:
    let bluffPicks = 0;
    for (let mixStep = 0; mixStep < 100; mixStep += 1) {
      const selected = selectPostflopAction(plan, mixStep / 100, 'sharp', { bluffFrequencyScale: 1.3 });
      if (selected.role === 'bluff') bluffPicks += 1;
    }
    // Task 3 (Stage 1) removed the flat sharp-difficulty bluff bonus
    // (+0.22) and the sizing-pressure term from selectPostflopAction, so this
    // spot no longer inherits either boost — only the roleBoost(0.16) the
    // busted-draw path itself adds, the shared −0.04 non-Friendly bluff
    // discount, and the caller's bluffFrequencyScale remain. That drops the
    // deterministic count from 66/100 to 6/100. Still non-zero — a real,
    // if now much smaller, part of the strategy — so the bracket is
    // re-pinned around the new value rather than the old one.
    expect(bluffPicks).toBeGreaterThan(2);
    expect(bluffPicks).toBeLessThan(50);
  });

  it('bluffs busted draws less often as more opponents remain on the river', () => {
    // Hero 6♠5♠ on A♠K♠9♥ | 7♦ | 2♣ — busted flush draw + gutshot with no
    // showdown value. A river bluff has to fold out every live range, so its
    // frequency must fall as the field grows. The equity inputs per field size
    // are what the game's own range-weighted sampling measures for this spot.
    const riverSpot = (opponentCount: number, equity: number): PostflopStrategyInput => ({
      bigBlind: 20,
      board: [
        { rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }, { rank: 9, suit: 'hearts' },
        { rank: 7, suit: 'diamonds' }, { rank: 2, suit: 'clubs' },
      ],
      cards: [{ rank: 6, suit: 'spades' }, { rank: 5, suit: 'spades' }],
      currentBet: 0, effectiveStack: 900, equity, initiative: 'none',
      legal: { canCall: false, canCheck: true, canFold: false, canRaise: true,
        minRaiseTo: 20, maxRaiseTo: 900, suggestedRaiseTo: 132, toCall: 0 },
      opponentCount, playerStreetBet: 0, playersBehind: 0, pot: 200, street: 'river',
    });
    const bluffPicks = (opponentCount: number, equity: number): number => {
      const plan = buildPostflopPlan(riverSpot(opponentCount, equity));
      let picks = 0;
      for (let mixStep = 0; mixStep < 100; mixStep += 1) {
        if (selectPostflopAction(plan, mixStep / 100, 'sharp').role === 'bluff') picks += 1;
      }
      return picks;
    };
    const headsUp = bluffPicks(1, 0.05);
    const threeWay = bluffPicks(2, 0.005);
    const fourWay = bluffPicks(3, 0.001);
    // Still a real part of the heads-up strategy… (re-pinned at 4/100 after
    // Task 3, Stage 1 removed the flat sharp bluff bonus and sizing-pressure
    // term; the absolute "-10" gap this used to check no longer fits a
    // headsUp count this small, so the ordering is checked relatively.)
    expect(headsUp).toBeGreaterThan(2);
    // …but it falls once a second live range exists, and does not climb back.
    expect(threeWay).toBeLessThan(headsUp);
    expect(fourWay).toBeLessThanOrEqual(threeWay);
  });

  it('sizes bluffs like value bets on the same texture', () => {
    // Weak hand (K high), no draw (river disables draw detection), on a wet
    // three-flush + connected board: 9♠8♠7♠ carries the three-flush, 9-4
    // keeps every rank within a five-wide connected span.
    const wetBoardWeakHandInput: PostflopStrategyInput = {
      bigBlind: 20,
      board: [
        { rank: 9, suit: 'spades' }, { rank: 8, suit: 'spades' }, { rank: 7, suit: 'spades' },
        { rank: 5, suit: 'hearts' }, { rank: 4, suit: 'diamonds' },
      ],
      cards: [{ rank: 13, suit: 'diamonds' }, { rank: 3, suit: 'clubs' }],
      currentBet: 0,
      effectiveStack: 900,
      equity: 0.12,
      initiative: 'none',
      legal: checkedToLegal,
      opponentCount: 1,
      playerStreetBet: 0,
      playersBehind: 0,
      pot: 200,
      street: 'river',
    };
    const plan = buildPostflopPlan(wetBoardWeakHandInput);
    const bluff = plan.candidates.filter((candidate) => candidate.role === 'bluff');
    expect(bluff.length).toBeGreaterThan(0);
    const best = [...bluff].sort((a, b) => b.score - a.score)[0];
    expect(best?.potFraction ?? 0).toBeGreaterThan(0.6);
  });

  it('mirrors bluff sizing onto value sizing multiway and at mid wetness', () => {
    // The two texture buckets the original mirror missed: multiway pots below
    // 0.35 wetness (every value branch jumps to 0.75 on a second opponent, the
    // bluff branch did not) and the lone reachable mid-wetness value, 0.30.
    // Everything public is held fixed; only the hole cards differ, so an
    // observer who could read the size could read the range.
    const spot = (
      board: PostflopStrategyInput['board'],
      cards: PostflopStrategyInput['cards'],
      equity: number,
      opponentCount: number,
    ): PostflopStrategyInput => ({
      bigBlind: 20,
      board,
      cards,
      currentBet: 0,
      effectiveStack: 800,
      equity,
      initiative: 'none',
      legal: { ...checkedToLegal, maxRaiseTo: 800 },
      opponentCount,
      playerStreetBet: 0,
      playersBehind: 0,
      pot: 200,
      street: 'river',
    });
    const bestRaise = (input: PostflopStrategyInput) => [...buildPostflopPlan(input).candidates]
      .filter((candidate) => candidate.action.type === 'raise')
      .sort((left, right) => right.score - left.score)[0];
    const boards = {
      dry: [
        { rank: 13, suit: 'clubs' }, { rank: 8, suit: 'diamonds' }, { rank: 3, suit: 'hearts' },
        { rank: 6, suit: 'spades' }, { rank: 11, suit: 'clubs' },
      ],
      midWet: [
        { rank: 13, suit: 'clubs' }, { rank: 8, suit: 'clubs' }, { rank: 3, suit: 'clubs' },
        { rank: 6, suit: 'spades' }, { rank: 11, suit: 'diamonds' },
      ],
    } as const satisfies Record<string, PostflopStrategyInput['board']>;

    for (const [name, board] of Object.entries(boards)) {
      for (const opponentCount of [1, 2, 3]) {
        const value = bestRaise(spot(board, [
          { rank: 6, suit: 'hearts' }, { rank: 6, suit: 'diamonds' },
        ], 0.9, opponentCount));
        const bluff = bestRaise(spot(board, [
          { rank: 12, suit: 'hearts' }, { rank: 2, suit: 'diamonds' },
        ], 0.08, opponentCount));
        expect(value?.role, `${name}/${opponentCount}`).toBe('value');
        expect(bluff?.role, `${name}/${opponentCount}`).toBe('bluff');
        expect(bluff?.potFraction ?? 0, `${name}/${opponentCount}`)
          .toBeCloseTo(value?.potFraction ?? 0, 2);
      }
    }
  });

  it('is unchanged when unseen opponent cards change because they are not an input', () => {
    const first = buildPostflopPlan(input());
    const second = buildPostflopPlan(input());

    expect(second).toEqual(first);
  });

  it('gives Sharp, Elite and Nemesis no flat bluff or raise incentive over Club', () => {
    const plan = buildPostflopPlan(input({ equity: 0.18 }));
    const raises = (difficulty: 'club' | 'sharp' | 'elite' | 'nemesis') => Array.from({ length: 4_000 }, (_, i) => (
      selectPostflopAction(plan, (i + 0.5) / 4_000, difficulty).action.type === 'raise'
    )).filter(Boolean).length;
    const club = raises('club');
    for (const tier of ['sharp', 'elite', 'nemesis'] as const) {
      // Only the temperature differs now; the raise share must stay within a few percent of Club.
      expect(Math.abs(raises(tier) - club), tier).toBeLessThan(4_000 * 0.05);
    }
  });
});
