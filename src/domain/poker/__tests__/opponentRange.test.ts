import { describe, expect, it } from 'vitest';
import {
  COMBOS,
  COMBO_COUNT,
  applyPostflopActions,
  applyPreflopActions,
  classifyCombo,
  comboShare,
  continuingRange,
  createBoardClassifier,
  createRangeSampler,
  foldShare,
  memoryShifts,
  responseTable,
  sizeBucketFor,
  strongShare,
  uniformRange,
  type RangeModelProfile,
} from '../opponentRange';
import { applyOpponentObservation, createEmptyOpponentMemory } from '../opponentMemory';
import { classifyPreflopHand } from '../preflopStrategy';
import { seededRandom } from '../cards';
import type { Card } from '../types';

export const club: RangeModelProfile = {
  archetype: 'balanced', tier: 'club', bluffAllowance: 1, narrowingStrength: 1, memoryStrength: 0,
};

export function isClass(keys: readonly string[]): (combo: readonly [Card, Card]) => boolean {
  const set = new Set(keys);
  return (combo) => set.has(classifyPreflopHand(combo).key);
}

const open = { type: 'raise' as const, facing: 'unopened' as const, raiseCount: 0, callersAfterRaise: 0, limperCount: 0, canCheck: false };
const spotCo = { position: 'CO' as const, playerCount: 6, effectiveStackBb: 100 };

describe('opponent range: combos and blockers', () => {
  it('enumerates 1,326 distinct unordered combos', () => {
    expect(COMBOS.length).toBe(COMBO_COUNT);
    expect(new Set(COMBOS.map(([a, b]) => `${a.rank}${a.suit}|${b.rank}${b.suit}`)).size).toBe(COMBO_COUNT);
  });

  it('gives blocked combos zero weight and everything else equal weight', () => {
    const range = uniformRange([{ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }]);
    COMBOS.forEach(([a, b], index) => {
      const blocked = [a, b].some((c) => c.suit === 'spades' && (c.rank === 14 || c.rank === 13));
      expect(range.weights[index]).toBe(blocked ? 0 : 1);
    });
    expect(range.total).toBeCloseTo(COMBO_COUNT - 101, 6);
  });
});

