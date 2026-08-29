import { describe, expect, it } from 'vitest';

import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';
import {
  DEFAULT_TABLE_MOMENT_PREFERENCES,
  tableMomentMotionEnabled,
  tableMomentVisible,
  withTableMomentSeatMuted,
} from './tableMomentPreferences';

const moment: TableMomentEnvelope = {
  atMs: 1_000,
  handNumber: 1,
  id: 'm1',
  playerId: 'player-1',
  protocolVersion: 1,
  reactionId: 'cheer',
  roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  seat: 2,
};

describe('table moment presentation preferences', () => {
  it('defaults to motion and no visual muting', () => {
    expect(DEFAULT_TABLE_MOMENT_PREFERENCES).toEqual({
      motion: true,
      muteAll: false,
      muteSeats: [],
    });
    expect(tableMomentVisible(DEFAULT_TABLE_MOMENT_PREFERENCES, moment)).toBe(true);
    expect(tableMomentMotionEnabled(DEFAULT_TABLE_MOMENT_PREFERENCES, false)).toBe(true);
  });

  it('hides moments via mute-all or per-seat muting', () => {
    expect(tableMomentVisible({ ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteAll: true }, moment))
      .toBe(false);
    expect(tableMomentVisible(
      { ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteSeats: [2] },
      moment,
    )).toBe(false);
    expect(tableMomentVisible(
      { ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteSeats: [1] },
      moment,
    )).toBe(true);
  });

  it('honors Reduced Motion independently of visibility', () => {
    expect(tableMomentMotionEnabled(DEFAULT_TABLE_MOMENT_PREFERENCES, true)).toBe(false);
    expect(tableMomentMotionEnabled({ ...DEFAULT_TABLE_MOMENT_PREFERENCES, motion: false }, false))
      .toBe(false);
    expect(tableMomentVisible(DEFAULT_TABLE_MOMENT_PREFERENCES, moment)).toBe(true);
  });

  it('toggles per-seat muting immutably', () => {
    const muted = withTableMomentSeatMuted(DEFAULT_TABLE_MOMENT_PREFERENCES, 2, true);
    expect(muted.muteSeats).toEqual([2]);
    expect(DEFAULT_TABLE_MOMENT_PREFERENCES.muteSeats).toEqual([]);
    expect(withTableMomentSeatMuted(muted, 2, true).muteSeats).toEqual([2]);
    expect(withTableMomentSeatMuted(muted, 2, false).muteSeats).toEqual([]);
    expect(tableMomentVisible(muted, moment)).toBe(false);
  });
});
