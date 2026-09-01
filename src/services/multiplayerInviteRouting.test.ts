import { describe, expect, it } from 'vitest';

import {
  departMultiplayerRoomForInviteReplacement,
  isTerminalMultiplayerRecoveryError,
  resolveMultiplayerInviteRoute,
  routeMultiplayerInviteAfterBootstrap,
} from './multiplayerInviteRouting';

const base = {
  hasActivePrivateRoom: false,
  hasOpenMultiplayerFlow: false,
  inviteRoomCode: '4123456',
  localTableOpen: false,
} as const;

describe('multiplayer invite routing', () => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, reject, resolve };
  }

  it('opens an unopposed invite directly', () => {
    expect(resolveMultiplayerInviteRoute(base)).toBe('join-invite');
  });

  it('requires confirmation before replacing a local table', () => {
    expect(resolveMultiplayerInviteRoute({ ...base, localTableOpen: true }))
      .toBe('confirm-leave-local-table');
  });

  it('resumes the saved room when its invite is opened again', () => {
    expect(resolveMultiplayerInviteRoute({
      ...base,
      activeRoomCode: '4123456',
      hasActivePrivateRoom: true,
    })).toBe('resume-saved-room');
  });

  it('offers resume versus replace when a different private room is saved', () => {
    expect(resolveMultiplayerInviteRoute({
      ...base,
      activeRoomCode: '4654321',
      hasActivePrivateRoom: true,
    })).toBe('confirm-saved-room-choice');
  });

  it('does not silently replace an open multiplayer setup', () => {
    expect(resolveMultiplayerInviteRoute({ ...base, hasOpenMultiplayerFlow: true }))
      .toBe('confirm-replace-multiplayer-flow');
  });

  it('waits for cold-start recovery before routing a different-room invite', async () => {
    const bootstrap = deferred();
    let activeRoomCode: string | undefined;
    const routes: string[] = [];
    const routing = routeMultiplayerInviteAfterBootstrap(bootstrap.promise, () => {
      routes.push(resolveMultiplayerInviteRoute({
        ...base,
        activeRoomCode,
        hasActivePrivateRoom: activeRoomCode !== undefined,
      }));
    });

    await Promise.resolve();
    expect(routes).toEqual([]);
    activeRoomCode = '4654321';
    bootstrap.resolve();
    await routing;

    expect(routes).toEqual(['confirm-saved-room-choice']);
  });

  it('resumes a recovered room when cold-start invite and room match', async () => {
    const bootstrap = deferred();
    let activeRoomCode: string | undefined;
    let route: string | null = null;
    const routing = routeMultiplayerInviteAfterBootstrap(bootstrap.promise, () => {
      route = resolveMultiplayerInviteRoute({
        ...base,
        activeRoomCode,
        hasActivePrivateRoom: activeRoomCode !== undefined,
      });
    });

    activeRoomCode = '4123456';
    bootstrap.resolve();
    await routing;

    expect(route).toBe('resume-saved-room');
  });

  it('still opens a valid invite when cold-start recovery fails', async () => {
    const bootstrap = deferred();
    let route: string | null = null;
    const routing = routeMultiplayerInviteAfterBootstrap(bootstrap.promise, () => {
      route = resolveMultiplayerInviteRoute(base);
    });

    bootstrap.reject(new Error('offline'));
    await routing;

    expect(route).toBe('join-invite');
  });

  it('syncs before leaving and retries one stale departure at the latest version', async () => {
    const calls: string[] = [];
    let syncVersion = 4;
    let leaveAttempts = 0;
    const result = await departMultiplayerRoomForInviteReplacement('room-1', {
      leave: async (roomId, version) => {
        calls.push(`leave:${roomId}:${version}`);
        leaveAttempts += 1;
        if (leaveAttempts === 1) throw { code: 'room_stale' };
      },
      sync: async (roomId) => {
        calls.push(`sync:${roomId}:${syncVersion}`);
        const snapshot = { version: syncVersion };
        syncVersion += 1;
        return snapshot;
      },
    });

    expect(result).toBe('departed');
    expect(calls).toEqual([
      'sync:room-1:4',
      'leave:room-1:4',
      'sync:room-1:5',
      'leave:room-1:5',
    ]);
  });

  it('keeps recovery on transient replacement failure but releases terminal rooms', async () => {
    const transient = await departMultiplayerRoomForInviteReplacement('room-1', {
      leave: async () => undefined,
      sync: async () => { throw { code: 'multiplayer_network' }; },
    });
    const terminal = await departMultiplayerRoomForInviteReplacement('room-1', {
      leave: async () => { throw { code: 'room_forbidden' }; },
      sync: async () => ({ version: 7 }),
    });

    expect(transient).toBe('retry');
    expect(terminal).toBe('terminal');
    expect(isTerminalMultiplayerRecoveryError({ code: 'room_access' })).toBe(true);
    expect(isTerminalMultiplayerRecoveryError({ code: 'room_not_found' })).toBe(true);
    expect(isTerminalMultiplayerRecoveryError({ code: 'room_stale' })).toBe(false);
    // A newer-protocol room can never be parsed by this build; the recovery
    // record must be released instead of retried forever.
    expect(isTerminalMultiplayerRecoveryError({ code: 'multiplayer_update_required' })).toBe(true);
  });
});
