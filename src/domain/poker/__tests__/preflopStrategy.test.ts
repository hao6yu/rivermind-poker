import { describe, expect, it } from 'vitest';

import type { TablePosition } from '../multiway';
import { HAND_CLASS_KEYS, combosForKey } from '../preflopRanges';
import {
  PREFLOP_RANKS,
  buildPreflopPlan,
  classifyPreflopHand,
  preflopGridCards,
  selectPreflopAction,
  type PreflopArchetype,
  type PreflopFacing,
  type PreflopRangeInput,
} from '../preflopStrategy';
import type { Card, LegalActions, Rank } from '../types';

function cards(high: Card['rank'], low: Card['rank'], suited = false): readonly Card[] {
  return [
    { rank: high, suit: 'spades' },
    { rank: low, suit: suited ? 'spades' : 'hearts' },
  ];
}

const RANK_BY_CHAR: Record<string, Rank> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/**
 * `preflopGridCards(row, column)` is suited when row > column and offsuit when
 * row < column, so a suited key passes (high, low) and an offsuit key passes
 * (low, high). Pairs take either order and land on the row === column branch.
 */
function preflopGridCardsForKey(key: string): readonly [Card, Card] {
  const high = RANK_BY_CHAR[key[0]!]!;
  const low = RANK_BY_CHAR[key[1]!]!;
  return key.endsWith('s') ? preflopGridCards(high, low) : preflopGridCards(low, high);
}

/** Combo-weighted share of all 1326 hands this archetype enters the pot with. */
function enteredFraction(
  archetype: PreflopArchetype,
  spot: Omit<PreflopRangeInput, 'archetype' | 'cards' | 'effectiveStackBb' | 'playerCount'>
    & { playerCount?: number },
): number {
  let entered = 0;
  let total = 0;
  for (const key of HAND_CLASS_KEYS) {
    const [first, second] = preflopGridCardsForKey(key);
    const result = buildPreflopPlan({
      ...spot,
      archetype,
      cards: [first, second],
      effectiveStackBb: 100,
      playerCount: spot.playerCount ?? 5,
    });
    entered += combosForKey(key) * (result.frequencies.raise + result.frequencies.call);
    total += combosForKey(key);
  }
  return entered / total;
}

function plan(
  hand: readonly Card[],
  position: TablePosition,
  facing: PreflopFacing = 'unopened',
  effectiveStackBb = 100,
  playerCount = 6,
) {
  return buildPreflopPlan({ cards: hand, effectiveStackBb, facing, playerCount, position, canCheck: position === 'BB' && facing === 'limped' });
}

