import { type MessageKey } from '../../localization';
import {
  PLAY_STATISTICS_SOURCES,
  playStatisticsIsEmpty,
  playStatisticsIsCapped,
  playStatisticsWinRate,
  populatedPlaySources,
  type PlaySourceTotals,
  type PlayStatistics,
  type PlayStatisticsSource,
} from '../../domain/stats/playStatistics';

/**
 * The copy rules for the play-record strip, kept out of the component so they
 * can be tested without a render. Everything the player reads here is a count of
 * hands they finished; no figure is a cash amount, and the note beside the
 * numbers always describes the window the numbers actually came from.
 */

/** Minimal shape of the translator, so the rules can be tested with a fake. */
export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export interface PlayStatisticsTile {
  id: 'hands' | 'tables' | 'wins' | 'winRate';
  labelKey: MessageKey;
  value: string;
  /** Spoken as one element so the figure and its meaning are never split. */
  accessibilityLabel: string;
}

export interface PlayStatisticsModeRow {
  id: PlayStatisticsSource;
  labelKey: MessageKey;
  detail: string;
}

export interface PlayStatisticsPanel {
  isEmpty: boolean;
  tiles: PlayStatisticsTile[];
  modes: PlayStatisticsModeRow[];
  notes: string[];
  accessibilityLabel: string;
}

function tile(
  id: PlayStatisticsTile['id'],
  labelKey: MessageKey,
  value: string,
  t: Translate,
): PlayStatisticsTile {
  const label = t(labelKey);
  return { id, labelKey, value, accessibilityLabel: `${label} ${value}` };
}

const MODE_LABEL_KEYS: Record<PlayStatisticsSource, MessageKey> = {
  solo: 'profile.stats.solo',
  local: 'profile.stats.local',
  private: 'profile.stats.private',
};

/** The localized name of one play source. */
function totalsFor(statistics: PlayStatistics, source: PlayStatisticsSource): PlaySourceTotals {
  return statistics.bySource[source];
}

/**
 * What the counted window covers. Phrased from the sources that were actually
 * read, so a build without private tables, or an offline read, never claims a
 * scope it did not measure; a truncated read says "most recent" instead.
 */
export function playStatisticsScopeNote(statistics: PlayStatistics, t: Translate): string {
  const read = PLAY_STATISTICS_SOURCES.filter((source) => statistics.coverage[source] !== 'unavailable');
  const ownTables = read.includes('solo') || read.includes('local');
  const privateTables = read.includes('private');
  let scope: string | null = null;
  if (ownTables && privateTables) scope = t('profile.stats.scopeEverywhere');
  else if (privateTables) scope = t('profile.stats.scopePrivate');
  else if (ownTables) scope = t('profile.stats.scopeOwnTables');
  if (scope === null) return t('profile.stats.noteUnavailable');
  return t(
    playStatisticsIsCapped(statistics) ? 'profile.stats.noteScopeRecent' : 'profile.stats.noteScope',
    { scope },
  );
}

/** The one figure that compares across table sizes, defined where it is shown. */
export function playStatisticsWinRateNote(t: Translate): string {
  return t('profile.stats.noteWinRate');
}

/**
 * The whole strip: an explicit empty state for a player with no finished hands,
 * and otherwise four figures, one row per mode they have actually played, and
 * the two definition lines that make those figures readable.
 */
export function describePlayStatistics(
  statistics: PlayStatistics,
  t: Translate,
): PlayStatisticsPanel {
  if (playStatisticsIsEmpty(statistics)) {
    const empty = t('profile.stats.empty');
    return { isEmpty: true, tiles: [], modes: [], notes: [empty], accessibilityLabel: empty };
  }

  const winRate = playStatisticsWinRate(statistics);
  const tiles: PlayStatisticsTile[] = [
    tile('hands', 'profile.stats.hands', String(statistics.hands), t),
    tile('tables', 'profile.stats.tables', String(statistics.tables), t),
    tile('wins', 'profile.stats.wins', String(statistics.wins), t),
    tile('winRate', 'profile.stats.winRate', `${winRate ?? 0}%`, t),
  ];

  const modes: PlayStatisticsModeRow[] = populatedPlaySources(statistics).map((source) => {
    const totals = totalsFor(statistics, source);
    return {
      id: source,
      labelKey: MODE_LABEL_KEYS[source],
      detail: t('profile.stats.modeDetail', { hands: totals.hands, wins: totals.wins }),
    };
  });

  const notes = [playStatisticsScopeNote(statistics, t), playStatisticsWinRateNote(t)];

  return {
    isEmpty: false,
    tiles,
    modes,
    notes,
    accessibilityLabel: [
      t('profile.stats.title'),
      ...tiles.map((entry) => entry.accessibilityLabel),
      ...modes.map((mode) => `${t(mode.labelKey)}, ${mode.detail}`),
      ...notes,
    ].join('. '),
  };
}
