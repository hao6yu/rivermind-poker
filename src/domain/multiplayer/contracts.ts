import type { AiDifficulty } from '../poker/aiProfiles.ts';
import type {
  MultiwayActionRecord,
  MultiwayHandState,
  MultiwayLegalActions,
} from '../poker/multiway.ts';
import type { PlayerAction } from '../poker/types.ts';

export type MultiplayerSeatCount = 2 | 3 | 6;
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
  processedCommands: MultiplayerProcessedCommand[];
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
    type: 'next-hand';
  })
  | (MultiplayerCommandBase & {
    type: 'rematch';
  })
  | (MultiplayerCommandBase & {
    type: 'leave';
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
  hostDisplayName: string;
  hostPlayerId: string;
  hostSeat?: number;
  hostUserId: string;
  roomCode: string;
  roomId: string;
}
