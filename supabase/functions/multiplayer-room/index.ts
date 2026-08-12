import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
  MultiplayerCoordinatorError,
} from '../../../src/domain/multiplayer/coordinator.ts';
import type {
  MultiplayerCoordinatorState,
  MultiplayerRoomCommand,
  MultiplayerRoomSnapshot,
  MultiplayerTransition,
  MultiplayerViewerProjection,
} from '../../../src/domain/multiplayer/contracts.ts';
import {
  createMultiplayerPublicSnapshot,
  createMultiplayerPublicTransition,
  createMultiplayerViewerProjection,
} from '../../../src/domain/multiplayer/projection.ts';
import { parseMultiplayerRoomRequest } from './contract.ts';

interface RpcError {
  code?: string;
  message?: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

interface AdminRpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
}

interface JoinableRoom {
  canonicalState: MultiplayerCoordinatorState;
  roomId: string;
}

const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAX_BODY_BYTES = 20_000;
const CREATE_CODE_ATTEMPTS = 5;

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable = false,
): Response {
  return Response.json({ error: { code, message, retryable } }, { status });
}

function cryptographicRandom(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return (values[0] ?? 0) / 0x1_0000_0000;
}

function sixDigitRoomCode(): string {
  const values = new Uint32Array(1);
  const range = 900_000;
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % range);
  do {
    crypto.getRandomValues(values);
  } while ((values[0] ?? limit) >= limit);
  return String(100_000 + ((values[0] ?? 0) % range));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function canonicalState(value: unknown, expectedRoomId?: string): MultiplayerCoordinatorState | null {
  const source = asRecord(value);
  const config = asRecord(source?.config);
  if (
    !source
    || typeof source.roomId !== 'string'
    || (expectedRoomId !== undefined && source.roomId !== expectedRoomId)
    || !Number.isSafeInteger(source.version)
    || !Array.isArray(source.seats)
    || !Array.isArray(source.processedCommands)
    || !config
    || ![2, 3, 6].includes(config.seatCount as number)
    || !['lobby', 'playing', 'between-hands', 'paused', 'complete'].includes(source.status as string)
  ) return null;
  return source as unknown as MultiplayerCoordinatorState;
}

function joinableRoom(value: unknown): JoinableRoom | null {
  const source = asRecord(value);
  if (!source || typeof source.roomId !== 'string') return null;
  const state = canonicalState(source.canonicalState, source.roomId);
  return state ? { canonicalState: state, roomId: source.roomId } : null;
}

function stateForPersistence(state: MultiplayerCoordinatorState): MultiplayerCoordinatorState {
  return { ...state, roomCode: '' };
}

function viewerProjection(
  state: MultiplayerCoordinatorState,
  userId: string,
  knownRoomCode = '',
): MultiplayerViewerProjection | null {
  try {
    const projection = createMultiplayerViewerProjection(state, userId);
    return knownRoomCode ? { ...projection, roomCode: knownRoomCode } : projection;
  } catch {
    return null;
  }
}

function coordinatorErrorResponse(error: MultiplayerCoordinatorError): Response {
  switch (error.code) {
    case 'forbidden':
      return errorResponse(403, 'room_forbidden', error.message);
    case 'not-found':
      return errorResponse(404, 'room_not_found', error.message);
    case 'stale-version':
      return errorResponse(409, 'room_stale', error.message, true);
    case 'command-conflict':
      return errorResponse(409, 'command_conflict', error.message);
    case 'invalid-command':
    case 'invalid-room':
      return errorResponse(400, 'room_command_invalid', error.message);
  }
}

async function loadRoom(
  admin: AdminRpcClient,
  roomId: string,
): Promise<{ error: RpcError | null; state: MultiplayerCoordinatorState | null }> {
  const result = await admin.rpc('multiplayer_load_private_room', { p_room_id: roomId });
  return {
    error: result.error,
    state: result.error ? null : canonicalState(result.data, roomId),
  };
}

async function commitTransition(
  admin: AdminRpcClient,
  roomId: string,
  previousVersion: number,
  state: MultiplayerCoordinatorState,
  transition: MultiplayerTransition,
): Promise<RpcError | null> {
  const persistedState = stateForPersistence(state);
  const snapshot = createMultiplayerPublicSnapshot(persistedState);
  const publicTransition = createMultiplayerPublicTransition(transition);
  const result = await admin.rpc('multiplayer_commit_transition', {
    p_canonical_state: persistedState,
    p_expected_version: previousVersion,
    p_public_actions: transition.actionBatch,
    p_public_snapshot: snapshot,
    p_public_transition: { snapshot, transition: publicTransition },
    p_room_id: roomId,
  });
  return result.error;
}

