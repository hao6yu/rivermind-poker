const ROOM_CODE_PATTERN = /^\d{6}$/;

export type MultiplayerInviteRoute =
  | 'confirm-leave-local-table'
  | 'confirm-replace-multiplayer-flow'
  | 'confirm-saved-room-choice'
  | 'join-invite'
  | 'resume-saved-room';

export interface MultiplayerInviteRouteContext {
  activeRoomCode?: string;
  hasActivePrivateRoom: boolean;
  hasOpenMultiplayerFlow: boolean;
  inviteRoomCode: string;
  localTableOpen: boolean;
}

/**
 * Cold-start room discovery and initial deep-link delivery are independent
 * native promises. Route the invite only after discovery settles so an older
 * recoverable room cannot appear behind an already-open Join flow.
 */
export async function routeMultiplayerInviteAfterBootstrap(
  bootstrap: Promise<unknown> | null,
  route: () => void,
): Promise<void> {
  try {
    await bootstrap;
  } catch {
    // A transient discovery failure must not swallow a valid invite.
  }
  route();
}

export type MultiplayerInviteDepartureResult = 'departed' | 'retry' | 'terminal';

interface MultiplayerInviteDepartureDependencies {
  leave(roomId: string, version: number): Promise<void>;
  sync(roomId: string): Promise<{ version: number }>;
}

function multiplayerRequestErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

export function isTerminalMultiplayerRecoveryError(error: unknown): boolean {
  const code = multiplayerRequestErrorCode(error);
  return code === 'room_access' || code === 'room_forbidden' || code === 'room_not_found'
    // A newer-protocol room can never be parsed by this build, so the local
    // recovery record must be cleared instead of retried forever.
    || code === 'multiplayer_update_required';
}

/**
 * Confirm departure against the latest authoritative room version before an
 * invite replaces the only locally recoverable room. A transient failure
 * leaves the recovery record untouched; a missing or forbidden room is safe
 * to forget because the caller can no longer leave it explicitly.
 */
export async function departMultiplayerRoomForInviteReplacement(
  roomId: string,
  dependencies: MultiplayerInviteDepartureDependencies,
): Promise<MultiplayerInviteDepartureResult> {
  try {
    let latest = await dependencies.sync(roomId);
    try {
      await dependencies.leave(roomId, latest.version);
    } catch (error) {
      if (multiplayerRequestErrorCode(error) !== 'room_stale') throw error;
      latest = await dependencies.sync(roomId);
      await dependencies.leave(roomId, latest.version);
    }
    return 'departed';
  } catch (error) {
    return isTerminalMultiplayerRecoveryError(error) ? 'terminal' : 'retry';
  }
}

/**
 * Route an already-validated invite without mutating navigation state. Local
 * games and active private rooms require an explicit choice before an inbound
 * URL can replace what the player is doing.
 */
export function resolveMultiplayerInviteRoute({
  activeRoomCode,
  hasActivePrivateRoom,
  hasOpenMultiplayerFlow,
  inviteRoomCode,
  localTableOpen,
}: MultiplayerInviteRouteContext): MultiplayerInviteRoute {
  if (!ROOM_CODE_PATTERN.test(inviteRoomCode)) return 'join-invite';
  if (localTableOpen) return 'confirm-leave-local-table';
  if (hasActivePrivateRoom) {
    return activeRoomCode === inviteRoomCode
      ? 'resume-saved-room'
      : 'confirm-saved-room-choice';
  }
  if (hasOpenMultiplayerFlow) return 'confirm-replace-multiplayer-flow';
  return 'join-invite';
}
