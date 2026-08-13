import type {
  MultiplayerPublicTransition,
  MultiplayerRoomSnapshot,
  MultiplayerViewerProjection,
} from '../domain/multiplayer/contracts';

export interface MultiplayerRoomEnvelope {
  duplicate?: boolean;
  left?: boolean;
  roomCode?: string;
  roomId: string;
  snapshot: MultiplayerViewerProjection | MultiplayerRoomSnapshot;
  transition?: MultiplayerPublicTransition;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function publicTransition(value: unknown): MultiplayerPublicTransition | null {
  const source = record(value);
  if (!source || !Number.isSafeInteger(source.version) || !Array.isArray(source.actionBatch)) return null;
  const validActions = source.actionBatch.every((value) => {
    const action = record(value);
    return action
      && typeof action.playerId === 'string'
      && ['fold', 'check', 'call', 'raise'].includes(action.type as string)
      && ['preflop', 'flop', 'turn', 'river'].includes(action.street as string)
      && Number.isSafeInteger(action.amount)
      && Number.isSafeInteger(action.potAfter);
  });
  if (
    !validActions
    || typeof source.commandId !== 'string'
    || typeof source.kind !== 'string'
    || !Number.isFinite(source.acceptedAtMs)
  ) return null;
  return source as unknown as MultiplayerPublicTransition;
}

export function parseMultiplayerRoomEnvelope(value: unknown): MultiplayerRoomEnvelope | null {
  const source = record(value);
  const snapshot = record(source?.snapshot);
  const config = record(snapshot?.config);
  const roomId = typeof source?.roomId === 'string'
    ? source.roomId
    : typeof snapshot?.roomId === 'string' ? snapshot.roomId : null;
  const transition = source?.transition === undefined ? undefined : publicTransition(source.transition);
  const left = source?.left === true;
  if (
    !source
    || !roomId
    || !snapshot
    || snapshot.roomId !== roomId
    || !Number.isSafeInteger(snapshot.version)
    || !Array.isArray(snapshot.seats)
    || !config
    || ![2, 3, 6].includes(config.seatCount as number)
    || !['lobby', 'playing', 'between-hands', 'paused', 'complete'].includes(snapshot.status as string)
    || transition === null
    || (left && 'viewerPlayerId' in snapshot)
    || (transition !== undefined && (
      transition.version > (snapshot.version as number)
      || (source.duplicate !== true && transition.version !== snapshot.version)
    ))
  ) return null;

  return {
    duplicate: typeof source.duplicate === 'boolean' ? source.duplicate : undefined,
    left: typeof source.left === 'boolean' ? source.left : undefined,
    roomCode: typeof source.roomCode === 'string' ? source.roomCode : undefined,
    roomId,
    snapshot: snapshot as unknown as MultiplayerViewerProjection | MultiplayerRoomSnapshot,
    transition,
  };
}

/** Database Broadcast callbacks wrap the room envelope in a `payload` field. */
export function parseMultiplayerBroadcastEnvelope(value: unknown): MultiplayerRoomEnvelope | null {
  const source = record(value);
  return parseMultiplayerRoomEnvelope(source?.payload ?? value);
}

export function isPersonalizedMultiplayerSnapshot(
  snapshot: MultiplayerViewerProjection | MultiplayerRoomSnapshot,
): snapshot is MultiplayerViewerProjection {
  return 'viewerPlayerId' in snapshot
    && typeof snapshot.viewerPlayerId === 'string'
    && 'legalActions' in snapshot;
}
