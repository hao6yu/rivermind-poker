import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';

import type {
  MultiplayerHandArchive,
  MultiplayerPublicTransition,
  MultiplayerRoomCommand,
  MultiplayerRoomConfig,
  MultiplayerViewerProjection,
} from '../domain/multiplayer/contracts';
import { ensureAnonymousSession, supabase } from './supabase';
import {
  isPersonalizedMultiplayerSnapshot,
  parseMultiplayerHandHistoryEnvelope,
  parseMultiplayerBroadcastEnvelope,
  parseMultiplayerRoomEnvelope,
  type MultiplayerRoomEnvelope,
} from './multiplayerContract';

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

export type MultiplayerRequestErrorCode =
  | 'command_conflict'
  | 'multiplayer_configuration'
  | 'multiplayer_invalid_response'
  | 'multiplayer_network'
  | 'request_invalid'
  | 'room_access'
  | 'room_code_busy'
  | 'room_command_invalid'
  | 'room_failure'
  | 'room_forbidden'
  | 'room_not_found'
  | 'room_rate_limited'
  | 'room_stale'
  | 'room_started'
  | 'room_unavailable'
  | 'seat_unavailable';

export class MultiplayerRequestError extends Error {
  constructor(
    public readonly code: MultiplayerRequestErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MultiplayerRequestError';
  }
}

interface EdgeErrorBody {
  error?: { code?: string; message?: string; retryable?: boolean };
}

function stableErrorCode(code: unknown): MultiplayerRequestErrorCode {
  const allowed: MultiplayerRequestErrorCode[] = [
    'command_conflict',
    'request_invalid',
    'room_access',
    'room_code_busy',
    'room_command_invalid',
    'room_failure',
    'room_forbidden',
    'room_not_found',
    'room_rate_limited',
    'room_stale',
    'room_started',
    'room_unavailable',
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
    return envelope && isPersonalizedMultiplayerSnapshot(envelope.snapshot)
      ? envelope.snapshot
      : null;
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
  config: MultiplayerRoomConfig;
  displayName: string;
  hostSeat?: number;
}): Promise<{ roomCode: string; snapshot: MultiplayerViewerProjection }> {
  const result = await invokeRoom({
    ...input,
    hostSeat: input.hostSeat ?? 0,
    operation: 'create',
  });
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
  displayName: string;
  roomCode: string;
  seat?: number | null;
}): Promise<{ roomCode: string; snapshot: MultiplayerViewerProjection }> {
  const result = await invokeRoom({ ...input, operation: 'join', seat: input.seat ?? null });
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
  const result = await invokeRoom({
    command: { ...command, commandId, expectedVersion },
    operation: 'command',
    roomId,
  });
  return { left: result.left, snapshot: result.snapshot, transition: result.transition };
}

export function subscribeToMultiplayerTable(
  roomId: string,
  onTransition: (envelope: MultiplayerRoomEnvelope | null) => void,
  onStatus?: (status: MultiplayerRealtimeStatus) => void,
): () => void {
  const client = supabase;
  if (!client) return () => undefined;
  const channel = client
    .channel(`room:${roomId}`, { config: { private: true } })
    .on('broadcast', { event: 'transition' }, (payload) => {
      onTransition(parseMultiplayerBroadcastEnvelope(payload));
    })
    .subscribe((status) => onStatus?.(status as MultiplayerRealtimeStatus));
  return () => {
    void client.removeChannel(channel);
  };
}
