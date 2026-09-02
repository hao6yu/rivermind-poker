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
export const PLAY_STATISTICS_VERSION = 2;

/** The three places a settled hand can come from, in display order. */
export const PLAY_STATISTICS_SOURCES = ['solo', 'local', 'private'] as const;
export type PlayStatisticsSource = (typeof PLAY_STATISTICS_SOURCES)[number];

/** The viewer's own outcome in one settled hand. */
export type PlayHandResult = 'won' | 'lost' | 'split';

/**
 * The deliberately small, stable spot taxonomy (Phase 18 S6 / P18-037). Every
 * completed hand with a hero decision lands in exactly one spot key, so the
 * spot rows stay additive with the hand total and a row can never be read as
 * a different cut of the same hands.
 */
export const PLAY_SPOT_POSITIONS = ['early', 'middle', 'late', 'blinds'] as const;
export type PlaySpotPosition = (typeof PLAY_SPOT_POSITIONS)[number];

export const PLAY_SPOT_STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
export type PlaySpotStreet = (typeof PLAY_SPOT_STREETS)[number];

/**
 * Five product families plus one explicit residual. The precedence that picks
 * one family per hand lives with the derivation (playStatisticsLedger) and is
 * fixed: blind defense outranks the raise-count families for a blind facing
 * action, then three-bet pot, facing open, then the stack/pot conditions, then
 * the residual so every spot-carrying hand has a family.
 */
export const PLAY_SPOT_FAMILIES = [
  'facing-open',
  'three-bet-pot',
  'blind-defense',
  'short-stack',
  'big-pot',
  'other',
] as const;
export type PlaySpotFamily = (typeof PLAY_SPOT_FAMILIES)[number];

/** The per-hand spot facts the projection aggregates. */
export interface PlaySpotFacts {
  family: PlaySpotFamily;
  /** The big blind that applied to this hand, for BB normalization. */
  bigBlind: number;
  /** The viewer's net chips for this hand (final − initial, play money). */
  netChips: number;
  position: PlaySpotPosition;
  /** The street of the viewer's last recorded decision. */
  street: PlaySpotStreet;
}

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
  /** Optional completion time (epoch ms) for the named comparison windows. */
  completedAtMs?: number;
  /**
   * v2 spot facts. Legacy v1 records (and sources that cannot derive a spot)
   * omit this field; such hands still count toward the totals but contribute
   * to no spot row, which the presentation reports as partial coverage.
   */
  spot?: PlaySpotFacts;
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

/** Per-spot aggregate: hands seen plus the viewer's net result. */
export interface PlaySpotAggregate {
  bigBlinds: number;
  hands: number;
  netChips: number;
}

export function playSpotKey(
  position: PlaySpotPosition,
  street: PlaySpotStreet,
  family: PlaySpotFamily,
): string {
  return `${position}:${street}:${family}`;
}

export function parsePlaySpotKey(key: string): {
  family: PlaySpotFamily;
  position: PlaySpotPosition;
  street: PlaySpotStreet;
} | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  const [position, street, family] = parts;
  if (
    !PLAY_SPOT_POSITIONS.includes(position as PlaySpotPosition)
    || !PLAY_SPOT_STREETS.includes(street as PlaySpotStreet)
    || !PLAY_SPOT_FAMILIES.includes(family as PlaySpotFamily)
  ) return null;
  return { family: family as PlaySpotFamily, position: position as PlaySpotPosition, street: street as PlaySpotStreet };
}

export interface PlayStatistics {
  version: typeof PLAY_STATISTICS_VERSION;
  hands: number;
  tables: number;
  wins: number;
  splits: number;
  bySource: Record<PlayStatisticsSource, PlaySourceTotals>;
  coverage: Record<PlayStatisticsSource, PlaySourceCoverage>;
  /**
   * v2 per-spot aggregates keyed by `position:street:family`. Built from the
   * same deduplicated hand set as the totals, so a hand is never counted in a
   * spot twice, and legacy records without spot facts simply contribute to no
   * row.
   */
  spots: Record<string, PlaySpotAggregate>;
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
    spots: {},
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
    // v2: the same deduplicated hand feeds at most one spot row. A record
    // without spot facts (legacy ledger, or a source that cannot derive one)
    // counts toward the totals but no spot, which is reported as partial
    // spot coverage rather than silently absorbed.
    const spot = record.spot;
    if (spot && Number.isFinite(spot.netChips) && Number.isFinite(spot.bigBlind)) {
      const key = playSpotKey(spot.position, spot.street, spot.family);
      const aggregate = statistics.spots[key]
        ?? { bigBlinds: 0, hands: 0, netChips: 0 };
      aggregate.hands += 1;
      aggregate.netChips += spot.netChips;
      // BB normalization uses each hand's own big blind, so an 800-chip table
      // and a 4,000-chip table stay comparable in the normalized unit.
      aggregate.bigBlinds += spot.bigBlind > 0 ? spot.netChips / spot.bigBlind : 0;
      statistics.spots[key] = aggregate;
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

/**
 * The sample floor (Phase 18 D05/S6): a spot needs this many hands before any
 * directional reading — even a rate presented beside a comparison — may be
 * shown. Below the floor the UI shows sample progress only.
 */
export const PLAY_SPOT_SAMPLE_FLOOR = 30;

/**
 * The named comparison windows. A spot compares its more recent half against
 * its older half, and only when each window independently reaches the sample
 * floor. With the projection's read ceiling this rarely activates, which is
 * the point: no trend claim is manufactured from a thin record.
 */
export type PlaySpotWindowComparison = {
  enoughData: false;
} | {
  enoughData: true;
  newer: { bigBlindsPer100: number; hands: number };
  older: { bigBlindsPer100: number; hands: number };
}

export function comparePlaySpotWindows(
  hands: ReadonlyArray<{ bigBlinds: number; completedAtMs?: number }>,
): PlaySpotWindowComparison {
  if (hands.length < PLAY_SPOT_SAMPLE_FLOOR * 2) return { enoughData: false };
  const timed = hands.filter((hand) => Number.isFinite(hand.completedAtMs));
  if (timed.length !== hands.length) return { enoughData: false };
  const ordered = [...hands].sort((left, right) => (left.completedAtMs ?? 0) - (right.completedAtMs ?? 0));
  const split = Math.floor(ordered.length / 2);
  const older = ordered.slice(0, split);
  const newer = ordered.slice(split);
  if (older.length < PLAY_SPOT_SAMPLE_FLOOR || newer.length < PLAY_SPOT_SAMPLE_FLOOR) {
    return { enoughData: false };
  }
  const per100 = (window: typeof older) => (window.reduce((total, hand) => total + hand.bigBlinds, 0) / window.length) * 100;
  return {
    enoughData: true,
    newer: { bigBlindsPer100: per100(newer), hands: newer.length },
    older: { bigBlindsPer100: per100(older), hands: older.length },
  };
}

/** A spot's normalized rate over its whole window, or null below the floor. */
export function playSpotBigBlindsPer100(aggregate: PlaySpotAggregate): number | null {
  if (aggregate.hands < PLAY_SPOT_SAMPLE_FLOOR) return null;
  return (aggregate.bigBlinds / aggregate.hands) * 100;
}
