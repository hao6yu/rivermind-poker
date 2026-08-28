import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
} from '../../domain/multiplayer/coordinator';
import type {
  MultiplayerCoordinatorState,
  MultiplayerRoomCommand,
  MultiplayerRoomCommandInput,
  MultiplayerRoomSnapshot,
} from '../../domain/multiplayer/contracts';
import type {
  MultiplayerFlowMode,
  MultiplayerLobbySeat,
  MultiplayerTableDraft,
} from './multiplayerUx';

export const multiplayerPreviewHostUserId = 'preview:host';
export const multiplayerPreviewViewerUserId = 'preview:viewer';

export function multiplayerLobbyViewerUserId(mode: MultiplayerFlowMode): string {
  return mode === 'create' ? multiplayerPreviewHostUserId : multiplayerPreviewViewerUserId;
}

function applySetupCommand(
  state: MultiplayerCoordinatorState,
  command: MultiplayerRoomCommandInput,
  commandId: string,
  nowMs: number,
): MultiplayerCoordinatorState {
  return applyMultiplayerCommand(state, {
    ...command,
    commandId,
    expectedVersion: state.version,
  } as MultiplayerRoomCommand, { nowMs }).state;
}

/**
 * Creates the same lobby state shape that the server coordinator owns. This is
 * deliberately limited to the lobby; dealing and private cards remain a
 * backend responsibility and are never created in the client preview.
 */
export function createMultiplayerLobbyState(
  mode: MultiplayerFlowMode,
  draft: MultiplayerTableDraft,
  roomCode: string,
  nowMs: number,
): MultiplayerCoordinatorState {
  const roomId = `preview:${roomCode}`;
  const hostSeat = mode === 'create' ? 0 : draft.seatCount === 2 ? 1 : Math.ceil(draft.seatCount / 2);
  let state = createMultiplayerRoom({
    config: {
      aiDifficulty: draft.aiDifficulty,
      bigBlindChips: 20,
      handTarget: draft.sessionLength,
      seatCount: draft.seatCount,
      smallBlindChips: 10,
      startingStackChips: draft.startingStackChips,
      turnSeconds: draft.turnSeconds,
    },
    hostDisplayName: mode === 'create' ? draft.playerName : 'Mina',
    hostPlayerId: 'preview:player:host',
    hostSeat,
    hostUserId: multiplayerPreviewHostUserId,
    roomCode,
    roomId,
  }, { nowMs });

  if (mode === 'create') return state;

  state = applySetupCommand(state, {
    actorUserId: multiplayerPreviewViewerUserId,
    displayName: draft.playerName,
    playerId: 'preview:player:viewer',
    seat: 0,
    type: 'join',
  }, 'preview:join-viewer', nowMs + 1);
  if (draft.seatCount === 6 || draft.seatCount === 9) {
    state = applySetupCommand(state, {
      actorUserId: multiplayerPreviewHostUserId,
      seat: 2,
      type: 'add-ai',
    }, 'preview:add-ai', nowMs + 2);
  }
  return applySetupCommand(state, {
    actorUserId: multiplayerPreviewHostUserId,
    ready: true,
    type: 'set-ready',
  }, 'preview:host-ready', nowMs + 3);
}

/**
 * Projects the seats of a room state into lobby presentation rows. Accepts
 * either a public snapshot or the canonical coordinator state (the client
 * lobby preview works directly on coordinator state).
 */
export function multiplayerLobbySeats(
  state: MultiplayerRoomSnapshot | MultiplayerCoordinatorState,
  viewerId: string,
): MultiplayerLobbySeat[] {
  return Array.from({ length: state.config.seatCount }, (_, seatIndex) => {
    const seat = state.seats.find((candidate) => candidate.seat === seatIndex);
    if (!seat) {
      return {
        displayName: null,
        kind: 'open',
        ready: false,
        seat: seatIndex,
      };
    }
    return {
      avatar: seat.avatar ?? null,
      displayName: seat.displayName,
      isHost: seat.isHost,
      isViewer: seat.playerId === viewerId || seat.userId === viewerId,
      kind: seat.kind,
      ready: seat.ready,
      seat: seat.seat,
    };
  });
}

export function canStartMultiplayerSnapshot(state: MultiplayerRoomSnapshot): boolean {
  if (state.status !== 'lobby' || state.seats.length < 2) return false;
  const humans = state.seats.filter((seat) => seat.kind === 'human');
  return humans.length > 0
    && humans.every((seat) => seat.ready && seat.connection === 'online');
}
