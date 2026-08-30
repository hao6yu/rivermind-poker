/**
 * The single projection behind every play statistic the player reads.
 *
 * Product rule it encodes: a number appears only when it comes from a settled
 * hand the player actually played, counted once, and counted the same way in
 * every mode. Three sources feed it — heads-up solo play, local multiway
 * tables, and private multiplayer tables — and each contributes the same shape
 * of fact, so a player who has only ever played private tables sees their own
 * real totals instead of empty placeholders, while a player who has never
 * played sees an explicit empty state rather than zeros pretending to be a
 * record.
 *
 * Deliberate omission: no chip total is aggregated here. Play-money deltas are
 * reconstructable per hand only where the engine already published pot awards,
 * and inventing a cross-mode chip sum would either duplicate engine payout
 * rules or quietly mix units. Chips stay in the per-session summaries, where
 * the table that produced them is named; the aggregate reports outcomes.
 */

/** Bump when the counted rule below changes, so an older projection can be told apart. */
export const PLAY_STATISTICS_VERSION = 1;

/** The three places a settled hand can come from, in display order. */
export const PLAY_STATISTICS_SOURCES = ['solo', 'local', 'private'] as const;
export type PlayStatisticsSource = (typeof PLAY_STATISTICS_SOURCES)[number];

/** The viewer's own outcome in one settled hand. */
export type PlayHandResult = 'won' | 'lost' | 'split';

/**
 * One completed hand as the projection needs it. `handId` must be the record's
 * stable identity (`${sessionClientId}:hand:${n}` for the player's own tables,
 * `${roomId}:${sessionNumber}:${handNumber}` for private ones) so a retry, a
 * queue flush, or a replayed fetch can never count the same hand twice.
 */
export interface PlayHandRecord {
  handId: string;
  source: PlayStatisticsSource;
  /** The session or room session this hand belongs to, for the tables count. */
  tableId: string;
  /** False for an abandoned or otherwise unsettled hand, which is never counted. */
  completed: boolean;
  result: PlayHandResult;
}

/** What one source contributed. */
export interface PlaySourceTotals {
  hands: number;
  tables: number;
  /** Hands the viewer won, shared pots included. */
  wins: number;
  /** Of those wins, how many were shared with someone else. */
  splits: number;
}

/**
 * How much of a source was actually read. `capped` means the read stopped at a
 * row ceiling, so the totals describe the player's most recent hands rather
 * than everything; `partial` means the source's own store could not be reached
 * and only the offline queue came back, so its rows are real but unverified
 * against the player's full record; `unavailable` means the source was read
 * but could not be read at all and contributes nothing; `skipped` means the
 * read deliberately did not attempt the source at all (a build without that
 * table kind), which narrows the stated scope but is not a failure. Every
 * state has to be visible in the copy beside the numbers instead of being
 * silently absorbed into the figures.
 */
export type PlaySourceCoverage = 'complete' | 'capped' | 'partial' | 'unavailable' | 'skipped';

/** Whether a source's rows were part of this read at all. */
export function isReadCoverage(coverage: PlaySourceCoverage): boolean {
  return coverage !== 'unavailable' && coverage !== 'skipped';
}

/**
 * True when no source's read failed. A deliberately skipped source is not a
 * failure: the read covered everything it attempted, so an empty result is a
 * genuine empty record. A failed source leaves the record unverified, and an
 * empty result must not pose as "no finished hands yet".
 */
export function playStatisticsIsFullyReadable(
  coverage: Record<PlayStatisticsSource, PlaySourceCoverage>,
): boolean {
  return PLAY_STATISTICS_SOURCES.every((source) => {
    const state = coverage[source];
    return state === 'complete' || state === 'capped' || state === 'skipped';
  });
}

export interface PlayStatistics {
  version: typeof PLAY_STATISTICS_VERSION;
  hands: number;
  tables: number;
  wins: number;
  splits: number;
  bySource: Record<PlayStatisticsSource, PlaySourceTotals>;
  coverage: Record<PlayStatisticsSource, PlaySourceCoverage>;
}

