import 'expo-sqlite/localStorage/install';

import type {
  MultiplayerRoomStatus,
  MultiplayerViewerProjection,
} from '../domain/multiplayer/contracts';

const ACTIVE_ROOM_STORAGE_KEY = 'rivermind.multiplayer-active-room.v1';
const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOM_CODE_PATTERN = /^\d{6}$/;
const RECOVERABLE_STATUSES: readonly MultiplayerRoomStatus[] = [
  'lobby',
  'playing',
  'between-hands',
  'paused',
  'complete',
];

export interface ActiveMultiplayerRoomRecord {
  expiresAtMs: number;
  roomCode?: string;
  roomId: string;
  savedAtMs: number;
  status: MultiplayerRoomStatus;
  version: 1;
}

export interface MultiplayerRecoveryStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export function multiplayerRecoveryNeedsReconnect(
  snapshot: Pick<MultiplayerViewerProjection, 'seats' | 'viewerPlayerId'>,
): boolean {
  const viewerSeat = snapshot.seats.find((seat) => seat.playerId === snapshot.viewerPlayerId);
  return viewerSeat?.kind === 'human' && viewerSeat.connection === 'offline';
}

let memoryRecord: ActiveMultiplayerRoomRecord | null = null;

function deviceStorage(): MultiplayerRecoveryStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function normalizedRecord(value: unknown): ActiveMultiplayerRoomRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1
    || typeof record.roomId !== 'string'
    || !UUID_PATTERN.test(record.roomId)
    || !Number.isSafeInteger(record.savedAtMs)
    || !Number.isSafeInteger(record.expiresAtMs)
    || typeof record.status !== 'string'
    || !RECOVERABLE_STATUSES.includes(record.status as MultiplayerRoomStatus)
    || (record.roomCode !== undefined && (
      typeof record.roomCode !== 'string' || !ROOM_CODE_PATTERN.test(record.roomCode)
    ))
  ) return null;
  return {
    expiresAtMs: record.expiresAtMs as number,
    ...(typeof record.roomCode === 'string' ? { roomCode: record.roomCode } : {}),
    roomId: record.roomId.toLowerCase(),
    savedAtMs: record.savedAtMs as number,
    status: record.status as MultiplayerRoomStatus,
    version: 1,
  };
}

export function loadActiveMultiplayerRoom(
  storage: MultiplayerRecoveryStorage | null = deviceStorage(),
  nowMs = Date.now(),
): ActiveMultiplayerRoomRecord | null {
  let record = memoryRecord;
  try {
    if (storage) {
      const raw = storage.getItem(ACTIVE_ROOM_STORAGE_KEY);
      record = raw ? normalizedRecord(JSON.parse(raw) as unknown) : null;
    }
  } catch {
    record = null;
  }
  if (!record || record.expiresAtMs <= nowMs) {
    memoryRecord = null;
    try {
      storage?.removeItem(ACTIVE_ROOM_STORAGE_KEY);
    } catch {
      // Recovery is best effort; an invalid in-memory record is already gone.
    }
    return null;
  }
  memoryRecord = record;
  return { ...record };
}

export function saveActiveMultiplayerRoom(
  snapshot: Pick<MultiplayerViewerProjection, 'createdAtMs' | 'roomCode' | 'roomId' | 'status'>,
  knownRoomCode = snapshot.roomCode,
  storage: MultiplayerRecoveryStorage | null = deviceStorage(),
  nowMs = Date.now(),
): ActiveMultiplayerRoomRecord | null {
  const roomCode = ROOM_CODE_PATTERN.test(knownRoomCode)
    ? knownRoomCode
    : undefined;
  const record = normalizedRecord({
    expiresAtMs: snapshot.createdAtMs + ROOM_LIFETIME_MS,
    ...(roomCode ? { roomCode } : {}),
    roomId: snapshot.roomId,
    savedAtMs: nowMs,
    status: snapshot.status,
    version: 1,
  });
  if (!record || record.expiresAtMs <= nowMs) return null;
  memoryRecord = record;
  try {
    storage?.setItem(ACTIVE_ROOM_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // The in-memory marker still supports the current app process.
  }
  return { ...record };
}

/**
 * Server fallback discovery races with direct create/join recovery callbacks
 * during cold start. Never let an older discovered room replace a pointer the
 * active UI has already published synchronously.
 */
export function saveDiscoveredActiveMultiplayerRoom(
  current: ActiveMultiplayerRoomRecord | null,
  snapshot: Pick<MultiplayerViewerProjection, 'createdAtMs' | 'roomCode' | 'roomId' | 'status'>,
  storage: MultiplayerRecoveryStorage | null = deviceStorage(),
  nowMs = Date.now(),
): ActiveMultiplayerRoomRecord | null {
  return current ? { ...current } : saveActiveMultiplayerRoom(
    snapshot,
    snapshot.roomCode,
    storage,
    nowMs,
  );
}

export function clearActiveMultiplayerRoom(
  storage: MultiplayerRecoveryStorage | null = deviceStorage(),
): void {
  memoryRecord = null;
  try {
    storage?.removeItem(ACTIVE_ROOM_STORAGE_KEY);
  } catch {
    // The in-memory marker is already cleared.
  }
}

export const multiplayerRecoveryContract = {
  key: ACTIVE_ROOM_STORAGE_KEY,
  roomLifetimeMs: ROOM_LIFETIME_MS,
};
