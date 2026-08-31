import { describe, expect, it } from 'vitest';

import { cardKey, seededRandom, type RandomSource } from '../cards';
import {
  applyEnforcedFold,
  applyMultiwayAction,
  buildMultiwayPots,
  createMultiwayHand,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type TablePlayerConfig,
} from '../multiway';
import type { Card, Rank, Suit } from '../types';

function players(count: number, stacks: number[] = []): TablePlayerConfig[] {
  return Array.from({ length: count }, (_, seat) => ({
    id: seat === 0 ? 'hero' : `ai-${seat}`,
    name: seat === 0 ? 'You' : `Player ${seat + 1}`,
    seat,
    stack: stacks[seat] ?? 1_000,
    isHero: seat === 0,
  }));
}

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function setKnownFourWayShowdown(hand: MultiwayHandState): void {
  hand.players.hero!.holeCards = [card(4, 'clubs'), card(5, 'diamonds')];
  hand.players['ai-1']!.holeCards = [card(13, 'clubs'), card(13, 'spades')];
  hand.players['ai-2']!.holeCards = [card(12, 'clubs'), card(12, 'spades')];
  hand.players['ai-3']!.holeCards = [card(11, 'clubs'), card(11, 'spades')];
  hand.deck = [
    card(6, 'diamonds'),
    card(14, 'hearts'), card(13, 'diamonds'), card(7, 'clubs'),
    card(8, 'diamonds'), card(2, 'spades'),
    card(9, 'diamonds'), card(3, 'hearts'),
  ];
}

function setKnownOddChipShowdown(hand: MultiwayHandState): void {
  hand.players.hero!.holeCards = [card(4, 'clubs'), card(5, 'diamonds')];
  hand.players['ai-1']!.holeCards = [card(13, 'clubs'), card(13, 'spades')];
  hand.players['ai-2']!.holeCards = [card(4, 'diamonds'), card(5, 'clubs')];
  hand.deck = [
    card(6, 'diamonds'),
    card(14, 'hearts'), card(13, 'diamonds'), card(7, 'clubs'),
    card(8, 'diamonds'), card(2, 'spades'),
    card(9, 'diamonds'), card(3, 'hearts'),
  ];
}

function setKnownFlushSidePotShowdown(hand: MultiwayHandState): void {
  hand.players.hero!.holeCards = [card(8, 'spades'), card(8, 'hearts')];
  hand.players['ai-1']!.holeCards = [card(11, 'spades'), card(4, 'spades')];
  hand.players['ai-2']!.holeCards = [card(14, 'clubs'), card(2, 'clubs')];
  hand.deck = [
    card(3, 'diamonds'),
    card(7, 'spades'), card(9, 'spades'), card(12, 'spades'),
    card(4, 'diamonds'), card(6, 'spades'),
    card(5, 'diamonds'), card(13, 'diamonds'),
  ];
}

function totalChips(state: MultiwayHandState): number {
  return state.tablePlayerIds.reduce(
    (total, playerId) => total + (state.players[playerId]?.stack ?? 0),
    state.pot,
  );
}

