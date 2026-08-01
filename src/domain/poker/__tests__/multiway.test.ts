import { describe, expect, it } from 'vitest';

import { cardKey, seededRandom } from '../cards';
import {
  activePlayersClockwiseAfter,
  createMultiwayHand,
  nextButtonSeat,
  type TablePlayerConfig,
} from '../multiway';

function players(count: number, stacks: number[] = []): TablePlayerConfig[] {
  return Array.from({ length: count }, (_, seat) => ({
    id: seat === 0 ? 'hero' : `ai-${seat}`,
    name: seat === 0 ? 'You' : `Player ${seat + 1}`,
    seat,
    stack: stacks[seat] ?? 1_000,
    isHero: seat === 0,
  }));
}

describe('multiway table foundation', () => {
  it('keeps the heads-up button as the small blind and first preflop actor', () => {
    const hand = createMultiwayHand({
      players: players(2),
      buttonSeat: 0,
      random: seededRandom(21),
    });

    expect(hand.buttonPlayerId).toBe('hero');
    expect(hand.smallBlindPlayerId).toBe('hero');
    expect(hand.bigBlindPlayerId).toBe('ai-1');
    expect(hand.preflopActionOrder).toEqual(['hero', 'ai-1']);
    expect(hand.postflopActionOrder).toEqual(['ai-1', 'hero']);
    expect(hand.players.hero?.position).toBe('BTN/SB');
    expect(hand.players['ai-1']?.position).toBe('BB');
    expect(hand.toAct).toBe('hero');
    expect(hand.pot).toBe(30);
  });

  it('assigns three-handed positions and starts action after the big blind', () => {
    const hand = createMultiwayHand({
      players: players(3),
      buttonSeat: 0,
      random: seededRandom(22),
    });

    expect(hand.smallBlindPlayerId).toBe('ai-1');
    expect(hand.bigBlindPlayerId).toBe('ai-2');
    expect(hand.preflopActionOrder).toEqual(['hero', 'ai-1', 'ai-2']);
    expect(hand.postflopActionOrder).toEqual(['ai-1', 'ai-2', 'hero']);
    expect(hand.players.hero?.position).toBe('BTN');
    expect(hand.players['ai-1']?.position).toBe('SB');
    expect(hand.players['ai-2']?.position).toBe('BB');
  });

  it('maps every six-max position and action order around a non-zero button', () => {
    const hand = createMultiwayHand({
      players: players(6),
      buttonSeat: 2,
      random: seededRandom(23),
    });

    expect(hand.activePlayerIds).toEqual(['ai-2', 'ai-3', 'ai-4', 'ai-5', 'hero', 'ai-1']);
    expect(hand.preflopActionOrder).toEqual(['ai-5', 'hero', 'ai-1', 'ai-2', 'ai-3', 'ai-4']);
    expect(hand.postflopActionOrder).toEqual(['ai-3', 'ai-4', 'ai-5', 'hero', 'ai-1', 'ai-2']);
    expect(hand.players['ai-2']?.position).toBe('BTN');
    expect(hand.players['ai-3']?.position).toBe('SB');
    expect(hand.players['ai-4']?.position).toBe('BB');
    expect(hand.players['ai-5']?.position).toBe('UTG');
    expect(hand.players.hero?.position).toBe('HJ');
    expect(hand.players['ai-1']?.position).toBe('CO');
  });

  it.each([
    [4, ['BTN', 'SB', 'BB', 'UTG']],
    [5, ['BTN', 'SB', 'BB', 'UTG', 'CO']],
  ] as const)('maps all positions at a %i-player table', (count, expectedPositions) => {
    const hand = createMultiwayHand({
      players: players(count),
      buttonSeat: 0,
      random: seededRandom(30 + count),
    });

    expect(hand.activePlayerIds.map((id) => hand.players[id]?.position)).toEqual(expectedPositions);
    expect(hand.preflopActionOrder).toHaveLength(count);
    expect(hand.postflopActionOrder).toHaveLength(count);
  });

  it('deals two unique cards clockwise from the small blind', () => {
    const hand = createMultiwayHand({
      players: players(6),
      buttonSeat: 2,
      random: seededRandom(24),
    });

    expect(hand.dealOrder).toEqual(['ai-3', 'ai-4', 'ai-5', 'hero', 'ai-1', 'ai-2']);
    const dealtCards = hand.activePlayerIds.flatMap((id) => hand.players[id]?.holeCards ?? []);
    expect(dealtCards).toHaveLength(12);
    expect(new Set(dealtCards.map(cardKey)).size).toBe(12);
    expect(hand.deck).toHaveLength(40);
  });

  it('skips busted and empty seats for blinds, action, and the next button', () => {
    const table = players(6, [1_000, 0, 1_000, 0, 1_000, 0]);
    const hand = createMultiwayHand({
      players: table,
      buttonSeat: 0,
      random: seededRandom(25),
    });

    expect(hand.activePlayerIds).toEqual(['hero', 'ai-2', 'ai-4']);
    expect(hand.smallBlindPlayerId).toBe('ai-2');
    expect(hand.bigBlindPlayerId).toBe('ai-4');
    expect(hand.preflopActionOrder).toEqual(['hero', 'ai-2', 'ai-4']);
    expect(hand.players['ai-1']?.holeCards).toEqual([]);
    expect(hand.players['ai-1']?.folded).toBe(true);
    expect(nextButtonSeat(table, 0)).toBe(2);
    expect(nextButtonSeat(table, 4)).toBe(0);
    expect(activePlayersClockwiseAfter(table, 2).map((player) => player.id)).toEqual(['ai-4', 'hero']);
  });

  it('posts a short blind all-in and removes that player from pending action', () => {
    const hand = createMultiwayHand({
      players: players(3, [1_000, 5, 1_000]),
      buttonSeat: 0,
      smallBlind: 10,
      bigBlind: 20,
      random: seededRandom(26),
    });

    expect(hand.players['ai-1']?.streetBet).toBe(5);
    expect(hand.players['ai-1']?.allIn).toBe(true);
    expect(hand.pot).toBe(25);
    expect(hand.currentBet).toBe(20);
    expect(hand.pending).toEqual(['hero', 'ai-2']);
  });

  it('rejects ambiguous or invalid table configurations', () => {
    expect(() => createMultiwayHand({ players: players(1) })).toThrow(/2–6 occupied seats/);
    expect(() => createMultiwayHand({ players: players(6).concat({
      id: 'ai-6', name: 'Player 7', seat: 6, stack: 1_000,
    }) })).toThrow(/2–6 occupied seats/);
    expect(() => createMultiwayHand({
      players: [{ id: 'same', name: 'A', seat: 0, stack: 1_000 }, { id: 'same', name: 'B', seat: 1, stack: 1_000 }],
    })).toThrow(/duplicated/);
    expect(() => createMultiwayHand({
      players: [{ id: 'a', name: 'A', seat: 0, stack: 1_000 }, { id: 'b', name: 'B', seat: 0, stack: 1_000 }],
    })).toThrow(/occupied twice/);
    expect(() => createMultiwayHand({
      players: players(3, [1_000, 0, 0]),
    })).toThrow(/At least two players/);
    expect(() => createMultiwayHand({ players: players(3), buttonSeat: 5 })).toThrow(/button.*chips/i);
  });

  it('preserves seating, dealing, and chip invariants across 100 varied hands', () => {
    let testedHands = 0;

    for (let count = 2; count <= 6; count += 1) {
      for (let buttonSeat = 0; buttonSeat < count; buttonSeat += 1) {
        for (let sample = 0; sample < 5; sample += 1) {
          const hand = createMultiwayHand({
            players: players(count),
            buttonSeat,
            random: seededRandom(count * 1_000 + buttonSeat * 10 + sample),
          });
          const dealtCards = hand.activePlayerIds.flatMap((id) => hand.players[id]?.holeCards ?? []);
          const chipsInStacks = hand.activePlayerIds.reduce(
            (total, id) => total + (hand.players[id]?.stack ?? 0),
            0,
          );

          expect(hand.activePlayerIds).toHaveLength(count);
          expect(hand.dealOrder).toHaveLength(count);
          expect(hand.preflopActionOrder).toHaveLength(count);
          expect(hand.postflopActionOrder).toHaveLength(count);
          expect(new Set(hand.activePlayerIds)).toEqual(new Set(hand.preflopActionOrder));
          expect(new Set(hand.activePlayerIds)).toEqual(new Set(hand.postflopActionOrder));
          expect(new Set(dealtCards.map(cardKey)).size).toBe(count * 2);
          expect(hand.deck).toHaveLength(52 - count * 2);
          expect(chipsInStacks + hand.pot).toBe(count * 1_000);
          expect(hand.smallBlindPlayerId).not.toBe(hand.bigBlindPlayerId);
          testedHands += 1;
        }
      }
    }

    expect(testedHands).toBe(100);
  });
});
