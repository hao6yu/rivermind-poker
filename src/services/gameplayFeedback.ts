export type HandResultKind = 'win' | 'loss' | 'split';

export type GameplayFeedbackCue =
  | 'newHand'
  | 'fold'
  | 'check'
  | 'call'
  | 'raise'
  | 'allIn'
  | 'streetReveal'
  | 'viewerTurn'
  | 'timerWarning'
  | 'disconnect'
  | 'restore'
  | { type: 'handResult'; result: HandResultKind };

export type GameplayFeedbackHaptic = 'light' | 'medium' | 'selection' | 'success' | 'warning';

export interface GameplayFeedbackDescriptor {
  /** Readability beat used to sequence related semantic feedback events. */
  durationMs: number;
  haptic: GameplayFeedbackHaptic;
}

const descriptorByCue: Record<Exclude<GameplayFeedbackCue, { type: 'handResult' }>, GameplayFeedbackDescriptor> = {
  newHand: { durationMs: 520, haptic: 'light' },
  fold: { durationMs: 250, haptic: 'selection' },
  check: { durationMs: 240, haptic: 'light' },
  call: { durationMs: 200, haptic: 'light' },
  raise: { durationMs: 310, haptic: 'medium' },
  allIn: { durationMs: 420, haptic: 'medium' },
  streetReveal: { durationMs: 230, haptic: 'light' },
  viewerTurn: { durationMs: 340, haptic: 'medium' },
  timerWarning: { durationMs: 360, haptic: 'warning' },
  disconnect: { durationMs: 340, haptic: 'warning' },
  restore: { durationMs: 340, haptic: 'success' },
};

/** Maps the shared semantic event contract to restrained tactile feedback. */
export function feedbackDescriptorForCue(
  cue: GameplayFeedbackCue,
  _eventId?: string,
): GameplayFeedbackDescriptor {
  if (typeof cue === 'string') return descriptorByCue[cue];
  return {
    durationMs: cue.result === 'win' ? 520 : cue.result === 'loss' ? 420 : 480,
    haptic: cue.result === 'win'
      ? 'success'
      : cue.result === 'loss'
        ? 'warning'
        : 'selection',
  };
}

export function feedbackDedupeKey(cue: GameplayFeedbackCue, eventId?: string): string | null {
  if (!eventId) return null;
  const cueType = typeof cue === 'string' ? cue : `handResult:${cue.result}`;
  return `${cueType}:${eventId}`;
}

/** Small insertion-ordered window for reconnect-safe semantic event ids. */
export class FeedbackDedupeWindow {
  readonly #seen = new Map<string, true>();

  constructor(private readonly capacity = 384) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('Feedback dedupe capacity must be a positive integer.');
    }
  }

  /** Returns true once for a keyed event. Unkeyed local events always pass. */
  consume(key: string | null): boolean {
    if (key === null) return true;
    if (this.#seen.has(key)) return false;
    this.#seen.set(key, true);
    while (this.#seen.size > this.capacity) {
      const oldest = this.#seen.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#seen.delete(oldest);
    }
    return true;
  }
}

export interface FeedbackTimerDriver {
  clear(timer: ReturnType<typeof setTimeout>): void;
  set(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
}

const nativeFeedbackTimerDriver: FeedbackTimerDriver = {
  clear: clearTimeout,
  set: setTimeout,
};

/** Provider-owned delayed work that can be invalidated as one table scope. */
export class GameplayFeedbackScopeScheduler {
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  #revision = 0;

  constructor(private readonly driver: FeedbackTimerDriver = nativeFeedbackTimerDriver) {}

  schedule(callback: () => void, delayMs: number): void {
    const revision = this.#revision;
    const timer = this.driver.set(() => {
      this.#timers.delete(timer);
      if (revision !== this.#revision) return;
      callback();
    }, Math.max(0, delayMs));
    this.#timers.add(timer);
  }

  cancelAll(): void {
    this.#revision += 1;
    this.#timers.forEach((timer) => this.driver.clear(timer));
    this.#timers.clear();
  }

  get pendingCount(): number {
    return this.#timers.size;
  }
}

export function feedbackSupersedesPendingResults(cue: GameplayFeedbackCue): boolean {
  return cue === 'newHand';
}
