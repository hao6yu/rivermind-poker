import type { PlayStatistics, PlaySourceCoverage, PlayStatisticsSource } from '../stats/playStatistics.ts';

/**
 * The room-private Play record snapshot (scope 3.11E).
 *
 * A seat owner publishes this bounded, versioned projection of the same
 * `loadPlayStatistics({ includePrivate: true })` read their Profile shows, so
 * every current room member sees one truthful record — never a smaller
 * current-table substitute. The snapshot is deliberately narrow: no account
 * id, email, authentication metadata, stable hand/table ids, raw history, or
 * hidden cards travel in it, and the validator REJECTS unknown fields so the
 * public projection cannot quietly grow private data.
 */

export const PUBLIC_PLAYER_RECORD_SNAPSHOT_VERSION = 1;

/** The largest serialized snapshot the room accepts. */
export const PUBLIC_PLAYER_RECORD_MAX_BYTES = 4096;

/** Display names are bounded; the room re-checks its own limits too. */
const MAX_DISPLAY_NAME_LENGTH = 40;

export interface PublicPlayerRecordTotals {
  hands: number;
  tables: number;
  wins: number;
}

export interface PublicPlayerRecordSnapshot {
  displayName: string;
  publishedAtMs: number;
  /** Monotonic per publisher: convergence keeps only the newest valid value. */
  revision: number;
  statistics: {
    bySource: Record<PlayStatisticsSource, PublicPlayerRecordTotals>;
    coverage: Record<PlayStatisticsSource, PlaySourceCoverage>;
    totals: PublicPlayerRecordTotals;
  };
  version: typeof PUBLIC_PLAYER_RECORD_SNAPSHOT_VERSION;
}

const SOURCES: readonly PlayStatisticsSource[] = ['solo', 'local', 'private'];
/** Sorted once, for strict key-set comparisons. */
const SORTED_SOURCES = [...SOURCES].sort();
const COVERAGES: readonly PlaySourceCoverage[] = ['complete', 'capped', 'partial', 'unavailable', 'skipped'];

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function isTotalsShape(value: unknown): value is PublicPlayerRecordTotals {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (keys.join(',') !== 'hands,tables,wins') return false;
  return isSafeNonNegativeInteger(candidate.hands)
    && isSafeNonNegativeInteger(candidate.tables)
    && isSafeNonNegativeInteger(candidate.wins);
}

/**
 * Project one Profile statistics read into the bounded public shape. The
 * source rows and coverage states carry over verbatim — an unreadable source
 * stays `unavailable` and is never converted into a misleading zero record —
 * and `most recent` qualifiers keep living in the coverage states.
 */
export function buildPublicPlayerRecordSnapshot(input: {
  displayName: string;
  publishedAtMs: number;
  revision: number;
  statistics: PlayStatistics;
}): PublicPlayerRecordSnapshot {
  const displayName = input.displayName.trim();
  if (displayName.length === 0 || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error('A public record requires a bounded display name.');
  }
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    throw new Error('A public record revision must be a positive integer.');
  }
  if (!Number.isFinite(input.publishedAtMs) || input.publishedAtMs < 0) {
    throw new Error('A public record timestamp must be finite and non-negative.');
  }
  return {
    displayName,
    publishedAtMs: Math.round(input.publishedAtMs),
    revision: input.revision,
    statistics: {
      bySource: Object.fromEntries(SOURCES.map((source) => [source, {
        hands: input.statistics.bySource[source].hands,
        tables: input.statistics.bySource[source].tables,
        wins: input.statistics.bySource[source].wins,
      }])) as Record<PlayStatisticsSource, PublicPlayerRecordTotals>,
      coverage: Object.fromEntries(SOURCES.map((source) => [source, input.statistics.coverage[source]])) as Record<PlayStatisticsSource, PlaySourceCoverage>,
      totals: {
        hands: input.statistics.hands,
        tables: input.statistics.tables,
        wins: input.statistics.wins,
      },
    },
    version: PUBLIC_PLAYER_RECORD_SNAPSHOT_VERSION,
  };
}

