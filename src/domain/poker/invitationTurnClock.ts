/**
 * The hidden-invitation turn clock (Slice 3.11D): a pure, deterministic
 * countdown controller consumed by the multiway table screen for The River
 * Below (45 seconds) and The Undertow (30 seconds).
 *
 * Contract highlights from the scope:
 *  - The clock belongs to the local challenge rules only — no leaderboard,
 *    anti-tamper claim, or server clock.
 *  - The human's clock starts only once control has actually passed; deal,
 *    street, reaction, rotation, and result animations never consume budget.
 *  - Backgrounding or an OS-owned interruption pauses the clock and resumes
 *    with the same remaining duration.
 *  - Expiry resolves to Check when legal, otherwise Fold — the caller maps
 *    the expiry; the clock only reports it once per turn.
 */

export interface InvitationTurnClockState {
  /** Milliseconds remaining when the snapshot was taken. */
  remainingMs: number;
  running: boolean;
}

export type InvitationClockPhase = 'calm' | 'warning' | 'critical';

/** The reviewed urgency thresholds: a calm countdown, a clear warning at
 * ten seconds, and a critical state at five (scope 3.11D). */
export const INVITATION_CLOCK_WARNING_MS = 10_000;
export const INVITATION_CLOCK_CRITICAL_MS = 5_000;

export class InvitationTurnClock {
  private readonly onExpire: () => void;
  private remainingMs: number;
  private startedAt: number | null = null;
  private expired = false;

  constructor(seconds: number, onExpire: () => void) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error('The invitation turn clock requires a positive duration.');
    }
    this.remainingMs = Math.round(seconds * 1000);
    this.onExpire = onExpire;
  }

  /** Begin (or continue) counting down from the current remaining time. The
   * injectable timestamp keeps production on the wall clock while tests run
   * a deterministic timeline. */
  start(now: number = Date.now()): void {
    if (this.expired || this.startedAt !== null) return;
    this.startedAt = now;
  }

  /** Freeze the countdown (app backgrounded, OS interruption) without
   * discarding the remaining duration. */
  pause(now: number = Date.now()): void {
    if (this.startedAt === null) return;
    this.tick(now);
    this.startedAt = null;
  }

  /** True while the clock is actively counting. */
  get running(): boolean {
    return this.startedAt !== null && !this.expired;
  }

  /** Advance to `now`, fire expiry exactly once, and return the snapshot. */
  tick(now: number = Date.now()): InvitationTurnClockState {
    if (this.startedAt !== null && !this.expired) {
      this.remainingMs = Math.max(0, this.remainingMs - (now - this.startedAt));
      this.startedAt = now;
      if (this.remainingMs === 0) {
        this.expired = true;
        this.onExpire();
      }
    }
    return { remainingMs: this.remainingMs, running: this.running };
  }

  /** Whether expiry has fired for this turn. */
  get isExpired(): boolean {
    return this.expired;
  }

  /** The reviewed urgency phase for the remaining time. */
  phase(): InvitationClockPhase {
    if (this.remainingMs <= INVITATION_CLOCK_CRITICAL_MS) return 'critical';
    if (this.remainingMs <= INVITATION_CLOCK_WARNING_MS) return 'warning';
    return 'calm';
  }
}

/** A whole-second display value, rounded up so a fresh 45-second turn reads
 * "45" rather than "44.75". */
export function invitationClockSecondsLabel(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}
