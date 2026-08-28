import { describe, expect, it } from 'vitest';

import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';
import {
  DEFAULT_TABLE_MOMENT_PREFERENCES,
  tableMomentHapticsEnabled,
  tableMomentIsFullySilent,
  tableMomentMotionEnabled,
  tableMomentSoundEnabled,
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
  it('defaults to sound, motion, and no seat muting', () => {
    expect(DEFAULT_TABLE_MOMENT_PREFERENCES).toEqual({
      motion: true,
      muteAll: false,
      muteSeats: [],
      sound: true,
    });
    expect(tableMomentSoundEnabled(DEFAULT_TABLE_MOMENT_PREFERENCES, moment)).toBe(true);
    expect(tableMomentMotionEnabled(DEFAULT_TABLE_MOMENT_PREFERENCES, false)).toBe(true);
  });

  it('mutes sound via master sound, mute-all, or per-seat muting', () => {
    expect(tableMomentSoundEnabled({ ...DEFAULT_TABLE_MOMENT_PREFERENCES, sound: false }, moment))
      .toBe(false);
    expect(tableMomentSoundEnabled({ ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteAll: true }, moment))
      .toBe(false);
    expect(tableMomentSoundEnabled(
      { ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteSeats: [2] },
      moment,
    )).toBe(false);
    // A different seat still plays sound.
    expect(tableMomentSoundEnabled(
      { ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteSeats: [1] },
      moment,
    )).toBe(true);
  });

  it('honors Reduced Motion and the haptics-off flag', () => {
    expect(tableMomentMotionEnabled(DEFAULT_TABLE_MOMENT_PREFERENCES, true)).toBe(false);
    expect(tableMomentMotionEnabled({ ...DEFAULT_TABLE_MOMENT_PREFERENCES, motion: false }, false))
      .toBe(false);
    expect(tableMomentHapticsEnabled(DEFAULT_TABLE_MOMENT_PREFERENCES, true)).toBe(false);
    expect(tableMomentHapticsEnabled(DEFAULT_TABLE_MOMENT_PREFERENCES, false)).toBe(true);
    expect(tableMomentHapticsEnabled({ ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteAll: true }, false))
      .toBe(false);
  });

  it('combines flags for the fully-silent case', () => {
    expect(tableMomentIsFullySilent(
      DEFAULT_TABLE_MOMENT_PREFERENCES,
      moment,
      false,
      false,
    )).toBe(false);
    expect(tableMomentIsFullySilent(
      { ...DEFAULT_TABLE_MOMENT_PREFERENCES, muteAll: true, motion: false },
      moment,
      true,
      true,
    )).toBe(true);
    // Sound off alone still allows motion.
    expect(tableMomentIsFullySilent(
      { ...DEFAULT_TABLE_MOMENT_PREFERENCES, sound: false },
      moment,
      false,
      false,
    )).toBe(false);
  });

  it('toggles per-seat muting immutably', () => {
    const muted = withTableMomentSeatMuted(DEFAULT_TABLE_MOMENT_PREFERENCES, 2, true);
    expect(muted.muteSeats).toEqual([2]);
    expect(DEFAULT_TABLE_MOMENT_PREFERENCES.muteSeats).toEqual([]);
    expect(withTableMomentSeatMuted(muted, 2, true).muteSeats).toEqual([2]);
    expect(withTableMomentSeatMuted(muted, 2, false).muteSeats).toEqual([]);
    expect(tableMomentSoundEnabled(muted, moment)).toBe(false);
  });
});
