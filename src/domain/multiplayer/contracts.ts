import type { AiDifficulty } from '../poker/aiProfiles.ts';
import type { PublicPlayerRecordSnapshot } from './playerRecordSnapshot';
import type { HumanAvatarSnapshot } from '../playerProfile.ts';
import type {
  MultiwayActionRecord,
  MultiwayHandState,
  MultiwayLegalActions,
} from '../poker/multiway.ts';
import type { PlayerAction } from '../poker/types.ts';

export type MultiplayerSeatCount = 2 | 3 | 6 | 9;

/**
 * The seat counts this client build can join, sent with every join request so
 * the table can refuse an incompatible join before it seats anyone. This is a
 * build capability, not a preference: a client that cannot render or reason
 * about a table size must never be seated at one, because the server commits
 * the seat before the client sees a snapshot and a rejected snapshot would
 * strand the lobby with an occupant who can never return.
 */
export const MULTIPLAYER_CLIENT_SEAT_COUNTS: readonly MultiplayerSeatCount[] = [2, 3, 6, 9];

/**
 * What a client that predates seat negotiation is assumed to support. Such
 * builds send no capability list, and their shipped seat options stopped at
 * six, so the table assumes they cannot join nine-seat rooms rather than
 * seating them into a snapshot they will refuse.
 */
export const MULTIPLAYER_LEGACY_SEAT_COUNTS: readonly MultiplayerSeatCount[] = [2, 3, 6];

/** Whether a room of this size can seat a client reporting these capabilities. */
export function multiplayerJoinSeatCountSupported(
  supportedSeatCounts: readonly MultiplayerSeatCount[],
  seatCount: MultiplayerSeatCount,
): boolean {
  return supportedSeatCounts.includes(seatCount);
}

/**
 * Version of the room *snapshot* protocol (the public shape sent through
 * Realtime and to clients). Raising this when a recoverable field is added to
 * the snapshot makes older clients reject the snapshot as update-required
 * instead of interpreting a partial state. The canonical coordinator state is
 * versioned separately by `MultiplayerCoordinatorState.version`.
 */
export const MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION = 2;
export type MultiplayerHandTarget = 5 | 10 | 'open';
export type MultiplayerTurnSeconds = 30 | 45 | 60;
export type MultiplayerRoomStatus = 'lobby' | 'playing' | 'between-hands' | 'paused' | 'complete';
export type MultiplayerConnectionState = 'online' | 'offline';
export type MultiplayerSeatKind = 'human' | 'ai';
export type MultiplayerSeatControl = 'human' | 'ai';
export type MultiplayerCompletionReason = 'hand-limit' | 'last-player-standing';

export interface MultiplayerRoomConfig {
  aiDifficulty: AiDifficulty;
  bigBlindChips: number;
  handTarget: MultiplayerHandTarget;
  seatCount: MultiplayerSeatCount;
  smallBlindChips: number;
  startingStackChips: number;
  turnSeconds: MultiplayerTurnSeconds;
}

export interface MultiplayerSeatState {
  aiProfileId: string | null;
  /**
   * The human's avatar reference, or null when the seat carries no avatar
   * (an AI seat, or a human who selected no authored/uploaded avatar). This is
   * the same bounded snapshot shape used by the local profile, so a remote
   * human's avatar is rendered identically. Optional in the type so legacy
   * snapshots parse; the coordinator always sets it on live seats.
   */
  avatar?: HumanAvatarSnapshot | null;
  /** The seat owner's room-private Play record snapshot; published only to
   * current room members and only after contract validation (scope 3.11E). */
  playRecord?: PublicPlayerRecordSnapshot | null;
  connection: MultiplayerConnectionState;
  control: MultiplayerSeatControl;
  displayName: string;
  isHost: boolean;
  joinedAtMs: number;
  kind: MultiplayerSeatKind;
  missedTurns: number;
  playerId: string;
  ready: boolean;
  seat: number;
  userId: string | null;
}

export interface MultiplayerPublicAction {
  amount: number;
  playerId: string;
  potAfter: number;
  street: MultiwayActionRecord['street'];
  type: MultiwayActionRecord['type'];
}

export interface MultiplayerTimeoutResult {
  action: 'check' | 'fold';
  aiTookOver: boolean;
  missedTurns: number;
  playerId: string;
}

export type MultiplayerTransitionKind = MultiplayerRoomCommand['type'];

export interface MultiplayerTransition {
  acceptedAtMs: number;
  actionBatch: MultiplayerPublicAction[];
  actorUserId: string;
  commandId: string;
  kind: MultiplayerTransitionKind;
  timeout: MultiplayerTimeoutResult | null;
  version: number;
}

export type MultiplayerPublicTransition = Omit<MultiplayerTransition, 'actorUserId'>;

export interface MultiplayerProcessedCommand {
  commandId: string;
  fingerprint: string;
  transition: MultiplayerTransition;
}

/**
 * Canonical server state. `hand` contains the deck and every private card and
 * must never be stored in an exposed schema or sent through Realtime.
 */
