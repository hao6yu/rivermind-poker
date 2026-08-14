import type { MultiplayerViewerProjection } from '../../domain/multiplayer/contracts';
import { multiplayerRecoveryNeedsReconnect } from '../../services/multiplayerRecovery';

interface MultiplayerResumeFlowDependencies {
  reconnect(snapshot: MultiplayerViewerProjection): Promise<MultiplayerViewerProjection>;
  sync(roomId: string): Promise<MultiplayerViewerProjection>;
}

function requestErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

/**
 * Synchronizes a recoverable room and restores an offline human seat. The
 * current-launch predicate is checked after every network boundary so closing
 * or replacing a flow can never issue a follow-up mutation for the old room.
 */
export async function resumeMultiplayerProjectionForFlow(
  roomId: string,
  isCurrent: () => boolean,
  dependencies: MultiplayerResumeFlowDependencies,
): Promise<MultiplayerViewerProjection | null> {
  let snapshot = await dependencies.sync(roomId);
  if (!isCurrent()) return null;
  if (!multiplayerRecoveryNeedsReconnect(snapshot)) return snapshot;

  try {
    snapshot = await dependencies.reconnect(snapshot);
    return isCurrent() ? snapshot : null;
  } catch (error) {
    if (!isCurrent()) return null;
    if (requestErrorCode(error) !== 'room_stale') throw error;
  }

  snapshot = await dependencies.sync(roomId);
  if (!isCurrent()) return null;
  if (!multiplayerRecoveryNeedsReconnect(snapshot)) return snapshot;
  snapshot = await dependencies.reconnect(snapshot);
  return isCurrent() ? snapshot : null;
}
