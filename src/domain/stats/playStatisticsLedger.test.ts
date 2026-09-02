import { describe, expect, it } from 'vitest';

import type { MultiwayHandOutcome, MultiwayHandState } from '../poker/multiway';
import type { GameState, PlayerId, PlayerState } from '../poker/types';
import {
  allPlayHandRecords,
  localPlayHandRecords,
  privatePlayHandRecords,
  soloPlayHandRecords,
  type LocalMultiwayLedgerHand,
  type PrivateLedgerHand,
} from './playStatisticsLedger';
import { buildPlayStatistics } from './playStatistics';

type HeadsUpWinner = 'hero' | 'villain' | 'tie';

function headsUpHand(
  clientId: string,
  winner: HeadsUpWinner | null,
): { clientId: string; game: Pick<GameState, 'street' | 'outcome' | 'bigBlind' | 'button' | 'players' | 'history'> } {
  return {
    clientId,
    game: {
      bigBlind: 20,
      button: 'hero',
      history: [],
      outcome: winner === null
        ? undefined
        : { winner, message: '', potWon: 40, showdown: true },
      players: {} as Record<PlayerId, PlayerState>,
      street: winner === null ? 'river' : 'complete',
    },
  };
}

function award(shares: Record<string, number>): MultiwayHandOutcome['awards'][number] {
  const winners = Object.entries(shares)
    .filter(([, chips]) => chips > 0)
    .map(([playerId]) => playerId);
  return { amount: 100, contributionCap: 100, eligiblePlayerIds: winners, kind: 'main', shares, winnerPlayerIds: winners };
}

function outcomeOf(shares: Record<string, number>): MultiwayHandOutcome {
  return { awards: [award(shares)], showdown: true, totalPot: 100, winnerPlayerIds: award(shares).winnerPlayerIds };
}

function multiwayHand(
  clientId: string,
  outcome: MultiwayHandOutcome | undefined,
): LocalMultiwayLedgerHand {
  return {
    clientId,
    game: {
      bigBlind: 20,
      history: [],
      outcome,
      players: {} as Record<string, never>,
      street: outcome ? 'complete' : 'turn',
    } as Pick<MultiwayHandState, 'street' | 'outcome' | 'bigBlind' | 'players' | 'history'>,
  };
}

function archiveHand(input: {
  roomId?: string;
  sessionNumber?: number;
  handNumber?: number;
  viewerPlayerId?: string;
  outcome?: MultiwayHandOutcome | undefined;
}): PrivateLedgerHand {
  return {
    roomId: input.roomId ?? 'room-1',
    sessionNumber: input.sessionNumber ?? 1,
    viewerPlayerId: input.viewerPlayerId ?? 'seat-4',
    hand: {
      bigBlind: 20,
      handNumber: input.handNumber ?? 1,
      history: [],
      outcome: input.outcome,
      players: {} as Record<string, never>,
      street: input.outcome ? 'complete' : 'preflop',
    },
  };
}