export interface MultiplayerCoordinatorState {
  completionReason: MultiplayerCompletionReason | null;
  config: MultiplayerRoomConfig;
  createdAtMs: number;
  hand: MultiwayHandState | null;
  hostPlayerId: string;
  /**
   * Absolute deadline (real epoch ms) at which the room deals the next hand
   * automatically while between hands, or null when no auto-deal is armed
   * (paused countdown, paused room, or session complete). The countdown is
   * recoverable: it lives in canonical state, so reconnect, foreground
   * recovery, and host transfer all converge on the same deadline.
   */
  nextHandAtMs: number | null;
  processedCommands: MultiplayerProcessedCommand[];
  /**
   * The AI profile id most recently removed from each seat, when any. Only the
   * coordinator consults this (never the client projection) so remove-and-re-add
   * acts as a reroll that avoids repeating the same profile when another
   * eligible one exists. Bounded to one profile id per seat.
   */
  removedAiProfileIdBySeat: Record<number, string | null>;
  resumeStatus: Extract<MultiplayerRoomStatus, 'playing' | 'between-hands'> | null;
  roomCode: string;
  roomId: string;
  seats: MultiplayerSeatState[];
  sessionNumber: number;
  status: MultiplayerRoomStatus;
  turnDeadlineAtMs: number | null;
  updatedAtMs: number;
  version: number;
}

interface MultiplayerCommandBase {
  actorUserId: string;
  commandId: string;
  expectedVersion: number;
}

export type MultiplayerRoomCommand =
  | (MultiplayerCommandBase & {
    type: 'join';
    displayName: string;
    /** The joining human's avatar, validated on accept; null when none is set. */
    avatar?: HumanAvatarSnapshot | null;
    /** The joining human's bounded Play record snapshot; validated on accept
     * and published only to current room members (scope 3.11E). */
    playRecord?: unknown;
    playerId: string;
    seat: number;
  })
  | (MultiplayerCommandBase & {
    type: 'add-ai';
    seat: number;
  })
  | (MultiplayerCommandBase & {
    type: 'remove-ai';
    seat: number;
  })
  | (MultiplayerCommandBase & {
    type: 'set-ready';
    ready: boolean;
  })
  | (MultiplayerCommandBase & {
    type: 'start';
  })
  | (MultiplayerCommandBase & {
    type: 'action';
    action: PlayerAction;
  })
  | (MultiplayerCommandBase & {
    type: 'tick';
  })
  | (MultiplayerCommandBase & {
    type: 'set-connection';
    connection: MultiplayerConnectionState;
  })
  | (MultiplayerCommandBase & {
    type: 'reclaim';
  })
  | (MultiplayerCommandBase & {
    type: 'deal-now';
  })
  | (MultiplayerCommandBase & {
    type: 'pause';
  })
  | (MultiplayerCommandBase & {
    type: 'resume';
  })
  | (MultiplayerCommandBase & {
    type: 'rematch';
  })
  | (MultiplayerCommandBase & {
    type: 'leave';
  })
  | (MultiplayerCommandBase & {
    /** Owner-only Play record replace (scope 3.11E): the coordinator derives
     * the seat from the authenticated actor and validates the snapshot before
     * publishing it to current room members. */
    type: 'update-play-record';
    record: unknown;
  });

export type MultiplayerRoomCommandInput = MultiplayerRoomCommand extends infer Command
  ? Command extends MultiplayerRoomCommand
    ? Omit<Command, 'commandId' | 'expectedVersion'>
    : never
  : never;

export interface MultiplayerCommandResult {
  duplicate: boolean;
  state: MultiplayerCoordinatorState;
  transition: MultiplayerTransition;
}

export interface MultiplayerRoomSnapshot {
  completionReason: MultiplayerCompletionReason | null;
  config: MultiplayerRoomConfig;
  createdAtMs: number;
  hand: MultiwayHandState | null;
  hostPlayerId: string;
  /**
   * Absolute deadline (real epoch ms) at which the room deals the next hand
   * automatically while between hands, or null when no auto-deal is armed
   * (paused countdown, paused room, or session complete). The countdown is
   * recoverable: it lives in canonical state, so reconnect, foreground
   * recovery, and host transfer all converge on the same deadline.
   */
  nextHandAtMs: number | null;
  /** Snapshot protocol version; older clients reject newer versions. */
  protocolVersion: typeof MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION;
  roomCode: string;
  roomId: string;
  seats: MultiplayerSeatState[];
  sessionNumber: number;
  status: MultiplayerRoomStatus;
  turnDeadlineAtMs: number | null;
  updatedAtMs: number;
  version: number;
}

export interface MultiplayerViewerProjection extends MultiplayerRoomSnapshot {
  legalActions: MultiwayLegalActions | null;
  viewerPlayerId: string;
}

export interface MultiplayerSessionStanding {
  avatar: HumanAvatarSnapshot | null;
  delta: number;
  isViewer: boolean;
  kind: MultiplayerSeatKind;
  label: string;
  place: number;
  playerId: string;
  seat: number;
  stack: number;
}

export interface MultiplayerSessionSummary {
  completionReason: MultiplayerCompletionReason;
  handsPlayed: number;
  rows: MultiplayerSessionStanding[];
  sessionNumber: number;
  viewerPlace: number | null;
}

/**
 * A completed hand persisted specifically for one human viewer. The deck is
 * always empty, folded opponents stay hidden forever, and only this viewer's
 * action records may retain decision context for a later private review.
 */
export interface MultiplayerHandArchive {
  completedAtMs: number;
  completionReason: MultiplayerCompletionReason | null;
  hand: MultiwayHandState;
  roomId: string;
  sessionNumber: number;
  viewerPlayerId: string;
}

export interface CreateMultiplayerRoomInput {
  config: MultiplayerRoomConfig;
  /** The host's avatar; null when the host selected no authored/uploaded avatar. */
  hostAvatar?: HumanAvatarSnapshot | null;
  hostDisplayName: string;
  hostPlayerId: string;
  hostSeat?: number;
  hostUserId: string;
  roomCode: string;
  roomId: string;
}
