import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import type { MultiplayerViewerProjection } from '../../domain/multiplayer/contracts';
import { resumeMultiplayerProjectionForFlow } from './multiplayerResumeFlow';

function snapshot(connection: 'offline' | 'online', version = 3): MultiplayerViewerProjection {
  return {
    completionReason: null,
    config: {
      aiDifficulty: 'club',
      bigBlindChips: 20,
      handTarget: 10,
      seatCount: 2,
      smallBlindChips: 10,
      startingStackChips: 2_000,
      turnSeconds: 45,
    },
    createdAtMs: 1_000,
    hand: null,
    hostPlayerId: 'viewer',
    protocolVersion: 2,
    legalActions: null,
    roomCode: '',
    roomId: 'room-1',
    seats: [{
      aiProfileId: null,
      connection,
      control: 'human',
      displayName: 'River Kai',
      isHost: true,
      joinedAtMs: 1_000,
      kind: 'human',
      missedTurns: 0,
      playerId: 'viewer',
      ready: false,
      seat: 0,
      userId: null,
    }],
    sessionNumber: 1,
    status: 'lobby',
    turnDeadlineAtMs: null,
    nextHandAtMs: null,
    updatedAtMs: 2_000,
    version,
    viewerPlayerId: 'viewer',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe('multiplayer resume flow', () => {
  it('does not reconnect after the flow closes during initial sync', async () => {
    const pending = deferred<MultiplayerViewerProjection>();
    const reconnect = vi.fn(async (value: MultiplayerViewerProjection) => value);
    let current = true;
    const result = resumeMultiplayerProjectionForFlow('room-1', () => current, {
      reconnect,
      sync: () => pending.promise,
    });

    current = false;
    pending.resolve(snapshot('offline'));

    await expect(result).resolves.toBeNull();
    expect(reconnect).not.toHaveBeenCalled();
  });

  it('retries one stale reconnect against a freshly synchronized version', async () => {
    const sync = vi.fn()
      .mockResolvedValueOnce(snapshot('offline', 3))
      .mockResolvedValueOnce(snapshot('offline', 4));
    const reconnect = vi.fn()
      .mockRejectedValueOnce({ code: 'room_stale' })
      .mockResolvedValueOnce(snapshot('online', 5));

    await expect(resumeMultiplayerProjectionForFlow('room-1', () => true, {
      reconnect,
      sync,
    })).resolves.toMatchObject({ version: 5 });
    expect(sync).toHaveBeenCalledTimes(2);
    expect(reconnect).toHaveBeenCalledTimes(2);
  });
});
