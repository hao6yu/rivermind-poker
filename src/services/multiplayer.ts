import type { PublicPlayerRecordSnapshot } from '../domain/multiplayer/playerRecordSnapshot';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';

import {
  type MultiplayerHandArchive,
  type MultiplayerPublicTransition,
  type MultiplayerRoomCommand,
  type MultiplayerRoomConfig,
  type MultiplayerViewerProjection,
} from '../domain/multiplayer/contracts';
import type { HumanAvatarReference } from '../domain/playerProfile';
import {
  TABLE_MOMENT_PROTOCOL_VERSION,
  type TableMomentEnvelope,
  type TableMomentReactionId,
} from '../domain/multiplayer/tableMoments';
import {
  ensureAnonymousSession,
  supabase,
} from './supabase';
import {
  isPersonalizedMultiplayerSnapshot,
  multiplayerSnapshotRequiresUpdate,
  parseMultiplayerBroadcastEnvelope,
  parseMultiplayerHandHistoryEnvelope,
  parseMultiplayerMomentEnvelope,
  parseMultiplayerRoomEnvelope,
  parseTableMomentBroadcastEnvelope,
  type MultiplayerRoomEnvelope,
} from './multiplayerContract';
import {
  MultiplayerRequestError,
  type MultiplayerRequestErrorCode,
} from './multiplayerRequestError';
import {
  buildCreateMultiplayerTableRequest,
  buildJoinMultiplayerTableRequest,
  buildMultiplayerCommandRequest,
} from './multiplayerRequest';

export {
  MultiplayerRequestError,
  type MultiplayerRequestErrorCode,
} from './multiplayerRequestError';

export type MultiplayerClientCommand = MultiplayerRoomCommand extends infer Command
  ? Command extends MultiplayerRoomCommand
    ? Command['type'] extends 'join'
      ? never
      : Omit<Command, 'actorUserId' | 'commandId' | 'expectedVersion'>
    : never
  : never;

export type MultiplayerRealtimeStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

interface EdgeErrorBody {
  error?: { code?: string; message?: string; retryAfterMs?: number; retryable?: boolean };
}

function stableErrorCode(code: unknown): MultiplayerRequestErrorCode {
  const allowed: MultiplayerRequestErrorCode[] = [
    'ai_roster_exhausted',
    'command_conflict',
    'moment_burst',
    'moment_cooldown',
    'moment_duplicate',
    'moment_hand_budget',
    // R1: the worker refuses an incompatible create/join client with this
    // stable code BEFORE any membership mutation; it must survive the
    // classification so the UI can surface localized update-required copy.
    'multiplayer_update_required',
    'request_invalid',
    'room_access',
    'room_code_busy',
    'room_command_invalid',
    'room_failure',
    'room_forbidden',
    'room_not_found',
    'room_rate_limited',
    'room_seat_count_unsupported',
    'room_stale',
    'room_started',
    'room_unavailable',
    // R4: a persisted room row that exists but cannot be normalized safely
    // (corrupt current format, invalid/future protocol or lifecycle state) is
    // refused with this stable code instead of a misleading not-found.
    'room_unsupported_state',
    'seat_unavailable',
  ];
  return typeof code === 'string' && allowed.includes(code as MultiplayerRequestErrorCode)
    ? code as MultiplayerRequestErrorCode
    : 'room_unavailable';
}

async function classifyFunctionError(error: unknown): Promise<MultiplayerRequestError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json() as EdgeErrorBody;
      if (body.error?.message) {
        return new MultiplayerRequestError(
          stableErrorCode(body.error.code),
          body.error.message,
          body.error.retryable === true,
          typeof body.error.retryAfterMs === 'number' ? body.error.retryAfterMs : undefined,
        );
      }
    } catch {
      // Fall through to a stable proxy error.
    }
  }
  if (error instanceof FunctionsFetchError) {
    return new MultiplayerRequestError(
      'multiplayer_network',
      'The table could not connect. Check your network and try again.',
      true,
    );
  }
  if (error instanceof FunctionsRelayError) {
    return new MultiplayerRequestError(
      'room_unavailable',
      'The multiplayer service is temporarily unavailable.',
      true,
    );
  }
  return new MultiplayerRequestError(
    'room_unavailable',
    'The table could not complete that request.',
    true,
  );
}

