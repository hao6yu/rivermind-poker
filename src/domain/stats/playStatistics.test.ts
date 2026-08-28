import { describe, expect, it } from 'vitest';

import {
  availablePlaySources,
  buildPlayStatistics,
  PLAY_STATISTICS_VERSION,
  playStatisticsIsEmpty,
  playStatisticsIsCapped,
  playStatisticsWinRate,
  populatedPlaySources,
  type PlayHandRecord,
  type PlaySourceCoverage,
} from './playStatistics';

function hand(overrides: Partial<PlayHandRecord> = {}): PlayHandRecord {
  return {
    handId: 'session-a:hand:1',
    source: 'solo',
    tableId: 'session-a',
    completed: true,
    result: 'lost',
    ...overrides,
  };
}

const READ_EVERYWHERE: Partial<Record<'solo' | 'local' | 'private', PlaySourceCoverage>> = {
  solo: 'complete',
  local: 'complete',
  private: 'complete',
};

describe('Play statistics projection', () => {
  it('counts each stable hand identity once, however many times it was fetched', () => {
    const repeated = hand({ handId: 'room-1:3:7', source: 'private', tableId: 'room-1:3' });
    const statistics = buildPlayStatistics([repeated, { ...repeated }, { ...repeated }], READ_EVERYWHERE);

    expect(statistics.hands).toBe(1);
    expect(statistics.bySource.private.hands).toBe(1);
  });

  it('counts the same hand number from two different tables as two hands', () => {
    const statistics = buildPlayStatistics([
      hand({ handId: 'room-1:3:7', source: 'private', tableId: 'room-1:3' }),
      hand({ handId: 'room-2:3:7', source: 'private', tableId: 'room-2:3', result: 'won' }),
    ], READ_EVERYWHERE);

    expect(statistics.hands).toBe(2);
    expect(statistics.tables).toBe(2);
    expect(statistics.wins).toBe(1);
  });

  it('never counts an abandoned or unsettled hand', () => {
    const statistics = buildPlayStatistics([
      hand({ completed: false }),
      hand({ handId: 'session-a:hand:2' }),
    ], READ_EVERYWHERE);

    expect(statistics.hands).toBe(1);
    expect(playStatisticsIsEmpty(statistics)).toBe(false);
  });

  it('refuses a record with no stable identity', () => {
    const statistics = buildPlayStatistics([
      hand({ handId: '   ' }),
      hand({ handId: 'session-a:hand:2', tableId: '' }),
      hand({ handId: 'session-a:hand:3' }),
    ], READ_EVERYWHERE);

    expect(statistics.hands).toBe(1);
  });

  it('counts one table per distinct table that produced a counted hand', () => {
    const statistics = buildPlayStatistics([
      hand({ handId: 'session-a:hand:1' }),
      hand({ handId: 'session-a:hand:2' }),
      hand({ handId: 'session-b:hand:1', tableId: 'session-b' }),
      hand({ completed: false, handId: 'session-c:hand:1', tableId: 'session-c' }),
    ], READ_EVERYWHERE);

    expect(statistics.tables).toBe(2);
    expect(statistics.bySource.solo.tables).toBe(2);
  });

  it('credits a shared pot as a win and keeps the shared tally separate', () => {
    const statistics = buildPlayStatistics([
      hand({ handId: 'a:hand:1', result: 'won' }),
      hand({ handId: 'a:hand:2', result: 'split' }),
      hand({ handId: 'a:hand:3', result: 'split' }),
      hand({ handId: 'a:hand:4', result: 'lost' }),
    ], READ_EVERYWHERE);

    expect(statistics.wins).toBe(3);
    expect(statistics.splits).toBe(2);
    expect(statistics.hands).toBe(4);
  });

  it('reports a win rate only when there is something to divide by', () => {
    expect(playStatisticsWinRate(buildPlayStatistics([], READ_EVERYWHERE))).toBeNull();
    expect(playStatisticsWinRate(buildPlayStatistics([
      hand({ handId: 'a:hand:1', result: 'won' }),
      hand({ handId: 'a:hand:2' }),
      hand({ handId: 'a:hand:3' }),
    ], READ_EVERYWHERE))).toBe(33);
  });

  it('gives a private-tables-only player real totals instead of an empty record', () => {
    const statistics = buildPlayStatistics([
      hand({ handId: 'room-9:1:1', source: 'private', tableId: 'room-9:1', result: 'won' }),
      hand({ handId: 'room-9:1:2', source: 'private', tableId: 'room-9:1' }),
      hand({ handId: 'room-9:1:3', source: 'private', tableId: 'room-9:1', result: 'split' }),
    ], { private: 'complete' });

    expect(playStatisticsIsEmpty(statistics)).toBe(false);
    expect(statistics.hands).toBe(3);
    expect(statistics.tables).toBe(1);
    expect(statistics.wins).toBe(2);
    expect(populatedPlaySources(statistics)).toEqual(['private']);
    expect(statistics.bySource.solo.hands).toBe(0);
  });

  it('leaves a source it never read out of the totals and out of the reading', () => {
    const statistics = buildPlayStatistics([
      hand({ handId: 'session-a:hand:1' }),
      hand({ handId: 'room-9:1:1', source: 'private', tableId: 'room-9:1' }),
    ], { solo: 'complete' });

    expect(statistics.hands).toBe(1);
    expect(statistics.bySource.private.hands).toBe(0);
    expect(availablePlaySources(statistics.coverage)).toEqual(['solo']);
  });

  it('says when the numbers came from a truncated read', () => {
    const capped = buildPlayStatistics([hand()], { solo: 'capped' });
    const full = buildPlayStatistics([hand()], { solo: 'complete' });

    expect(playStatisticsIsCapped(capped)).toBe(true);
    expect(playStatisticsIsCapped(full)).toBe(false);
  });

  it('sees every source as unavailable until something is read', () => {
    const statistics = buildPlayStatistics([]);

    expect(availablePlaySources(statistics.coverage)).toEqual([]);
    expect(playStatisticsIsEmpty(statistics)).toBe(true);
    expect(statistics.version).toBe(PLAY_STATISTICS_VERSION);
  });

  it('keeps each source in its own bucket and in display order', () => {
    const statistics = buildPlayStatistics([
      hand({ handId: 'p:1', source: 'private', tableId: 'room:1', result: 'won' }),
      hand({ handId: 'l:hand:1', source: 'local', tableId: 'session-l', result: 'won' }),
      hand({ handId: 's:hand:1', source: 'solo', tableId: 'session-s' }),
    ], READ_EVERYWHERE);

    expect(populatedPlaySources(statistics)).toEqual(['solo', 'local', 'private']);
    expect(statistics.bySource).toEqual({
      solo: { hands: 1, tables: 1, wins: 0, splits: 0 },
      local: { hands: 1, tables: 1, wins: 1, splits: 0 },
      private: { hands: 1, tables: 1, wins: 1, splits: 0 },
    });
  });
});
