import { describe, expect, it } from 'vitest';

import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';
import {
  TABLE_MOMENT_LANE_COUNT,
  TABLE_MOMENT_PENDING_CAPACITY,
  TABLE_MOMENT_PRESENTATION_MS,
  advanceTableMomentLanes,
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

  it('drops stale and future-skewed broadcasts before presentation', () => {
    let state = createTableMomentLaneState();
    state = offerTableMoment(state, moment('old', 1_000), 4_001);
    state = offerTableMoment(state, moment('future', 6_001), 5_000);
    expect(visibleTableMoments(state, 5_000)).toEqual([]);
    expect(state.pending).toEqual([]);
    expect(state.recentIds).toEqual([]);
    // A just-broadcast moment (within the presentation window) is accepted.
    state = offerTableMoment(state, moment('fresh', 5_000), 5_000);
    expect(visibleTableMoments(state, 5_000).map((m) => m.id)).toEqual(['fresh']);
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
