import { type MessageKey } from '../../localization';
import {
  PLAY_STATISTICS_SOURCES,
  isReadCoverage,
  playStatisticsIsEmpty,
  playStatisticsIsCapped,
  playStatisticsIsFullyReadable,
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
 * scope it did not measure; a truncated read says "most recent" instead. A
 * partial read — the offline queue standing in for an unreachable store — gets
 * its own admission instead of a scope it could not verify, and when that
 * partial fallback shares the totals with sources that were read server-side,
 * the admission names both origins rather than crediting the server's rows to
 * this device — keeping the "most recent" qualifier whenever one of those
 * server-side reads stopped at its row ceiling.
 */
export function playStatisticsScopeNote(statistics: PlayStatistics, t: Translate): string {
  const read = PLAY_STATISTICS_SOURCES.filter((source) => isReadCoverage(statistics.coverage[source]));
  if (read.length === 0) return t('profile.stats.noteUnavailable');
  const partial = read.filter((source) => statistics.coverage[source] === 'partial');
  const readFromServer = read.filter((source) => statistics.coverage[source] !== 'partial');
  if (partial.length > 0 && readFromServer.length > 0) {
    const scope = scopeForSources(readFromServer, t) as string;
    return t(
      readFromServer.some((source) => statistics.coverage[source] === 'capped')
        ? 'profile.stats.noteOfflineMixedRecent'
        : 'profile.stats.noteOfflineMixed',
      { scope },
    );
  }
  if (partial.length > 0) return t('profile.stats.noteOffline');
  const scope = scopeForSources(read, t);
  if (scope === null) return t('profile.stats.noteUnavailable');
  return t(
    playStatisticsIsCapped(statistics) ? 'profile.stats.noteScopeRecent' : 'profile.stats.noteScope',
    { scope },
  );
}

/** The localized name of one set of counted sources. */
function scopeForSources(
  sources: PlayStatisticsSource[],
  t: Translate,
): string | null {
  const ownTables = sources.includes('solo') || sources.includes('local');
  const privateTables = sources.includes('private');
  if (ownTables && privateTables) return t('profile.stats.scopeEverywhere');
  if (privateTables) return t('profile.stats.scopePrivate');
  if (ownTables) return t('profile.stats.scopeOwnTables');
  return null;
}

/**
 * The perspective-aware record heading (scope 3.11E): the owner reads "Your
 * full record" while another room member reads the player's name — the viewer
 * is never addressed as the owner of somebody else's record, in any locale.
 */
export function playStatisticsRecordTitle(displayName: string, isViewer: boolean, t: Translate): string {
  return isViewer ? t('profile.record.ownerTitle') : t('profile.record.observerTitle', { name: displayName });
}

/** The one figure that compares across table sizes, defined where it is shown. */
export function playStatisticsWinRateNote(t: Translate): string {
  return t('profile.stats.noteWinRate');
}

/**
 * The whole strip: an explicit empty state for a player with no finished hands
 * — worded differently when nothing could be read at all — and otherwise four
 * figures, one row per mode they have actually played, and the two definition
 * lines that make those figures readable.
 */
export function describePlayStatistics(
  statistics: PlayStatistics,
  t: Translate,
): PlayStatisticsPanel {
  if (playStatisticsIsEmpty(statistics)) {
    // "No finished hands yet" is a definitive claim: it is only honest when
    // every source the read attempted came back readable. A source whose read
    // failed — even alongside one that returned nothing — leaves the record
    // unverified, and a deliberately skipped source is not a failure.
    const empty = playStatisticsIsFullyReadable(statistics.coverage)
      ? t('profile.stats.empty')
      : t('profile.stats.noteUnavailable');
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
