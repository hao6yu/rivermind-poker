import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
  evaluateTableMoment,
  MultiplayerCoordinatorError,
} from '../../../src/domain/multiplayer/coordinator.ts';
import {
  allInCommitPlayerIds,
  classifyAiAllInMomentTriggers,
  classifyAiMomentTriggers,
  selectAiTableMoments,
  type AiMomentTrigger,
} from '../../../src/domain/multiplayer/aiTableMoments.ts';
import type {
  MultiplayerCoordinatorState,
  MultiplayerHandArchive,
  MultiplayerRoomCommand,
  MultiplayerRoomSnapshot,
  MultiplayerTransition,
  MultiplayerViewerProjection,
} from '../../../src/domain/multiplayer/contracts.ts';
import {
  multiplayerJoinSeatCountSupported,
  MULTIPLAYER_PROTOCOL_VERSION,
} from '../../../src/domain/multiplayer/contracts.ts';
import {
  gateCreateJoinProtocol,
  parseMultiplayerRoomRequest,
} from './contract.ts';
import {
  multiplayerHandBecameArchivable,
  parseMultiplayerHandArchives,
} from '../../../src/domain/multiplayer/archive.ts';
import {
  createMultiplayerPublicSnapshot,
  createMultiplayerPublicTransition,
  createMultiplayerViewerHandArchive,
  createMultiplayerViewerProjection,
} from '../../../src/domain/multiplayer/projection.ts';
import {
  normalizeMultiplayerCanonicalState,
  parseJoinableMultiplayerRoom,
} from './stateContract.ts';

function rawRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

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

const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAX_BODY_BYTES = 20_000;
const CREATE_CODE_ATTEMPTS = 5;
const REQUEST_LIMIT_WINDOW_SECONDS = 60;
const CREATE_REQUEST_LIMIT = 10;
const JOIN_REQUEST_LIMIT = 20;

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable = false,
  retryAfterMs?: number,
): Response {
  return Response.json({
    error: {
      code,
      message,
      retryable,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    },
  }, { status });
}

function logRequestDiagnostic(
  operation: string,
  outcome: 'failure' | 'success',
  status: number,
  startedAtMs: number,
  detail?: string,
): void {
  console.info('Multiplayer request', {
    detail: detail ?? null,
    latencyMs: Math.max(0, Math.round(performance.now() - startedAtMs)),
    operation,
    outcome,
    status,
  });
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

function stateForPersistence(state: MultiplayerCoordinatorState): MultiplayerCoordinatorState {
  return { ...state, roomCode: '' };
}

interface PersistedHandArchive extends MultiplayerHandArchive {
  userId: string;
}

function archivesForPersistence(
  previousState: MultiplayerCoordinatorState,
  state: MultiplayerCoordinatorState,
): PersistedHandArchive[] {
  if (!multiplayerHandBecameArchivable(previousState, state)) return [];
  return state.seats.flatMap((seat) => {
    if (seat.kind !== 'human' || !seat.userId) return [];
    const archive = createMultiplayerViewerHandArchive(state, seat.userId);
    return archive ? [{ ...archive, userId: seat.userId }] : [];
  });
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
    case 'roster-exhausted':
      return errorResponse(409, 'ai_roster_exhausted', error.message);
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
    state: result.error ? null : normalizeMultiplayerCanonicalState(result.data, roomId),
  };
}

async function claimRequestSlot(
  admin: AdminRpcClient,
  userId: string,
  operation: 'create' | 'join',
): Promise<{ allowed: boolean; error: RpcError | null }> {
  const result = await admin.rpc('multiplayer_claim_request_slot', {
    p_limit: operation === 'create' ? CREATE_REQUEST_LIMIT : JOIN_REQUEST_LIMIT,
    p_operation: operation,
    p_user_id: userId,
    p_window_seconds: REQUEST_LIMIT_WINDOW_SECONDS,
  });
  return { allowed: result.data === true, error: result.error };
}

