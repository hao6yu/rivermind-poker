import { describe, expect, it } from 'vitest';

import { buildPlayStatistics, type PlayHandRecord } from '../../domain/stats/playStatistics';
import { describePlayStatistics, playStatisticsScopeNote, type Translate } from './playStatisticsPresentation';

function hand(overrides: Partial<PlayHandRecord>): PlayHandRecord {
  return { handId: 'session-a:hand:1', source: 'solo', tableId: 'session-a', completed: true, result: 'lost', ...overrides };
}

/** A translator that names its key and parameters instead of rendering copy. */
const t: Translate = (key, params) => {
  const values = Object.entries(params ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join(',');
  return values === '' ? key : `${key}(${values})`;
};

const EVERYWHERE = { solo: 'complete', local: 'complete', private: 'complete' } as const;

describe('Play record presentation', () => {
  it('shows an explicit empty state instead of a row of zeros', () => {
    // The sources were read and hold nothing: a genuinely empty record.
    const panel = describePlayStatistics(
      buildPlayStatistics([], { solo: 'complete', local: 'complete' }),
      t,
    );

    expect(panel.isEmpty).toBe(true);
    expect(panel.tiles).toEqual([]);
    expect(panel.modes).toEqual([]);
    expect(panel.notes).toEqual(['profile.stats.empty']);
  });

  it('shows four figures for a player who has finished hands', () => {
    const panel = describePlayStatistics(buildPlayStatistics([
      hand({ handId: 'a:hand:1', result: 'won' }),
      hand({ handId: 'a:hand:2', result: 'split' }),
      hand({ handId: 'a:hand:3' }),
      hand({ handId: 'b:hand:1', tableId: 'session-b', result: 'won' }),
    ], { solo: 'complete' }), t);

    expect(panel.tiles.map((tile) => [tile.id, tile.value])).toEqual([
      ['hands', '4'],
      ['tables', '2'],
      ['wins', '3'],
      ['winRate', '75%'],
    ]);
  });

  it('never leaves a figure as a dash', () => {
    const panel = describePlayStatistics(buildPlayStatistics([hand({})], { solo: 'complete' }), t);

    expect(panel.tiles.every((tile) => tile.value.trim() !== '' && tile.value !== '—')).toBe(true);
  });

  it('labels each figure so a screen reader never hears a bare number', () => {
    const panel = describePlayStatistics(buildPlayStatistics([hand({})], { solo: 'complete' }), t);

    expect(panel.tiles.map((tile) => tile.accessibilityLabel)).toEqual([
      'profile.stats.hands 1',
      'profile.stats.tables 1',
      'profile.stats.wins 0',
      'profile.stats.winRate 0%',
    ]);
  });

  it('lists only the modes the player has actually played', () => {
    const panel = describePlayStatistics(buildPlayStatistics([
      hand({ handId: 'p:1', source: 'private', tableId: 'room-1:1', result: 'won' }),
    ], { solo: 'complete', local: 'complete', private: 'complete' }), t);

    expect(panel.modes).toEqual([{ id: 'private', labelKey: 'profile.stats.private', detail: 'profile.stats.modeDetail(hands=1,wins=1)' }]);
  });

  it('names every counted source when all three were read', () => {
    const statistics = buildPlayStatistics([hand({})], EVERYWHERE);

    expect(playStatisticsScopeNote(statistics, t)).toBe(
      'profile.stats.noteScope(scope=profile.stats.scopeEverywhere)',
    );
  });

  it('narrows the stated scope to private tables when only private was read', () => {
    const statistics = buildPlayStatistics([hand({})], { private: 'complete' });

    expect(playStatisticsScopeNote(statistics, t)).toBe(
      'profile.stats.noteScope(scope=profile.stats.scopePrivate)',
    );
  });

  it('narrows the stated scope to the player’s own tables when private is unavailable', () => {
    const statistics = buildPlayStatistics([hand({})], { solo: 'complete', local: 'complete' });

    expect(playStatisticsScopeNote(statistics, t)).toBe(
      'profile.stats.noteScope(scope=profile.stats.scopeOwnTables)',
    );
  });

  it('says when the read stopped short of everything', () => {
    const statistics = buildPlayStatistics([hand({})], { solo: 'capped', local: 'complete' });

    expect(playStatisticsScopeNote(statistics, t)).toBe(
      'profile.stats.noteScopeRecent(scope=profile.stats.scopeOwnTables)',
    );
  });

  it('admits when nothing could be read instead of showing a zero record', () => {
    const statistics = buildPlayStatistics([], {});

    expect(playStatisticsScopeNote(statistics, t)).toBe('profile.stats.noteUnavailable');
  });

  it('never dresses an unreadable history up as an empty record', () => {
    const panel = describePlayStatistics(buildPlayStatistics([], {}), t);

    expect(panel.isEmpty).toBe(true);
    expect(panel.notes).toEqual(['profile.stats.noteUnavailable']);
  });

  it('still shows the plain empty state when the sources were read and are empty', () => {
    const panel = describePlayStatistics(
      buildPlayStatistics([], { solo: 'complete', local: 'complete' }),
      t,
    );

    expect(panel.isEmpty).toBe(true);
    expect(panel.notes).toEqual(['profile.stats.empty']);
  });

  it('says the totals come from this device when only the offline queue came back', () => {
    const statistics = buildPlayStatistics([
      hand({ handId: 'a:hand:1', result: 'won' }),
    ], { solo: 'partial', local: 'partial' });

    expect(playStatisticsScopeNote(statistics, t)).toBe('profile.stats.noteOffline');
  });

  it('keeps counting queued hands from a partial read', () => {
    const statistics = buildPlayStatistics([
      hand({ handId: 'a:hand:1', result: 'won' }),
    ], { solo: 'partial', local: 'partial' });

    expect(statistics.hands).toBe(1);
    expect(statistics.coverage.solo).toBe('partial');
  });

  it('prefers the offline admission over a scope claim when a partial read is capped', () => {
    const statistics = buildPlayStatistics([
      hand({ handId: 'a:hand:1' }),
    ], { solo: 'capped', local: 'partial' });

    expect(playStatisticsScopeNote(statistics, t)).toBe('profile.stats.noteOffline');
  });

  it('defines the win rate next to the win rate', () => {
    const panel = describePlayStatistics(buildPlayStatistics([hand({ result: 'won' })], { solo: 'complete' }), t);

    expect(panel.notes).toEqual([
      'profile.stats.noteScope(scope=profile.stats.scopeOwnTables)',
      'profile.stats.noteWinRate',
    ]);
  });
});
