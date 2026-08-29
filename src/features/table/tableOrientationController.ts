export type TableOrientationSelection = 'portrait' | 'landscape';

export type TableOrientationPresentationState =
  | TableOrientationSelection
  | 'changing'
  | 'unsupported';

export type TableOrientationFailure = 'failed' | 'unsupported' | null;

export interface TableOrientationSnapshot {
  failure: TableOrientationFailure;
  presentation: TableOrientationPresentationState;
  selected: TableOrientationSelection;
}

export type TableOrientationApplyResult = 'applied' | 'unsupported';

export interface TableOrientationAdapter {
  apply(selection: TableOrientationSelection): Promise<TableOrientationApplyResult>;
}

export interface TableOrientationController {
  foreground(): void;
  select(selection: TableOrientationSelection): void;
  setLive(active: boolean): void;
  snapshot(): TableOrientationSnapshot;
  subscribe(listener: (snapshot: TableOrientationSnapshot) => void): () => void;
}

interface OrientationRequest {
  publish: boolean;
  revision: number;
  selection: TableOrientationSelection;
}

const INITIAL_SNAPSHOT: TableOrientationSnapshot = {
  failure: null,
  presentation: 'portrait',
  selected: 'portrait',
};

/**
 * Serializes native orientation locks for the whole live-table surface.
 *
 * Native locks cannot be cancelled. A newer selection therefore replaces the
 * pending request and bumps the revision; the older completion is allowed to
 * settle but cannot publish UI state. The replacement starts only afterwards,
 * so there is never more than one native request in flight.
 */
export function createTableOrientationController(
  adapter: TableOrientationAdapter,
): TableOrientationController {
  let active = false;
  let applying = false;
  let pending: OrientationRequest | null = null;
  let revision = 0;
  let current = INITIAL_SNAPSHOT;
  const listeners = new Set<(snapshot: TableOrientationSnapshot) => void>();

  const publish = (snapshot: TableOrientationSnapshot) => {
    current = snapshot;
    for (const listener of listeners) listener(snapshot);
  };

  const drain = () => {
    if (applying || pending === null) return;
    const request = pending;
    pending = null;
    applying = true;
    void adapter.apply(request.selection).then((result) => {
      applying = false;
      const currentRequest = request.revision === revision;
      if (request.publish && active && currentRequest) {
        publish(result === 'unsupported'
          ? {
            failure: 'unsupported',
            presentation: 'unsupported',
            selected: request.selection,
          }
          : {
            failure: null,
            presentation: request.selection,
            selected: request.selection,
          });
      }
      drain();
    }).catch(() => {
      applying = false;
      if (request.publish && active && request.revision === revision) {
        publish({
          failure: 'failed',
          presentation: request.selection,
          selected: request.selection,
        });
      }
      drain();
    });
  };

  const enqueue = (selection: TableOrientationSelection, publishState: boolean) => {
    revision += 1;
    pending = { publish: publishState, revision, selection };
    if (publishState) {
      publish({ failure: null, presentation: 'changing', selected: selection });
    }
    drain();
  };

  return {
    foreground() {
      if (!active) return;
      enqueue(current.selected, true);
    },
    select(selection) {
      if (!active) return;
      if (selection === current.selected && current.failure === null) return;
      enqueue(selection, true);
    },
    setLive(nextActive) {
      if (nextActive === active) return;
      active = nextActive;
      if (active) {
        enqueue('portrait', true);
        return;
      }
      // Every live-table exit owns one portrait restoration. It is serialized
      // behind an uninterruptible native lock and deliberately publishes no
      // state into the screen that just unmounted.
      current = INITIAL_SNAPSHOT;
      enqueue('portrait', false);
    },
    snapshot() {
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
  };
}