async function invokeMultiplayerFunction(body: Record<string, unknown>): Promise<unknown> {
  await ensureAnonymousSession();
  if (!supabase) {
    throw new MultiplayerRequestError(
      'multiplayer_configuration',
      'Multiplayer is not connected yet.',
      false,
    );
  }
  const { data, error } = await supabase.functions.invoke('multiplayer-room', {
    body,
    timeout: 20_000,
  });
  if (error) throw await classifyFunctionError(error);
  return data;
}

async function invokeRoom(body: Record<string, unknown>): Promise<{
  left?: boolean;
  roomCode?: string;
  snapshot: MultiplayerViewerProjection | null;
  transition?: MultiplayerPublicTransition;
}> {
  const data = await invokeMultiplayerFunction(body);
  const envelope = parseMultiplayerRoomEnvelope(data);
  if (!envelope || (!envelope.left && !isPersonalizedMultiplayerSnapshot(envelope.snapshot))) {
    if (multiplayerSnapshotRequiresUpdate(data)) {
      throw new MultiplayerRequestError(
        'multiplayer_update_required',
        'This table uses a newer RiverMind table format. Update RiverMind to join.',
        false,
      );
    }
    throw new MultiplayerRequestError(
      'multiplayer_invalid_response',
      'The table returned an invalid update. Try again.',
      true,
    );
  }
  return {
    left: envelope.left,
    roomCode: envelope.roomCode,
    snapshot: envelope.left ? null : envelope.snapshot as MultiplayerViewerProjection,
    transition: envelope.transition,
  };
}

export async function resumeMultiplayerTable(): Promise<MultiplayerViewerProjection | null> {
  try {
    const data = await invokeMultiplayerFunction({ operation: 'resume' });
    const envelope = parseMultiplayerRoomEnvelope(data);
    if (envelope && isPersonalizedMultiplayerSnapshot(envelope.snapshot)) {
      return envelope.snapshot;
    }
    if (multiplayerSnapshotRequiresUpdate(data)) {
      throw new MultiplayerRequestError(
        'multiplayer_update_required',
        'This table uses a newer RiverMind table format. Update RiverMind to join.',
        false,
      );
    }
    return null;
  } catch (error) {
    if (error instanceof MultiplayerRequestError && error.code === 'room_not_found') return null;
    throw error;
  }
}

export async function loadMultiplayerHandHistory(input: {
  limit?: number;
  roomId?: string | null;
  sessionNumber?: number | null;
} = {}): Promise<MultiplayerHandArchive[]> {
  const data = await invokeMultiplayerFunction({
    limit: input.limit ?? 50,
    operation: 'history',
    roomId: input.roomId ?? null,
    sessionNumber: input.sessionNumber ?? null,
  });
  const history = parseMultiplayerHandHistoryEnvelope(data);
  if (!history) {
    throw new MultiplayerRequestError(
      'multiplayer_invalid_response',
      'The table returned invalid hand history. Try again.',
      true,
    );
  }
  return history;
}

export async function deleteAllMultiplayerHandHistory(): Promise<number> {
  if (!supabase) return 0;
  const data = await invokeMultiplayerFunction({ operation: 'delete-history' });
  if (
    typeof data !== 'object'
    || data === null
    || Array.isArray(data)
    || !Number.isSafeInteger((data as { deleted?: unknown }).deleted)
    || ((data as { deleted: number }).deleted < 0)
  ) {
    throw new MultiplayerRequestError(
      'multiplayer_invalid_response',
      'The table returned an invalid deletion result. Try again.',
      true,
    );
  }
  return (data as { deleted: number }).deleted;
}

export async function createMultiplayerTable(input: {
  avatar?: HumanAvatarReference | null;
  config: MultiplayerRoomConfig;
  displayName: string;
  hostSeat?: number;
  /** The host's room-private Play record snapshot (scope 3.11E). */
  playRecord?: PublicPlayerRecordSnapshot;
}): Promise<{ roomCode: string; snapshot: MultiplayerViewerProjection }> {
  const result = await invokeRoom(buildCreateMultiplayerTableRequest(input));
  if (!result.snapshot || !result.roomCode || !/^\d{6}$/.test(result.roomCode)) {
    throw new MultiplayerRequestError(
      'multiplayer_invalid_response',
      'The table did not return a valid room code.',
      true,
    );
  }
  return { roomCode: result.roomCode, snapshot: result.snapshot };
}