function commitErrorResponse(error: RpcError): Response {
  if (error.code === '40001') {
    return errorResponse(409, 'room_stale', 'The room changed. Sync and try again.', true);
  }
  if (error.code === 'P0002') return errorResponse(404, 'room_not_found', 'The room was not found.');
  console.error('Multiplayer transition commit failed', { code: error.code ?? 'unknown' });
  return errorResponse(503, 'room_unavailable', 'The room could not save that change. Try again.', true);
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST for multiplayer room requests.');
    }
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_BYTES) {
      return errorResponse(413, 'request_too_large', 'The multiplayer request is too large.');
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse(400, 'request_invalid', 'Expected a JSON request body.');
    }
    const body = parseMultiplayerRoomRequest(rawBody);
    if (!body) return errorResponse(400, 'request_invalid', 'The multiplayer request is invalid.');

    const userId = context.userClaims?.id ?? context.jwtClaims?.sub;
    if (typeof userId !== 'string' || userId.length === 0) {
      return errorResponse(401, 'room_access', 'Start a new guest session and try again.');
    }
    const admin = context.supabaseAdmin as unknown as AdminRpcClient;
    const nowMs = Date.now();

    if (body.operation === 'create') {
      for (let attempt = 0; attempt < CREATE_CODE_ATTEMPTS; attempt += 1) {
        const roomCode = sixDigitRoomCode();
        const roomId = crypto.randomUUID();
        const playerId = `player:${crypto.randomUUID()}`;
        let state: MultiplayerCoordinatorState;
        try {
          state = createMultiplayerRoom({
            config: body.config,
            hostDisplayName: body.displayName,
            hostPlayerId: playerId,
            hostSeat: body.hostSeat,
            hostUserId: userId,
            roomCode,
            roomId,
          }, { nowMs });
        } catch (error) {
          if (error instanceof MultiplayerCoordinatorError) return coordinatorErrorResponse(error);
          throw error;
        }
        const publicSnapshot = createMultiplayerPublicSnapshot(state);
        const result = await admin.rpc('multiplayer_create_room', {
          p_canonical_state: stateForPersistence(state),
          p_config: state.config,
          p_expires_at: new Date(nowMs + ROOM_LIFETIME_MS).toISOString(),
          p_host_display_name: body.displayName,
          p_host_player_id: playerId,
          p_host_seat: body.hostSeat,
          p_host_user_id: userId,
          p_public_snapshot: publicSnapshot,
          p_room_code_hash: await sha256Hex(roomCode),
          p_room_id: roomId,
        });
        if (!result.error) {
          return Response.json({
            roomCode,
            roomId,
            snapshot: viewerProjection(state, userId, roomCode),
          }, { status: 201 });
        }
        if (result.error.code !== '23505') {
          console.error('Multiplayer room creation failed', { code: result.error.code ?? 'unknown' });
          return errorResponse(503, 'room_unavailable', 'The room could not be created. Try again.', true);
        }
      }
      return errorResponse(503, 'room_code_busy', 'A room code could not be reserved. Try again.', true);
    }

    if (body.operation === 'join') {
      const lookup = await admin.rpc('multiplayer_load_joinable_room', {
        p_room_code_hash: await sha256Hex(body.roomCode),
      });
      if (lookup.error) {
        console.error('Multiplayer room lookup failed', { code: lookup.error.code ?? 'unknown' });
        return errorResponse(503, 'room_unavailable', 'The room could not be checked. Try again.', true);
      }
      const room = joinableRoom(lookup.data);
      if (!room) return errorResponse(404, 'room_not_found', 'That room code is invalid or expired.');
      const occupied = new Set(room.canonicalState.seats.map((seat) => seat.seat));
      const seat = body.seat ?? Array.from(
        { length: room.canonicalState.config.seatCount },
        (_, index) => index,
      ).find((index) => !occupied.has(index));
      if (seat === undefined || seat >= room.canonicalState.config.seatCount || occupied.has(seat)) {
        return errorResponse(409, 'seat_unavailable', 'That room has no open seat.');
      }

      try {
        const result = applyMultiplayerCommand(room.canonicalState, {
          actorUserId: userId,
          commandId: `join:${crypto.randomUUID()}`,
          displayName: body.displayName,
          expectedVersion: room.canonicalState.version,
          playerId: `player:${crypto.randomUUID()}`,
          seat,
          type: 'join',
        }, { nowMs });
        const commitError = await commitTransition(
          admin,
          room.roomId,
          room.canonicalState.version,
          result.state,
          result.transition,
        );
        if (commitError) return commitErrorResponse(commitError);
        return Response.json({
          roomCode: body.roomCode,
          roomId: room.roomId,
          snapshot: viewerProjection(result.state, userId, body.roomCode),
        });
      } catch (error) {
        if (error instanceof MultiplayerCoordinatorError) return coordinatorErrorResponse(error);
        throw error;
      }
    }

    const loaded = await loadRoom(admin, body.roomId);
    if (loaded.error) {
      console.error('Multiplayer room load failed', { code: loaded.error.code ?? 'unknown' });
      return errorResponse(503, 'room_unavailable', 'The room could not be loaded. Try again.', true);
    }
    if (!loaded.state) return errorResponse(404, 'room_not_found', 'The room was not found or has expired.');
    const viewer = viewerProjection(loaded.state, userId);
    if (!viewer) return errorResponse(403, 'room_forbidden', 'You are not a member of this room.');
    if (body.operation === 'sync') return Response.json({ roomId: body.roomId, snapshot: viewer });

    try {
      const previousVersion = loaded.state.version;
      const result = applyMultiplayerCommand(loaded.state, {
        ...body.command,
        actorUserId: userId,
      } as MultiplayerRoomCommand, { nowMs, random: cryptographicRandom });
      if (result.duplicate) {
        return Response.json({
          duplicate: true,
          roomId: body.roomId,
          snapshot: viewerProjection(result.state, userId),
          transition: createMultiplayerPublicTransition(result.transition),
        });
      }
      const commitError = await commitTransition(
        admin,
        body.roomId,
        previousVersion,
        result.state,
        result.transition,
      );
      if (commitError) return commitErrorResponse(commitError);
      const snapshot = viewerProjection(result.state, userId);
      return Response.json({
        duplicate: false,
        left: snapshot === null,
        roomId: body.roomId,
        snapshot: snapshot ?? createMultiplayerPublicSnapshot(result.state),
        transition: createMultiplayerPublicTransition(result.transition),
      });
    } catch (error) {
      if (error instanceof MultiplayerCoordinatorError) return coordinatorErrorResponse(error);
      console.error('Unexpected multiplayer coordinator failure');
      return errorResponse(500, 'room_failure', 'The room could not process that request.', true);
    }
  }),
};
