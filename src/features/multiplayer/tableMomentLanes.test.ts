import { describe, expect, it } from 'vitest';

import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';
import {
  TABLE_MOMENT_LANE_COUNT,
  TABLE_MOMENT_MAX_FUTURE_SKEW_MS,
  TABLE_MOMENT_PENDING_CAPACITY,
  TABLE_MOMENT_PRESENTATION_MS,
  advanceTableMomentLanes,
  assignTableMomentVisualTracks,
  createTableMomentLaneState,
  offerTableMoment,
  visibleTableMoments,
} from './tableMomentLanes';

function moment(id: string, atMs: number): TableMomentEnvelope {
  return {
    atMs,
    handNumber: 1,
    id,
    playerId: 'player-1',
    protocolVersion: 1,
    reactionId: 'cheer',
    roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    seat: 0,
  };
}

describe('table moment bullet-screen lanes', () => {
  it('uses stable varied visual tracks without overlapping simultaneous moments', () => {
    const first = assignTableMomentVisualTracks(['m1', 'm2']);
    const repeated = assignTableMomentVisualTracks(['m1', 'm2']);
    expect(repeated).toEqual(first);
    expect(new Set(first).size).toBe(2);
    expect(first.every((track) => track >= 0 && track < 3)).toBe(true);
    expect(assignTableMomentVisualTracks(['m1'])).toEqual([first[0]]);
  });

  it('shows at most two moments at once and promotes queued moments FIFO', () => {
    let state = createTableMomentLaneState();
    state = offerTableMoment(state, moment('m1', 1_000), 1_000);
    state = offerTableMoment(state, moment('m2', 1_100), 1_100);
    state = offerTableMoment(state, moment('m3', 1_200), 1_200);
    expect(visibleTableMoments(state, 1_200).map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(state.pending.map((m) => m.id)).toEqual(['m3']);
    // After m1's window, the queued m3 promotes into the freed lane 0 while
    // m2 keeps lane 1: promotion is FIFO, lanes keep their positions.
    const firstExpiry = 1_000 + TABLE_MOMENT_PRESENTATION_MS;
    state = advanceTableMomentLanes(state, firstExpiry);
    expect(visibleTableMoments(state, firstExpiry).map((m) => m.id))
      .toEqual(['m3', 'm2']);
    // m2 expires at its own window; the promoted m3 keeps a full window on
    // screen (promotion restarts its presentation window).
    state = advanceTableMomentLanes(state, 1_100 + TABLE_MOMENT_PRESENTATION_MS);
    expect(visibleTableMoments(state, 1_100 + TABLE_MOMENT_PRESENTATION_MS).map((m) => m.id))
      .toEqual(['m3']);
    expect(visibleTableMoments(state, 6_999).map((m) => m.id)).toEqual(['m3']);
    state = advanceTableMomentLanes(state, 7_000);
    expect(visibleTableMoments(state, 7_000)).toEqual([]);
    expect(state.pending).toEqual([]);
  });

  it('keeps a maximum of two lanes and drops the newest moment when full', () => {
    let state = createTableMomentLaneState();
    for (let index = 0; index < TABLE_MOMENT_PENDING_CAPACITY + 2; index += 1) {
      state = offerTableMoment(state, moment(`m${index}`, 1_000), 1_000);
    }
    expect(state.lanes.filter(Boolean)).toHaveLength(TABLE_MOMENT_LANE_COUNT);
    expect(state.pending).toHaveLength(TABLE_MOMENT_PENDING_CAPACITY);
    // The moment offered when everything was full is dropped: the newest
    // overflow never displaces an older queued moment.
    expect(state.pending.map((m) => m.id)).toEqual(
      ['m2', 'm3', 'm4', 'm5'],
    );
  });

  it('drops stale and bogus-future broadcasts but tolerates real clock skew', () => {
    let state = createTableMomentLaneState();
    state = offerTableMoment(state, moment('old', 1_000), 4_001);
    // A stamp more than the tolerated skew ahead is bogus and dropped.
    state = offerTableMoment(state, moment('bogus-future', 5_000 + TABLE_MOMENT_MAX_FUTURE_SKEW_MS + 1), 5_000);
    expect(visibleTableMoments(state, 5_000)).toEqual([]);
    expect(state.pending).toEqual([]);
    expect(state.recentIds).toEqual([]);
    // A device whose clock lags the server by seconds still presents the
    // moment (server-stamped envelope arrives stamped slightly in the
    // future relative to the device clock).
    state = offerTableMoment(state, moment('skewed', 5_000 + 5_000), 5_000);
    expect(visibleTableMoments(state, 5_000).map((m) => m.id)).toEqual(['skewed']);
    // A just-broadcast moment (within the presentation window) is accepted.
    state = offerTableMoment(state, moment('fresh', 5_000), 5_000);
    expect(visibleTableMoments(state, 5_000).map((m) => m.id)).toEqual(['skewed', 'fresh']);
  });

  it('never promotes a queued moment whose stamp went stale while waiting', () => {
    let state = createTableMomentLaneState();
    state = offerTableMoment(state, moment('m1', 1_000), 1_000);
    state = offerTableMoment(state, moment('m2', 1_000), 1_000);
    state = offerTableMoment(state, moment('m3', 1_000), 1_000);
    // Both lanes expire and the queued moment's stamp is now outside the
    // presentation window: promotion must drop it, not present it late.
    state = advanceTableMomentLanes(state, 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1);
    expect(visibleTableMoments(state, 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1)).toEqual([]);
    expect(state.pending).toEqual([]);
    // A queue that stayed fresh is still promoted normally: when both lanes
    // expire, the pending moment (stamped 2.6s ago) promotes instead of
    // being dropped.
    state = offerTableMoment(state, moment('m4', 1_000), 1_000);
    state = offerTableMoment(state, moment('m5', 1_000), 1_000);
    state = offerTableMoment(state, moment('m6', 1_400), 1_400);
    state = advanceTableMomentLanes(state, 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1);
    expect(visibleTableMoments(state, 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1).map((m) => m.id))
      .toEqual(['m6']);
    expect(state.pending).toEqual([]);
  });

  it('drops a true replay of an id with its original stale stamp', () => {
    let state = createTableMomentLaneState();
    state = offerTableMoment(state, moment('m1', 1_000), 1_000);
    state = advanceTableMomentLanes(state, 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1);
    // A genuine replayed broadcast keeps its original (now stale) stamp and
    // must not reappear; only a freshly stamped envelope may reuse the id.
    state = offerTableMoment(state, moment('m1', 1_000), 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1);
    expect(visibleTableMoments(state, 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1)).toEqual([]);
  });

  it('deduplicates replayed broadcasts within the presentation window', () => {
    let state = createTableMomentLaneState();
    state = offerTableMoment(state, moment('m1', 1_000), 1_000);
    const once = visibleTableMoments(state, 1_000);
    state = offerTableMoment(state, moment('m1', 1_000), 1_100);
    state = offerTableMoment(state, moment('m1', 1_000), 1_200);
    expect(visibleTableMoments(state, 1_200)).toEqual(once);
    expect(state.pending).toEqual([]);
    // A replayed id arriving after the window is presentable again.
    state = advanceTableMomentLanes(state, 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1);
    state = offerTableMoment(state, moment('m1', 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1), 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1);
    expect(visibleTableMoments(state, 1_000 + TABLE_MOMENT_PRESENTATION_MS + 1).map((m) => m.id))
      .toEqual(['m1']);
  });

  it('never shows more than one moment per lane', () => {
    let state = createTableMomentLaneState();
    for (let index = 0; index < 8; index += 1) {
      state = offerTableMoment(state, moment(`m${index}`, 1_000), 1_000);
    }
    const lanes = state.lanes.filter(Boolean);
    expect(new Set(lanes.map((lane) => lane!.lane)).size).toBe(TABLE_MOMENT_LANE_COUNT);
    expect(lanes.map((lane) => lane!.moment.id)).toEqual(['m0', 'm1']);
  });
});
