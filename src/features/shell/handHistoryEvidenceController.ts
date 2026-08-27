import type { SessionHandRecord } from '../table/sessionModels';

export interface HandHistorySnapshot {
  hands: SessionHandRecord[];
  /**
   * Whether the gate is open: the newest load has settled (on resolve or
   * reject). The closing view gates the terminal summary freeze on this so a
   * cold relaunch or a returning mission never freezes stale pre-load history.
   */
  loaded: boolean;
}

/** A load's settled outcome: `ok` when the records loaded, otherwise the load was rejected. */
export interface HandHistoryLoadResult {
  ok: boolean;
  hands: SessionHandRecord[];
}

/**
 * Coordinates the recommended session's closing hand-history loads so that only
 * the newest load may record the hands and (re)open the terminal summary's gate.
 *
 * Every load captures the current generation and settles against it. A load that
 * resolves after a newer one has started — for example the session-opening load
 * racing a mission refresh, or a late request after the session closed — is
 * stale: it is discarded and never touches the state. The newest load always
 * opens the gate on resolve or reject, so the terminal view is never stranded on
 * a loading placeholder.
 *
 * The controller owns no React state; it notifies subscribers via `onChange` so
 * the shell can mirror its snapshot into component state.
 */
export class HandHistoryEvidenceController {
  private generation = 0;
  private hands: SessionHandRecord[] = [];
  private loaded = false;
  /** Invoked (with the current snapshot) whenever the controller changes. */
  onChange: ((snapshot: HandHistorySnapshot) => void) | null = null;

  constructor(
    private readonly load: () => Promise<SessionHandRecord[]> = () => Promise.resolve([]),
  ) {}

  /** The latest settled snapshot. */
  getSnapshot(): HandHistorySnapshot {
    return { hands: this.hands, loaded: this.loaded };
  }

  /**
   * Begin a load, returning its generation. By default a load does not touch the
   * gate (it settles it, on resolve or reject, when it completes). Pass
   * `{ reArm: true }` to close the gate immediately — so a terminal view that is
   * about to appear refreezes only the hands this newer load resolves with,
   * rather than freezing the stale pre-mission set.
   */
  begin(options: { reArm?: boolean } = {}): number {
    const gen = ++this.generation;
    const reArm = options.reArm === true;
    if (reArm) this.loaded = false;
    void this.load().then(
      (hands) => this.settle(gen, { ok: true, hands }),
      () => this.settle(gen, { ok: false, hands: [] }),
    );
    if (reArm) this.publish();
    return gen;
  }

  /**
   * Settle a load after it has resolved or rejected. The newest load records the
   * hands on resolve and always opens the gate; any other (stale) load is
   * discarded and never touches state.
   */
  settle(gen: number, result: HandHistoryLoadResult): void {
    if (gen !== this.generation) return;
    if (result.ok) this.hands = result.hands;
    this.loaded = true;
    this.publish();
  }

  /** Invalidate every outstanding load, e.g. when the session closes. */
  invalidate(): void {
    this.generation += 1;
    this.hands = [];
    this.loaded = false;
    this.publish();
  }

  private publish(): void {
    this.onChange?.(this.getSnapshot());
  }
}
