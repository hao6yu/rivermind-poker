import { describe, expect, it } from 'vitest';

import type { SessionHandRecord } from '../table/sessionModels';
import { HandHistoryEvidenceController } from './handHistoryEvidenceController';
import type { HandHistorySnapshot } from './handHistoryEvidenceController';

// Resolves after every queued microtask has run, so a load's settled() effect has
// applied before the test reads the snapshot.
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

// A minimal, distinctive hand record. The controller never inspects its shape,
// so only the fields below (which give it identity for `toEqual`) matter.
function hand(id: string): SessionHandRecord {
  return {
    clientId: id,
    completedAt: '2020-01-01T00:00:00Z',
    game: null,
    coachResult: null,
    mode: 'heads_up',
  } as unknown as SessionHandRecord;
}

/** A controllable hand-history loader that returns a queued promise per call. */
class DeferredLoads {
  private pending: Array<{ resolve: (hands: SessionHandRecord[]) => void; reject: () => void }> = [];
  public calls = 0;

  load = (): Promise<SessionHandRecord[]> => {
    this.calls += 1;
    return new Promise<SessionHandRecord[]>((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  };

  /** Resolve the oldest outstanding load. */
  async resolve(hands: SessionHandRecord[]): Promise<void> {
    const next = this.pending.shift();
    if (!next) throw new Error('no pending load to resolve');
    next.resolve(hands);
    await flush();
  }

  /** Reject the oldest outstanding load. */
  async reject(): Promise<void> {
    const next = this.pending.shift();
    if (!next) throw new Error('no pending load to reject');
    next.reject();
    await flush();
  }
}

describe('HandHistoryEvidenceController', () => {
  it('opens the gate and records hands when the newest load settles', async () => {
    const loads = new DeferredLoads();
    const controller = new HandHistoryEvidenceController(loads.load);

    controller.begin();
    await loads.resolve([hand('a')]);

    expect(controller.getSnapshot()).toEqual({ hands: [hand('a')], loaded: true });
  });

  // Regression for the stale-request race: the session-opening load resolves
  // after the mission refresh has begun, and must not reopen the gate or freeze
  // the terminal summary on stale pre-mission history.
  it('discards a stale load that resolves after a mission refresh, and only the newest gates + records', async () => {
    const loads = new DeferredLoads();
    const controller = new HandHistoryEvidenceController(loads.load);

    // The session opens (gen 1), then a mission refresh supersedes it (gen 2).
    const gen1 = controller.begin();
    const gen2 = controller.begin();
    expect([gen1, gen2]).toEqual([1, 2]);

    // The initial request resolves *after* the mission refresh has started.
    await loads.resolve([hand('stale')]);
    // It is stale: the gate stays re-armed and the stale hands are ignored.
    expect(controller.getSnapshot()).toEqual({ hands: [], loaded: false });

    // The newest load then settles with the fresh, post-mission hands.
    await loads.resolve([hand('fresh')]);
    expect(controller.getSnapshot()).toEqual({ hands: [hand('fresh')], loaded: true });
  });

  it('does not re-open the gate from a stale rejection; the newest load still gates', async () => {
    const loads = new DeferredLoads();
    const controller = new HandHistoryEvidenceController(loads.load);

    controller.begin(); // gen 1 (stale)
    controller.begin(); // gen 2 (newest)

    // A stale rejection must not touch state.
    await loads.reject();
    expect(controller.getSnapshot()).toEqual({ hands: [], loaded: false });

    // The newest load still settles the gate, even on rejection.
    await loads.reject();
    expect(controller.getSnapshot()).toEqual({ hands: [], loaded: true });
  });

  it('discards outstanding loads after the session closes', async () => {
    const loads = new DeferredLoads();
    const controller = new HandHistoryEvidenceController(loads.load);

    controller.begin(); // gen 1
    controller.begin(); // gen 2

    // Closing the session invalidates both outstanding loads.
    controller.invalidate();
    expect(controller.getSnapshot()).toEqual({ hands: [], loaded: false });

    // A late-resolving load from the prior session is discarded, keeping the
    // reset snapshot.
    await loads.resolve([hand('late-1')]);
    await loads.resolve([hand('late-2')]);
    expect(controller.getSnapshot()).toEqual({ hands: [], loaded: false });
  });

  it('republishes its snapshot through onChange on settle and invalidate (begin alone does not publish)', async () => {
    const loads = new DeferredLoads();
    const controller = new HandHistoryEvidenceController(loads.load);
    const seen: Array<HandHistorySnapshot['loaded']> = [];
    controller.onChange = (snapshot) => {
      seen.push(snapshot.loaded);
    };

    controller.begin(); // a plain load does not touch the gate, so it does not publish
    await loads.resolve([hand('a')]); // the newest load settles and opens the gate
    controller.invalidate(); // closing republishes with the gate closed

    expect(seen).toEqual([true, false]);
  });

  it('publishes (re-arms) when a load is begun with { reArm: true }', async () => {
    const loads = new DeferredLoads();
    const controller = new HandHistoryEvidenceController(loads.load);
    const seen: Array<HandHistorySnapshot['loaded']> = [];
    controller.onChange = (snapshot) => {
      seen.push(snapshot.loaded);
    };

    controller.begin({ reArm: true }); // a mission refresh re-arms the gate first
    await loads.resolve([hand('a')]); // then the load settles and re-opens the gate

    expect(seen).toEqual([false, true]);
  });
});