function emptyStatistics(
  coverage: Record<PlayStatisticsSource, PlaySourceCoverage>,
): PlayStatistics {
  return {
    version: PLAY_STATISTICS_VERSION,
    hands: 0,
    tables: 0,
    wins: 0,
    splits: 0,
    bySource: {
      solo: { hands: 0, tables: 0, wins: 0, splits: 0 },
      local: { hands: 0, tables: 0, wins: 0, splits: 0 },
      private: { hands: 0, tables: 0, wins: 0, splits: 0 },
    },
    coverage,
  };
}

function readCoverage(
  coverage: Partial<Record<PlayStatisticsSource, PlaySourceCoverage>> | undefined,
): Record<PlayStatisticsSource, PlaySourceCoverage> {
  return {
    solo: coverage?.solo ?? 'unavailable',
    local: coverage?.local ?? 'unavailable',
    private: coverage?.private ?? 'unavailable',
  };
}

/** Sources whose rows were read at all, in display order. */
export function availablePlaySources(coverage: Record<PlayStatisticsSource, PlaySourceCoverage>): PlayStatisticsSource[] {
  return PLAY_STATISTICS_SOURCES.filter((source) => isReadCoverage(coverage[source]));
}

/** True when no completed hand was counted anywhere: show the empty state. */
export function playStatisticsIsEmpty(statistics: PlayStatistics): boolean {
  return statistics.hands === 0;
}

/** True when a read source was truncated, so the totals are a recent window. */
export function playStatisticsIsCapped(statistics: PlayStatistics): boolean {
  return PLAY_STATISTICS_SOURCES.some((source) => statistics.coverage[source] === 'capped');
}

/**
 * Hands won (outright or shared) out of hands completed, as a whole percentage.
 * Returns null with no denominator, so an empty record never reads as 0%.
 */
export function playStatisticsWinRate(statistics: PlayStatistics): number | null {
  if (statistics.hands === 0) return null;
  return Math.round((statistics.wins / statistics.hands) * 100);
}

/** Sources with at least one counted hand, in display order. */
export function populatedPlaySources(statistics: PlayStatistics): PlayStatisticsSource[] {
  return PLAY_STATISTICS_SOURCES.filter((source) => statistics.bySource[source].hands > 0);
}

/**
 * The counted rule: keep settled hands, drop anything without a stable
 * identity, count each identity once, count one table per distinct table
 * identity that contributed a counted hand, and ignore sources that were never
 * read so an unread source cannot dilute the totals.
 */
export function buildPlayStatistics(
  records: readonly PlayHandRecord[],
  coverage: Partial<Record<PlayStatisticsSource, PlaySourceCoverage>> = {},
): PlayStatistics {
  const read = readCoverage(coverage);
  const statistics = emptyStatistics(read);
  const seenHands = new Set<string>();
  const tablesBySource: Record<PlayStatisticsSource, Set<string>> = {
    solo: new Set(),
    local: new Set(),
    private: new Set(),
  };

  for (const record of records) {
    if (!record || record.completed !== true) continue;
    if (!isStableId(record.handId) || !isStableId(record.tableId)) continue;
    const source: PlayStatisticsSource | null = PLAY_STATISTICS_SOURCES.includes(record.source)
      ? record.source
      : null;
    if (!source || !isReadCoverage(read[source])) continue;
    if (seenHands.has(record.handId)) continue;
    seenHands.add(record.handId);

    statistics.hands += 1;
    tablesBySource[source].add(record.tableId);
    const totals = statistics.bySource[source];
    totals.hands += 1;
    if (record.result === 'won' || record.result === 'split') {
      statistics.wins += 1;
      totals.wins += 1;
      if (record.result === 'split') {
        statistics.splits += 1;
        totals.splits += 1;
      }
    }
  }

  for (const source of PLAY_STATISTICS_SOURCES) {
    statistics.bySource[source].tables = tablesBySource[source].size;
    statistics.tables += tablesBySource[source].size;
  }
  return statistics;
}

function isStableId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
