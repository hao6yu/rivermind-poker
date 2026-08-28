import type {
  MultiplayerRoomConfig,
  MultiplayerRoomCommand,
} from '../../../src/domain/multiplayer/contracts.ts';
import {
  isValidPlayerDisplayName,
  type HumanAvatarSnapshot,
  normalizePlayerDisplayName,
  validateHumanAvatarSnapshot,
} from '../../../src/domain/playerProfile.ts';

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
    hostSeat: number;
  }
  | {
    operation: 'join';
    avatar?: HumanAvatarSnapshot | null;
    displayName: string;
    roomCode: string;
    seat: number | null;
  }
  | {
    operation: 'sync';
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
    case 'reclaim':
    case 'next-hand':
    case 'rematch':
    case 'leave':
      return { ...base, type: source.type };
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
      return parsedConfig && parsedName && parsedSeat !== null && parsedSeat < parsedConfig.seatCount
        ? {
          config: parsedConfig,
          displayName: parsedName,
          hostSeat: parsedSeat,
          operation: 'create',
          ...(parsedAvatar ? { hostAvatar: parsedAvatar } : {}),
        }
        : null;
    }
    case 'join': {
      const parsedCode = roomCode(source.roomCode);
      const parsedName = displayName(source.displayName);
      const parsedSeat = source.seat === undefined ? null : integer(source.seat);
      const parsedAvatar = avatar(source.avatar);
      return parsedCode && parsedName && (parsedSeat === null || parsedSeat < 9)
        ? {
          displayName: parsedName,
          operation: 'join',
          roomCode: parsedCode,
          seat: parsedSeat,
          ...(parsedAvatar ? { avatar: parsedAvatar } : {}),
        }
        : null;
    }
    case 'sync': {
      const parsedRoomId = roomId(source.roomId);
      return parsedRoomId ? { operation: 'sync', roomId: parsedRoomId } : null;
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
    default:
      return null;
  }
}
