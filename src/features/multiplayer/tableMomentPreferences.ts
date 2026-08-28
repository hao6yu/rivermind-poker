import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';

/**
 * Device-local presentation preferences for table moments.
 *
 * Purely functional so preference combinations are unit-testable without a
 * render harness. Preferences are device-local by scope: mute-all, per-seat
 * muting, master sound, and motion all gate only this device's presentation —
 * they never affect what the room broadcasts.
 */

export interface TableMomentPreferences {
  /** Master sound toggle for table moments. */
  sound: boolean;
  /** Mute every table-moment sound on this device. */
  muteAll: boolean;
  /** Seats whose moment sounds are muted on this device. */
  muteSeats: number[];
  /** Allow lane animation/motion for moments on this device. */
  motion: boolean;
}

export const DEFAULT_TABLE_MOMENT_PREFERENCES: TableMomentPreferences = {
  motion: true,
  muteAll: false,
  muteSeats: [],
  sound: true,
};

/** Whether a moment should play sound on this device. */
export function tableMomentSoundEnabled(
  preferences: TableMomentPreferences,
  moment: TableMomentEnvelope,
): boolean {
  return preferences.sound
    && !preferences.muteAll
    && !preferences.muteSeats.includes(moment.seat);
}

/** Whether lane animation is allowed, honoring the OS Reduced Motion flag. */
export function tableMomentMotionEnabled(
  preferences: TableMomentPreferences,
  reducedMotion: boolean,
): boolean {
  return preferences.motion && !reducedMotion;
}

/** Whether haptics are allowed for a moment, honoring the OS haptics flag. */
export function tableMomentHapticsEnabled(
  preferences: TableMomentPreferences,
  hapticsOff: boolean,
): boolean {
  return preferences.sound && !preferences.muteAll && !hapticsOff;
}

/** Whether this moment is fully silent on this device (no sound, no motion). */
export function tableMomentIsFullySilent(
  preferences: TableMomentPreferences,
  moment: TableMomentEnvelope,
  reducedMotion: boolean,
  hapticsOff: boolean,
): boolean {
  return !tableMomentSoundEnabled(preferences, moment)
    && !tableMomentMotionEnabled(preferences, reducedMotion)
    && !tableMomentHapticsEnabled(preferences, hapticsOff);
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