/** Strict validator: known version, exact shape, bounded values, consistent totals. */
export function isPublicPlayerRecordSnapshot(value: unknown): value is PublicPlayerRecordSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== PUBLIC_PLAYER_RECORD_SNAPSHOT_VERSION) return false;
  if (Object.keys(candidate).sort().join(',') !== 'displayName,publishedAtMs,revision,statistics,version') return false;
  if (typeof candidate.displayName !== 'string'
    || candidate.displayName.trim().length === 0
    || candidate.displayName.length > MAX_DISPLAY_NAME_LENGTH) return false;
  if (!Number.isFinite(candidate.publishedAtMs) || (candidate.publishedAtMs as number) < 0) return false;
  if (!isSafeNonNegativeInteger(candidate.revision) || (candidate.revision as number) < 1) return false;
  const statistics = candidate.statistics;
  if (!statistics || typeof statistics !== 'object' || Array.isArray(statistics)) return false;
  if (Object.keys(statistics as Record<string, unknown>).sort().join(',') !== 'bySource,coverage,totals') return false;
  const stats = statistics as Record<string, unknown>;
  if (!isTotalsShape(stats.totals)) return false;
  const bySource = stats.bySource;
  if (!bySource || typeof bySource !== 'object' || Array.isArray(bySource)) return false;
  if (Object.keys(bySource as Record<string, unknown>).sort().join(',') !== SORTED_SOURCES.join(',')) return false;
  const coverage = stats.coverage;
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) return false;
  if (Object.keys(coverage as Record<string, unknown>).sort().join(',') !== SORTED_SOURCES.join(',')) return false;
  let handsSum = 0;
  let tablesSum = 0;
  let winsSum = 0;
  for (const source of SOURCES) {
    if (!isTotalsShape((bySource as Record<string, unknown>)[source])) return false;
    const totals = (bySource as Record<string, PublicPlayerRecordTotals>)[source]!;
    if (totals.wins > totals.hands || totals.tables > totals.hands) return false;
    handsSum += totals.hands;
    tablesSum += totals.tables;
    winsSum += totals.wins;
    const state = (coverage as Record<string, unknown>)[source];
    if (!COVERAGES.includes(state as PlaySourceCoverage)) return false;
  }
  const totals = stats.totals as PublicPlayerRecordTotals;
  // Totals must equal their source rows exactly: a snapshot that credits the
  // totals with hands the rows do not show is inconsistent, not private.
  if (totals.hands !== handsSum || totals.tables !== tablesSum || totals.wins !== winsSum) return false;
  if (totals.wins > totals.hands || totals.tables > totals.hands) return false;
  return true;
}

/**
 * Snapshot convergence: reconnects, retries, and duplicate deliveries converge
 * on the NEWEST valid revision; a stale or equal-revision replay never
 * overwrites newer data, and an invalid payload never replaces a valid one.
 */
export function mergePublicPlayerRecordSnapshots(
  current: PublicPlayerRecordSnapshot | null,
  incoming: unknown,
): PublicPlayerRecordSnapshot | null {
  if (!isPublicPlayerRecordSnapshot(incoming)) return current;
  if (current && incoming.revision <= current.revision) return current;
  return incoming;
}

/** The serialized payload size the room transport must stay within. */
export function publicPlayerRecordSerializedBytes(snapshot: PublicPlayerRecordSnapshot): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).length;
}

/**
 * The snapshot's bounded rows re-materialized as the shared Play statistics
 * shape, so the room sheet renders through the exact `PlayStatisticsCard`
 * presentation Profile uses. `splits` is deliberately not part of the public
 * projection and reads zero without affecting any displayed figure.
 */
export function publicPlayerRecordStatistics(snapshot: PublicPlayerRecordSnapshot): PlayStatistics {
  return {
    bySource: snapshot.statistics.bySource,
    coverage: snapshot.statistics.coverage,
    hands: snapshot.statistics.totals.hands,
    splits: 0,
    tables: snapshot.statistics.totals.tables,
    wins: snapshot.statistics.totals.wins,
    // S6/P18-037: spot aggregates stay private to the owner's device. The
    // public room sheet keeps the v1 totals shape and shows no spot rows.
    spots: {},
    // The public projection is deliberately the v1 shape (no spots), so the
    // version is stated as its own constant rather than the v2 default.
    version: 1,
  } as unknown as PlayStatistics;
}
