import {
  MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION,
  type MultiplayerCompletionReason,
  type MultiplayerCoordinatorState,
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
  // Scope 3.11F: a room completed by the host ending a stalled session keeps
  // its reason through a reload; legacy rows fall back to inference below.
  if (source.completionReason === 'host-ended') return 'host-ended';
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
  const startingStackChips = Number.isSafeInteger(config?.startingStackChips)
    ? (config?.startingStackChips as number)
    : 0;
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
    || ![null, 'hand-limit', 'host-ended', 'last-player-standing'].includes(
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
    // Rooms persisted before the 3.11F lifecycle upgrade predate the protocol
    // field: they normalize to protocol 2 and are upgraded on their next
    // coordinator mutation (ledger init, participation defaults).
    protocolVersion: Number.isSafeInteger(source.protocolVersion)
      ? source.protocolVersion
      : 2,
    resumeStatus: source.resumeStatus,
    roomCode: source.roomCode,
    roomId: source.roomId,
    seats: (Array.isArray(source.seats) ? source.seats : []).map((seat: unknown) => {
      const seatRow = record(seat);
      if (!seatRow) return seat;
      // Fail-safe legacy policy (scope 3.11F): a persisted room may still
      // carry a human seat the old coordinator handed to AI. The upgraded
      // coordinator never plays that seat with AI logic — control returns to
      // the (offline) human owner, who must reconnect to act. The ledger row
      // is initialized from the room's configured opening buy-in only when
      // absent; no rebuy history is ever manufactured.
      const legacyTakeover = seatRow.kind === 'human' && seatRow.control === 'ai';
      const rawLedger = record(seatRow.ledger);
      const ledger = rawLedger && Number.isSafeInteger(rawLedger.initialBuyIn)
        ? seatRow.ledger
        : {
          initialBuyIn: startingStackChips,
          playerId: typeof seatRow.playerId === 'string' ? seatRow.playerId : '',
          rebuyChips: 0,
          rebuyCount: 0,
          settledAtMs: 0,
          settledHandNumber: 0,
          settledStack: startingStackChips,
          totalBuyIn: startingStackChips,
        };
      return {
        ...seatRow,
        control: legacyTakeover ? 'human' : seatRow.control,
        ledger,
        participation: typeof seatRow.participation === 'string'
          ? seatRow.participation
          : legacyTakeover ? 'disconnected' : 'active',
      };
    }),
    sessionNumber,
    status: source.status,
    turnDeadlineAtMs: source.turnDeadlineAtMs,
    nextHandAtMs: source.nextHandAtMs ?? null,
    // Preserve a valid pending-decision deadline exactly across reloads;
    // anything malformed falls back to none rather than inventing a window.
    rebuyDecisionDeadlineAtMs: Number.isSafeInteger(source.rebuyDecisionDeadlineAtMs)
      ? source.rebuyDecisionDeadlineAtMs
      : null,
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