export async function joinMultiplayerTable(input: {
  avatar?: HumanAvatarReference | null;
  displayName: string;
  /** The joining member's room-private Play record snapshot (scope 3.11E). */
  playRecord?: PublicPlayerRecordSnapshot;
  roomCode: string;
  seat?: number | null;
}): Promise<{ roomCode: string; snapshot: MultiplayerViewerProjection }> {
  const result = await invokeRoom(buildJoinMultiplayerTableRequest(input));
  if (!result.snapshot) throw new MultiplayerRequestError(
    'multiplayer_invalid_response',
    'The table returned an invalid update. Try again.',
    true,
  );
  return { roomCode: result.roomCode ?? input.roomCode, snapshot: result.snapshot };
}

export async function syncMultiplayerTable(roomId: string): Promise<MultiplayerViewerProjection> {
  const snapshot = (await invokeRoom({ operation: 'sync', roomId })).snapshot;
  if (!snapshot) throw new MultiplayerRequestError(
    'multiplayer_invalid_response',
    'The table returned an invalid update. Try again.',
    true,
  );
  return snapshot;
}

export async function sendMultiplayerCommand(
  roomId: string,
  expectedVersion: number,
  command: MultiplayerClientCommand,
  commandId = Crypto.randomUUID(),
): Promise<{
  left?: boolean;
  snapshot: MultiplayerViewerProjection | null;
  transition?: MultiplayerPublicTransition;
}> {
  const result = await invokeRoom(buildMultiplayerCommandRequest(
    roomId,
    commandId,
    expectedVersion,
    command as Record<string, unknown>,
  ));
  return { left: result.left, snapshot: result.snapshot, transition: result.transition };
}

export function subscribeToMultiplayerTable(
  roomId: string,
  onTransition: (envelope: MultiplayerRoomEnvelope | null) => void,
  onStatus?: (status: MultiplayerRealtimeStatus) => void,
  onMoment?: (moment: TableMomentEnvelope) => void,
): () => void {
  const client = supabase;
  if (!client) return () => undefined;
  const channel = client
    .channel(`room:${roomId}`, { config: { private: true } })
    .on('broadcast', { event: 'transition' }, (payload) => {
      onTransition(parseMultiplayerBroadcastEnvelope(payload));
    })
    .on('broadcast', { event: 'table-moment' }, (payload) => {
      const moment = parseTableMomentBroadcastEnvelope(payload);
      if (moment && moment.roomId === roomId && onMoment) onMoment(moment);
    })
    .subscribe((status) => onStatus?.(status as MultiplayerRealtimeStatus));
  return () => {
    void client.removeChannel(channel);
  };
}

/**
 * Sends one ephemeral table moment through the authenticated multiplayer-room
 * Edge Function. The server derives the sender seat, revalidates the hand and
 * reaction, claims the cooldown/budget/dedup slot, and broadcasts on the
 * private room topic; the client never chooses whose moment is shown. Cooldown,
 * budget, and duplicate rejections surface as non-retryable codes the UI treats
 * as silent (the moment simply is not shown); the envelope comes back only
 * when the moment was actually accepted.
 */
export async function sendMultiplayerTableMoment(
  roomId: string,
  reactionId: TableMomentReactionId,
  momentId: string,
  handNumber: number,
): Promise<TableMomentEnvelope> {
  const data = await invokeMultiplayerFunction({
    handNumber,
    id: momentId,
    operation: 'moment',
    protocolVersion: TABLE_MOMENT_PROTOCOL_VERSION,
    reactionId,
    roomId,
  });
  const envelope = parseMultiplayerMomentEnvelope(data);
  if (!envelope) {
    throw new MultiplayerRequestError(
      'multiplayer_invalid_response',
      'The table returned an invalid moment update. Try again.',
      true,
    );
  }
  return envelope;
}