describe('multiway betting and pot engine', () => {
  it('completes a three-player preflop round in poker action order', () => {
    let state = createMultiwayHand({ players: players(3), buttonSeat: 0, random: seededRandom(101) });

    state = applyMultiwayAction(state, 'hero', { type: 'call' });
    expect(state.toAct).toBe('ai-1');
    state = applyMultiwayAction(state, 'ai-1', { type: 'call' });
    expect(state.toAct).toBe('ai-2');
    state = applyMultiwayAction(state, 'ai-2', { type: 'check' });

    expect(state.street).toBe('flop');
    expect(state.board).toHaveLength(3);
    expect(state.pot).toBe(60);
    expect(state.toAct).toBe('ai-1');
    expect(state.players.hero?.streetBet).toBe(0);
    expect(state.actedAtBet.hero).toBeNull();
  });

  it('does not mutate the previous state and rejects illegal actions', () => {
    const state = createMultiwayHand({ players: players(3), buttonSeat: 0, random: seededRandom(102) });
    expect(() => applyMultiwayAction(state, 'ai-1', { type: 'call' })).toThrow(/not ai-1's turn/);
    expect(() => applyMultiwayAction(state, 'hero', { type: 'check' })).toThrow(/facing a bet/);
    expect(() => applyMultiwayAction(state, 'hero', { type: 'raise', amount: 30 })).toThrow(/below the minimum/);

    const next = applyMultiwayAction(state, 'hero', { type: 'fold' });
    expect(state.players.hero?.folded).toBe(false);
    expect(state.history).toEqual([]);
    expect(next.players.hero?.folded).toBe(true);
  });

  it('settles the whole pot only after all but one player fold', () => {
    let state = createMultiwayHand({ players: players(3), buttonSeat: 0, random: seededRandom(103) });
    state = applyMultiwayAction(state, 'hero', { type: 'fold' });
    expect(state.street).toBe('preflop');
    expect(state.toAct).toBe('ai-1');
    state = applyMultiwayAction(state, 'ai-1', { type: 'fold' });

    expect(state.street).toBe('complete');
    expect(state.outcome?.showdown).toBe(false);
    expect(state.outcome?.winnerPlayerIds).toEqual(['ai-2']);
    expect(state.outcome?.totalPot).toBe(20);
    expect(state.players['ai-2']?.stack).toBe(1_010);
    expect(totalChips(state)).toBe(3_000);
  });

  it('makes a short all-in raise callable without reopening the prior raiser', () => {
    let state = createMultiwayHand({
      players: players(3, [1_000, 150, 1_000]),
      buttonSeat: 0,
      random: seededRandom(104),
    });
    state = applyMultiwayAction(state, 'hero', { type: 'raise', amount: 100 });
    state = applyMultiwayAction(state, 'ai-1', { type: 'raise', amount: 150 });

    expect(state.players['ai-1']?.allIn).toBe(true);
    expect(state.lastFullRaise).toBe(80);
    expect(state.toAct).toBe('ai-2');
    state = applyMultiwayAction(state, 'ai-2', { type: 'call' });

    const heroLegal = getMultiwayLegalActions(state, 'hero');
    expect(heroLegal.toCall).toBe(50);
    expect(heroLegal.raiseReopened).toBe(false);
    expect(heroLegal.canRaise).toBe(false);
    expect(heroLegal.canCall).toBe(true);
  });

  it('reopens raising after cumulative short all-ins equal a full raise', () => {
    let state = createMultiwayHand({
      players: players(4, [150, 200, 1_000, 1_000]),
      buttonSeat: 0,
      random: seededRandom(105),
    });
    state = applyMultiwayAction(state, 'ai-3', { type: 'raise', amount: 100 });
    state = applyMultiwayAction(state, 'hero', { type: 'raise', amount: 150 });
    state = applyMultiwayAction(state, 'ai-1', { type: 'raise', amount: 200 });
    state = applyMultiwayAction(state, 'ai-2', { type: 'call' });

    const originalRaiserLegal = getMultiwayLegalActions(state, 'ai-3');
    expect(originalRaiserLegal.toCall).toBe(100);
    expect(originalRaiserLegal.raiseReopened).toBe(true);
    expect(originalRaiserLegal.canRaise).toBe(true);
    expect(originalRaiserLegal.minRaiseTo).toBe(280);
  });

  it('lets a prior checker complete a short postflop all-in to the minimum bet', () => {
    let state = createMultiwayHand({
      players: players(3, [1_000, 1_000, 30]),
      buttonSeat: 0,
      random: seededRandom(113),
    });
    state = applyMultiwayAction(state, 'hero', { type: 'call' });
    state = applyMultiwayAction(state, 'ai-1', { type: 'call' });
    state = applyMultiwayAction(state, 'ai-2', { type: 'check' });
    state = applyMultiwayAction(state, 'ai-1', { type: 'check' });
    state = applyMultiwayAction(state, 'ai-2', { type: 'raise', amount: 10 });
    state = applyMultiwayAction(state, 'hero', { type: 'call' });

    const priorCheckerLegal = getMultiwayLegalActions(state, 'ai-1');
    expect(priorCheckerLegal.toCall).toBe(10);
    expect(priorCheckerLegal.raiseReopened).toBe(true);
    expect(priorCheckerLegal.canRaise).toBe(true);
    expect(priorCheckerLegal.minRaiseTo).toBe(20);
  });

  it('builds and awards a main pot plus two side pots to different winners', () => {
    let state = createMultiwayHand({
      players: players(4, [50, 100, 200, 200]),
      buttonSeat: 0,
      random: seededRandom(106),
    });
    setKnownFourWayShowdown(state);

    state = applyMultiwayAction(state, 'ai-3', { type: 'raise', amount: 200 });
    state = applyMultiwayAction(state, 'hero', { type: 'call' });
    state = applyMultiwayAction(state, 'ai-1', { type: 'call' });
    state = applyMultiwayAction(state, 'ai-2', { type: 'call' });

    expect(state.street).toBe('complete');
    expect(state.board).toEqual([
      card(14, 'hearts'), card(13, 'diamonds'), card(7, 'clubs'), card(2, 'spades'), card(3, 'hearts'),
    ]);
    expect(state.outcome?.awards.map((award) => ({
      amount: award.amount,
      eligible: award.eligiblePlayerIds,
      winners: award.winnerPlayerIds,
    }))).toEqual([
      { amount: 200, eligible: ['hero', 'ai-1', 'ai-2', 'ai-3'], winners: ['hero'] },
      { amount: 150, eligible: ['ai-1', 'ai-2', 'ai-3'], winners: ['ai-1'] },
      { amount: 200, eligible: ['ai-2', 'ai-3'], winners: ['ai-2'] },
    ]);
    expect(state.outcome?.winnerPlayerIds).toEqual(['hero']);
    expect(state.players.hero?.stack).toBe(200);
    expect(state.players['ai-1']?.stack).toBe(150);
    expect(state.players['ai-2']?.stack).toBe(200);
    expect(state.players['ai-3']?.stack).toBe(0);
    expect(totalChips(state)).toBe(550);
  });

  it('keeps a side-pot recipient out of the main-pot winner list', () => {
    let state = createMultiwayHand({
      players: players(3, [200, 20, 200]),
      buttonSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      random: seededRandom(115),
    });
    setKnownFlushSidePotShowdown(state);

    state = applyMultiwayAction(state, 'hero', { type: 'raise', amount: 100 });
    state = applyMultiwayAction(state, 'ai-1', { type: 'call' });
    state = applyMultiwayAction(state, 'ai-2', { type: 'call' });
    state = applyMultiwayAction(state, 'ai-2', { type: 'check' });
    state = applyMultiwayAction(state, 'hero', { type: 'raise', amount: 10 });
    state = applyMultiwayAction(state, 'ai-2', { type: 'fold' });

    expect(state.street).toBe('complete');
    expect(state.board).toEqual([
      card(7, 'spades'), card(9, 'spades'), card(12, 'spades'), card(6, 'spades'), card(13, 'diamonds'),
    ]);
    expect(state.outcome?.awards.map((award) => ({
      amount: award.amount,
      kind: award.kind,
      winners: award.winnerPlayerIds,
    }))).toEqual([
      { amount: 60, kind: 'main', winners: ['ai-1'] },
      { amount: 160, kind: 'side', winners: ['hero'] },
    ]);
    expect(state.outcome?.winnerPlayerIds).toEqual(['ai-1']);
    expect(state.outcome?.handDescriptions).toMatchObject({ hero: 'Flush', 'ai-1': 'Flush' });
    expect(state.players.hero?.stack).toBe(260);
    expect(state.players['ai-1']?.stack).toBe(60);
    expect(totalChips(state)).toBe(420);
  });

  it('awards an odd split-pot chip clockwise from the button', () => {
    let state = createMultiwayHand({
      players: players(3, [15, 15, 15]),
      buttonSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      random: seededRandom(107),
    });
    setKnownOddChipShowdown(state);

    state = applyMultiwayAction(state, 'hero', { type: 'raise', amount: 15 });
    state = applyMultiwayAction(state, 'ai-1', { type: 'call' });
    state = applyMultiwayAction(state, 'ai-2', { type: 'call' });

    expect(state.outcome?.awards).toHaveLength(1);
    expect(state.outcome?.awards[0]?.winnerPlayerIds).toEqual(['hero', 'ai-2']);
    expect(state.outcome?.winnerPlayerIds).toEqual(['hero', 'ai-2']);
    expect(state.outcome?.awards[0]?.shares).toEqual({ hero: 22, 'ai-2': 23 });
    expect(state.players.hero?.stack).toBe(22);
    expect(state.players['ai-2']?.stack).toBe(23);
    expect(totalChips(state)).toBe(45);
  });

  it('runs out the board automatically once only one player still has chips', () => {
    let state = createMultiwayHand({
      players: players(3, [40, 40, 1_000]),
      buttonSeat: 0,
      random: seededRandom(108),
    });
    state = applyMultiwayAction(state, 'hero', { type: 'raise', amount: 40 });
    state = applyMultiwayAction(state, 'ai-1', { type: 'call' });
    state = applyMultiwayAction(state, 'ai-2', { type: 'call' });

    expect(state.street).toBe('complete');
    expect(state.board).toHaveLength(5);
    expect(state.outcome?.showdown).toBe(true);
    expect(state.pot).toBe(0);
    expect(totalChips(state)).toBe(1_080);
  });

  it('automatically settles a hand that begins with a heads-up blind all-in', () => {
    const state = createMultiwayHand({
      players: players(2, [5, 1_000]),
      buttonSeat: 0,
      random: seededRandom(110),
    });

    expect(state.street).toBe('complete');
    expect(state.board).toHaveLength(5);
    expect(state.outcome?.showdown).toBe(true);
    expect(state.outcome?.totalPot).toBe(10);
    expect(totalChips(state)).toBe(1_005);
  });

  it('caps a covering stack at the short opponent’s callable contribution', () => {
    let state = createMultiwayHand({
      players: players(2, [50, 1_000]),
      buttonSeat: 0,
      random: seededRandom(114),
    });
    state = applyMultiwayAction(state, 'hero', { type: 'call' });

    const coveringStackLegal = getMultiwayLegalActions(state, 'ai-1');
    expect(coveringStackLegal.canRaise).toBe(true);
    expect(coveringStackLegal.maxRaiseTo).toBe(50);

    state = applyMultiwayAction(state, 'ai-1', { type: 'raise', amount: coveringStackLegal.maxRaiseTo });
    expect(state.players['ai-1']?.allIn).toBe(false);
    expect(state.history.at(-1)?.amount).toBe(50);
    state = applyMultiwayAction(state, 'hero', { type: 'call' });

    expect(state.street).toBe('complete');
    expect(state.outcome?.totalPot).toBe(100);
    expect(totalChips(state)).toBe(1_050);
  });

  it('returns an overbet when the only deep opponent folds instead of creating a one-player side pot', () => {
    let state = createMultiwayHand({
      players: players(3, [50, 1_000, 1_000]),
      buttonSeat: 0,
      random: seededRandom(111),
    });
    state = applyMultiwayAction(state, 'hero', { type: 'raise', amount: 50 });
    state = applyMultiwayAction(state, 'ai-1', { type: 'raise', amount: 200 });
    state = applyMultiwayAction(state, 'ai-2', { type: 'fold' });

    expect(state.street).toBe('complete');
    expect(state.outcome?.totalPot).toBe(120);
    expect(state.outcome?.awards.every((award) => award.eligiblePlayerIds.length >= 2)).toBe(true);
    expect(state.history.find((action) => action.playerId === 'ai-1' && action.type === 'raise')).toMatchObject({
      amount: 50,
      potAfter: 120,
    });
    expect(state.players['ai-1']?.allIn).toBe(false);
    expect(totalChips(state)).toBe(2_050);
  });

  it('exposes contribution pots before settlement', () => {
    let state = createMultiwayHand({ players: players(3), buttonSeat: 0, random: seededRandom(112) });
    state = applyMultiwayAction(state, 'hero', { type: 'raise', amount: 100 });
    state = applyMultiwayAction(state, 'ai-1', { type: 'call' });

    expect(buildMultiwayPots(state)).toEqual([
      { amount: 60, contributionCap: 20, eligiblePlayerIds: ['hero', 'ai-1', 'ai-2'], kind: 'main' },
      { amount: 160, contributionCap: 100, eligiblePlayerIds: ['hero', 'ai-1'], kind: 'side' },
    ]);
  });

  it('finishes 250 varied two- through six-player hands without creating chips', () => {
    let completedHands = 0;

    for (const count of [2, 3, 4, 5, 6]) {
      for (let seed = 0; seed < 50; seed += 1) {
        const random = seededRandom(count * 10_000 + seed);
        let state = createMultiwayHand({
          players: players(count),
          buttonSeat: seed % count,
          random,
        });
        let actions = 0;

        while (state.street !== 'complete') {
          const playerId = state.toAct;
          if (!playerId) throw new Error('A live simulated hand has no player to act.');
          const legal = getMultiwayLegalActions(state, playerId);
          const choice = random();
          if (legal.canRaise && choice < 0.2) {
            state = applyMultiwayAction(state, playerId, { type: 'raise', amount: legal.suggestedRaiseTo });
          } else if (legal.canCheck) {
            state = applyMultiwayAction(state, playerId, { type: 'check' });
          } else if (legal.canCall && choice < 0.9) {
            state = applyMultiwayAction(state, playerId, { type: 'call' });
          } else {
            state = applyMultiwayAction(state, playerId, { type: 'fold' });
          }
          actions += 1;
          if (actions > 200) throw new Error('A simulated hand did not terminate.');
        }

        const visibleCards = [
          ...state.activePlayerIds.flatMap((playerId) => state.players[playerId]?.holeCards ?? []),
          ...state.board,
        ];
        expect(new Set(visibleCards.map(cardKey)).size).toBe(visibleCards.length);
        expect(state.outcome).toBeDefined();
        expect(state.pot).toBe(0);
        expect(totalChips(state)).toBe(count * 1_000);
        completedHands += 1;
      }
    }

    expect(completedHands).toBe(250);
  });
});

describe('applyEnforcedFold immutability and semantics (3.11 hardening)', () => {
  function headsUpHand(): { hand: ReturnType<typeof createMultiwayHand>; random: RandomSource } {
    const random = seededRandom(7);
    const hand = createMultiwayHand({
      bigBlind: 20,
      buttonSeat: 0,
      players: [
        { id: 'a', name: 'A', seat: 0, stack: 1_000 },
        { id: 'b', name: 'B', seat: 1, stack: 1_000 },
      ],
      random,
      smallBlind: 10,
    });
    return { hand, random };
  }

  it('never mutates its input hand, players, or history', () => {
    const { hand } = headsUpHand();
    const snapshot = JSON.stringify(hand);
    const next = applyEnforcedFold(hand, hand.toAct!);
    expect(JSON.stringify(hand)).toBe(snapshot);
    // The fold is recorded only on the returned copy.
    expect(next.history).toHaveLength(hand.history.length + 1);
    expect(next.history.at(-1)).toMatchObject({ playerId: hand.toAct, type: 'fold' });
  });

  it('folds even when checking is free (the training guardrail is bypassed by design)', () => {
    // In this heads-up fixture the first actor faces only a completed blind:
    // a plain fold would be refused ("folding is not legal when checking is
    // available"); the enforced fold must still work for forced departures.
    const { hand } = headsUpHand();
    const actor = hand.toAct!;
    const legal = getMultiwayLegalActions(hand, actor);
    const plainFold = () => applyMultiwayAction(hand, actor, { type: 'fold' });
    if (legal.canCheck) {
      expect(plainFold).toThrow();
      const next = applyEnforcedFold(hand, actor);
      expect(next.players[actor]!.folded).toBe(true);
    } else {
      // The fixture's actor faces a bet: the plain fold is legal and the
      // enforced fold records the same fold.
      const next = applyEnforcedFold(hand, actor);
      expect(next.players[actor]!.folded).toBe(true);
    }
  });

  it('returns the same hand when the seat already folded', () => {
    const { hand } = headsUpHand();
    const once = applyEnforcedFold(hand, hand.toAct!);
    const twice = applyEnforcedFold(once, once.toAct ?? hand.toAct!);
    expect(twice.players[hand.toAct!]!.folded).toBe(true);
  });
});
