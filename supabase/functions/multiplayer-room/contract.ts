import type {
  MultiplayerRoomConfig,
  MultiplayerRoomCommand,
  MultiplayerSeatCount,
} from '../../../src/domain/multiplayer/contracts.ts';
import {
  MULTIPLAYER_CLIENT_SEAT_COUNTS,
  MULTIPLAYER_LEGACY_SEAT_COUNTS,
  MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
} from '../../../src/domain/multiplayer/contracts.ts';
import { isPublicPlayerRecordSnapshot } from '../../../src/domain/multiplayer/playerRecordSnapshot.ts';
import {
  parseTableMomentRequest,
  type TableMomentReactionId,
} from '../../../src/domain/multiplayer/tableMoments.ts';
import {
  isValidPlayerDisplayName,
  type HumanAvatarSnapshot,
  normalizePlayerDisplayName,
  validateHumanAvatarSnapshot,
} from '../../../src/domain/playerProfile.ts';

type PublicPlayerRecord = Parameters<typeof isPublicPlayerRecordSnapshot>[0] extends never ? never : Record<string, unknown>;

type ClientCommand = MultiplayerRoomCommand extends infer Command
  ? Command extends MultiplayerRoomCommand
    ? Omit<Command, 'actorUserId'>
    : never
  : never;

export type MultiplayerRoomRequest =
  | {
    operation: 'create';
    config: MultiplayerRoomConfig;
    displayName: string;
    hostAvatar?: HumanAvatarSnapshot | null;
    hostPlayRecord?: PublicPlayerRecord;
    hostSeat: number;
  }
  | {
    operation: 'join';
    avatar?: HumanAvatarSnapshot | null;
    displayName: string;
    playRecord?: PublicPlayerRecord;
    roomCode: string;
    seat: number | null;
    supportedSeatCounts: readonly MultiplayerSeatCount[];
  }
  | {
    operation: 'sync';
    roomId: string;
  }
  | {
    // Q4: dedicated heartbeat — refreshes the SERVER-OBSERVED liveness row
    // for the authenticated caller's own seat. Commits no canonical state.
    operation: 'liveness';
    roomId: string;
  }
  | {
    operation: 'resume';
  }
  | {
    operation: 'history';
    limit: number;
    roomId: string | null;
    sessionNumber: number | null;
  }
  | {
    operation: 'delete-history';
  }
  | {
    operation: 'command';
    roomId: string;
    command: ClientCommand;
  }
  | {
    operation: 'moment';
    handNumber: number;
    id: string;
    protocolVersion: number;
    reactionId: TableMomentReactionId;
    roomId: string;
  };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function displayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizePlayerDisplayName(value);
  return isValidPlayerDisplayName(normalized) ? normalized : null;
}

/**
 * The joiner's seat-count capabilities. A build that predates negotiation
 * sends no list and is assumed to support only what shipped builds of that era
 * could seat; a build that sends a list must send a non-empty set of known
 * seat sizes — anything else is a malformed request from a client that claims
 * to negotiate, and is refused rather than guessed at.
 */
function supportedSeatCounts(value: unknown): readonly MultiplayerSeatCount[] {
  if (value === undefined) return MULTIPLAYER_LEGACY_SEAT_COUNTS;
  if (!Array.isArray(value) || value.length < 1 || value.length > MULTIPLAYER_CLIENT_SEAT_COUNTS.length) {
    return MULTIPLAYER_LEGACY_SEAT_COUNTS;
  }
  const parsed = [...new Set(value)]
    .filter((entry): entry is MultiplayerSeatCount => {
      return typeof entry === 'number'
        && Number.isInteger(entry)
        && (MULTIPLAYER_CLIENT_SEAT_COUNTS as readonly number[]).includes(entry);
    })
    .sort((left, right) => left - right);
  return parsed.length > 0 ? parsed : MULTIPLAYER_LEGACY_SEAT_COUNTS;
}

/**
 * Coerce a client avatar reference to a validated snapshot, or null. An
 * untrusted/malformed snapshot is dropped to null (the seat falls back to
 * initials) rather than rejected outright: the avatar identifier is bounded, so
 * it can never leak or crash the seat.
 */
function avatar(value: unknown): HumanAvatarSnapshot | null {
  return validateHumanAvatarSnapshot(value as HumanAvatarSnapshot)
    ? value as HumanAvatarSnapshot
    : null;
}

function integer(value: unknown, minimum = 0): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum ? value as number : null;
}

function roomId(value: unknown): string | null {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function roomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{6}$/.test(trimmed) ? trimmed : null;
}

