import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';

/**
 * Bounded two-lane bullet-screen presentation for table moments.
 *
 * Pure and UI-framework-free so the lane allocation, bounded queues, expiry,
 * and FIFO overflow behavior are fully unit-testable without a React Native
 * render harness. Two lanes show at most two moments at once, each for
 * `TABLE_MOMENT_PRESENTATION_MS`; moments that arrive while both lanes and the
 * bounded pending queue are full are dropped, keeping the oldest pending
 * moment (the safe order for a live table). A bounded, TTL-pruned recent-id
 * window deduplicates replayed broadcasts. Audio/haptics/UI scheduling live in
 * the presentation layer; this module only decides what is visible when.
 */

export const TABLE_MOMENT_PRESENTATION_MS = 3_000;
export const TABLE_MOMENT_LANE_COUNT = 2;
export const TABLE_MOMENT_PENDING_CAPACITY = 4;
export const TABLE_MOMENT_RECENT_ID_CAPACITY = 16;

export interface TableMomentLane {
  /** Which lane (0 or 1) shows this moment. */
  lane: number;
  moment: TableMomentEnvelope;
  visibleUntilMs: number;
}

interface RecentMomentId {
  atMs: number;
  id: string;
}

export interface TableMomentLaneState {
  /** Moments currently on screen, one per lane at most. */
  lanes: [TableMomentLane | null, TableMomentLane | null];
  /** FIFO queue of moments waiting for a free lane. */
  pending: TableMomentEnvelope[];
  /** Bounded recent-id window for broadcast deduplication. */
  recentIds: RecentMomentId[];
}

export function createTableMomentLaneState(): TableMomentLaneState {
  return { lanes: [null, null], pending: [], recentIds: [] };
}

function recentIdWindow(state: TableMomentLaneState, nowMs: number): RecentMomentId[] {
  // Ids are meaningful only while a moment could still be presented: prune
  // entries older than one presentation lifetime, then cap the window.
  return state.recentIds
    .filter((entry) => nowMs - entry.atMs <= TABLE_MOMENT_PRESENTATION_MS)
    .slice(-TABLE_MOMENT_RECENT_ID_CAPACITY);
}

function hasRecentId(state: TableMomentLaneState, id: string, nowMs: number): boolean {
  return recentIdWindow(state, nowMs).some((entry) => entry.id === id);
}

/**
 * Expires lanes whose presentation window passed and promotes queued moments
 * into free lanes in FIFO order. Returns a new state; never mutates input.
 */
export function advanceTableMomentLanes(
  state: TableMomentLaneState,
  nowMs: number,
): TableMomentLaneState {
  const next: TableMomentLaneState = {
    lanes: [null, null],
    pending: [...state.pending],
    recentIds: recentIdWindow(state, nowMs),
  };
  for (const lane of state.lanes) {
    if (lane && lane.visibleUntilMs > nowMs) next.lanes[lane.lane] = lane;
  }
  while (next.pending.length > 0 && (next.lanes[0] === null || next.lanes[1] === null)) {
    const laneIndex = next.lanes[0] === null ? 0 : 1;
    const moment = next.pending.shift();
    if (!moment) break;
    next.lanes[laneIndex] = {
      lane: laneIndex,
      moment,
      visibleUntilMs: nowMs + TABLE_MOMENT_PRESENTATION_MS,
    };
  }
  return next;
}

/**
 * Offers one received moment to the presentation. Stale broadcasts and
 * duplicates are dropped; otherwise the moment fills a free lane or joins the
 * FIFO queue, and is dropped only when lanes and queue are all full. Returns
 * the next state.
 */
export function offerTableMoment(
  state: TableMomentLaneState,
  moment: TableMomentEnvelope,
  nowMs: number,
): TableMomentLaneState {
  const next: TableMomentLaneState = {
    lanes: [...state.lanes],
    pending: [...state.pending],
    recentIds: recentIdWindow(state, nowMs),
  };
  if (hasRecentId(next, moment.id, nowMs)) return next;
  if (next.lanes.some((lane) => lane !== null && lane.moment.id === moment.id)) return next;
  if (nowMs - moment.atMs > TABLE_MOMENT_PRESENTATION_MS || moment.atMs > nowMs + 1_000) {
    return next;
  }
  next.recentIds.push({ atMs: nowMs, id: moment.id });
  if (next.lanes[0] === null) {
    next.lanes[0] = { lane: 0, moment, visibleUntilMs: nowMs + TABLE_MOMENT_PRESENTATION_MS };
    return next;
  }
  if (next.lanes[1] === null) {
    next.lanes[1] = { lane: 1, moment, visibleUntilMs: nowMs + TABLE_MOMENT_PRESENTATION_MS };
    return next;
  }
  if (next.pending.length < TABLE_MOMENT_PENDING_CAPACITY) {
    next.pending.push(moment);
    return next;
  }
  return next;
}

/** The moments currently visible, in lane order. */
export function visibleTableMoments(
  state: TableMomentLaneState,
  nowMs: number,
): TableMomentEnvelope[] {
  return state.lanes
    .filter((lane): lane is TableMomentLane => lane !== null && lane.visibleUntilMs > nowMs)
    .map((lane) => lane.moment);
}
