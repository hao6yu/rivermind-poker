import type {
  MultiplayerConnectionState,
  MultiplayerParticipationState,
  MultiplayerRoomStatus,
} from '../../domain/multiplayer/contracts';
import type { MessageKey } from '../../localization';

/**
 * A2: one consistent table status. The private table historically scattered
 * its state explanations across a sitting-out banner, transport toasts, lobby
 * hints and modal titles. This resolver derives ONE prioritized status — with
 * the matching recovery action — from authoritative snapshot state, so the
 * table can render a single status area and disable stale betting controls
 * while state is uncertain.
 */

export type MultiplayerTableStatusKind =
  | 'reconnecting'
  | 'pausedByHost'
  | 'rebuyRequired'
  | 'returnQueued'
  | 'sittingOut'
  | 'waitingForPlayers'
  | 'none';

export type MultiplayerTableStatusAction =
  | 'rebuy'
  | 'readyUp'
  | 'returnNextHand'
  | null;

export interface MultiplayerTableStatus {
  kind: MultiplayerTableStatusKind;
  messageKey: MessageKey;
  action: MultiplayerTableStatusAction;
  actionLabelKey: MessageKey | null;
  /**
   * True when the status explains why the viewer cannot act right now; the
   * table uses it to keep stale betting controls disabled with a reason.
   */
  blocking: boolean;
}

export interface MultiplayerTableStatusInput {
  roomStatus: MultiplayerRoomStatus;
  /** The viewer seat's participation state, or null when seated data is pending. */
  viewerParticipation: MultiplayerParticipationState | null;
  viewerConnection: MultiplayerConnectionState | null;
  /** The transport layer is re-establishing the realtime connection. */
  transportReconnecting: boolean;
  viewerReady: boolean | null;
  /** Connected human seats that are not ready while the room is in the lobby. */
  waitingHumanCount: number;
  /** A next-hand auto-deal is armed (recoverable countdown is running). */
  autoDealArmed: boolean;
  /** The viewer queued a return for the next between-hands boundary. */
  returnQueued: boolean;
  sessionComplete: boolean;
}

const none: MultiplayerTableStatus = {
  action: null,
  actionLabelKey: null,
  blocking: false,
  kind: 'none',
  messageKey: 'multiplayer.game.sittingOutBanner', // never rendered for kind 'none'
};

/**
 * Priority order mirrors the player's decision stack: a finished session is
 * handled by the summary sheet; a broken connection explains everything else;
 * a host pause freezes the room; personal states (rebuy, sitting out) follow;
 * lobby readiness is informational. Lower-priority states never mask a
 * higher-priority one.
 */
export function resolveMultiplayerTableStatus(
  input: MultiplayerTableStatusInput,
): MultiplayerTableStatus {
  if (input.sessionComplete || input.roomStatus === 'complete') return none;
  if (input.transportReconnecting) {
    return {
      action: null,
      actionLabelKey: null,
      blocking: true,
      kind: 'reconnecting',
      messageKey: 'multiplayer.game.reconnect',
    };
  }
  if (input.roomStatus === 'paused') {
    return {
      action: null,
      actionLabelKey: null,
      blocking: true,
      kind: 'pausedByHost',
      messageKey: 'multiplayer.game.paused',
    };
  }
  if (input.viewerParticipation === 'rebuy-pending') {
    return {
      action: 'rebuy',
      actionLabelKey: 'multiplayer.rebuy.pending',
      blocking: true,
      kind: 'rebuyRequired',
      messageKey: 'multiplayer.game.rebuyPending',
    };
  }
  if (input.viewerParticipation === 'sitting-out') {
    if (input.returnQueued) {
      return {
        action: null,
        actionLabelKey: null,
        blocking: true,
        kind: 'returnQueued',
        messageKey: 'multiplayer.game.returnQueued',
      };
    }
    return {
      action: 'returnNextHand',
      actionLabelKey: 'multiplayer.game.returnNextHand',
      blocking: true,
      kind: 'sittingOut',
      messageKey: 'multiplayer.game.sittingOutBanner',
    };
  }
  if (input.viewerParticipation === 'disconnected' || input.viewerConnection === 'offline') {
    return {
      action: null,
      actionLabelKey: null,
      blocking: true,
      kind: 'reconnecting',
      messageKey: 'multiplayer.game.reconnect',
    };
  }
  if (input.roomStatus === 'lobby') {
    if (input.viewerReady === false) {
      return {
        action: 'readyUp',
        actionLabelKey: 'multiplayer.lobby.readyUp',
        blocking: true,
        kind: 'waitingForPlayers',
        messageKey: 'multiplayer.lobby.waiting',
      };
    }
    if (input.waitingHumanCount > 0) {
      return {
        action: null,
        actionLabelKey: null,
        blocking: false,
        kind: 'waitingForPlayers',
        messageKey: 'multiplayer.lobby.waiting',
      };
    }
    return none;
  }
  return none;
}
