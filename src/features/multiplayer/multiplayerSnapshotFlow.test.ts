import { describe, expect, it, vi } from 'vitest';

import type { MultiplayerViewerProjection } from '../../domain/multiplayer/contracts';
import {
  acceptMultiplayerSnapshot,
  createMultiplayerAsyncScopeGate,
  createMultiplayerCommandGate,
  createMultiplayerSnapshotSyncCoordinator,
  createMultiplayerTimeoutAttemptGate,
  multiplayerSnapshotSessionChanged,
} from './multiplayerSnapshotFlow';

function snapshot(
  version: number,
  roomId = 'room-1',
  roomCode = '',
): MultiplayerViewerProjection {
  return {
    completionReason: null,
    config: {
      aiDifficulty: 'club',
      bigBlindChips: 20,
      handTarget: 10,
      seatCount: 3,
      smallBlindChips: 10,
      startingStackChips: 2_000,
      turnSeconds: 45,
    },
    createdAtMs: 1,
    hand: null,
    hostPlayerId: 'player-1',
    protocolVersion: 3,
    legalActions: null,
    roomCode,
    roomId,
    seats: [],
    sessionNumber: 1,
    status: 'lobby',
    turnDeadlineAtMs: null,
    nextHandAtMs: null,
    rebuyDecisionDeadlineAtMs: null,
    updatedAtMs: version,
    version,
    viewerPlayerId: 'player-1',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('multiplayer snapshot flow', () => {
  it('never regresses to an older response and preserves the private room code', () => {
    const current = snapshot(12, 'room-1', '795182');

    expect(acceptMultiplayerSnapshot(current, snapshot(11), {
      expectedRoomId: 'room-1',
    })).toBe(current);
    expect(acceptMultiplayerSnapshot(current, snapshot(13), {
      expectedRoomId: 'room-1',
    })).toMatchObject({ roomCode: '795182', version: 13 });
  });

  it('ignores a late response after the player left or changed rooms', () => {
    const current = snapshot(4, 'room-2', '123456');
    expect(acceptMultiplayerSnapshot(current, snapshot(8, 'room-1'), {
      expectedRoomId: 'room-1',
    })).toBe(current);
    expect(acceptMultiplayerSnapshot(null, snapshot(8, 'room-1'), {
      expectedRoomId: 'room-1',
    })).toBeNull();
  });

  it('marks only an authoritative same-room rematch as a presentation boundary', () => {
    const firstSession = snapshot(12);
    const rematch = { ...snapshot(13), sessionNumber: 2 };

    expect(multiplayerSnapshotSessionChanged(firstSession, rematch)).toBe(true);
    expect(multiplayerSnapshotSessionChanged(rematch, { ...snapshot(14), sessionNumber: 2 }))
      .toBe(false);
    expect(multiplayerSnapshotSessionChanged(firstSession, snapshot(13, 'room-2'))).toBe(false);
    expect(multiplayerSnapshotSessionChanged(null, rematch)).toBe(false);
  });

  it('coalesces a newer broadcast received during sync and reaches its high-water version', async () => {
    const first = deferred<MultiplayerViewerProjection>();
    const second = deferred<MultiplayerViewerProjection>();
    const sync = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const accepted: number[] = [];
    const coordinator = createMultiplayerSnapshotSyncCoordinator();

    const draining = coordinator.request(11, sync, (value) => accepted.push(value.version));
    const sameDrain = coordinator.request(12, sync, (value) => accepted.push(value.version));
    expect(sameDrain).toBe(draining);
    expect(sync).toHaveBeenCalledTimes(1);

    first.resolve(snapshot(11));
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
    second.resolve(snapshot(12));
    await draining;

    expect(accepted).toEqual([11, 12]);
  });

  it('fails a bounded catch-up that never reaches the observed version so the caller can retry', async () => {
    const accepted: number[] = [];
    const coordinator = createMultiplayerSnapshotSyncCoordinator();
    const sync = vi.fn().mockResolvedValue(snapshot(11));

    await expect(coordinator.request(12, sync, (value) => accepted.push(value.version)))
      .rejects.toThrow(/latest observed version/i);

    expect(sync).toHaveBeenCalledTimes(4);
    expect(accepted).toEqual([11, 11, 11, 11]);
    await expect(coordinator.request(12, () => Promise.resolve(snapshot(12)), () => undefined))
      .resolves.toBeUndefined();
  });

  it('discards an old in-flight sync after reset', async () => {
    const pending = deferred<MultiplayerViewerProjection>();
    const accepted: number[] = [];
    const coordinator = createMultiplayerSnapshotSyncCoordinator();
    const draining = coordinator.request(5, () => pending.promise, (value) => accepted.push(value.version));

    coordinator.reset();
    pending.resolve(snapshot(5));
    await draining;

    expect(accepted).toEqual([]);
  });

  it('synchronously rejects a second command until the first releases', () => {
    const gate = createMultiplayerCommandGate();
    const releaseFirst = gate.tryAcquire();
    expect(releaseFirst).toBeTypeOf('function');
    expect(gate.tryAcquire()).toBeNull();
    releaseFirst?.();
    expect(gate.tryAcquire()).toBeTypeOf('function');
  });

  it('invalidates network completions from an obsolete modal launch', () => {
    const gate = createMultiplayerAsyncScopeGate();
    const firstLaunch = gate.capture();
    expect(gate.isCurrent(firstLaunch)).toBe(true);

    gate.invalidate();
    const nextLaunch = gate.capture();

    expect(gate.isCurrent(firstLaunch)).toBe(false);
    expect(gate.isCurrent(nextLaunch)).toBe(true);
  });

  it('does not let an old command release a newer lease after reset', () => {
    const gate = createMultiplayerCommandGate();
    const releaseOld = gate.tryAcquire();
    gate.reset();
    const releaseNew = gate.tryAcquire();

    expect(releaseOld?.()).toBe(false);
    expect(gate.tryAcquire()).toBeNull();
    expect(releaseNew?.()).toBe(true);
    expect(gate.tryAcquire()).toBeTypeOf('function');
  });

  it('allows only one timeout attempt for an authoritative version', () => {
    const gate = createMultiplayerTimeoutAttemptGate();
    const complete = gate.begin(7, 1_000);

    expect(complete).toBeTypeOf('function');
    expect(gate.begin(7, 1_500)).toBeNull();
    expect(complete?.({ completedAtMs: 1_600, latestVersion: 7, success: true })).toBe(true);
    expect(gate.begin(7, 20_000)).toBeNull();
    expect(gate.begin(8, 1_700)).toBeTypeOf('function');
  });

  it('backs off a transient timeout failure instead of retrying every 500 ms', () => {
    const gate = createMultiplayerTimeoutAttemptGate();
    const complete = gate.begin(11, 10_000);

    expect(complete?.({ completedAtMs: 10_250, latestVersion: 11, success: false })).toBe(true);
    expect(gate.begin(11, 10_750)).toBeNull();
    expect(gate.begin(11, 11_250)).toBeNull();
    expect(gate.begin(11, 12_249)).toBeNull();
    expect(gate.begin(11, 12_250)).toBeTypeOf('function');
  });

  it('opens the advanced version immediately when a failed request observes newer state', () => {
    const gate = createMultiplayerTimeoutAttemptGate();
    const complete = gate.begin(14, 5_000);

    expect(complete?.({ completedAtMs: 5_200, latestVersion: 15, success: false })).toBe(true);
    expect(gate.begin(14, 20_000)).toBeNull();
    expect(gate.begin(15, 5_201)).toBeTypeOf('function');
  });

  it('does not let a stale timeout completion clear a newer attempt', () => {
    const gate = createMultiplayerTimeoutAttemptGate();
    const completeOld = gate.begin(21, 1_000);
    const completeNew = gate.begin(22, 1_100);

    expect(completeNew).toBeTypeOf('function');
    expect(completeOld?.({ completedAtMs: 1_200, latestVersion: 22, success: true })).toBe(false);
    expect(gate.begin(22, 1_300)).toBeNull();
    expect(completeNew?.({ completedAtMs: 1_400, latestVersion: 22, success: false })).toBe(true);
    expect(gate.begin(22, 3_399)).toBeNull();
    expect(gate.begin(22, 3_400)).toBeTypeOf('function');
  });

  it('reset invalidates an old timeout lease and permits a clean attempt', () => {
    const gate = createMultiplayerTimeoutAttemptGate();
    const completeOld = gate.begin(3, 1_000);
    gate.reset();
    const completeNew = gate.begin(3, 1_001);

    expect(completeNew).toBeTypeOf('function');
    expect(completeOld?.({ completedAtMs: 1_100, latestVersion: 3, success: true })).toBe(false);
    expect(gate.begin(3, 1_200)).toBeNull();
  });
});