async function commitTransition(
  admin: AdminRpcClient,
  roomId: string,
  previousState: MultiplayerCoordinatorState,
  state: MultiplayerCoordinatorState,
  transition: MultiplayerTransition,
): Promise<RpcError | null> {
  const persistedState = stateForPersistence(state);
  const snapshot = createMultiplayerPublicSnapshot(persistedState);
  const publicTransition = createMultiplayerPublicTransition(transition);
  const result = await admin.rpc('multiplayer_commit_transition_v2', {
    p_canonical_state: persistedState,
    p_expected_version: previousState.version,
    p_hand_archives: archivesForPersistence(previousState, state),
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

/**
 * Selects and broadcasts sparse AI reactions for a just-settled hand. Runs
 * only after the settling transition committed; the coordinator classifies
 * AI seats against the three authored trigger classes and rolls the authored
 * probability, then each candidate is claimed against the authoritative
 * room-cooldown, per-hand cap, and per-AI limit before it is broadcast on the
 * same private topic as human moments. Clients never roll an AI reaction, and
 * a failed claim or broadcast is silently skipped: AI moments are ephemeral
 * and must never fail the underlying transition response.
 */
async function broadcastAiMoments(
  admin: AdminRpcClient,
  previousState: MultiplayerCoordinatorState,
  state: MultiplayerCoordinatorState,
  nowMs: number,
  transition: MultiplayerTransition | null,
): Promise<void> {
  try {
    // Settled hand: this engine computes the showdown reveal and the
    // settled-hand result in the same transition, so the settled-result
    // classes cover both approved stages.
    if (multiplayerHandBecameArchivable(previousState, state)) {
      const outcome = state.hand?.outcome;
      if (!outcome) return;
      await emitAiMoments(
        admin,
        state,
        nowMs,
        classifyAiMomentTriggers(state, outcome),
      );
      return;
    }
    // Mid-hand accepted all-in while the hand still runs: the players who
    // committed their stack in this transition are the all-in event, and AI
    // seats still in the hand may react.
    const allInIds = allInCommitPlayerIds(state, transition);
    if (allInIds.length === 0) return;
    await emitAiMoments(
      admin,
      state,
      nowMs,
      classifyAiAllInMomentTriggers(state, allInIds[0]),
    );
  } catch (error) {
    // A network-level rejection (or any selection failure) must never surface
    // as a failed response for a transition that already committed.
    console.error('Multiplayer AI moment pipeline aborted', { error });
  }
}

async function emitAiMoments(
  admin: AdminRpcClient,
  state: MultiplayerCoordinatorState,
  nowMs: number,
  triggers: AiMomentTrigger[],
): Promise<void> {
  if (triggers.length === 0) return;
  const candidates = selectAiTableMoments({
    aiMomentsThisHand: 0,
    nowMs,
    random: cryptographicRandom,
    roomLastAiMomentAtMs: null,
    state,
    triggers,
  });
  for (const candidate of candidates) {
    // One transactional send: the AI claim (room cooldown, per-hand cap,
    // per-seat limit, burst bucket) and the broadcast commit or roll back
    // together, so a failed delivery consumes no AI moment budget and the next
    // transition can spend the slot on a moment that actually arrives.
    const send = await admin.rpc('multiplayer_send_ai_table_moment', {
      p_hand_number: candidate.handNumber,
      p_now_ms: candidate.atMs,
      p_payload: { moment: candidate, roomId: candidate.roomId },
      p_payload_id: candidate.id,
      p_room_id: candidate.roomId,
      p_seat: candidate.seat,
    });
    if (send.error) {
      console.error('Multiplayer AI moment send failed', { code: send.error.code ?? 'unknown' });
      continue;
    }
    if (send.data === 'room-cooldown' || send.data === 'room-burst' || send.data === 'hand-cap') break;
  }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const startedAtMs = performance.now();
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

    // Capability negotiation (R1, scope 3.11F/H08) runs on the RAW body before
    // the strict parser: an older/future protocol must be refused with a
    // stable update-required response even when the rest of its payload uses
    // legacy field names the current parser would reject. Malformed protocol
    // values fail safely as request_invalid; anything else continues to the
    // full parse below.
    const rawSource = rawRecord(rawBody);
    if (rawSource?.operation === 'create' || rawSource?.operation === 'join') {
      const gate = gateCreateJoinProtocol(rawSource.protocol);
      if (gate === 'update-required') {
        logRequestDiagnostic(String(rawSource.operation), 'failure', 426, startedAtMs, 'protocol-unsupported');
        return errorResponse(
          426,
          'multiplayer_update_required',
          'This version of the app cannot join tables with the seat lifecycle and ledger. Update the app and try again.',
        );
      }
      if (gate === 'invalid') {
        logRequestDiagnostic(String(rawSource.operation), 'failure', 400, startedAtMs, 'protocol-malformed');
        return errorResponse(400, 'request_invalid', 'The multiplayer request is invalid.');
      }
    }

    const body = parseMultiplayerRoomRequest(rawBody);
    if (!body) return errorResponse(400, 'request_invalid', 'The multiplayer request is invalid.');

    const userId = context.userClaims?.id ?? context.jwtClaims?.sub;
    if (typeof userId !== 'string' || userId.length === 0) {
      return errorResponse(401, 'room_access', 'Start a new guest session and try again.');
    }
    const admin = context.supabaseAdmin as unknown as AdminRpcClient;
    const nowMs = Date.now();

    if (body.operation === 'create' || body.operation === 'join') {
      const slot = await claimRequestSlot(admin, userId, body.operation);
      if (slot.error) {
        console.error('Multiplayer request limit failed', { code: slot.error.code ?? 'unknown' });
        logRequestDiagnostic(body.operation, 'failure', 503, startedAtMs, 'limit-unavailable');
        return errorResponse(503, 'room_unavailable', 'The room could not be checked. Try again.', true);
      }
      if (!slot.allowed) {
        logRequestDiagnostic(body.operation, 'failure', 429, startedAtMs, 'rate-limited');
        return errorResponse(
          429,
          'room_rate_limited',
          'Too many room attempts. Wait a moment and try again.',
          true,
        );
      }
    }

    if (body.operation === 'resume') {
      const result = await admin.rpc('multiplayer_load_resumable_room', { p_user_id: userId });
      if (result.error) {
        console.error('Multiplayer room recovery failed', { code: result.error.code ?? 'unknown' });
        logRequestDiagnostic('resume', 'failure', 503, startedAtMs, 'load-failed');
        return errorResponse(503, 'room_unavailable', 'The table could not be restored. Try again.', true);
      }
      const state = normalizeMultiplayerCanonicalState(result.data);
      if (!state) {
        logRequestDiagnostic('resume', 'failure', 404, startedAtMs, 'not-found');
        return errorResponse(404, 'room_not_found', 'There is no active table to restore.');
      }
      const snapshot = viewerProjection(state, userId);
      if (!snapshot) return errorResponse(403, 'room_forbidden', 'You are not a member of this room.');
      logRequestDiagnostic('resume', 'success', 200, startedAtMs);
      return Response.json({ roomId: state.roomId, snapshot });
    }

    if (body.operation === 'history') {
      const result = await admin.rpc('multiplayer_load_hand_archives', {
        p_limit: body.limit,
        p_room_id: body.roomId,
        p_session_number: body.sessionNumber,
        p_user_id: userId,
      });
      if (result.error) {
        console.error('Multiplayer hand history load failed', { code: result.error.code ?? 'unknown' });
        logRequestDiagnostic('history', 'failure', 503, startedAtMs, 'load-failed');
        return errorResponse(503, 'room_unavailable', 'Hand history could not be loaded. Try again.', true);
      }
      const history = parseMultiplayerHandArchives(result.data);
      if (!history) {
        logRequestDiagnostic('history', 'failure', 500, startedAtMs, 'invalid-archive');
        return errorResponse(500, 'room_failure', 'Hand history could not be verified.', true);
      }
      logRequestDiagnostic('history', 'success', 200, startedAtMs);
      return Response.json({ history });
    }

    if (body.operation === 'delete-history') {
      const result = await admin.rpc('multiplayer_delete_hand_archives', { p_user_id: userId });
      if (result.error || !Number.isSafeInteger(result.data) || (result.data as number) < 0) {
        console.error('Multiplayer hand history deletion failed', {
          code: result.error?.code ?? 'invalid-result',
        });
        logRequestDiagnostic('delete-history', 'failure', 503, startedAtMs, 'delete-failed');
        return errorResponse(503, 'room_unavailable', 'Hand history could not be deleted. Try again.', true);
      }
      logRequestDiagnostic('delete-history', 'success', 200, startedAtMs);
      return Response.json({ deleted: result.data });
    }

    // Capability negotiation (scope 3.11F/H08): a client that declares an
    // older/other lifecycle protocol is refused with an update-required
    // response BEFORE any membership or seat mutation. A request with no
    // protocol field at all is pre-3.11F legacy — same refusal.
    if (body.operation === 'create') {
      for (let attempt = 0; attempt < CREATE_CODE_ATTEMPTS; attempt += 1) {
        const roomCode = sixDigitRoomCode();
        const roomId = crypto.randomUUID();
        const playerId = `player:${crypto.randomUUID()}`;
        let state: MultiplayerCoordinatorState;
        try {
          state = createMultiplayerRoom({
            config: body.config,
            hostAvatar: body.hostAvatar,
            hostDisplayName: body.displayName,
            hostPlayerId: playerId,
            hostSeat: body.hostSeat,
            hostUserId: userId,
            roomCode,
            roomId,
          }, { nowMs });
          // The host's room-private Play record publishes through the same
          // owner-only validated path every member uses (scope 3.11E/F).
          // This is the ONLY host-record publication path: the parser maps
          // exactly one wire field (`hostPlayRecord`) so a supplied record can
          // never be dropped or applied twice (R1).
          if (body.hostPlayRecord !== undefined) {
            state = applyMultiplayerCommand(state, {
              actorUserId: userId,
              commandId: `create-record:${crypto.randomUUID()}`,
              expectedVersion: state.version,
              record: body.hostPlayRecord,
              type: 'update-play-record',
            }, { nowMs }).state;
          }
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
          logRequestDiagnostic('create', 'success', 201, startedAtMs);
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
        logRequestDiagnostic('join', 'failure', 503, startedAtMs, 'lookup-failed');
        return errorResponse(503, 'room_unavailable', 'The room could not be checked. Try again.', true);
      }
      const room = parseJoinableMultiplayerRoom(lookup.data);
      if (!room) {
        logRequestDiagnostic('join', 'failure', 404, startedAtMs, 'invalid-or-expired');
        return errorResponse(404, 'room_not_found', 'That room code is invalid or expired.');
      }
      if (room.canonicalState.status !== 'lobby') {
        logRequestDiagnostic('join', 'failure', 409, startedAtMs, 'already-started');
        return errorResponse(409, 'room_started', 'That table has already started.');
      }
      // Seat-count negotiation happens before any mutation: the join commits
      // the seat before the client sees a snapshot, so a client that cannot
      // handle this table size must be refused here instead of stranding the
      // lobby with an occupant whose own build rejects the room.
      if (!multiplayerJoinSeatCountSupported(
        body.supportedSeatCounts,
        room.canonicalState.config.seatCount,
      )) {
        logRequestDiagnostic('join', 'failure', 409, startedAtMs, 'seat-count-unsupported');
        return errorResponse(
          409,
          'room_seat_count_unsupported',
          'This version of the app cannot join tables this size. Update the app and try again.',
        );
      }
      const occupied = new Set(room.canonicalState.seats.map((seat) => seat.seat));
      const seat = body.seat ?? Array.from(
        { length: room.canonicalState.config.seatCount },
        (_, index) => index,
      ).find((index) => !occupied.has(index));
      if (seat === undefined || seat >= room.canonicalState.config.seatCount || occupied.has(seat)) {
        logRequestDiagnostic('join', 'failure', 409, startedAtMs, 'no-seat');
        return errorResponse(409, 'seat_unavailable', 'That room has no open seat.');
      }

      try {
        const result = applyMultiplayerCommand(room.canonicalState, {
          actorUserId: userId,
          avatar: body.avatar,
          commandId: `join:${crypto.randomUUID()}`,
          playRecord: body.playRecord,
          displayName: body.displayName,
          expectedVersion: room.canonicalState.version,
          playerId: `player:${crypto.randomUUID()}`,
          seat,
          type: 'join',
        }, { nowMs });
        const commitError = await commitTransition(
          admin,
          room.roomId,
          room.canonicalState,
          result.state,
          result.transition,
        );
        if (commitError) return commitErrorResponse(commitError);
        logRequestDiagnostic('join', 'success', 200, startedAtMs);
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

    if (body.operation === 'moment') {
      const loaded = await loadRoom(admin, body.roomId);
      if (loaded.error) {
        console.error('Multiplayer room load failed', { code: loaded.error.code ?? 'unknown' });
        logRequestDiagnostic('moment', 'failure', 503, startedAtMs, 'load-failed');
        return errorResponse(503, 'room_unavailable', 'The table could not be checked. Try again.', true);
      }
      if (!loaded.state) {
        logRequestDiagnostic('moment', 'failure', 404, startedAtMs, 'not-found');
        return errorResponse(404, 'room_not_found', 'The table was not found or has expired.');
      }
      if (!viewerProjection(loaded.state, userId)) {
        logRequestDiagnostic('moment', 'failure', 403, startedAtMs, 'not-member');
        return errorResponse(403, 'room_forbidden', 'You are not a member of this room.');
      }
      // The coordinator derives the sender seat from the authenticated
      // membership and revalidates the hand sequence, reaction id, and payload
      // id against the authoritative state before anything is emitted.
      let moment;
      try {
        moment = evaluateTableMoment(loaded.state, {
          actorUserId: userId,
          handNumber: body.handNumber,
          id: body.id,
          reactionId: body.reactionId,
        }, nowMs);
      } catch (error) {
        if (error instanceof MultiplayerCoordinatorError) return coordinatorErrorResponse(error);
        throw error;
      }
      // One transactional send: the claim (sender/room token buckets, payload-id
      // deduplication, live-hand revalidation) and the broadcast commit or roll
      // back together, so a failed delivery consumes nothing and a retry
      // succeeds, while a duplicate answer still means "already delivered".
      const send = await admin.rpc('multiplayer_send_table_moment', {
        p_hand_number: moment.handNumber,
        p_now_ms: moment.atMs,
        p_payload: { moment, roomId: moment.roomId },
        p_payload_id: moment.id,
        p_room_id: moment.roomId,
        p_user_id: userId,
      });
      if (send.error) {
        console.error('Multiplayer moment send failed', { code: send.error.code ?? 'unknown' });
        logRequestDiagnostic('moment', 'failure', 503, startedAtMs, 'send-failed');
        return errorResponse(503, 'room_unavailable', 'The moment could not be delivered. Try again.', true);
      }
      if (send.data !== 'accepted') {
        // Duplicate/legacy budget answers are non-fatal. A stale hand means
        // the room advanced past the moment's hand between
        // validation and the claim: surface it as a retryable sync so the
        // client converges on the current hand instead of showing an error.
        if (send.data === 'stale-hand') {
          logRequestDiagnostic('moment', 'failure', 409, startedAtMs, 'stale-hand');
          return errorResponse(
            409,
            'room_stale',
            'The table changed before that moment was sent. Review the latest state and try again.',
            true,
          );
        }
        const burst = typeof send.data === 'string'
          ? /^burst:(\d+)$/.exec(send.data)
          : null;
        if (burst) {
          const retryAfterMs = Math.max(1, Number(burst[1]));
          logRequestDiagnostic('moment', 'failure', 429, startedAtMs, 'burst');
          return errorResponse(
            429,
            'moment_burst',
            'The table is showing enough moments right now. Wait a moment and try again.',
            true,
            retryAfterMs,
          );
        }
        logRequestDiagnostic('moment', 'failure', 429, startedAtMs, String(send.data));
        return errorResponse(
          429,
          send.data === 'budget'
            ? 'moment_hand_budget'
            : send.data === 'duplicate' ? 'moment_duplicate' : 'moment_cooldown',
          'The table is showing enough moments right now. Wait a moment and try again.',
          false,
        );
      }
      // The moment was broadcast exactly once by the database on the same
      // private room topic as every snapshot, with the claim committed in the
      // same transaction. The SQL wrapper revalidated the payload shape and
      // redaction before sending.
      logRequestDiagnostic('moment', 'success', 200, startedAtMs);
      return Response.json({ moment, roomId: moment.roomId });
    }

    const loaded = await loadRoom(admin, body.roomId);
    if (loaded.error) {
      console.error('Multiplayer room load failed', { code: loaded.error.code ?? 'unknown' });
      return errorResponse(503, 'room_unavailable', 'The room could not be loaded. Try again.', true);
    }
    if (!loaded.state) return errorResponse(404, 'room_not_found', 'The room was not found or has expired.');
    const viewer = viewerProjection(loaded.state, userId);
    if (!viewer) return errorResponse(403, 'room_forbidden', 'You are not a member of this room.');
    if (body.operation === 'sync') {
      logRequestDiagnostic('sync', 'success', 200, startedAtMs);
      return Response.json({ roomId: body.roomId, snapshot: viewer });
    }

    try {
      const result = applyMultiplayerCommand(loaded.state, {
        ...body.command,
        actorUserId: userId,
      } as MultiplayerRoomCommand, { nowMs, random: cryptographicRandom });
      if (result.duplicate) {
        logRequestDiagnostic('command', 'success', 200, startedAtMs, 'duplicate');
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
        loaded.state,
        result.state,
        result.transition,
      );
      if (commitError) return commitErrorResponse(commitError);
      // A hand that just settled (or a mid-hand accepted all-in) may earn
      // sparse AI reactions: the coordinator classifies and rolls them, the
      // claim gates each one, and the broadcast rides the same private topic.
      // The pipeline runs after the canonical commit and can never fail the
      // response (every failure is swallowed inside it); it is awaited rather
      // than fire-and-forgot so the isolate cannot be torn down mid-broadcast,
      // costing at most a couple of short RPCs on the transition response.
      await broadcastAiMoments(admin, loaded.state, result.state, nowMs, result.transition);
      const snapshot = viewerProjection(result.state, userId);
      logRequestDiagnostic('command', 'success', 200, startedAtMs, body.command.type);
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
