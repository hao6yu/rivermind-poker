import {
  TABLE_MOMENT_COOLDOWN_MS,
  TABLE_MOMENT_HUMAN_HAND_BUDGET,
} from '../../domain/multiplayer/tableMoments';

/**
 * Client-side tray state for sending table moments.
 *
 * The server remains authoritative for cooldown, budget, and dedup; this pure
 * model mirrors the same rules locally so the tray can disable reactions and
 * show the remaining per-hand budget without waiting for a rejection. A
 * rejected send simply does not advance the local counters.
 */

export interface TableMomentTrayState {
  /** Moments accepted this hand (per the server, mirrored locally). */
  acceptedThisHand: number;
  /** When the current cooldown expires, or null when none is active. */
  cooldownUntilMs: number | null;
}

export function createTableMomentTrayState(): TableMomentTrayState {
  return { acceptedThisHand: 0, cooldownUntilMs: null };
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
  return state.acceptedThisHand < TABLE_MOMENT_HUMAN_HAND_BUDGET
    && tableMomentTrayCooldownRemainingMs(state, nowMs) === 0;
}

/** Records one locally accepted moment and starts the cooldown. */
export function recordTableMomentAccepted(
  state: TableMomentTrayState,
  nowMs: number,
): TableMomentTrayState {
  return {
    acceptedThisHand: state.acceptedThisHand + 1,
    cooldownUntilMs: nowMs + TABLE_MOMENT_COOLDOWN_MS,
  };
}

/**
 * Mirrors a server-side cooldown refusal without counting it against the
 * per-hand budget: the tray re-arms only when the server's own cooldown
 * would have expired, so a raced tap cannot hammer the claim.
 */
export function recordTableMomentCooldown(
  state: TableMomentTrayState,
  nowMs: number,
): TableMomentTrayState {
  return {
    acceptedThisHand: state.acceptedThisHand,
    cooldownUntilMs: Math.max(state.cooldownUntilMs ?? 0, nowMs + TABLE_MOMENT_COOLDOWN_MS),
  };
}

/** Rolls the tray state over when a new hand begins. */
export function resetTableMomentTrayHand(state: TableMomentTrayState): TableMomentTrayState {
  return { ...state, acceptedThisHand: 0 };
}

/** Remaining per-hand budget for the tray indicator. */
export function tableMomentTrayHandBudgetRemaining(state: TableMomentTrayState): number {
  return Math.max(0, TABLE_MOMENT_HUMAN_HAND_BUDGET - state.acceptedThisHand);
}