describe('opponent range: preflop weights from the authored tables', () => {
  it('weights a button opener by the RFI raise leg, so AA dominates 72o but junk is never zero', () => {
    const range = applyPreflopActions(uniformRange([]), [open], { ...spotCo, position: 'BTN' }, club);
    expect(comboShare(range, isClass(['AA']))).toBeGreaterThan(comboShare(range, isClass(['72o'])) * 20);
    expect(comboShare(range, isClass(['72o']))).toBeGreaterThan(0);
  });

  it('weights a big-blind caller by the defense call leg, not the raise leg', () => {
    const range = applyPreflopActions(uniformRange([]), [
      { type: 'call', facing: 'raised', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'BTN', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BB', playerCount: 6, effectiveStackBb: 100 }, club);
    expect(comboShare(range, isClass(['AA']))).toBeLessThan(comboShare(range, isClass(['87s'])));
  });

  it('compounds repeated raises: an open then a 4-bet is far tighter than an open alone', () => {
    const opened = applyPreflopActions(uniformRange([]), [open], spotCo, club);
    const fourBet = applyPreflopActions(opened, [
      { type: 'raise', facing: 'raised', raiseCount: 2, raiseSizeBb: 9, raiserPosition: 'BTN', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], spotCo, club);
    const premium = isClass(['AA', 'KK', 'QQ', 'AKs', 'AKo']);
    expect(comboShare(fourBet, premium)).toBeGreaterThan(comboShare(opened, premium) * 2);
  });

  it('leaves a big blind that only checked at uniform weights', () => {
    const range = applyPreflopActions(uniformRange([]), [{ ...open, type: 'check', canCheck: true }], { ...spotCo, position: 'BB' }, club);
    expect(comboShare(range, isClass(['AA']))).toBeCloseTo(6 / COMBO_COUNT, 6);
  });

  it('models a patient archetype tighter than a pressure archetype on the same open', () => {
    const patient = applyPreflopActions(uniformRange([]), [open], spotCo, { ...club, archetype: 'patient' });
    const pressure = applyPreflopActions(uniformRange([]), [open], spotCo, { ...club, archetype: 'pressure' });
    // Probe hand swapped from the brief's 'T8s': the authored CO RFI table (preflopRanges.ts)
    // groups T8s into the top, non-wide row (raise: 0.95, no `wide` flag) alongside AA-22, so
    // buildPreflopPlan's "never fold" restoration (preflopStrategy.ts ~500-515) snaps any
    // archetype tightening on that row straight back to the authored 0.95 raise share. T8s's
    // absolute weight barely moves, so its *share* of a patient range that shrinks everywhere
    // else actually comes out higher than its share of a pressure range that widens everywhere
    // else -- the opposite of what this test means to check. 97s sits in CO's genuinely `wide`
    // RFI row (raise: 0.5), where archetype wideScale actually applies, and confirms patient <
    // pressure as intended.
    expect(comboShare(patient, isClass(['97s']))).toBeLessThan(comboShare(pressure, isClass(['97s'])));
  });
});

describe('opponent range: memory shifts', () => {
  function memoryOf(hands: number, actions: Parameters<typeof applyOpponentObservation>[1]['actions']) {
    let memory = createEmptyOpponentMemory();
    for (let hand = 0; hand < hands; hand += 1) memory = applyOpponentObservation(memory, { actions, position: 'late' }, '2026-01-01T00:00:00.000Z');
    return memory;
  }

  it('is neutral without memory or without strength', () => {
    expect(memoryShifts(club)).toEqual({ wide: 1, aggression: 0, stickiness: 0 });
    const memory = memoryOf(30, [{ facingBet: true, street: 'flop', type: 'call' }]);
    expect(memoryShifts({ ...club, memory, memoryStrength: 0 })).toEqual({ wide: 1, aggression: 0, stickiness: 0 });
  });

  it('reads a caller as sticky, a raiser as aggressive, and a loose enterer as wide, within bounds', () => {
    const sticky = memoryShifts({ ...club, memoryStrength: 1, memory: memoryOf(30, [{ facingBet: false, street: 'preflop', type: 'call' }, { facingBet: true, street: 'flop', type: 'call' }]) });
    expect(sticky.stickiness).toBeGreaterThan(0.2);
    expect(sticky.stickiness).toBeLessThanOrEqual(0.5);
    const aggressive = memoryShifts({ ...club, memoryStrength: 1, memory: memoryOf(30, [{ facingBet: false, street: 'preflop', type: 'raise' }, { facingBet: false, street: 'flop', type: 'raise' }]) });
    expect(aggressive.aggression).toBeGreaterThan(0.2);
    expect(aggressive.wide).toBeGreaterThan(1);
    expect(aggressive.wide).toBeLessThanOrEqual(1.6);
    const nit = memoryShifts({ ...club, memoryStrength: 1, memory: memoryOf(30, [{ facingBet: false, street: 'preflop', type: 'fold' }]) });
    expect(nit.wide).toBeLessThan(1);
    expect(nit.wide).toBeGreaterThanOrEqual(0.6);
  });

  it('an aggressive read lowers the premium share of a mere call more than the speculative share', () => {
    const neutral = applyPreflopActions(uniformRange([]), [
      { type: 'call', facing: 'raised', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'BTN', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BB', playerCount: 6, effectiveStackBb: 100 }, club);
    const aggressiveProfile = { ...club, memoryStrength: 1, memory: memoryOf(30, [{ facingBet: false, street: 'preflop', type: 'raise' }, { facingBet: false, street: 'flop', type: 'raise' }]) };
    const aggressive = applyPreflopActions(uniformRange([]), [
      { type: 'call', facing: 'raised', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'BTN', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BB', playerCount: 6, effectiveStackBb: 100 }, aggressiveProfile);
    // A frequent 3-bettor who merely calls is less likely to hold a hand it would have 3-bet.
    expect(comboShare(aggressive, isClass(['QQ', 'AKs']))).toBeLessThan(comboShare(neutral, isClass(['QQ', 'AKs'])));
    // Premiums lose relatively more call mass than speculative hands after the same call,
    // so the shift changes which hands continue rather than scaling every hand equally.
    const premium = isClass(['AA', 'KK', 'QQ', 'AKs']);
    const speculative = isClass(['87s', '76s', '65s']);
    const premiumRatio = comboShare(aggressive, premium) / comboShare(neutral, premium);
    const speculativeRatio = comboShare(aggressive, speculative) / comboShare(neutral, speculative);
    expect(premiumRatio).toBeLessThan(speculativeRatio);
    expect(aggressive.total).toBeGreaterThan(0);
  });
});

describe('opponent range: board-relative classification', () => {
  const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
  const dry: Card[] = [c(13, 'hearts'), c(8, 'clubs'), c(3, 'diamonds')];

  it('buckets bet sizes at half pot and one pot', () => {
    expect(sizeBucketFor(0.33)).toBe('small');
    expect(sizeBucketFor(0.5)).toBe('small');
    expect(sizeBucketFor(0.75)).toBe('large');
    expect(sizeBucketFor(1)).toBe('large');
    expect(sizeBucketFor(1.25)).toBe('overbet');
  });

  it('separates top pair, weak pair, overpair, two pair with a hole card, and air', () => {
    expect(classifyCombo([c(13, 'spades'), c(7, 'spades')], dry)).toBe('topPair');
    expect(classifyCombo([c(8, 'spades'), c(7, 'spades')], dry)).toBe('weakPair');
    expect(classifyCombo([c(6, 'spades'), c(6, 'hearts')], dry)).toBe('weakPair');
    expect(classifyCombo([c(14, 'spades'), c(14, 'hearts')], dry)).toBe('strong');
    expect(classifyCombo([c(13, 'spades'), c(8, 'spades')], dry)).toBe('strong');
    expect(classifyCombo([c(10, 'spades'), c(4, 'hearts')], dry)).toBe('air');
  });

  it('labels a hand that only adds a kicker on a paired board as playing the board', () => {
    const paired: Card[] = [c(9, 'hearts'), c(9, 'clubs'), c(4, 'diamonds'), c(2, 'spades')];
    expect(classifyCombo([c(14, 'spades'), c(7, 'hearts')], paired)).toBe('boardPlays');
    expect(classifyCombo([c(9, 'spades'), c(7, 'hearts')], paired)).toBe('strong');
    const doublePaired: Card[] = [c(9, 'hearts'), c(9, 'clubs'), c(4, 'diamonds'), c(4, 'spades'), c(2, 'hearts')];
    expect(classifyCombo([c(14, 'spades'), c(7, 'hearts')], doublePaired)).toBe('boardPlays');
    expect(classifyCombo([c(9, 'spades'), c(7, 'hearts')], doublePaired)).toBe('premium');
    const quads: Card[] = [c(9, 'hearts'), c(9, 'clubs'), c(9, 'diamonds'), c(9, 'spades')];
    expect(classifyCombo([c(14, 'spades'), c(7, 'hearts')], quads)).toBe('boardPlays');
  });

  it('separates draws, weak draws, and pair plus draw', () => {
    const twoTone: Card[] = [c(13, 'hearts'), c(8, 'hearts'), c(3, 'diamonds')];
    expect(classifyCombo([c(14, 'hearts'), c(5, 'hearts')], twoTone)).toBe('draw');
    expect(classifyCombo([c(13, 'clubs'), c(7, 'hearts')], twoTone)).toBe('topPair');
    expect(classifyCombo([c(8, 'spades'), c(7, 'hearts')], [c(13, 'hearts'), c(11, 'diamonds'), c(10, 'clubs')])).toBe('weakDraw');
    expect(classifyCombo([c(13, 'clubs'), c(4, 'hearts')], [c(13, 'hearts'), c(8, 'hearts'), c(3, 'hearts')])).toBe('pairPlusDraw');
  });
});

describe('opponent range: response table and narrowing', () => {
  const board: Card[] = [{ rank: 13, suit: 'hearts' }, { rank: 8, suit: 'clubs' }, { rank: 3, suit: 'diamonds' }];
  const classifier = createBoardClassifier();
  const table = responseTable(club);

  it('authors rows that sum to one', () => {
    for (const rows of Object.values(table.facing)) {
      for (const row of Object.values(rows)) expect(row.fold + row.call + row.raise).toBeCloseTo(1, 6);
    }
    for (const row of Object.values(table.checkedTo)) expect(row.betSmall + row.betLarge + row.check).toBeCloseTo(1, 6);
  });

  it('a large bet raises the strong share; a check lowers it', () => {
    const prior = uniformRange([]);
    const bet = applyPostflopActions(prior, [{ board, type: 'raise', sizeBucket: 'large', facingBet: false }], club, classifier);
    const check = applyPostflopActions(prior, [{ board, type: 'check', sizeBucket: 'small', facingBet: false }], club, classifier);
    expect(strongShare(bet, board, classifier)).toBeGreaterThan(strongShare(prior, board, classifier));
    expect(strongShare(check, board, classifier)).toBeLessThan(strongShare(prior, board, classifier));
  });

  it('narrowing strength 0 leaves the range untouched and every combo stays above zero at full strength', () => {
    const prior = uniformRange([]);
    const untouched = applyPostflopActions(prior, [{ board, type: 'raise', sizeBucket: 'large', facingBet: false }], { ...club, narrowingStrength: 0 }, classifier);
    expect(Array.from(untouched.weights)).toEqual(Array.from(prior.weights));
    let range = prior;
    for (let street = 0; street < 3; street += 1) range = applyPostflopActions(range, [{ board, type: 'raise', sizeBucket: 'overbet', facingBet: true }], club, classifier);
    expect(Math.min(...Array.from(range.weights))).toBeGreaterThan(0);
  });

  it('fold share falls as the range strengthens and rises with bet size', () => {
    const prior = uniformRange([]);
    const strong = applyPostflopActions(prior, [{ board, type: 'raise', sizeBucket: 'large', facingBet: false }], club, classifier);
    expect(foldShare(strong, board, 'large', table, classifier)).toBeLessThan(foldShare(prior, board, 'large', table, classifier));
    expect(foldShare(prior, board, 'small', table, classifier)).toBeLessThan(foldShare(prior, board, 'large', table, classifier));
    expect(foldShare(prior, board, 'large', table, classifier)).toBeLessThan(foldShare(prior, board, 'overbet', table, classifier));
  });

  it('the continuing range is stronger than the whole range and smaller', () => {
    const prior = uniformRange([]);
    const continuing = continuingRange(prior, board, 'large', table, classifier);
    expect(continuing.total).toBeLessThan(prior.total);
    expect(strongShare(continuing, board, classifier)).toBeGreaterThan(strongShare(prior, board, classifier));
  });

  it('a sticky read lowers predicted folds for marginal hands and narrows a call less, from one table', () => {
    let memory = createEmptyOpponentMemory();
    for (let hand = 0; hand < 30; hand += 1) {
      memory = applyOpponentObservation(memory, { actions: [{ facingBet: false, street: 'preflop', type: 'call' }, { facingBet: true, street: 'flop', type: 'call' }], position: 'late' }, '2026-01-01T00:00:00.000Z');
    }
    const stickyProfile = { ...club, memoryStrength: 1, memory };
    const stickyTable = responseTable(stickyProfile);
    expect(stickyTable.facing.topPair.large.fold).toBeLessThan(table.facing.topPair.large.fold);
    expect(stickyTable.facing.premium.large.fold).toBeCloseTo(table.facing.premium.large.fold, 6);
    expect(stickyTable.facing.air.large.fold).toBeCloseTo(table.facing.air.large.fold, 6);
    const prior = uniformRange([]);
    expect(foldShare(prior, board, 'large', stickyTable, classifier)).toBeLessThan(foldShare(prior, board, 'large', table, classifier));
    const neutralCall = applyPostflopActions(prior, [{ board, type: 'call', sizeBucket: 'large', facingBet: true }], club, classifier);
    const stickyCall = applyPostflopActions(prior, [{ board, type: 'call', sizeBucket: 'large', facingBet: true }], stickyProfile, classifier);
    // A caller known to be sticky is read as weaker after the same call.
    expect(strongShare(stickyCall, board, classifier)).toBeLessThan(strongShare(neutralCall, board, classifier));
  });
});

describe('opponent range: sampling', () => {
  it('draws combos in proportion to their weights and never draws excluded cards', () => {
    const weights = new Float64Array(uniformRange([]).weights);
    COMBOS.forEach((combo, index) => {
      if (classifyPreflopHand(combo).key === 'AA') weights[index] = 10;
    });
    const heavy = { weights, total: Array.from(weights).reduce((sum, value) => sum + value, 0) };
    const sampler = createRangeSampler(heavy);
    const random = seededRandom(5);
    const excluded = new Set(['14-spades']);
    let aces = 0;
    for (let draw = 0; draw < 4_000; draw += 1) {
      const combo = sampler.sample(excluded, random);
      expect(combo.some((card) => card.rank === 14 && card.suit === 'spades')).toBe(false);
      if (classifyPreflopHand(combo).key === 'AA') aces += 1;
    }
    // 3 unblocked AA combos x 10 / (30 + 1275) ≈ 2.3 percent; uniform would be 0.23 percent.
    expect(aces / 4_000).toBeGreaterThan(0.015);
    expect(aces / 4_000).toBeLessThan(0.035);
  });
});
