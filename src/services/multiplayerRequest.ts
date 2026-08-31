import {
  MULTIPLAYER_CLIENT_SEAT_COUNTS,
  MULTIPLAYER_PROTOCOL_VERSION,
  type MultiplayerRoomConfig,
} from '../domain/multiplayer/contracts';
import type { HumanAvatarSnapshot } from '../domain/playerProfile';

/**
 * The exact create/join request payloads the production multiplayer service
 * sends (R1, Slice 3.11 hardening). These builders are the single source of
 * truth for the wire contract so the tests can prove that payloads produced by
 * `createMultiplayerTable`/`joinMultiplayerTable` — not hand-crafted ideal
 * JSON — are accepted by the real Edge Function parser.
 *
 * Wire contract (one unambiguous naming scheme, scope 3.11E/F):
 * - create carries the host's identity fields under the `host` prefix
 *   (`hostAvatar`, `hostPlayRecord`), because the room does not exist yet;
 * - join carries the joiner's identity fields unprefixed (`avatar`,
 *   `playRecord`), matching the authenticated seat they will occupy;
 * - both declare `protocol` (the lifecycle/ledger capability this build
 *   speaks) so an incompatible client is refused with update-required
 *   guidance before any room, seat, or membership mutation.
 */
export interface CreateMultiplayerTableRequestInput {
  avatar?: HumanAvatarSnapshot | null;
  config: MultiplayerRoomConfig;
  displayName: string;
  hostSeat?: number;
  playRecord?: unknown;
}

export function buildCreateMultiplayerTableRequest(
  input: CreateMultiplayerTableRequestInput,
): Record<string, unknown> {
  return {
    config: input.config,
    displayName: input.displayName,
    hostAvatar: input.avatar ?? null,
    hostPlayRecord: input.playRecord,
    hostSeat: input.hostSeat ?? 0,
    operation: 'create',
    protocol: MULTIPLAYER_PROTOCOL_VERSION,
  };
}

export interface JoinMultiplayerTableRequestInput {
  avatar?: HumanAvatarSnapshot | null;
  displayName: string;
  playRecord?: unknown;
  roomCode: string;
  seat?: number | null;
}

export function buildJoinMultiplayerTableRequest(
  input: JoinMultiplayerTableRequestInput,
): Record<string, unknown> {
  return {
    avatar: input.avatar ?? null,
    displayName: input.displayName,
    operation: 'join',
    playRecord: input.playRecord,
    protocol: MULTIPLAYER_PROTOCOL_VERSION,
    roomCode: input.roomCode,
    seat: input.seat ?? null,
    // Declare what this build can seat so the table refuses an incompatible
    // join before it commits a seat the client's own contract would reject.
    supportedSeatCounts: MULTIPLAYER_CLIENT_SEAT_COUNTS,
  };
}

/** Wraps a client command with its transport envelope (command id included). */
export function buildMultiplayerCommandRequest(
  roomId: string,
  commandId: string,
  expectedVersion: number,
  command: Record<string, unknown>,
): Record<string, unknown> {
  return {
    command: { ...command, commandId, expectedVersion },
    operation: 'command',
    roomId,
  };
}