describe('Play statistics ledger adapters', () => {
  it('counts a heads-up hand the player won and one they lost', () => {
    const records = soloPlayHandRecords([
      headsUpHand('session-a:hand:1', 'hero'),
      headsUpHand('session-a:hand:2', 'villain'),
    ]);

    expect(records.map((record) => record.result)).toEqual(['won', 'lost']);
    expect(records[0]!.tableId).toBe('session-a');
    expect(records[1]!.source).toBe('solo');
  });

  it('reads a heads-up split as a shared win', () => {
    expect(soloPlayHandRecords([headsUpHand('session-a:hand:1', 'tie')])[0]!.result).toBe('split');
  });

  it('drops a heads-up hand that never reached a result', () => {
    expect(soloPlayHandRecords([headsUpHand('session-a:hand:1', null)])).toEqual([]);
  });

  it('drops a record whose saved state is missing instead of guessing', () => {
    expect(soloPlayHandRecords([{ clientId: 'session-a:hand:1', game: null }])).toEqual([]);
    expect(localPlayHandRecords([{ clientId: 'session-a:hand:1', game: undefined }])).toEqual([]);
  });

  it('keeps two sessions of hands apart', () => {
    const records = soloPlayHandRecords([
      headsUpHand('session-a:hand:1', 'hero'),
      headsUpHand('session-b:hand:1', 'hero'),
    ]);

    expect(new Set(records.map((record) => record.tableId))).toEqual(new Set(['session-a', 'session-b']));
  });

  it('counts the hero as a winner of a local multiway main pot', () => {
    const records = localPlayHandRecords([
      multiwayHand('table-a:hand:1', outcomeOf({ hero: 100 })),
      multiwayHand('table-a:hand:2', outcomeOf({ 'ai-1': 100 })),
    ]);

    expect(records.map((record) => record.result)).toEqual(['won', 'lost']);
    expect(records[0]!.source).toBe('local');
  });

  it('credits a side-pot-only finish as a shared win, never as a loss', () => {
    const records = localPlayHandRecords([
      multiwayHand('table-a:hand:1', {
        awards: [award({ 'ai-1': 140 }), award({ hero: 60 })],
        showdown: true,
        totalPot: 200,
        winnerPlayerIds: ['ai-1'],
      }),
    ]);

    expect(records[0]!.result).toBe('split');
  });

  it('treats an abandoned local hand as no record at all', () => {
    expect(localPlayHandRecords([multiwayHand('table-a:hand:1', undefined)])).toEqual([]);
  });

  it('identifies a private hand by room, session, and hand number', () => {
    const records = privatePlayHandRecords([
      archiveHand({ roomId: 'room-1', sessionNumber: 2, handNumber: 5 }),
      archiveHand({ roomId: 'room-1', sessionNumber: 2, handNumber: 6, outcome: outcomeOf({ 'seat-4': 100 }) }),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]!.handId).toBe('room-1:2:6');
    expect(records[0]!.tableId).toBe('room-1:2');
    expect(records[0]!.result).toBe('won');
  });

  it('scores a private hand from the viewer seat, not the hero seat', () => {
    const sharedPot = {
      awards: [award({ 'seat-4': 50, 'seat-5': 50 })],
      showdown: true,
      totalPot: 100,
      winnerPlayerIds: ['seat-4', 'seat-5'],
    };
    const forViewer = privatePlayHandRecords([archiveHand({ viewerPlayerId: 'seat-4', outcome: sharedPot })]);
    const forSomeoneElse = privatePlayHandRecords([archiveHand({ viewerPlayerId: 'seat-9', outcome: {
      awards: [award({ 'seat-4': 100 })],
      showdown: true,
      totalPot: 100,
      winnerPlayerIds: ['seat-4'],
    } })]);

    expect(forViewer[0]!.result).toBe('split');
    expect(forSomeoneElse[0]!.result).toBe('lost');
  });

  it('refuses an archive row with an unusable identity', () => {
    expect(privatePlayHandRecords([archiveHand({ handNumber: 0, outcome: outcomeOf({ 'seat-4': 10 }) })])).toEqual([]);
    expect(privatePlayHandRecords([archiveHand({ roomId: ' ', outcome: outcomeOf({ 'seat-4': 10 }) })])).toEqual([]);
    expect(privatePlayHandRecords([archiveHand({ viewerPlayerId: '', outcome: outcomeOf({ 'seat-4': 10 }) })])).toEqual([]);
  });

  it('assembles one ordered ledger across the three modes', () => {
    const records = allPlayHandRecords({
      solo: [headsUpHand('session-a:hand:1', 'hero')],
      local: [multiwayHand('table-a:hand:1', outcomeOf({ hero: 100 }))],
      private: [archiveHand({ outcome: outcomeOf({ 'seat-4': 100 }) })],
    });

    expect(records.map((record) => record.source)).toEqual(['solo', 'local', 'private']);
    const statistics = buildPlayStatistics(records, { solo: 'complete', local: 'complete', private: 'complete' });
    expect(statistics.hands).toBe(3);
    expect(statistics.wins).toBe(3);
    expect(statistics.tables).toBe(3);
  });
});