function config(value: unknown): MultiplayerRoomConfig | null {
  const source = record(value);
  if (!source) return null;
  const seatCount = integer(source.seatCount);
  const startingStackChips = integer(source.startingStackChips, 2);
  const smallBlindChips = integer(source.smallBlindChips, 1);
  const bigBlindChips = integer(source.bigBlindChips, 1);
  const turnSeconds = integer(source.turnSeconds);
  if (
    ![2, 3, 6, 9].includes(seatCount ?? -1)
    || ![5, 10, 'open'].includes(source.handTarget as string | number)
    || ![30, 45, 60].includes(turnSeconds ?? -1)
    || !['friendly', 'club', 'sharp', 'elite', 'nemesis'].includes(source.aiDifficulty as string)
    || startingStackChips === null
    || smallBlindChips === null
    || bigBlindChips === null
    || bigBlindChips < smallBlindChips
    || startingStackChips < bigBlindChips
  ) return null;

  return {
    aiDifficulty: source.aiDifficulty as MultiplayerRoomConfig['aiDifficulty'],
    bigBlindChips,
    handTarget: source.handTarget as MultiplayerRoomConfig['handTarget'],
    seatCount: seatCount as MultiplayerRoomConfig['seatCount'],
    smallBlindChips,
    startingStackChips,
    turnSeconds: turnSeconds as MultiplayerRoomConfig['turnSeconds'],
  };
}

/**
 * The client-declared live-play capability, or null when absent or
 * malformed (scope 3.11F/H08). Exported so the worker can distinguish an
 * under-declared capability (update-required refusal) from generic request
 * garbage (request_invalid).
 */
export function parseClientProtocol(value: unknown): number | null {
  return integer(value);
}

/**
 * Live-play capability gate, also used for create/join (R1, scope 3.11F/H08). Kept pure so the
 * 426/400 decision is unit-testable without booting the Edge runtime:
 * - `current` — the declared protocol is exactly this server's; continue;
 * - `update-required` — the request is well formed but declares an older or
 *   future protocol (or none at all, i.e. a pre-3.11F client): refused with a
 *   stable update-required response BEFORE any room, seat, or membership
 *   mutation;
 * - `invalid` — the protocol field is present but malformed: generic request
 *   garbage, failed safely at the request boundary.
 */
export type MultiplayerProtocolGate = 'current' | 'invalid' | 'update-required';

export function gateCreateJoinProtocol(value: unknown): MultiplayerProtocolGate {
  if (value === undefined) return 'update-required';
  const declared = parseClientProtocol(value);
  if (declared === null) return 'invalid';
  return declared === MULTIPLAYER_CLIENT_PROTOCOL_VERSION ? 'current' : 'update-required';
}

/** Archive reads/deletion remain available to older builds; live play does not. */
export function gateMultiplayerRequestProtocol(value: unknown): MultiplayerProtocolGate {
  const source = record(value);
  if (!source || !['create', 'join', 'sync', 'resume', 'command', 'liveness', 'moment'].includes(String(source.operation))) {
    return 'current';
  }
  return gateCreateJoinProtocol(source.protocol);
}

function command(value: unknown): ClientCommand | null {
  const source = record(value);
  if (!source || 'actorUserId' in source) return null;
  const commandId = typeof source.commandId === 'string' ? source.commandId.trim() : '';
  const expectedVersion = integer(source.expectedVersion);
  if (commandId.length < 1 || commandId.length > 128 || expectedVersion === null) return null;
  const base = { commandId, expectedVersion };

  switch (source.type) {
    case 'add-ai':
    case 'remove-ai': {
      const seat = integer(source.seat);
      return seat === null ? null : { ...base, seat, type: source.type };
    }
    case 'set-ready':
      return typeof source.ready === 'boolean'
        ? { ...base, ready: source.ready, type: 'set-ready' }
        : null;
    case 'start':
    case 'tick':
    case 'deal-now':
    case 'pause':
    case 'resume':
    case 'rematch':
    case 'leave':
    case 'rebuy':
    case 'sit-out':
    case 'return-next-hand':
    case 'end-stalled-session': {
      // Strict field set: spoofed identity, amount, stack, or net-result
      // fields are refused at the boundary (scope 3.11F) — the coordinator
      // derives everything else from the authenticated actor and canonical
      // state.
      const allowed = Object.keys(source).sort().join(',');
      return allowed === 'commandId,expectedVersion,type'
        ? { ...base, type: source.type }
        : null;
    }
    case 'update-play-record': {
      // The record is validated against its own contract here so a malformed
      // payload is refused at the request boundary (scope 3.11F); the actor
      // binding happens server-side only.
      const allowed = Object.keys(source).sort().join(',');
      if (allowed !== 'commandId,expectedVersion,record,type') return null;
      return isPublicPlayerRecordSnapshot(source.record)
        ? { ...base, record: source.record, type: 'update-play-record' }
        : null;
    }
    case 'set-connection':
      return source.connection === 'online' || source.connection === 'offline'
        ? { ...base, connection: source.connection, type: 'set-connection' }
        : null;
    case 'action': {
      const action = record(source.action);
      if (!action || !['fold', 'check', 'call', 'raise'].includes(action.type as string)) return null;
      if (action.type === 'raise') {
        const amount = integer(action.amount, 1);
        return amount === null
          ? null
          : { ...base, action: { amount, type: 'raise' }, type: 'action' };
      }
      return { ...base, action: { type: action.type as 'fold' | 'check' | 'call' }, type: 'action' };
    }
    default:
      return null;
  }
}

