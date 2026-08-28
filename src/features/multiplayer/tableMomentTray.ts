import { TABLE_MOMENT_COOLDOWN_MS } from '../../domain/multiplayer/tableMoments';

/**
 * Client-side tray state for sending table moments.
 *
 * The server remains authoritative for cooldown and dedup; this pure model
 * mirrors the cooldown locally so the tray can disable rapid repeat taps.
 * There is deliberately no per-hand quota.
 */

export interface TableMomentTrayState {
  /** When the current cooldown expires, or null when none is active. */
  cooldownUntilMs: number | null;
}

export function createTableMomentTrayState(): TableMomentTrayState {
  return { cooldownUntilMs: null };
}

/** Milliseconds remaining in the tray cooldown, or 0 when none. */
export function tableMomentTrayCooldownRemainingMs(
  state: TableMomentTrayState,
  nowMs: number,
): number {
  if (state.cooldownUntilMs === null) return 0;
  return Math.max(0, state.cooldownUntilMs - nowMs);
}

/** Whether the tray can accept another tap right now. */
export function tableMomentTrayCanSend(
  state: TableMomentTrayState,
  nowMs: number,
): boolean {
  return tableMomentTrayCooldownRemainingMs(state, nowMs) === 0;
}

/** Records one locally accepted moment and starts the cooldown. */
export function recordTableMomentAccepted(
  state: TableMomentTrayState,
  nowMs: number,
): TableMomentTrayState {
  return {
    cooldownUntilMs: nowMs + TABLE_MOMENT_COOLDOWN_MS,
  };
}

/**
 * Mirrors a server-side cooldown refusal: the tray re-arms only when the
 * server's own cooldown would have expired, so a raced tap cannot hammer the
 * claim.
 */
export function recordTableMomentCooldown(
  state: TableMomentTrayState,
  nowMs: number,
): TableMomentTrayState {
  return {
    cooldownUntilMs: Math.max(state.cooldownUntilMs ?? 0, nowMs + TABLE_MOMENT_COOLDOWN_MS),
  };
}

/** A hand rollover does not alter the short anti-spam cooldown. */
export function resetTableMomentTrayHand(state: TableMomentTrayState): TableMomentTrayState {
  return state;
}
