import { describe, expect, it } from 'vitest';

import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';
import type { MultiwayHandState } from '../../domain/poker/multiway';
import type { GameState } from '../../domain/poker/types';
import {
  mergeTableActivityEvents,
  projectHeadsUpTableActivity,
  projectMultiwayTableActivity,
  projectTableMomentActivity,
  type TableActivityEvent,
} from './tableActivity';

const headsUp = {
  board: [
    { rank: 14, suit: 'spades' },
    { rank: 13, suit: 'hearts' },
    { rank: 2, suit: 'clubs' },
  ],
  handNumber: 4,
  history: [
    {
      amount: 100,
      decisionContext: {
        board: [],
        currentBet: 100,
        playerStackBefore: 900,
        playerStreetBetBefore: 50,
      },
      player: 'hero',
      street: 'preflop',
      type: 'call',
    },
    {
      amount: 900,
      decisionContext: {
        board: [
          { rank: 14, suit: 'spades' },
          { rank: 13, suit: 'hearts' },
          { rank: 2, suit: 'clubs' },
        ],
        currentBet: 0,
        playerStackBefore: 900,
        playerStreetBetBefore: 0,
      },
      player: 'villain',
      street: 'flop',
      type: 'raise',
    },
  ],
  players: {
    hero: { name: 'You' },
    villain: { name: 'Mara' },
  },
  street: 'flop',
} as GameState;

describe('table activity projection', () => {
  it('projects streets, board reveals, actions, and all-in state in canonical order', () => {
    const events = projectHeadsUpTableActivity(headsUp);
    expect(events.map(({ id }) => id)).toEqual([
      '4:street:preflop',
      '4:action:0',
      '4:street:flop',
      '4:board:flop',
      '4:action:1',
    ]);
    expect(events.at(-1)).toMatchObject({
      aggression: 'bet',
      allIn: true,
      amount: 900,
      playerName: 'Mara',
    });
  });

  it('projects each side-pot award and the terminal winner without a second ledger', () => {
    const game = {
      ...headsUp,
      activePlayerIds: ['hero', 'villain'],
      history: headsUp.history.map((action) => ({ ...action, playerId: action.player })),
      outcome: {
        awards: [
          { amount: 1200, winnerPlayerIds: ['hero'] },
          { amount: 400, winnerPlayerIds: ['villain'] },
        ],
        totalPot: 1600,
        winnerPlayerIds: ['hero'],
      },
      players: {
        hero: { name: 'You' },
        villain: { name: 'Mara' },
      },
    } as unknown as MultiwayHandState;
    const terminal = projectMultiwayTableActivity(game).filter(({ kind }) => kind === 'award' || kind === 'result');
    expect(terminal).toMatchObject([
      { amount: 1200, kind: 'award', winnerNames: ['You'] },
      { amount: 400, kind: 'award', winnerNames: ['Mara'] },
      { amount: 1600, kind: 'result', winnerNames: ['You'] },
    ]);
  });

  it('projects one ordinary terminal event for the common single-recipient outcome', () => {
    // The common case: one recipient took the whole pot. The award row would
    // repeat the same winner and amount the result row already carries, so
    // the projection collapses to a single terminal event (scope 3.11E).
    const game = {
      ...headsUp,
      activePlayerIds: ['hero', 'villain'],
      history: headsUp.history.map((action) => ({ ...action, playerId: action.player })),
      outcome: {
        awards: [{ amount: 668, winnerPlayerIds: ['hero'] }],
        totalPot: 668,
        winnerPlayerIds: ['hero'],
      },
      players: {
        hero: { name: 'You' },
        villain: { name: 'Mara' },
      },
    } as unknown as MultiwayHandState;
    const terminal = projectMultiwayTableActivity(game).filter(({ kind }) => kind === 'award' || kind === 'result');
    expect(terminal).toEqual([
      expect.objectContaining({ amount: 668, kind: 'result', winnerNames: ['You'] }),
    ]);
  });

  it('keeps the award breakdown for a split pot and for an award that does not cover the pot', () => {
    const split = {
      ...headsUp,
      activePlayerIds: ['hero', 'villain'],
      history: headsUp.history.map((action) => ({ ...action, playerId: action.player })),
      outcome: {
        awards: [{ amount: 800, winnerPlayerIds: ['hero', 'villain'] }],
        totalPot: 800,
        winnerPlayerIds: ['hero', 'villain'],
      },
      players: {
        hero: { name: 'You' },
        villain: { name: 'Mara' },
      },
    } as unknown as MultiwayHandState;
    const splitTerminal = projectMultiwayTableActivity(split).filter(({ kind }) => kind === 'award' || kind === 'result');
    expect(splitTerminal).toMatchObject([
      { amount: 800, kind: 'award', winnerNames: ['You', 'Mara'] },
      { amount: 800, kind: 'result', winnerNames: ['You', 'Mara'] },
    ]);

    // An award that does not cover the whole pot needs the accounting row.
    const uncovered = {
      ...split,
      outcome: {
        awards: [{ amount: 400, winnerPlayerIds: ['hero'] }],
        totalPot: 500,
        winnerPlayerIds: ['hero'],
      },
    } as unknown as MultiwayHandState;
    const uncoveredTerminal = projectMultiwayTableActivity(uncovered).filter(({ kind }) => kind === 'award' || kind === 'result');
    expect(uncoveredTerminal).toMatchObject([
      { amount: 400, kind: 'award', winnerNames: ['You'] },
      { amount: 500, kind: 'result', winnerNames: ['You'] },
    ]);
  });

  it('orders, filters, and expires memory-only moment rows', () => {
    const moment = (id: string, atMs: number, handNumber = 4): TableMomentEnvelope => ({
      atMs,
      handNumber,
      id,
      playerId: 'hero',
      protocolVersion: 1,
      reactionId: 'cheer',
      roomId: '00000000-0000-4000-8000-000000000000',
      seat: 0,
    });
    expect(projectTableMomentActivity([
      moment('later', 9_500),
      moment('stale', 1),
      moment('other-hand', 9_800, 5),
      moment('first', 9_000),
      moment('first', 9_000),
    ], { hero: 'You' }, 4, 10_002).map(({ id }) => id)).toEqual([
      'moment:first',
      'moment:later',
    ]);
  });
});

describe('table activity reconciliation', () => {
  const action = (id: string): TableActivityEvent => ({ id, kind: 'action', sequence: 0 });
  const moment = (id: string): TableActivityEvent => ({ ephemeral: true, id, kind: 'moment', sequence: 0 });

  it('keeps observed chronology, appends unseen rows, and deduplicates reopen projections', () => {
    expect(mergeTableActivityEvents(
      [action('a1'), moment('m1')],
      [action('a1'), action('a2'), moment('m1')],
    ).map(({ id }) => id)).toEqual(['a1', 'm1', 'a2']);
  });

  it('removes expired moments while retaining reconstructable action rows', () => {
    expect(mergeTableActivityEvents(
      [action('a1'), moment('m1')],
      [action('a1')],
    ).map(({ id }) => id)).toEqual(['a1']);
  });
});