export function parseMultiplayerRoomRequest(value: unknown): MultiplayerRoomRequest | null {
  const source = record(value);
  if (!source) return null;
  switch (source.operation) {
    case 'create': {
      const parsedConfig = config(source.config);
      const parsedName = displayName(source.displayName);
      const parsedSeat = source.hostSeat === undefined ? 0 : integer(source.hostSeat);
      const parsedAvatar = avatar(source.hostAvatar);
      // One unambiguous create wire contract: the host publishes its record
      // and avatar under the `host` names (R1). The pre-fix `playRecord`/
      // `avatar` names are not aliases — a current client sending them is
      // refusing to be mapped, so the request fails instead of quietly
      // publishing no record.
      if ('playRecord' in source || 'avatar' in source) return null;
      const recordSupplied = source.hostPlayRecord !== undefined;
      const parsedRecord = isPublicPlayerRecordSnapshot(source.hostPlayRecord)
        ? source.hostPlayRecord
        : undefined;
      // A SUPPLIED but malformed record is refused, never silently dropped:
      // creating the room without the host's published record would lie about
      // their profile to every member (R1).
      if (recordSupplied && !parsedRecord) return null;
      return parsedConfig && parsedName && parsedSeat !== null && parsedSeat < parsedConfig.seatCount
        ? {
          config: parsedConfig,
          displayName: parsedName,
          hostSeat: parsedSeat,
          operation: 'create',
          ...(parsedAvatar ? { hostAvatar: parsedAvatar } : {}),
          ...(parsedRecord ? { hostPlayRecord: parsedRecord } : {}),
        }
        : null;
    }
    case 'join': {
      const parsedCode = roomCode(source.roomCode);
      const parsedName = displayName(source.displayName);
      const parsedSeat = source.seat === undefined ? null : integer(source.seat);
      const parsedAvatar = avatar(source.avatar);
      const parsedCapabilities = supportedSeatCounts(source.supportedSeatCounts);
      const recordSupplied = source.playRecord !== undefined;
      const parsedRecord = isPublicPlayerRecordSnapshot(source.playRecord)
        ? source.playRecord
        : undefined;
      // A SUPPLIED but malformed record is refused, never silently dropped
      // (R1): the joiner's published record would silently disappear.
      if (recordSupplied && !parsedRecord) return null;
      return parsedCode && parsedName && (parsedSeat === null || parsedSeat < 9)
        ? {
          displayName: parsedName,
          operation: 'join',
          roomCode: parsedCode,
          seat: parsedSeat,
          supportedSeatCounts: parsedCapabilities,
          ...(parsedAvatar ? { avatar: parsedAvatar } : {}),
          ...(parsedRecord ? { playRecord: parsedRecord } : {}),
        }
        : null;
    }
    case 'sync': {
      const parsedRoomId = roomId(source.roomId);
      return parsedRoomId ? { operation: 'sync', roomId: parsedRoomId } : null;
    }
    case 'liveness': {
      const parsedRoomId = roomId(source.roomId);
      return parsedRoomId ? { operation: 'liveness', roomId: parsedRoomId } : null;
    }
    case 'resume':
      return { operation: 'resume' };
    case 'delete-history':
      return { operation: 'delete-history' };
    case 'history': {
      const parsedRoomId = source.roomId === undefined || source.roomId === null
        ? null
        : roomId(source.roomId);
      const parsedSession = source.sessionNumber === undefined || source.sessionNumber === null
        ? null
        : integer(source.sessionNumber, 1);
      const parsedLimit = source.limit === undefined ? 50 : integer(source.limit, 1);
      return (source.roomId === undefined || source.roomId === null || parsedRoomId)
        && (source.sessionNumber === undefined || source.sessionNumber === null || parsedSession)
        && parsedLimit !== null
        && parsedLimit <= 100
        ? {
          limit: parsedLimit,
          operation: 'history',
          roomId: parsedRoomId,
          sessionNumber: parsedSession,
        }
        : null;
    }
    case 'command': {
      const parsedRoomId = roomId(source.roomId);
      const parsedCommand = command(source.command);
      return parsedRoomId && parsedCommand
        ? { command: parsedCommand, operation: 'command', roomId: parsedRoomId }
        : null;
    }
    case 'moment': {
      // The client never supplies a seat or player id: the coordinator derives
      // the sender from the authenticated membership. The shared strict parser
      // rejects malformed shapes, future protocol versions, unknown reaction
      // ids, unbounded payload ids, and bad hand numbers.
      const parsed = parseTableMomentRequest(source);
      return parsed ? { ...parsed, operation: 'moment' } : null;
    }
    default:
      return null;
  }
}
