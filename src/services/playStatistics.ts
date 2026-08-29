import {
  buildPlayStatistics,
  type PlaySourceCoverage,
  type PlayStatistics,
} from '../domain/stats/playStatistics';
import {
  localPlayHandRecords,
  privatePlayHandRecords,
  soloPlayHandRecords,
} from '../domain/stats/playStatisticsLedger';
import { loadRecentHandHistoryResult } from './handHistory';
import { loadMultiplayerHandHistory } from './multiplayer';

/**
 * Reads the three canonical completed-hand ledgers and hands them to the one
 * projection. This layer decides only *how much was read*; what a number means
 * is decided in `domain/stats/playStatistics.ts`, never here.
 */

/** Hand rows requested from the player's own tables. */
export const OWN_TABLE_STATS_LIMIT = 200;

/**
 * Archive rows requested from private tables. The hand-history endpoint clamps
 * to its own ceiling, so asking for more than that ceiling is what marks the
 * private totals as a recent window rather than everything.
 */
export const PRIVATE_TABLE_STATS_LIMIT = 100;

/**
 * The player's cross-mode play record. `includePrivate` is opt-in because the
 * private-table read costs a round trip and is only available in builds that
 * ship that preview; when it is off, or the read fails, the private source is
 * reported unavailable rather than as zero hands.
 */
export async function loadPlayStatistics(input: { includePrivate?: boolean } = {}): Promise<PlayStatistics> {
  const ownRead = await loadRecentHandHistoryResult(OWN_TABLE_STATS_LIMIT);
  const ownHands = ownRead.records;
  const soloHands = ownHands.filter((hand) => hand.mode !== 'multiway');
  const localHands = ownHands.filter((hand) => hand.mode === 'multiway');
  // A failed remote read leaves only the offline queue: rows from it are real
  // but unverified against the player's full record, so they are marked partial
  // and never labelled complete — while a failed read that produced no rows at
  // all stays unavailable, so an unreadable history cannot pose as an empty one.
  const ownCoverage: PlaySourceCoverage = !ownRead.readComplete
    ? ownHands.length > 0 ? 'partial' : 'unavailable'
    : ownHands.length >= OWN_TABLE_STATS_LIMIT ? 'capped' : 'complete';

  if (!input.includePrivate) {
    return buildPlayStatistics(
      [...soloPlayHandRecords(soloHands), ...localPlayHandRecords(localHands)],
      { solo: ownCoverage, local: ownCoverage },
    );
  }

  let privateRead: PlaySourceCoverage = 'unavailable';
  const privateRecords: ReturnType<typeof privatePlayHandRecords> = [];
  try {
    const archives = await loadMultiplayerHandHistory({ limit: PRIVATE_TABLE_STATS_LIMIT });
    privateRecords.push(...privatePlayHandRecords(archives));
    privateRead = archives.length >= PRIVATE_TABLE_STATS_LIMIT ? 'capped' : 'complete';
  } catch {
    // Offline, signed out, or a preview build without the function: the private
    // source simply contributes nothing, and the copy beside the numbers says so.
    privateRead = 'unavailable';
  }

  return buildPlayStatistics(
    [...soloPlayHandRecords(soloHands), ...localPlayHandRecords(localHands), ...privateRecords],
    { solo: ownCoverage, local: ownCoverage, private: privateRead },
  );
}
