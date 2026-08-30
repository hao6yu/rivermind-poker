import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';

export const TABLE_MOMENT_LANE_COUNT = 3;
export const TABLE_MOMENT_DISPLAY_CAPACITY = 24;
export const TABLE_MOMENT_PENDING_CAPACITY = TABLE_MOMENT_DISPLAY_CAPACITY - TABLE_MOMENT_LANE_COUNT;
export const TABLE_MOMENT_RECENT_ID_CAPACITY = 48;
export const TABLE_MOMENT_PRESENTATION_MIN_MS = 6_000;
export const TABLE_MOMENT_PRESENTATION_MAX_MS = 9_000;
export const TABLE_MOMENT_TRAVEL_POINTS_PER_SECOND = 120;
export const TABLE_MOMENT_FRESHNESS_MS = 10_000;
export const TABLE_MOMENT_MAX_FUTURE_SKEW_MS = 30_000;

export interface TableMomentLane {
  durationMs: number;
  lane: number;
  moment: TableMomentEnvelope;
  visibleUntilMs: number;
}

interface QueuedTableMoment {
  durationMs: number;
  moment: TableMomentEnvelope;
}

interface RecentMomentId {
  atMs: number;
  id: string;
}

export interface TableMomentLaneState {
  lanes: [TableMomentLane | null, TableMomentLane | null, TableMomentLane | null];
  pending: QueuedTableMoment[];
  recentIds: RecentMomentId[];
}

export function tableMomentTravelDurationMs(distancePoints: number): number {
  const distanceDuration = Math.round(
    Math.max(0, distancePoints) / TABLE_MOMENT_TRAVEL_POINTS_PER_SECOND * 1_000,
  );
  return Math.max(
    TABLE_MOMENT_PRESENTATION_MIN_MS,
    Math.min(TABLE_MOMENT_PRESENTATION_MAX_MS, distanceDuration),
  );
}

export function createTableMomentLaneState(): TableMomentLaneState {
  return { lanes: [null, null, null], pending: [], recentIds: [] };
}

function stableTrackStart(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % TABLE_MOMENT_LANE_COUNT;
}

export function chooseTableMomentFreeLane(
  lanes: TableMomentLaneState['lanes'],
  id: string,
): number | null {
  const start = stableTrackStart(id);
  for (let offset = 0; offset < TABLE_MOMENT_LANE_COUNT; offset += 1) {
    const lane = (start + offset) % TABLE_MOMENT_LANE_COUNT;
    if (lanes[lane] === null) return lane;
  }
  return null;
}

function recentIdWindow(state: TableMomentLaneState, nowMs: number): RecentMomentId[] {
  return state.recentIds
    .filter((entry) => nowMs - entry.atMs <= TABLE_MOMENT_FRESHNESS_MS)
    .slice(-TABLE_MOMENT_RECENT_ID_CAPACITY);
}

export function advanceTableMomentLanes(
  state: TableMomentLaneState,
  nowMs: number,
): TableMomentLaneState {
  const next: TableMomentLaneState = {
    lanes: [null, null, null],
    pending: [...state.pending],
    recentIds: recentIdWindow(state, nowMs),
  };
  for (const lane of state.lanes) {
    if (lane && lane.visibleUntilMs > nowMs) next.lanes[lane.lane] = lane;
  }
  while (next.pending.length > 0) {
    const queued = next.pending[0];
    if (!queued) break;
    const lane = chooseTableMomentFreeLane(next.lanes, queued.moment.id);
    if (lane === null) break;
    next.pending.shift();
    next.lanes[lane] = {
      durationMs: queued.durationMs,
      lane,
      moment: queued.moment,
      visibleUntilMs: nowMs + queued.durationMs,
    };
  }
  return next;
}

export function offerTableMoment(
  state: TableMomentLaneState,
  moment: TableMomentEnvelope,
  nowMs: number,
  durationMs: number,
): TableMomentLaneState {
  const next = advanceTableMomentLanes(state, nowMs);
  if (nowMs - moment.atMs > TABLE_MOMENT_FRESHNESS_MS
    || moment.atMs > nowMs + TABLE_MOMENT_MAX_FUTURE_SKEW_MS
    || next.recentIds.some((entry) => entry.id === moment.id)
    || next.lanes.some((lane) => lane?.moment.id === moment.id)
    || next.pending.some((queued) => queued.moment.id === moment.id)) {
    return next;
  }
  next.recentIds.push({ atMs: nowMs, id: moment.id });
  const lane = chooseTableMomentFreeLane(next.lanes, moment.id);
  if (lane !== null) {
    next.lanes[lane] = {
      durationMs,
      lane,
      moment,
      visibleUntilMs: nowMs + durationMs,
    };
  } else if (next.pending.length < TABLE_MOMENT_PENDING_CAPACITY) {
    next.pending.push({ durationMs, moment });
  }
  return next;
}

export function nextTableMomentLaneExpiryMs(state: TableMomentLaneState): number | null {
  const expiries = state.lanes
    .filter((lane): lane is TableMomentLane => lane !== null)
    .map((lane) => lane.visibleUntilMs);
  return expiries.length > 0 ? Math.min(...expiries) : null;
}

export function visibleTableMomentLanes(
  state: TableMomentLaneState,
  nowMs: number,
): TableMomentLane[] {
  return state.lanes.filter(
    (lane): lane is TableMomentLane => lane !== null && lane.visibleUntilMs > nowMs,
  );
}

export function visibleTableMoments(
  state: TableMomentLaneState,
  nowMs: number,
): TableMomentEnvelope[] {
  return visibleTableMomentLanes(state, nowMs).map((lane) => lane.moment);
}
