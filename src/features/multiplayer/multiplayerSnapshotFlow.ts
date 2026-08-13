import type { MultiplayerViewerProjection } from '../../domain/multiplayer/contracts';

export interface MultiplayerSnapshotAcceptanceOptions {
  /** Ignore a response that belongs to a room the player already left. */
  expectedRoomId?: string;
  /** Sync responses deliberately omit the private room code. */
  knownRoomCode?: string;
}

/**
 * Every network ingress uses this reducer so an out-of-order response can
 * never move the visible table back to an older authoritative version.
 */
export function acceptMultiplayerSnapshot(
  current: MultiplayerViewerProjection | null,
  incoming: MultiplayerViewerProjection,
  options: MultiplayerSnapshotAcceptanceOptions = {},
): MultiplayerViewerProjection | null {
  const { expectedRoomId, knownRoomCode = '' } = options;
  if (expectedRoomId && (
    incoming.roomId !== expectedRoomId
    || current?.roomId !== expectedRoomId
  )) return current;

  if (
    current
    && current.roomId === incoming.roomId
    && incoming.version < current.version
  ) return current;

  const currentRoomCode = current?.roomId === incoming.roomId ? current.roomCode : '';
  return {
    ...incoming,
    roomCode: incoming.roomCode || currentRoomCode || knownRoomCode,
  };
}

export interface MultiplayerSnapshotSyncCoordinator {
  request(
    targetVersion: number,
    sync: () => Promise<MultiplayerViewerProjection>,
    accept: (snapshot: MultiplayerViewerProjection) => void,
  ): Promise<void>;
  reset(): void;
}

const MAX_CATCH_UP_SYNCS = 4;

/**
 * Coalesces Realtime broadcasts into one sync loop. If another broadcast
 * arrives while a sync is running, the loop keeps going until it reaches the
 * highest observed version instead of silently dropping that notification.
 */
export function createMultiplayerSnapshotSyncCoordinator(): MultiplayerSnapshotSyncCoordinator {
  let generation = 0;
  let highWaterVersion = -1;
  let inFlight: Promise<void> | null = null;

  return {
    request(targetVersion, sync, accept) {
      highWaterVersion = Math.max(highWaterVersion, targetVersion);
      if (inFlight) return inFlight;

      const requestGeneration = generation;
      const task = (async () => {
        for (let attempt = 0; attempt < MAX_CATCH_UP_SYNCS; attempt += 1) {
          const snapshot = await sync();
          if (generation !== requestGeneration) return;
          accept(snapshot);
          if (snapshot.version >= highWaterVersion) return;
        }
        throw new Error('The multiplayer snapshot did not reach the latest observed version.');
      })();
      inFlight = task;
      void task.then(
        () => { if (inFlight === task) inFlight = null; },
        () => { if (inFlight === task) inFlight = null; },
      );
      return task;
    },
    reset() {
      generation += 1;
      highWaterVersion = -1;
      inFlight = null;
    },
  };
}

export interface MultiplayerCommandGate {
  reset(): void;
  tryAcquire(): (() => boolean) | null;
}

/** React state updates are asynchronous, so `busy` alone cannot stop two taps
 * in the same event turn from sending duplicate commands. */
export function createMultiplayerCommandGate(): MultiplayerCommandGate {
  let generation = 0;
  let activeLease: number | null = null;
  return {
    reset() {
      generation += 1;
      activeLease = null;
    },
    tryAcquire() {
      if (activeLease !== null) return null;
      generation += 1;
      const lease = generation;
      activeLease = lease;
      return () => {
        if (activeLease !== lease) return false;
        activeLease = null;
        return true;
      };
    },
  };
}

export const MULTIPLAYER_TIMEOUT_RETRY_DELAY_MS = 2_000;

export interface MultiplayerTimeoutAttemptCompletion {
  /** Wall-clock completion time, used to schedule a retry after failure. */
  completedAtMs: number;
  /** Latest authoritative room version observed when the request finished. */
  latestVersion: number;
  /** True when the timeout command itself was accepted. */
  success: boolean;
}

export type CompleteMultiplayerTimeoutAttempt = (
  completion: MultiplayerTimeoutAttemptCompletion,
) => boolean;

export interface MultiplayerTimeoutAttemptGate {
  /**
   * Starts one attempt for this authoritative version. Returns null while the
   * version is in flight, permanently handled, stale, or inside retry backoff.
   */
  begin(version: number, nowMs: number): CompleteMultiplayerTimeoutAttempt | null;
  reset(): void;
}

function validTimeoutGateNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Prevents the 500 ms deadline watcher from flooding timeout commands. A
 * successful version stays closed until the room advances; a transient
 * failure can retry after a short backoff. Each completion is lease-bound so
 * an older request can never clear a newer in-flight attempt.
 */
export function createMultiplayerTimeoutAttemptGate(
  retryDelayMs = MULTIPLAYER_TIMEOUT_RETRY_DELAY_MS,
): MultiplayerTimeoutAttemptGate {
  if (!validTimeoutGateNumber(retryDelayMs)) {
    throw new Error('The multiplayer timeout retry delay must be a non-negative safe integer.');
  }

  let leaseSequence = 0;
  let latestVersion = -1;
  let active: { lease: number; version: number } | null = null;
  let handledVersion: number | null = null;
  let retryAtMs = 0;
  let retryVersion: number | null = null;

  const advanceTo = (version: number) => {
    if (version <= latestVersion) return;
    latestVersion = version;
    handledVersion = null;
    retryVersion = null;
    retryAtMs = 0;
    if (active && active.version < version) active = null;
  };

  return {
    begin(version, nowMs) {
      if (!validTimeoutGateNumber(version) || !Number.isFinite(nowMs) || nowMs < 0) return null;
      if (version < latestVersion) return null;
      advanceTo(version);
      if (
        active
        || handledVersion === version
        || (retryVersion === version && nowMs < retryAtMs)
      ) return null;

      leaseSequence += 1;
      const lease = leaseSequence;
      active = { lease, version };

      return ({ completedAtMs, latestVersion: observedVersion, success }) => {
        if (
          active?.lease !== lease
          || active.version !== version
          || !Number.isFinite(completedAtMs)
          || completedAtMs < 0
          || !validTimeoutGateNumber(observedVersion)
        ) return false;

        active = null;
        if (observedVersion > latestVersion) advanceTo(observedVersion);

        if (success || observedVersion > version) {
          if (latestVersion === version) handledVersion = version;
          retryVersion = null;
          retryAtMs = 0;
        } else {
          retryVersion = version;
          retryAtMs = completedAtMs + retryDelayMs;
        }
        return true;
      };
    },
    reset() {
      leaseSequence += 1;
      latestVersion = -1;
      active = null;
      handledVersion = null;
      retryVersion = null;
      retryAtMs = 0;
    },
  };
}