describe('preflop strategy', () => {
  it('classifies canonical hand keys regardless of card order', () => {
    expect(classifyPreflopHand(cards(14, 13, true)).key).toBe('AKs');
    expect(classifyPreflopHand([...cards(14, 13)].reverse()).key).toBe('AKo');
    expect(classifyPreflopHand(cards(9, 9)).key).toBe('99');
  });

  it('maps every hand-class key back onto the canonical grid cards', () => {
    for (const key of HAND_CLASS_KEYS) {
      expect(classifyPreflopHand(preflopGridCardsForKey(key)).key).toBe(key);
    }
  });

  it('opens wider in late position than under the gun', () => {
    expect(plan(cards(13, 10), 'UTG').primaryAction).toBe('fold');
    expect(plan(cards(13, 10), 'BTN').primaryAction).toBe('raise');
  });

  it('reads the short-handed first-to-act seat as its 6-max equivalent', () => {
    // Short-handed tables lose seats from the top of the order: multiway.ts
    // deals 5-handed as BTN/SB/BB/UTG/CO and 4-handed as BTN/SB/BB/UTG, so the
    // seat still labelled UTG has four and three players behind it — a 6-max HJ
    // and a 6-max CO. Reading the 6-max UTG table there opened 13.2% at every
    // table size, which is where playerCount was silently discarded.
    const openWidth = (playerCount: number) => enteredFraction('balanced', {
      facing: 'unopened', playerCount, position: 'UTG',
    });
    expect(openWidth(6)).toBeCloseTo(0.132, 2);
    expect(openWidth(5)).toBeCloseTo(0.169, 2);
    expect(openWidth(4)).toBeCloseTo(0.270, 2);
  });

  it('treats a four-handed first-in open as the late-position open it is', () => {
    // raiserBucket() buckets UTG as 'early', so before the remap the whole
    // 4-handed table defended the vs-early tables against what is really a
    // cutoff open. Q9s sits in BB_VS_LATE's 0.2/0.6 band but only in
    // BB_VS_EARLY's 0.02/0.35 wide band.
    const defend = (playerCount: number) => buildPreflopPlan({
      cards: cards(12, 9, true),
      effectiveStackBb: 100,
      facing: 'raised',
      playerCount,
      position: 'BB',
      raiseCount: 1,
      raiseSizeBb: 2.5,
      raiserPosition: 'UTG',
    });
    expect(defend(6).primaryAction).toBe('fold');
    expect(defend(4).primaryAction).toBe('call');
  });

  it('raises premium pairs from every opening position and depth', () => {
    const positions: TablePosition[] = ['BTN/SB', 'BTN', 'SB', 'CO', 'HJ', 'UTG'];
    for (const position of positions) {
      for (const depth of [20, 40, 100]) {
        expect(plan(cards(14, 14), position, 'unopened', depth).primaryAction).toBe('raise');
      }
    }
  });

  it('uses suited wheel aces as a selective deep-stack 3-bet bluff', () => {
    const suited = plan(cards(14, 5, true), 'BTN', 'raised', 100);
    const offsuit = plan(cards(14, 5), 'BTN', 'raised', 100);
    expect(suited.frequencies.raise).toBeGreaterThan(offsuit.frequencies.raise);
    expect(suited.category).toBe('mix');
  });

  it('defends the big blind wider than an early position seat', () => {
    const hand = cards(12, 9, true);
    expect(plan(hand, 'BB', 'raised').frequencies.call).toBeGreaterThan(plan(hand, 'UTG', 'raised').frequencies.call);
  });

  describe('cold-call defense for the neutral teaching baseline', () => {
    // The coach, hand grading and the range explorer call buildPreflopPlan with
    // no tier and no archetype, so they skip population bands. Those bands must
    // therefore never be the only entry covering a hand a solid player defends:
    // when they were, suited kings vanished from the baseline entirely while
    // small suited connectors kept calling.
    const defend = (key: string, position: TablePosition, raiser: TablePosition) => {
      const [first, second] = preflopGridCardsForKey(key);
      const result = buildPreflopPlan({
        cards: [first, second],
        effectiveStackBb: 60,
        facing: 'raised',
        playerCount: 5,
        position,
        raiseCount: 1,
        raiseSizeBb: 2.5,
        raiserPosition: raiser,
      });
      return result.frequencies.raise + result.frequencies.call;
    };

    it('keeps suited kings ahead of small suited connectors in position', () => {
      expect(defend('K9s', 'BTN', 'CO')).toBeGreaterThanOrEqual(defend('54s', 'BTN', 'CO'));
      expect(defend('Q9s', 'BTN', 'CO')).toBeGreaterThanOrEqual(defend('54s', 'BTN', 'CO'));
    });

    it('orders suited kings by their kicker', () => {
      expect(defend('K9s', 'BTN', 'CO')).toBeGreaterThanOrEqual(defend('K6s', 'BTN', 'CO'));
      expect(defend('K6s', 'BTN', 'CO')).toBeGreaterThanOrEqual(defend('K2s', 'BTN', 'CO'));
      expect(defend('K9s', 'BTN', 'CO')).toBeGreaterThan(0.2);
    });

    it('keeps a coarse defense floor from every cold-calling seat', () => {
      const width = (position: TablePosition, raiser: TablePosition) => {
        let entered = 0;
        let total = 0;
        for (const key of HAND_CLASS_KEYS) {
          entered += combosForKey(key) * defend(key, position, raiser);
          total += combosForKey(key);
        }
        return entered / total;
      };
      // Combo-weighted expected entry, not share-of-range: the hands are played
      // at fractional frequencies, so a ~28% range enters ~18% of the time.
      // Measured here: BTN 17.9%, SB 19.7%, CO 13.9%. These floors are a coarse
      // canary for a table losing whole classes at once — the precise guard for
      // the population-band hole is the two ordering tests above, which is the
      // shape the regression actually had.
      expect(width('BTN', 'CO')).toBeGreaterThan(0.15);
      expect(width('SB', 'CO')).toBeGreaterThan(0.15);
      expect(width('CO', 'UTG')).toBeGreaterThan(0.11);
    });
  });

  it('defends wider against a late-position open than an early-position open', () => {
    const hand = cards(10, 6, true);
    const buttonOpen = buildPreflopPlan({
      cards: hand,
      effectiveStackBb: 100,
      facing: 'raised',
      playerCount: 6,
      position: 'BB',
      raiseSizeBb: 2.5,
      raiserPosition: 'BTN',
    });
    const underTheGunOpen = buildPreflopPlan({
      cards: hand,
      effectiveStackBb: 100,
      facing: 'raised',
      playerCount: 6,
      position: 'BB',
      raiseSizeBb: 2.5,
      raiserPosition: 'UTG',
    });

    expect(buttonOpen.frequencies.call).toBeGreaterThan(underTheGunOpen.frequencies.call);
    expect(underTheGunOpen.frequencies.fold).toBeGreaterThan(buttonOpen.frequencies.fold);
  });

  it('trims speculative flats when the effective stack is short', () => {
    const hand = cards(7, 6, true);
    const deep = buildPreflopPlan({
      cards: hand,
      effectiveStackBb: 100,
      facing: 'raised',
      playerCount: 6,
      position: 'BTN',
      raiseSizeBb: 2.5,
      raiserPosition: 'CO',
    });
    const short = buildPreflopPlan({
      cards: hand,
      effectiveStackBb: 20,
      facing: 'raised',
      playerCount: 6,
      position: 'BTN',
      raiseSizeBb: 2.5,
      raiserPosition: 'CO',
    });
    expect(deep.frequencies.call).toBeGreaterThan(short.frequencies.call);
    expect(short.frequencies.fold).toBeGreaterThan(deep.frequencies.fold);
  });

  it('gives in-position callers a real flatting range including small pairs', () => {
    const result = buildPreflopPlan({
      cards: [{ rank: 5, suit: 'spades' }, { rank: 5, suit: 'hearts' }],
      effectiveStackBb: 100,
      facing: 'raised',
      playerCount: 5,
      position: 'BTN',
      raiseCount: 1,
      raiseSizeBb: 2.5,
      raiserPosition: 'CO',
    });
    expect(result.frequencies.call).toBeGreaterThan(0.4);
    expect(result.frequencies.raise).toBeLessThan(0.15);
  });

  it('loosens suited and paired overcalls when the pot is already multiway', () => {
    const base = {
      cards: [{ rank: 7, suit: 'clubs' }, { rank: 6, suit: 'clubs' }] as const,
      effectiveStackBb: 100,
      facing: 'raised' as const,
      playerCount: 5,
      position: 'BTN' as const,
      raiseCount: 1,
      raiseSizeBb: 2.5,
      raiserPosition: 'HJ' as const,
    };
    const alone = buildPreflopPlan({ ...base, callersAfterRaise: 0 });
    const crowded = buildPreflopPlan({ ...base, callersAfterRaise: 2 });
    expect(crowded.frequencies.call).toBeGreaterThan(alone.frequencies.call);
  });

  it('defends against a 5bb open at a reduced but nonzero rate', () => {
    const base = {
      cards: [{ rank: 13, suit: 'spades' }, { rank: 11, suit: 'spades' }] as const,
      effectiveStackBb: 100,
      facing: 'raised' as const,
      playerCount: 5,
      position: 'BB' as const,
      raiseCount: 1,
      raiserPosition: 'BTN' as const,
    };
    const small = buildPreflopPlan({ ...base, raiseSizeBb: 2.5 });
    const big = buildPreflopPlan({ ...base, raiseSizeBb: 5 });
    expect(big.frequencies.fold).toBeGreaterThan(small.frequencies.fold);
    expect(big.frequencies.call + big.frequencies.raise).toBeGreaterThan(0.3);
  });

  it('separates archetypes by 25+ VPIP points defending the big blind', () => {
    // Blind defense is where the price-sensitive `wide` bands live, so the
    // archetype wideScale lever (patient 0.4 vs sticky 1.7) has the most
    // material to work on: a station and a nit must not defend the same blind.
    const defend = (archetype: PreflopArchetype) => enteredFraction(archetype, {
      facing: 'raised', position: 'BB', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'BTN',
    });
    expect(defend('sticky') - defend('patient')).toBeGreaterThan(0.25);
    expect(defend('pressure')).toBeGreaterThan(defend('balanced'));
    expect(defend('patient')).toBeLessThan(defend('balanced'));
  });

  it('orders in-position cold-calling ranges by archetype', () => {
    // IP_VS_LATE is a deliberately narrow 282-combo cold-call table with only
    // 40 combos in its `wide` band, so the achievable spread here is bounded by
    // the table's own width — direction and a real (not token) gap is the bar.
    const coldCall = (archetype: PreflopArchetype) => enteredFraction(archetype, {
      facing: 'raised', position: 'BTN', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'CO',
    });
    expect(coldCall('sticky')).toBeGreaterThan(coldCall('balanced'));
    expect(coldCall('balanced')).toBeGreaterThan(coldCall('patient'));
    expect(coldCall('sticky') - coldCall('patient')).toBeGreaterThan(0.04);
  });

  describe('never folds the always-continue top of a defense table', () => {
    // Price, archetype and tier reshape the raise:call mix of a band, but a band
    // authored at raise + call >= 0.98 is a "never fold" band. Multiplicative
    // shrink used to leak that missing mass into folds (AA folding 20-26%).
    it('keeps AA continuing against an oversized open', () => {
      const result = buildPreflopPlan({
        cards: cards(14, 14),
        effectiveStackBb: 100,
        facing: 'raised',
        playerCount: 6,
        position: 'BB',
        raiseCount: 1,
        raiseSizeBb: 5,
        raiserPosition: 'BTN',
      });
      expect(result.frequencies.fold).toBeLessThan(0.05);
    });

    it('keeps KK continuing against a large 3-bet', () => {
      const result = buildPreflopPlan({
        cards: cards(13, 13),
        effectiveStackBb: 100,
        facing: 'raised',
        playerCount: 6,
        position: 'BTN',
        raiseCount: 2,
        raiseSizeBb: 9,
        raiserPosition: 'BB',
      });
      expect(result.frequencies.fold).toBeLessThan(0.12);
    });

    it('keeps AA continuing against a 4-bet', () => {
      const result = buildPreflopPlan({
        cards: cards(14, 14),
        effectiveStackBb: 100,
        facing: 'raised',
        playerCount: 6,
        position: 'BTN',
        raiseCount: 3,
        raiseSizeBb: 22,
        raiserPosition: 'BB',
      });
      expect(result.frequencies.fold).toBeLessThan(0.12);
    });

    it('keeps AA continuing for a sticky archetype that shrinks 3-bets', () => {
      const result = buildPreflopPlan({
        archetype: 'sticky',
        cards: cards(14, 14),
        effectiveStackBb: 100,
        facing: 'raised',
        playerCount: 6,
        position: 'BTN',
        raiseCount: 1,
        raiseSizeBb: 2.5,
        raiserPosition: 'CO',
      });
      expect(result.frequencies.fold).toBeLessThan(0.05);
      // The archetype still shapes the mix it continues with.
      expect(result.frequencies.call).toBeGreaterThan(result.frequencies.raise);
    });

    it('still lets non-premium bands grow their fold share against a big open', () => {
      const base = {
        cards: cards(12, 9, true),
        effectiveStackBb: 100,
        facing: 'raised' as const,
        playerCount: 6,
        position: 'BB' as const,
        raiseCount: 1,
        raiserPosition: 'BTN' as const,
      };
      const small = buildPreflopPlan({ ...base, raiseSizeBb: 2.5 });
      const big = buildPreflopPlan({ ...base, raiseSizeBb: 5 });
      expect(big.frequencies.fold).toBeGreaterThan(small.frequencies.fold + 0.05);
    });
  });

  describe('never open-folds the premium top of a first-in range', () => {
    // The RFI tables author their premium top bands at raise + call = 0.95-0.97
    // (the remainder is deliberate entry variance). Tier and archetype shaping
    // must reshape that mix, not grow the fold share — a friendly-tier or
    // sticky AI open-folding AA is exactly the artifact the never-fold restore
    // exists to prevent.
    it('keeps AA at its authored entry frequency for a friendly-tier opener', () => {
      const result = buildPreflopPlan({
        cards: cards(14, 14),
        effectiveStackBb: 100,
        facing: 'unopened',
        playerCount: 6,
        position: 'UTG',
        strategyTier: 'friendly',
      });
      expect(result.frequencies.fold).toBeLessThanOrEqual(0.051);
    });

    it('keeps AA at its authored entry frequency for a sticky friendly-tier opener', () => {
      const result = buildPreflopPlan({
        archetype: 'sticky',
        cards: cards(14, 14),
        effectiveStackBb: 100,
        facing: 'unopened',
        playerCount: 6,
        position: 'UTG',
        strategyTier: 'friendly',
      });
      expect(result.frequencies.fold).toBeLessThanOrEqual(0.051);
    });

    it('keeps AA opening from the heads-up button at the friendly tier', () => {
      const result = buildPreflopPlan({
        cards: cards(14, 14),
        effectiveStackBb: 100,
        facing: 'unopened',
        playerCount: 2,
        position: 'BTN/SB',
        strategyTier: 'friendly',
      });
      expect(result.frequencies.fold).toBeLessThanOrEqual(0.031);
    });

    it('still lets the wide edge of an opening range grow its fold share', () => {
      const base = {
        cards: cards(13, 9, true),
        effectiveStackBb: 100,
        facing: 'unopened' as const,
        playerCount: 6,
        position: 'UTG' as const,
      };
      const club = buildPreflopPlan(base);
      const nemesis = buildPreflopPlan({ ...base, strategyTier: 'nemesis' });
      expect(nemesis.frequencies.fold).toBeGreaterThan(club.frequencies.fold + 0.05);
    });
  });

  describe('keeps population-model overcalls out of the neutral teaching baseline', () => {
    // The recreational-overcall band models how a loose low-stakes population
    // plays, not how anyone should play. Callers that model an opponent (any
    // strategyTier or archetype) get it; the tier-less, archetype-less baseline
    // the coach, grading, and range explorer consume must not recommend
    // cold-calling suited junk.
    const t4sFacingOpen = {
      cards: cards(10, 4, true),
      effectiveStackBb: 100,
      facing: 'raised' as const,
      playerCount: 6,
      position: 'BTN' as const,
      raiseCount: 1,
      raiseSizeBb: 2.5,
      raiserPosition: 'CO' as const,
    };

    it('folds suited junk to a raise when no opponent is being modeled', () => {
      const result = buildPreflopPlan(t4sFacingOpen);
      expect(result.primaryAction).toBe('fold');
      expect(result.frequencies.fold).toBeGreaterThan(0.9);
    });

    it('keeps the loose flat for AI population callers', () => {
      const result = buildPreflopPlan({ ...t4sFacingOpen, strategyTier: 'club' });
      expect(result.frequencies.call).toBeGreaterThan(0.4);
    });
  });

  it('puts the big blind limped-pot continue mass on check, not an illegal call', () => {
    // The over-limp tables carry their continue mass on the call leg, but the
    // big blind closing a limped pot has nothing to call — that mass belongs
    // on the free check, or grading flips its baseline to Raise and the coach
    // prints impossible call percentages.
    const result = buildPreflopPlan({
      canCheck: true,
      cards: cards(14, 10),
      effectiveStackBb: 100,
      facing: 'limped',
      limperCount: 2,
      playerCount: 5,
      position: 'BB',
    });
    expect(result.frequencies.call).toBe(0);
    expect(result.frequencies.check).toBeGreaterThan(0.5);
    expect(result.primaryAction).toBe('check');
  });

  it('never open-raises pure trash from early position at any frequency above noise', () => {
    const result = buildPreflopPlan({
      cards: [{ rank: 7, suit: 'spades' }, { rank: 2, suit: 'hearts' }],
      effectiveStackBb: 100,
      facing: 'unopened',
      playerCount: 6,
      position: 'UTG',
    });
    expect(result.frequencies.raise).toBeLessThan(0.02);
    expect(result.frequencies.fold).toBeGreaterThan(0.95);
  });

  it('over-limps small pairs behind limpers instead of folding', () => {
    const result = buildPreflopPlan({
      cards: [{ rank: 4, suit: 'spades' }, { rank: 4, suit: 'hearts' }],
      effectiveStackBb: 100,
      facing: 'limped',
      limperCount: 2,
      playerCount: 5,
      position: 'CO',
    });
    expect(result.frequencies.call).toBeGreaterThan(0.35);
  });

  it('iso-raises value hands over limpers instead of over-limping them', () => {
    const result = buildPreflopPlan({
      cards: cards(14, 13, true),
      effectiveStackBb: 100,
      facing: 'limped',
      limperCount: 2,
      playerCount: 5,
      position: 'CO',
    });
    expect(result.frequencies.raise).toBeGreaterThan(0.8);
    expect(result.explanation).toContain('raise the limpers');
  });

  it('produces valid frequencies for all 169 hands across common contexts', () => {
    const contexts: Array<[TablePosition, PreflopFacing, number]> = [
      ['UTG', 'unopened', 100],
      ['BTN', 'unopened', 40],
      ['BB', 'raised', 100],
      ['SB', 'limped', 20],
    ];
    for (const row of PREFLOP_RANKS) {
      for (const column of PREFLOP_RANKS) {
        for (const [position, facing, depth] of contexts) {
          const result = plan(preflopGridCards(row, column), position, facing, depth);
          const values = Object.values(result.frequencies);
          expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
          expect(values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
        }
      }
    }
  });

  it('always returns a legal action and clamps raise sizing', () => {
    const legal: LegalActions = {
      canCall: true,
      canCheck: false,
      canFold: true,
      canRaise: true,
      maxRaiseTo: 180,
      minRaiseTo: 120,
      suggestedRaiseTo: 140,
      toCall: 40,
    };
    const premium = plan(cards(14, 14), 'BB', 'raised', 100);
    const action = selectPreflopAction(premium, 0, legal, {
      bigBlind: 20,
      currentBet: 80,
      facing: 'raised',
      legal,
      playerStreetBet: 20,
      position: 'BB',
      stackBand: premium.stackBand,
    });
    expect(action).toEqual({ type: 'raise', amount: 180 });
  });

  it('uses a smaller re-raise multiple when the pot is already 3-bet', () => {
    const legal: LegalActions = {
      canCall: true,
      canCheck: false,
      canFold: true,
      canRaise: true,
      maxRaiseTo: 2_000,
      minRaiseTo: 300,
      suggestedRaiseTo: 400,
      toCall: 160,
    };
    const sizing = {
      bigBlind: 20,
      currentBet: 180,
      facing: 'raised' as const,
      legal,
      playerStreetBet: 20,
      position: 'BB' as const,
      stackBand: 'deep' as const,
    };
    const premium = plan(cards(14, 14), 'BB', 'raised', 100);
    const versusOpen = selectPreflopAction(premium, 0, legal, sizing);
    const versusThreeBet = selectPreflopAction(premium, 0, legal, { ...sizing, raiseCount: 2 });
    expect(versusOpen).toEqual({ type: 'raise', amount: 630 });
    expect(versusThreeBet).toEqual({ type: 'raise', amount: 432 });
  });
});
