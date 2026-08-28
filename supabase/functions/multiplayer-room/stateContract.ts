import type {
  MultiplayerCompletionReason,
  MultiplayerCoordinatorState,
} from '../../../src/domain/multiplayer/contracts.ts';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function inferredLegacyCompletionReason(
  source: Record<string, unknown>,
  config: Record<string, unknown>,
): MultiplayerCompletionReason | null {
  if (source.status !== 'complete') return null;
  const hand = record(source.hand);
  const players = record(hand?.players);
  const tablePlayerIds = Array.isArray(hand?.tablePlayerIds) ? hand.tablePlayerIds : [];
  if (!hand || !players || !record(hand.outcome)) return null;
  const livePlayers = tablePlayerIds.filter((playerId) => {
    if (typeof playerId !== 'string') return false;
    const player = record(players[playerId]);
    return typeof player?.stack === 'number' && player.stack > 0;
  });
  if (livePlayers.length < 2) return 'last-player-standing';
  const handTarget = config.handTarget;
  if (
    handTarget !== 'open'
    && Number.isSafeInteger(hand.handNumber)
    && (hand.handNumber as number) >= Number(handTarget)
  ) return 'hand-limit';
  return null;
}

/** Rolling-deploy parser for canonical rooms created before Phase 12. */
export function normalizeMultiplayerCanonicalState(
  value: unknown,
  expectedRoomId?: string,
): MultiplayerCoordinatorState | null {
  const source = record(value);
  const config = record(source?.config);
  const sessionNumber = source?.sessionNumber === undefined ? 1 : source.sessionNumber;
  const completionReason = source?.completionReason === undefined
    ? source && config ? inferredLegacyCompletionReason(source, config) : null
    : source.completionReason;
  if (
    !source
    || typeof source.roomId !== 'string'
    || (expectedRoomId !== undefined && source.roomId !== expectedRoomId)
    || !Number.isSafeInteger(source.version)
    || !Array.isArray(source.seats)
    || !Array.isArray(source.processedCommands)
    || !config
    || !Number.isSafeInteger(sessionNumber)
    || (sessionNumber as number) < 1
    || ![null, 'hand-limit', 'last-player-standing'].includes(
      completionReason as null | string,
    )
    || ![2, 3, 6, 9].includes(config.seatCount as number)
    || !['lobby', 'playing', 'between-hands', 'paused', 'complete'].includes(source.status as string)
  ) return null;
  // The coordinator state has a closed shape: moment data, transcripts, or any
  // other foreign key from a poisoned row is deliberately dropped here so
  // ephemeral content can never ride along into coordinator memory.
  return {
    completionReason,
    config,
    createdAtMs: source.createdAtMs,
    hand: source.hand,
    hostPlayerId: source.hostPlayerId,
    processedCommands: source.processedCommands,
    // The reroll memory is canonical-only; legacy or malformed shapes fall
    // back to an empty map so the coordinator never reads a foreign type.
    removedAiProfileIdBySeat: (() => {
      const memory = source.removedAiProfileIdBySeat;
      if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return {};
      return Object.fromEntries(
        Object.entries(memory).filter(([, value]) => value === null || typeof value === 'string'),
      );
    })(),
    resumeStatus: source.resumeStatus,
    roomCode: source.roomCode,
    roomId: source.roomId,
    seats: source.seats,
    sessionNumber,
    status: source.status,
    turnDeadlineAtMs: source.turnDeadlineAtMs,
    nextHandAtMs: source.nextHandAtMs,
    updatedAtMs: source.updatedAtMs,
    version: source.version,
  } as unknown as MultiplayerCoordinatorState;
}

export interface JoinableMultiplayerRoom {
  canonicalState: MultiplayerCoordinatorState;
  roomId: string;
}

export function parseJoinableMultiplayerRoom(value: unknown): JoinableMultiplayerRoom | null {
  const source = record(value);
  if (!source || typeof source.roomId !== 'string') return null;
  const state = normalizeMultiplayerCanonicalState(source.canonicalState, source.roomId);
  return state ? { canonicalState: state, roomId: source.roomId } : null;
}
