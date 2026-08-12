import type {
  MultiplayerRoomSnapshot,
  MultiplayerViewerProjection,
} from '../domain/multiplayer/contracts';

export interface MultiplayerRoomEnvelope {
  duplicate?: boolean;
  left?: boolean;
  roomCode?: string;
  roomId: string;
  snapshot: MultiplayerViewerProjection | MultiplayerRoomSnapshot;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseMultiplayerRoomEnvelope(value: unknown): MultiplayerRoomEnvelope | null {
  const source = record(value);
  const snapshot = record(source?.snapshot);
  const config = record(snapshot?.config);
  if (
    !source
    || typeof source.roomId !== 'string'
    || !snapshot
    || snapshot.roomId !== source.roomId
    || !Number.isSafeInteger(snapshot.version)
    || !Array.isArray(snapshot.seats)
    || !config
    || ![2, 3, 6].includes(config.seatCount as number)
    || !['lobby', 'playing', 'between-hands', 'paused', 'complete'].includes(snapshot.status as string)
  ) return null;

  return {
    duplicate: typeof source.duplicate === 'boolean' ? source.duplicate : undefined,
    left: typeof source.left === 'boolean' ? source.left : undefined,
    roomCode: typeof source.roomCode === 'string' ? source.roomCode : undefined,
    roomId: source.roomId,
    snapshot: snapshot as unknown as MultiplayerViewerProjection | MultiplayerRoomSnapshot,
  };
}

export function isPersonalizedMultiplayerSnapshot(
  snapshot: MultiplayerViewerProjection | MultiplayerRoomSnapshot,
): snapshot is MultiplayerViewerProjection {
  return 'viewerPlayerId' in snapshot
    && typeof snapshot.viewerPlayerId === 'string'
    && 'legalActions' in snapshot;
}
