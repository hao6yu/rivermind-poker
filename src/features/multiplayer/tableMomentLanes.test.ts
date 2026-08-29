import { describe, expect, it } from 'vitest';

import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';
import {
  TABLE_MOMENT_DISPLAY_CAPACITY,
  TABLE_MOMENT_FRESHNESS_MS,
  TABLE_MOMENT_LANE_COUNT,
  TABLE_MOMENT_MAX_FUTURE_SKEW_MS,
  TABLE_MOMENT_PENDING_CAPACITY,
  TABLE_MOMENT_PRESENTATION_MAX_MS,
  TABLE_MOMENT_PRESENTATION_MIN_MS,
  advanceTableMomentLanes,
  chooseTableMomentFreeLane,
  createTableMomentLaneState,
  nextTableMomentLaneExpiryMs,
  offerTableMoment,
  tableMomentTravelDurationMs,
  visibleTableMomentLanes,
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

const duration = 7_000;

describe('stable three-track table moment scheduler', () => {
  it('derives a linear distance duration clamped to six through nine seconds', () => {
    expect(tableMomentTravelDurationMs(100)).toBe(TABLE_MOMENT_PRESENTATION_MIN_MS);
    expect(tableMomentTravelDurationMs(840)).toBe(7_000);
    expect(tableMomentTravelDurationMs(2_000)).toBe(TABLE_MOMENT_PRESENTATION_MAX_MS);
  });

  it('chooses a deterministic free track and never moves an existing entry', () => {
    let state = createTableMomentLaneState();
    const preferred = chooseTableMomentFreeLane(state.lanes, 'm1');
    state = offerTableMoment(state, moment('m1', 1_000), 1_000, duration);
    const first = visibleTableMomentLanes(state, 1_000)[0];
    expect(first?.lane).toBe(preferred);
    state = offerTableMoment(state, moment('m2', 1_001), 1_001, duration);
    state = offerTableMoment(state, moment('m3', 1_002), 1_002, duration);
    expect(visibleTableMomentLanes(state, 1_002).find((lane) => lane.moment.id === 'm1'))
      .toEqual(first);
    expect(new Set(visibleTableMomentLanes(state, 1_002).map((lane) => lane.lane)).size).toBe(3);
  });

  it('queues collision-free overflow FIFO and promotes it only after expiry', () => {
    let state = createTableMomentLaneState();
    for (let index = 0; index < 5; index += 1) {
      state = offerTableMoment(state, moment(`m${index}`, 1_000 + index), 1_000 + index, duration);
    }
    expect(visibleTableMomentLanes(state, 1_004)).toHaveLength(TABLE_MOMENT_LANE_COUNT);
    expect(state.pending.map(({ moment: entry }) => entry.id)).toEqual(['m3', 'm4']);
    const expiry = nextTableMomentLaneExpiryMs(state);
    expect(expiry).not.toBeNull();
    state = advanceTableMomentLanes(state, expiry!);
    expect(visibleTableMoments(state, expiry!).map((entry) => entry.id)).toContain('m3');
    expect(state.pending.map(({ moment: entry }) => entry.id)).toEqual(['m4']);
  });

  it('bounds the full display allocation at 24 without displacing older entries', () => {
    let state = createTableMomentLaneState();
    for (let index = 0; index < TABLE_MOMENT_DISPLAY_CAPACITY + 1; index += 1) {
      state = offerTableMoment(state, moment(`m${index}`, 1_000), 1_000, duration);
    }
    expect(state.lanes.filter(Boolean)).toHaveLength(TABLE_MOMENT_LANE_COUNT);
    expect(state.pending).toHaveLength(TABLE_MOMENT_PENDING_CAPACITY);
    expect(state.pending.at(-1)?.moment.id).toBe(`m${TABLE_MOMENT_DISPLAY_CAPACITY - 1}`);
  });

  it('keeps repeated reactions distinct while deduplicating the same envelope id', () => {
    let state = createTableMomentLaneState();
    state = offerTableMoment(state, moment('unique-a', 1_000), 1_000, duration);
    state = offerTableMoment(state, moment('unique-b', 1_000), 1_000, duration);
    state = offerTableMoment(state, moment('unique-a', 1_000), 1_001, duration);
    expect(visibleTableMoments(state, 1_001).map((entry) => entry.id).sort())
      .toEqual(['unique-a', 'unique-b']);
  });

  it('drops expired and bogus-future envelopes but accepts honest clock skew', () => {
    let state = createTableMomentLaneState();
    state = offerTableMoment(state, moment('old', 1_000), 1_000 + TABLE_MOMENT_FRESHNESS_MS + 1, duration);
    state = offerTableMoment(
      state,
      moment('future', 5_000 + TABLE_MOMENT_MAX_FUTURE_SKEW_MS + 1),
      5_000,
      duration,
    );
    expect(visibleTableMoments(state, 5_000)).toEqual([]);
    state = offerTableMoment(state, moment('skewed', 10_000), 5_000, duration);
    expect(visibleTableMoments(state, 5_000).map((entry) => entry.id)).toEqual(['skewed']);
  });

  it('does not restart a stable entry when another moment arrives', () => {
    let state = offerTableMoment(createTableMomentLaneState(), moment('first', 1_000), 1_000, duration);
    const before = visibleTableMomentLanes(state, 2_000).find((lane) => lane.moment.id === 'first');
    state = offerTableMoment(state, moment('later', 2_000), 2_000, duration);
    const after = visibleTableMomentLanes(state, 2_000).find((lane) => lane.moment.id === 'first');
    expect(after?.lane).toBe(before?.lane);
    expect(after?.visibleUntilMs).toBe(before?.visibleUntilMs);
    expect(after?.durationMs).toBe(before?.durationMs);
  });
});
