import { describe, expect, it } from 'vitest';

import {
  createTableOrientationController,
  tableOrientationDestination,
  type TableOrientationApplyResult,
  type TableOrientationSelection,
} from './tableOrientationController';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('table orientation controller', () => {
  it('does not call native orientation APIs while a live table is mounting', async () => {
    const requests: Array<{
      deferred: ReturnType<typeof deferred<TableOrientationApplyResult>>;
      selection: TableOrientationSelection;
    }> = [];
    const controller = createTableOrientationController({
      apply(selection) {
        const request = { deferred: deferred<TableOrientationApplyResult>(), selection };
        requests.push(request);
        return request.deferred.promise;
      },
    });
    const snapshots = [controller.snapshot()];
    controller.subscribe((snapshot) => snapshots.push(snapshot));

    controller.setLive(true);
    expect(requests).toEqual([]);
    expect(controller.snapshot()).toEqual({ failure: null, presentation: 'portrait', selected: 'portrait' });

    controller.select('landscape');
    expect(requests.map((request) => request.selection)).toEqual(['landscape']);
    expect(controller.snapshot()).toMatchObject({ presentation: 'changing', selected: 'landscape' });

    requests[0]!.deferred.resolve('applied');
    await flushPromises();
    expect(controller.snapshot()).toEqual({ failure: null, presentation: 'landscape', selected: 'landscape' });
    expect(snapshots.at(-1)).toEqual({ failure: null, presentation: 'landscape', selected: 'landscape' });
  });

  it('restores portrait once after exit even when a landscape request is in flight', async () => {
    const requests: Array<{
      deferred: ReturnType<typeof deferred<TableOrientationApplyResult>>;
      selection: TableOrientationSelection;
    }> = [];
    const controller = createTableOrientationController({
      apply(selection) {
        const request = { deferred: deferred<TableOrientationApplyResult>(), selection };
        requests.push(request);
        return request.deferred.promise;
      },
    });
    controller.setLive(true);
    controller.select('landscape');
    controller.setLive(false);
    requests[0]!.deferred.resolve('applied');
    await flushPromises();

    expect(requests.map((request) => request.selection)).toEqual(['landscape', 'portrait']);
    requests[1]!.deferred.resolve('applied');
    await flushPromises();
    expect(requests).toHaveLength(2);
  });

  it('reapplies the selected orientation after foregrounding', async () => {
    const applied: TableOrientationSelection[] = [];
    const controller = createTableOrientationController({
      async apply(selection) {
        applied.push(selection);
        return 'applied';
      },
    });
    controller.setLive(true);
    await flushPromises();
    controller.select('landscape');
    await flushPromises();
    controller.foreground();
    await flushPromises();
    expect(applied).toEqual(['landscape', 'landscape']);
  });

  it('exposes unsupported and retryable failure states without throwing', async () => {
    let outcome: 'unsupported' | 'failed' | 'applied' = 'unsupported';
    const controller = createTableOrientationController({
      async apply() {
        if (outcome === 'failed') throw new Error('native refusal');
        return outcome;
      },
    });
    controller.setLive(true);
    await flushPromises();
    controller.select('landscape');
    await flushPromises();
    expect(controller.snapshot()).toMatchObject({ failure: 'unsupported', presentation: 'unsupported' });

    outcome = 'failed';
    controller.select('landscape');
    await flushPromises();
    expect(controller.snapshot()).toMatchObject({ failure: 'failed', presentation: 'landscape' });

    outcome = 'applied';
    controller.select('landscape');
    await flushPromises();
    expect(controller.snapshot()).toEqual({ failure: null, presentation: 'landscape', selected: 'landscape' });

    controller.select('portrait');
    await flushPromises();
    expect(controller.snapshot()).toEqual({ failure: null, presentation: 'portrait', selected: 'portrait' });
  });
});

describe('tableOrientationDestination (3.11E)', () => {
  it('always labels the OTHER orientation as the toggle destination', () => {
    expect(tableOrientationDestination('portrait')).toBe('landscape');
    expect(tableOrientationDestination('landscape')).toBe('portrait');
  });
});
