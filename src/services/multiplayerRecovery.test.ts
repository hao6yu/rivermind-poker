import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import type { MultiplayerViewerProjection } from '../domain/multiplayer/contracts';
import {
  clearActiveMultiplayerRoom,
  loadActiveMultiplayerRoom,
  multiplayerRecoveryNeedsReconnect,
  multiplayerRecoveryContract,
  saveActiveMultiplayerRoom,
  saveDiscoveredActiveMultiplayerRoom,
  type MultiplayerRecoveryStorage,
} from './multiplayerRecovery';

function memoryStorage(initial?: Record<string, string>): MultiplayerRecoveryStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
    values,
  };
}

function snapshot(status: MultiplayerViewerProjection['status'] = 'lobby'): MultiplayerViewerProjection {
  return {
    config: {
      aiDifficulty: 'club',
      bigBlindChips: 20,
      handTarget: 10,
      seatCount: 3,
      smallBlindChips: 10,
      startingStackChips: 2_000,
      turnSeconds: 45,
    },
    completionReason: null,
    createdAtMs: 2_000_000_000_000,
    hand: null,
    hostPlayerId: 'player:host',
    protocolVersion: 3,
    legalActions: null,
    roomCode: '042106',
    roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    seats: [],
    sessionNumber: 1,
    status,
    turnDeadlineAtMs: null,
    nextHandAtMs: null,
    updatedAtMs: 2_000_000_000_100,
    version: 2,
    viewerPlayerId: 'player:host',
  };
}

describe('same-device multiplayer recovery', () => {
  beforeEach(() => clearActiveMultiplayerRoom(memoryStorage()));

  it('persists only a bounded active-room locator and lobby code', () => {
    const storage = memoryStorage();
    const nowMs = 2_000_000_000_200;
    const record = saveActiveMultiplayerRoom(snapshot(), '042106', storage, nowMs);
    expect(loadActiveMultiplayerRoom(storage, nowMs)).toEqual(record);
    const raw = storage.values.get(multiplayerRecoveryContract.key) ?? '';
    expect(JSON.parse(raw)).toEqual(record);
    expect(raw).not.toMatch(/cards|deck|player:host|auth|token/i);
  });

  it('preserves a known code through play so a later rematch lobby can share it', () => {
    const storage = memoryStorage();
    const record = saveActiveMultiplayerRoom(snapshot('playing'), '042106', storage, 2_000_000_000_200);
    expect(record).toMatchObject({ roomCode: '042106', status: 'playing' });

    const rematchLobby = { ...snapshot('lobby'), roomCode: '' };
    const rematchRecord = saveActiveMultiplayerRoom(rematchLobby, record?.roomCode ?? '', storage, 2_000_000_000_300);
    expect(rematchRecord).toMatchObject({ roomCode: '042106', status: 'lobby' });
  });

  it('does not let delayed fallback discovery overwrite a room published by create or join', () => {
    const storage = memoryStorage();
    const activeSnapshot = {
      ...snapshot('playing'),
      roomCode: '654321',
      roomId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    const active = saveActiveMultiplayerRoom(activeSnapshot, activeSnapshot.roomCode, storage);
    const discovered = saveDiscoveredActiveMultiplayerRoom(active, snapshot(), storage);

    expect(discovered).toEqual(active);
    expect(loadActiveMultiplayerRoom(storage)).toEqual(active);
  });

  it('clears corrupt, expired, and deliberately removed records', () => {
    const corrupt = memoryStorage({ [multiplayerRecoveryContract.key]: '{bad json' });
    expect(loadActiveMultiplayerRoom(corrupt, 1)).toBeNull();
    expect(corrupt.values.has(multiplayerRecoveryContract.key)).toBe(false);

    const storage = memoryStorage();
    const created = snapshot();
    saveActiveMultiplayerRoom(created, created.roomCode, storage, created.createdAtMs + 1);
    expect(loadActiveMultiplayerRoom(
      storage,
      created.createdAtMs + multiplayerRecoveryContract.roomLifetimeMs,
    )).toBeNull();

    saveActiveMultiplayerRoom(created, created.roomCode, storage, created.createdAtMs + 1);
    clearActiveMultiplayerRoom(storage);
    expect(loadActiveMultiplayerRoom(storage, created.createdAtMs + 2)).toBeNull();
  });

  it('rejects malformed room identifiers and invite codes', () => {
    const storage = memoryStorage({
      [multiplayerRecoveryContract.key]: JSON.stringify({
        expiresAtMs: 2_000_000_100_000,
        roomCode: 'RMK724',
        roomId: 'not-a-room',
        savedAtMs: 2_000_000_000_000,
        status: 'playing',
        version: 1,
      }),
    });
    expect(loadActiveMultiplayerRoom(storage, 2_000_000_000_001)).toBeNull();
  });

  it('reconnects an offline viewer even after the session is complete', () => {
    const completed = snapshot('complete');
    completed.seats = [{
      aiProfileId: null,
      connection: 'offline',
      control: 'human',
      displayName: 'Host',
      isHost: true,
      joinedAtMs: completed.createdAtMs,
      kind: 'human',
      missedTurns: 0,
      playerId: completed.viewerPlayerId,
      ready: false,
      seat: 0,
      userId: null,
    }];
    expect(multiplayerRecoveryNeedsReconnect(completed)).toBe(true);
    completed.seats[0]!.connection = 'online';
    expect(multiplayerRecoveryNeedsReconnect(completed)).toBe(false);
  });
});
