import { describe, expect, it } from 'vitest';

import type { PlayStatistics } from '../../stats/playStatistics';
import {
  buildPublicPlayerRecordSnapshot,
  isPublicPlayerRecordSnapshot,
  mergePublicPlayerRecordSnapshots,
  PUBLIC_PLAYER_RECORD_MAX_BYTES,
  publicPlayerRecordSerializedBytes,
} from '../playerRecordSnapshot';

function statistics(overrides: Partial<PlayStatistics> = {}): PlayStatistics {
  return {
    bySource: {
      local: { hands: 4, tables: 1, wins: 2 },
      private: { hands: 6, tables: 2, wins: 3 },
      solo: { hands: 0, tables: 0, wins: 0 },
    },
    coverage: {
      local: 'complete',
      private: 'capped',
      solo: 'skipped',
    },
    hands: 10,
    splits: 1,
    tables: 3,
    version: 1,
    wins: 5,
    ...overrides,
  } as PlayStatistics;
}

function validSnapshot() {
  return buildPublicPlayerRecordSnapshot({
    displayName: 'Hao',
    publishedAtMs: 1_710_000_000_000,
    revision: 3,
    statistics: statistics(),
  });
}

describe('public player record snapshot (3.11E)', () => {
  it('projects the Profile read with coverage preserved and totals consistent', () => {
    const snapshot = validSnapshot();
    expect(snapshot.statistics.totals).toEqual({ hands: 10, tables: 3, wins: 5 });
    expect(snapshot.statistics.bySource.private).toEqual({ hands: 6, tables: 2, wins: 3 });
    // Coverage carries over verbatim: a capped read stays capped, a skipped
    // source is never converted into a misleading zero record.
    expect(snapshot.statistics.coverage).toEqual({ local: 'complete', private: 'capped', solo: 'skipped' });
    expect(isPublicPlayerRecordSnapshot(snapshot)).toBe(true);
  });

  it('rejects unknown versions, unknown fields, and invalid shapes', () => {
    expect(isPublicPlayerRecordSnapshot({ ...validSnapshot(), version: 2 })).toBe(false);
    expect(isPublicPlayerRecordSnapshot({ ...validSnapshot(), userEmail: 'x@y.z' })).toBe(false);
    expect(isPublicPlayerRecordSnapshot({ ...validSnapshot(), accountId: 'user-1' })).toBe(false);
    expect(isPublicPlayerRecordSnapshot({ ...validSnapshot(), handIds: ['h1'] })).toBe(false);
    expect(isPublicPlayerRecordSnapshot(null)).toBe(false);
    expect(isPublicPlayerRecordSnapshot('record')).toBe(false);
    expect(isPublicPlayerRecordSnapshot({ ...validSnapshot(), revision: 0 })).toBe(false);
    expect(isPublicPlayerRecordSnapshot({ ...validSnapshot(), revision: 2.5 })).toBe(false);
    expect(isPublicPlayerRecordSnapshot({ ...validSnapshot(), displayName: '' })).toBe(false);
    expect(isPublicPlayerRecordSnapshot({ ...validSnapshot(), displayName: 'x'.repeat(41) })).toBe(false);
  });

  it('rejects negative, fractional, and inconsistent totals', () => {
    const base = validSnapshot();
    expect(isPublicPlayerRecordSnapshot({
      ...base,
      statistics: { ...base.statistics, totals: { hands: -1, tables: 3, wins: 5 } },
    })).toBe(false);
    expect(isPublicPlayerRecordSnapshot({
      ...base,
      statistics: { ...base.statistics, totals: { hands: 10.5, tables: 3, wins: 5 } },
    })).toBe(false);
    // Totals must equal the source rows exactly.
    expect(isPublicPlayerRecordSnapshot({
      ...base,
      statistics: { ...base.statistics, totals: { hands: 11, tables: 3, wins: 5 } },
    })).toBe(false);
    expect(isPublicPlayerRecordSnapshot({
      ...base,
      statistics: { ...base.statistics, totals: { hands: 10, tables: 3, wins: 6 } },
    })).toBe(false);
    // A source row cannot claim more wins than hands, or more tables than hands.
    expect(isPublicPlayerRecordSnapshot({
      ...base,
      statistics: {
        ...base.statistics,
        bySource: { ...base.statistics.bySource, local: { hands: 4, tables: 1, wins: 5 } },
      },
    })).toBe(false);
  });

  it('rejects invalid coverage states', () => {
    const base = validSnapshot();
    expect(isPublicPlayerRecordSnapshot({
      ...base,
      statistics: { ...base.statistics, coverage: { ...base.statistics.coverage, solo: 'verified' as never } },
    })).toBe(false);
  });

  it('stays within the payload bound and converges on the newest valid revision', () => {
    const snapshot = validSnapshot();
    expect(publicPlayerRecordSerializedBytes(snapshot)).toBeLessThanOrEqual(PUBLIC_PLAYER_RECORD_MAX_BYTES);

    const newer = buildPublicPlayerRecordSnapshot({
      displayName: 'Hao',
      publishedAtMs: 1_710_000_500_000,
      revision: 4,
      statistics: statistics(),
    });
    // A duplicate delivery of the same revision never overwrites; a stale one
    // never rolls back; an invalid payload never replaces a valid snapshot.
    expect(mergePublicPlayerRecordSnapshots(newer, snapshot)).toBe(newer);
    expect(mergePublicPlayerRecordSnapshots(snapshot, newer)).toEqual(newer);
    expect(mergePublicPlayerRecordSnapshots(newer, { ...snapshot, revision: 4 })).toBe(newer);
    expect(mergePublicPlayerRecordSnapshots(newer, 'garbage')).toBe(newer);
    expect(mergePublicPlayerRecordSnapshots(null, snapshot)).toEqual(snapshot);
    expect(mergePublicPlayerRecordSnapshots(null, 'garbage')).toBeNull();
  });
});
