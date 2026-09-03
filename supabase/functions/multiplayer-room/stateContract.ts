import {
  canonicalStateUsesCurrentMultiplayerProtocol,
  MULTIPLAYER_REBUY_CHIPS,
  MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION,
  type MultiplayerCompletionReason,
  type MultiplayerCoordinatorState,
  type MultiplayerLedgerEntry,
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

/**
 * The human participation states a persisted room may carry (scope 3.11F).
 * An unknown value is a corrupt row: it is refused, never coerced into a
 * plausible lifecycle state (R4).
 */
const PARTICIPATION_STATES = ['active', 'disconnected', 'left', 'rebuy-pending', 'sitting-out'];

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * Validates one persisted ledger row against its full contract (R4). Every
 * field must be a bounded non-negative integer, the row must belong to this
 * seat, and the accounting invariants must hold exactly:
 * rebuyChips = rebuyCount x 4,000 and totalBuyIn = initialBuyIn + rebuyChips.
 */
function validLedgerRow(
  raw: unknown,
  seatPlayerId: unknown,
): MultiplayerLedgerEntry | null {
  const row = record(raw);
  if (!row) return null;
  const fields = [
    row.initialBuyIn,
    row.rebuyChips,
    row.rebuyCount,
    row.settledAtMs,
    row.settledHandNumber,
    row.settledStack,
    row.totalBuyIn,
  ];
  if (!fields.every((value) => isSafeNonNegativeInteger(value))) return null;
  if (typeof row.playerId !== 'string' || row.playerId !== seatPlayerId) return null;
  if ((row.rebuyChips as number) !== (row.rebuyCount as number) * MULTIPLAYER_REBUY_CHIPS) return null;
  if ((row.totalBuyIn as number) !== (row.initialBuyIn as number) + (row.rebuyChips as number)) return null;
  return {
    initialBuyIn: row.initialBuyIn as number,
    playerId: row.playerId,
    rebuyChips: row.rebuyChips as number,
    rebuyCount: row.rebuyCount as number,
    settledAtMs: row.settledAtMs as number,
    settledHandNumber: row.settledHandNumber as number,
    settledStack: row.settledStack as number,
    totalBuyIn: row.totalBuyIn as number,
  };
}

/**
 * The provable legacy conversion for a room persisted before the 3.11F ledger
 * existed (R4). A conversion is only built when the actual settled balances
 * can be RECONSTRUCTED, never guessed:
 * - a room with no hand has provably moved no chips: every seat holds exactly
 *   its configured opening buy-in;
 * - a first hand still in progress has provably settled nothing: the opening
 *   buy-in is still each seat's settled stack (no rebuys existed pre-3.11F);
 * - a settled hand is authoritative: each seat's stack in that hand IS its
 *   settled balance, and conservation (settled stacks sum to the total chips
 *   introduced) must hold exactly.
 * Anything else — a mid-hand room past hand 1 (its previous settled state is
 * unrecoverable), a settled hand missing a seat, a conservation violation — is
 * refused. Opening stacks alone are never evidence of a settled result.
 */
function legacyLedgers(
  source: Record<string, unknown>,
  seatPlayerIds: string[],
  startingStackChips: number,
): MultiplayerLedgerEntry[] | null {
  const opening = seatPlayerIds.map((playerId) => ({
    initialBuyIn: startingStackChips,
    playerId,
    rebuyChips: 0,
    rebuyCount: 0,
    settledAtMs: 0,
    settledHandNumber: 0,
    settledStack: startingStackChips,
    totalBuyIn: startingStackChips,
  }));
  const hand = record(source.hand);
  if (!hand) return opening;
  const handNumber = hand.handNumber;
  const inProgress = !record(hand.outcome);
  if (inProgress) {
    // Only the FIRST hand is provably unsettled for every seat; a later hand
    // would erase the prior settlement's gains/losses.
    if (handNumber !== 1) return null;
    return opening;
  }
  const players = record(hand.players);
  if (!players || !isSafeNonNegativeInteger(handNumber) || handNumber < 1) return null;
  const ledgers: MultiplayerLedgerEntry[] = [];
  let settledSum = 0;
  for (const playerId of seatPlayerIds) {
    const player = record(players[playerId]);
    const stack = player?.stack;
    if (!isSafeNonNegativeInteger(stack)) return null;
    ledgers.push({
      initialBuyIn: startingStackChips,
      playerId,
      rebuyChips: 0,
      rebuyCount: 0,
      settledAtMs: isSafeNonNegativeInteger(source.updatedAtMs) ? source.updatedAtMs as number : 0,
      settledHandNumber: handNumber,
      settledStack: stack,
      totalBuyIn: startingStackChips,
    });
    settledSum += stack;
  }
  // Chip conservation: a legacy room had no rebuys, so the settled stacks must
  // sum to exactly the chips every seat bought in with. A violation means the
  // row is corrupt (chips vanished or were manufactured) — refuse it.
  if (settledSum !== startingStackChips * seatPlayerIds.length) return null;
  return ledgers;
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
  // R4/H08: a persisted protocol newer than this build refuses to load — the
  // server cannot guess a newer wire's semantics. Legacy rooms (pre-3.11F)
  // carry no protocol field or the pre-lifecycle protocol 2. Protocol 3 is
  // the previous preview lane: its ledger is validated here for non-live
  // compatibility work, while every live v4 route refuses it before calling
  // this normalizer.
  const persistedProtocol = source?.protocolVersion;
  // Only the two documented pre-lifecycle protocols count as legacy. An
  // out-of-range or nonsense version (-1, 0, any negative) is NOT legacy —
  // it is a corrupt row and must fail closed like a future protocol does.
  const protocolIsLegacy = persistedProtocol === undefined
    || persistedProtocol === 1
    || persistedProtocol === 2;
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
    || persistedProtocol !== undefined && (
      !Number.isSafeInteger(persistedProtocol)
      || ![1, 2, 3, MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION].includes(persistedProtocol as number)
    )
  ) return null;

  // R4: validate every seat's lifecycle/identity fields BEFORE any ledger
  // work. Unknown participation enums and current-format takeover rows fail
  // closed instead of becoming active seats.
  interface ParsedSeat {
    legacyTakeover: boolean;
    participation: string | null;
    rawLedger: unknown;
    row: Record<string, unknown>;
  }
  const parsedSeats: ParsedSeat[] = [];
  for (const seat of source.seats) {
    const seatRow = record(seat);
    if (!seatRow) return null;
    if (
      !['human', 'ai'].includes(seatRow.kind as string)
      || !['human', 'ai'].includes(seatRow.control as string)
      || !['online', 'offline'].includes(seatRow.connection as string)
    ) return null;
    const legacyTakeover = seatRow.kind === 'human' && seatRow.control === 'ai';
    // A CURRENT-format row must never carry the retired takeover state: only a
    // legacy row can be coerced back to its human owner (R4).
    if (legacyTakeover && !protocolIsLegacy) return null;
    const rawParticipation = seatRow.participation;
    if (rawParticipation !== undefined
      && (typeof rawParticipation !== 'string' || !PARTICIPATION_STATES.includes(rawParticipation))) {
      return null;
    }
    parsedSeats.push({
      legacyTakeover,
      participation: typeof rawParticipation === 'string' ? rawParticipation : null,
      rawLedger: seatRow.ledger,
      row: seatRow,
    });
  }

  // R4 ledger policy. A CURRENT-format room must carry one fully valid ledger
  // row per seat with exact room-level conservation; a LEGACY room must carry
  // none and is converted only when its settled balances are provable.
  const seatPlayerIds = parsedSeats.map((seat) => (typeof seat.row.playerId === 'string' ? seat.row.playerId : ''));
  let ledgers: Array<MultiplayerLedgerEntry | null>;
  if (protocolIsLegacy) {
    if (parsedSeats.some((seat) => seat.rawLedger !== undefined)) return null;
    if (seatPlayerIds.some((playerId) => playerId.length === 0)) return null;
    if (!Number.isSafeInteger(startingStackChips) || startingStackChips < 1) return null;
    const legacy = legacyLedgers(source, seatPlayerIds, startingStackChips);
    if (!legacy) return null;
    ledgers = legacy;
  } else {
    ledgers = parsedSeats.map((seat) => validLedgerRow(seat.rawLedger, seat.row.playerId));
    if (ledgers.some((entry) => entry === null)) return null;
    const settledSum = ledgers.reduce((total, entry) => total + (entry?.settledStack ?? 0), 0);
    const introducedSum = ledgers.reduce((total, entry) => total + (entry?.totalBuyIn ?? 0), 0);
    if (settledSum !== introducedSum) return null;
  }

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
    // An accepted legacy room is upgraded to the current lifecycle protocol as
    // part of its provable conversion; the next persisted transition stores it.
    protocolVersion: MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION,
    resumeStatus: source.resumeStatus,
    roomCode: source.roomCode,
    roomId: source.roomId,
    seats: parsedSeats.map((seat, index) => ({
      ...seat.row,
      control: seat.legacyTakeover ? 'human' : seat.row.control,
      ledger: ledgers[index],
      participation: seat.participation
        ?? (seat.legacyTakeover ? 'disconnected' : 'active'),
    })),
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
  if (
    !source
    || typeof source.roomId !== 'string'
    || !canonicalStateUsesCurrentMultiplayerProtocol(source.canonicalState)
  ) return null;
  const state = normalizeMultiplayerCanonicalState(source.canonicalState, source.roomId);
  return state ? { canonicalState: state, roomId: source.roomId } : null;
}
