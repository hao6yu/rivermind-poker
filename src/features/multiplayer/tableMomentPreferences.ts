import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';

/**
 * Device-local presentation preferences for table moments.
 *
 * Purely functional so preference combinations are unit-testable without a
 * render harness. Preferences are device-local by scope: mute-all, per-seat
 * muting, and motion gate only this device's presentation. Reactions never
 * emit sound or haptics and preferences never affect what the room broadcasts.
 */

export interface TableMomentPreferences {
  /** Hide every table moment on this device. */
  muteAll: boolean;
  /** Seats whose table moments are hidden on this device. */
  muteSeats: number[];
  /** Allow lane animation/motion for moments on this device. */
  motion: boolean;
}

export const DEFAULT_TABLE_MOMENT_PREFERENCES: TableMomentPreferences = {
  motion: true,
  muteAll: false,
  muteSeats: [],
};

/** Whether a moment should be presented on this device. */
export function tableMomentVisible(
  preferences: TableMomentPreferences,
  moment: TableMomentEnvelope,
): boolean {
  return !preferences.muteAll && !preferences.muteSeats.includes(moment.seat);
}

/** Whether lane animation is allowed, honoring the OS Reduced Motion flag. */
export function tableMomentMotionEnabled(
  preferences: TableMomentPreferences,
  reducedMotion: boolean,
): boolean {
  return preferences.motion && !reducedMotion;
}

/** Toggles per-seat muting without mutating the input preferences. */
export function withTableMomentSeatMuted(
  preferences: TableMomentPreferences,
  seat: number,
  muted: boolean,
): TableMomentPreferences {
  const muteSeats = muted
    ? (preferences.muteSeats.includes(seat)
      ? preferences.muteSeats
      : [...preferences.muteSeats, seat])
    : preferences.muteSeats.filter((mutedSeat) => mutedSeat !== seat);
  return { ...preferences, muteSeats };
}
