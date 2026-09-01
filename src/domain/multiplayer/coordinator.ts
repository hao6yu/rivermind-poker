import type { RandomSource } from '../poker/cards.ts';
import {
  isPublicPlayerRecordSnapshot,
  PUBLIC_PLAYER_RECORD_MAX_BYTES,
  publicPlayerRecordSerializedBytes,
  type PublicPlayerRecordSnapshot,
} from './playerRecordSnapshot.ts';
import {
  isCurrentMultiplayerRoomCode,
  MULTIPLAYER_PROTOCOL_VERSION,
  MULTIPLAYER_REBUY_CHIPS,
  type MultiplayerLedgerEntry,
} from './contracts.ts';
import { createFairMultiwayDecisionState } from '../poker/fairness.ts';
import {
  applyEnforcedFold,
  applyMultiwayAction,
  createMultiwayHand,
  getMultiwayLegalActions,
  nextButtonSeat,
  type MultiwayHandState,
  type TablePlayerConfig,
} from '../poker/multiway.ts';
import { decideMultiwayAiAction } from '../poker/multiwayAi.ts';
import {
  validateHumanAvatarSnapshot,
  type HumanAvatarSnapshot,
} from '../playerProfile.ts';
import {
  MULTIWAY_AI_IDENTITIES,
  multiwayAiIdentityForSeat,
  multiwayAiRoster,
  type MultiwayAiIdentity,
} from '../poker/multiwayAiProfiles.ts';
import {
  foldAiNameForComparison,
  selectAiSeatIdentity,
} from './aiSeatSelection.ts';
import {
  TABLE_MOMENT_MAX_PAYLOAD_ID_LENGTH,
  createTableMomentEnvelope,
  isTableMomentReactionId,
  type TableMomentEnvelope,
  type TableMomentReactionId,
} from './tableMoments.ts';
import type {
  CreateMultiplayerRoomInput,
  MultiplayerCommandResult,
  MultiplayerCoordinatorState,
  MultiplayerCompletionReason,
  MultiplayerProcessedCommand,
  MultiplayerPublicAction,
  MultiplayerRoomCommand,
  MultiplayerRoomConfig,
  MultiplayerSeatState,
  MultiplayerTimeoutResult,
  MultiplayerTransition,
} from './contracts.ts';

export type MultiplayerCoordinatorErrorCode =
  | 'command-conflict'
  | 'forbidden'
  | 'invalid-command'
  | 'invalid-room'
  | 'not-found'
  | 'roster-exhausted'
  | 'stale-version';

export class MultiplayerCoordinatorError extends Error {
  constructor(
    public readonly code: MultiplayerCoordinatorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MultiplayerCoordinatorError';
  }
}

export interface MultiplayerCoordinatorContext {
  /** Server time. Never accept this value from an untrusted client payload. */
  nowMs: number;
  /** The live backend must provide a cryptographically secure random source for dealing. */
  random?: RandomSource;
  /** Test-only escape hatch that keeps AI simulations inexpensive. */
  aiSimulations?: number;
  /**
   * Q4 server-observed seat liveness: authenticated user id → the freshest
   * contact stamp the SERVER recorded for that seat owner, on the SAME clock
   * as nowMs (the worker clock — never a client or Postgres clock). The
   * client-declared connection flag is not the liveness authority.
   * The live worker MUST supply a verified map for every expiry/deal path;
   * missing/failed reads refuse the request before calling the coordinator.
   * Optional only for pure in-memory simulations that have no transport.
   */
  liveness?: Readonly<Record<string, number>>;
}

/**
 * Q4: a seat is transport-stale when no server-observed contact was recorded
 * for its owner within this window. The client heartbeat fires far more
 * often than this (3x+ redundancy); a unit test pins the ratio.
 */
export const MULTIPLAYER_LIVENESS_STALE_MS = 15_000;

const MAX_PROCESSED_COMMANDS = 256;

export const defaultMultiplayerRoomConfig: MultiplayerRoomConfig = {
  aiDifficulty: 'club',
  bigBlindChips: 20,
  handTarget: 10,
  seatCount: 3,
  smallBlindChips: 10,
  startingStackChips: 2_000,
  turnSeconds: 45,
};

function invalid(message: string): never {
  throw new MultiplayerCoordinatorError('invalid-command', message);
}

/**
 * Coerce an untrusted Play record snapshot to the validated contract, or null.
 * An invalid record is never published: joining strips it, and the explicit
 * publish command rejects it (scope 3.11E).
 */
function validPlayRecord(input: unknown): PublicPlayerRecordSnapshot | null {
  return isPublicPlayerRecordSnapshot(input) ? input : null;
}

/**
 * The authoritative ledger row for one participant (scope 3.11F): initial and
 * total buy-in start at the configured stack; settled values update only at
 * settled boundaries; netChips = settledStack - totalBuyIn.
 */
function ledgerEntryFor(
  seat: Pick<MultiplayerSeatState, 'playerId' | 'seat'>,
  startingStackChips: number,
  nowMs: number,
): MultiplayerLedgerEntry {
  return {
    initialBuyIn: startingStackChips,
    playerId: seat.playerId,
    settledAtMs: nowMs,
    settledHandNumber: 0,
    rebuyChips: 0,
    rebuyCount: 0,
    settledStack: startingStackChips,
    totalBuyIn: startingStackChips,
  };
}

/**
 * Settled-boundary ledger update: every live participant's settled stack comes
 * from the completed hand, and conservation must hold exactly — the sum of
 * settled stacks equals the sum of all chips introduced (scope 3.11F).
 */
function settleLedger(state: MultiplayerCoordinatorState, nowMs: number): void {
  const hand = state.hand;
  if (!hand?.outcome) return;
  for (const seat of state.seats) {
    const entry = seat.ledger;
    if (!entry) continue;
    const player = hand.players[seat.playerId];
    if (!player) continue;
    entry.settledAtMs = nowMs;
    entry.settledHandNumber = hand.handNumber;
    entry.settledStack = player.stack;
  }
  const settledSum = state.seats.reduce((total, seat) => total + (seat.ledger?.settledStack ?? 0), 0);
  const introducedSum = state.seats.reduce((total, seat) => total + (seat.ledger?.totalBuyIn ?? 0), 0);
  if (settledSum !== introducedSum) {
    throw new MultiplayerCoordinatorError(
      'invalid-room',
      'Chip conservation failed at the settled boundary.',
    );
  }
}

/*
 * Coerce an untrusted avatar reference to a validated wire snapshot, or null.
 * A null or malformed avatar is accepted as "no avatar" (presentation falls
 * back to initials); a malformed avatar is never trusted as a concrete image.
 */
function validAvatar(snapshot: HumanAvatarSnapshot | null | undefined): HumanAvatarSnapshot | null {
  if (snapshot === null || snapshot === undefined || !validateHumanAvatarSnapshot(snapshot)) {
    return null;
  }
  return snapshot;
}

function assertContext(context: MultiplayerCoordinatorContext): void {
  if (!Number.isFinite(context.nowMs) || context.nowMs < 0) {
    invalid('Coordinator time must be a non-negative finite number.');
  }
  if (context.aiSimulations !== undefined
    && (!Number.isInteger(context.aiSimulations) || context.aiSimulations < 1)) {
    invalid('AI simulations must be a positive integer.');
  }
}

function assertIdentifier(value: string, label: string, maximum = 128): void {
  const length = value.trim().length;
  if (length < 1 || length > maximum) invalid(`${label} must contain 1–${maximum} characters.`);
}

function assertDisplayName(value: string): void {
  const length = value.trim().length;
  if (length < 2 || length > 18) invalid('Display names must contain 2–18 characters.');
}

function assertConfig(config: MultiplayerRoomConfig): void {
  if (![2, 3, 6, 9].includes(config.seatCount)) {
    invalid('A multiplayer room must have 2, 3, 6, or 9 seats.');
  }
  if (![5, 10, 'open'].includes(config.handTarget)) invalid('The hand target must be 5, 10, or open.');
  if (![30, 45, 60].includes(config.turnSeconds)) invalid('The turn timer must be 30, 45, or 60 seconds.');
  if (!Number.isInteger(config.startingStackChips) || config.startingStackChips < 2) {
    invalid('The starting stack must be a positive chip amount.');
  }
  if (!Number.isInteger(config.smallBlindChips) || config.smallBlindChips < 1) {
    invalid('The small blind must be a positive chip amount.');
  }
  if (!Number.isInteger(config.bigBlindChips) || config.bigBlindChips < config.smallBlindChips) {
    invalid('The big blind must be at least the small blind.');
  }
  if (config.startingStackChips < config.bigBlindChips) {
    invalid('The starting stack must cover at least one big blind.');
  }
}

function assertSeatIndex(state: MultiplayerCoordinatorState, seat: number): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.config.seatCount) {
    invalid(`Seat ${seat} is outside this room.`);
  }
}

/** All coordinator state is deliberately JSON-compatible for Edge Function persistence. */
function cloneState(state: MultiplayerCoordinatorState): MultiplayerCoordinatorState {
  return JSON.parse(JSON.stringify(state)) as MultiplayerCoordinatorState;
}

function commandFingerprint(command: MultiplayerRoomCommand): string {
  return JSON.stringify(command);
}

function humanSeatForUser(
  state: MultiplayerCoordinatorState,
  userId: string,
): MultiplayerSeatState | undefined {
  return state.seats.find((seat) => seat.kind === 'human' && seat.userId === userId);
}

function requireMember(state: MultiplayerCoordinatorState, userId: string): MultiplayerSeatState {
  const seat = humanSeatForUser(state, userId);
  if (!seat) throw new MultiplayerCoordinatorError('forbidden', 'The caller is not a room member.');
  // A permanently departed seat keeps its ledger row for stats but holds no
  // further command rights in this running session (scope 3.11F).
  if (seat.participation === 'left') {
    throw new MultiplayerCoordinatorError('forbidden', 'You have left this running session and cannot return to it.');
  }
  return seat;
}

function requireHost(state: MultiplayerCoordinatorState, userId: string): MultiplayerSeatState {
  const seat = requireMember(state, userId);
  if (!seat.isHost || seat.playerId !== state.hostPlayerId) {
    throw new MultiplayerCoordinatorError('forbidden', 'Only the room host can do that.');
  }
  return seat;
}

function seatForPlayer(state: MultiplayerCoordinatorState, playerId: string): MultiplayerSeatState {
  const seat = state.seats.find((candidate) => candidate.playerId === playerId);
  if (!seat) throw new MultiplayerCoordinatorError('not-found', `Player ${playerId} has no room seat.`);
  return seat;
}

function publicAction(record: MultiwayHandState['history'][number]): MultiplayerPublicAction {
  return {
    amount: record.amount,
    playerId: record.playerId,
    potAfter: record.potAfter,
    street: record.street,
    type: record.type,
  };
}

function appendActions(
  hand: MultiwayHandState,
  historyLengthBefore: number,
  actionBatch: MultiplayerPublicAction[],
): void {
  actionBatch.push(...hand.history.slice(historyLengthBefore).map(publicAction));
}

function allHumansOffline(state: MultiplayerCoordinatorState): boolean {
  const humans = state.seats.filter((seat) => seat.kind === 'human');
  return humans.length > 0 && humans.every((seat) => seat.connection === 'offline');
}

function pauseRoom(
  state: MultiplayerCoordinatorState,
  resumeStatus: 'playing' | 'between-hands',
): void {
  state.resumeStatus = resumeStatus;
  state.status = 'paused';
  // The CURRENT TURN deadline is deliberately preserved across the pause:
  // resuming restores the same absolute deadline, so an offline human never
  // gains a fresh turn budget and an already-expired deadline folds exactly
  // once (scope 3.11F, adjacent check 2).
  // A paused room must not deal behind everyone's back: the countdown is
  // re-armed on resume instead.
  state.nextHandAtMs = null;
}

/**
 * Q4: has the SERVER stopped observing contact from this seat's owner? Only
 * meaningful when a verified liveness map is present (the live worker must
 * provide it for every expiry/deal; pure simulations have no transport). A
 * missing owner entry counts as stale: no observed contact is no contact.
 * Future stamps (clock skew) can only look fresher, never staler.
 */
function seatLivenessIsStale(
  seat: MultiplayerSeatState,
  context: MultiplayerCoordinatorContext,
): boolean {
  if (context.liveness === undefined || seat.kind !== 'human' || !seat.userId) return false;
  const renewedAtMs = context.liveness[seat.userId];
  return renewedAtMs === undefined || context.nowMs - renewedAtMs >= MULTIPLAYER_LIVENESS_STALE_MS;
}

/**
 * Q4: record the truth the server observed — a stale seat's client is gone.
 * The connection flag flips to offline and an active/pending seat becomes
 * DISCONNECTED (recoverable only through the owner's own online command;
 * sitting-out stays sitting-out, left is untouchable). Host AUTHORITY moves
 * when the host's transport dies; the host SEAT stays human (scope 3.11F).
 */
function demoteStaleSeat(
  state: MultiplayerCoordinatorState,
  seat: MultiplayerSeatState,
): boolean {
  if (seat.connection !== 'online') return false;
  seat.connection = 'offline';
  if (seat.participation === 'active' || seat.participation === 'rebuy-pending') {
    seat.participation = 'disconnected';
  }
  if (state.status === 'lobby') seat.ready = false;
  transferUnavailableHost(state, seat.playerId);
  return true;
}

/**
 * Q4 between-hands convergence: sweep every online human seat whose SERVER-
 * observed liveness went stale. The sweep never touches turnDeadlineAtMs,
 * the settled hand, or any ledger row — it only repairs transport truth.
 * Returns true when anything changed (the caller commits that repair even
 * when the countdown is not due).
 */
function sweepStaleLiveness(
  state: MultiplayerCoordinatorState,
  context: MultiplayerCoordinatorContext,
): boolean {
  if (context.liveness === undefined) return false;
  let changed = false;
  for (const seat of state.seats) {
    if (seat.kind !== 'human' || seat.connection !== 'online') continue;
    if (seat.participation === 'left') continue;
    if (seatLivenessIsStale(seat, context)) {
      changed = demoteStaleSeat(state, seat) || changed;
    }
  }
  return changed;
}

function sessionCompletionReason(
  state: MultiplayerCoordinatorState,
  hand: MultiwayHandState,
): MultiplayerCompletionReason | null {
  const livePlayers = hand.tablePlayerIds.filter((playerId) => (hand.players[playerId]?.stack ?? 0) > 0);
  // Hand-limit completion always wins over rebuy/reconnect eligibility.
  if (state.config.handTarget !== 'open' && hand.handNumber >= state.config.handTarget) {
    return 'hand-limit';
  }
  if (livePlayers.length < 2) {
    // A busted/disconnected/sitting-out human who has not permanently left
    // can still rebuy, reconnect, or return: keep the room between hands
    // instead of completing as last-player-standing (scope 3.11F). The
    // decision is ledger/lifecycle based — the last hand's dealt-player
    // subset is never the session roster (R3).
    if (humanCanReturnToSession(state)) return null;
    return 'last-player-standing';
  }
  return null;
}

/**
 * Whether any human could still become an active funded participant (R3):
 * not permanently left, and either disconnected (may reconnect), sitting out
 * (may return), pending a rebuy decision, or busted at zero (may rebuy). The
 * current hand's dealt-player subset is not the session roster.
 */
function humanCanReturnToSession(state: MultiplayerCoordinatorState): boolean {
  return state.seats.some((seat) => {
    if (seat.kind !== 'human' || seat.participation === 'left') return false;
    if (seat.participation === 'disconnected'
      || seat.participation === 'sitting-out'
      || seat.participation === 'rebuy-pending') return true;
    return (seat.ledger?.settledStack ?? state.config.startingStackChips) === 0;
  });
}

/** Active funded participants for the next deal, from ledger + lifecycle (R3). */
function activeFundedCount(state: MultiplayerCoordinatorState): number {
  return dealableTablePlayers(state).filter((player) => player.stack > 0).length;
}

/** Transport loss must not discard another owner's unresolved decision clock. */
function clearResolvedRebuyDeadline(state: MultiplayerCoordinatorState): void {
  if (!state.seats.some((seat) => seat.kind === 'human'
    && seat.participation === 'disconnected' && seat.ledger?.settledStack === 0)) {
    state.rebuyDecisionDeadlineAtMs = null;
  }
}

function settleCompletedHand(
  state: MultiplayerCoordinatorState,
  nowMs: number,
): void {
  const hand = state.hand;
  if (!hand?.outcome) return;
  settleLedger(state, nowMs);
  state.turnDeadlineAtMs = null;
  state.completionReason = sessionCompletionReason(state, hand);
  state.status = state.completionReason ? 'complete' : 'between-hands';
  state.resumeStatus = null;
  // Rebuy decisions (scope 3.11F): a connected human settled to exactly zero
  // enters the pending decision; a disconnected busted human stays
  // disconnected (they rebuy only after reconnecting). Auto-deal stays
  // deferred while a connected pending decision exists, with the decision
  // deadline set by the room's configured turn duration.
  const decisionDeadline = nowMs + state.config.turnSeconds * 1_000;
  for (const seat of state.seats) {
    // Only a seat dealt into the settled hand can be "settled to zero":
    // a seat that was omitted from the deal (disconnected or sitting out
    // when the hand started, then returned mid-hand) never contested these
    // chips, so its lifecycle must survive the settlement untouched —
    // sitting-out and active returns persist until the owner decides.
    if (seat.kind !== 'human' || seat.participation === 'left' || seat.participation === 'sitting-out') continue;
    const participant = hand.players[seat.playerId];
    if (!participant) continue;
    if (participant.stack !== 0) continue;
    if (seat.participation === 'active' || seat.participation === 'rebuy-pending' || seat.participation === undefined) {
      seat.participation = seat.connection === 'online' ? 'rebuy-pending' : 'disconnected';
    }
  }
  const pendingConnected = state.seats.some((seat) => (
    seat.kind === 'human'
    && seat.participation === 'rebuy-pending'
    && seat.connection === 'online'
  ));
  state.rebuyDecisionDeadlineAtMs = pendingConnected ? decisionDeadline : null;
  // Arm the recoverable auto-deal countdown for every settled hand; the
  // host can deal now, pause, or resume it, and the deadline travels in
  // canonical state so any client converges on the same due moment. A
  // pending rebuy decision — or a stalled room where a human can still
  // return — defers the countdown entirely (scope 3.11F, R3 ledger-based).
  const funded = activeFundedCount(state);
  const humanCanReturn = humanCanReturnToSession(state);
  const fundable = funded >= 2 || !humanCanReturn;
  state.nextHandAtMs = state.status === 'between-hands' && !pendingConnected && fundable
    ? nowMs + NEXT_HAND_COUNTDOWN_MS
    : null;
}

export function multiplayerAiIdentityMap(
  state: MultiplayerCoordinatorState,
): Partial<Record<string, MultiwayAiIdentity>> {
  return Object.fromEntries(state.seats
    .filter((seat) => seat.control === 'ai')
    .map((seat) => [
      seat.playerId,
      (seat.kind === 'ai' && seat.aiProfileId
        ? MULTIWAY_AI_IDENTITIES.find((identity) => identity.id === seat.aiProfileId)
        : null)
        ?? multiwayAiIdentityForSeat(seat.seat, state.config.aiDifficulty),
    ]));
}

function seatedAiProfileIds(
  state: MultiplayerCoordinatorState,
  excludingPlayerId?: string,
): string[] {
  return state.seats
    .filter((seat) => seat.kind === 'ai' && seat.playerId !== excludingPlayerId)
    .map((seat) => seat.aiProfileId)
    .filter((id): id is string => id !== null);
}

function humanDisplayNames(state: MultiplayerCoordinatorState): string[] {
  return state.seats
    .filter((seat) => seat.kind === 'human')
    .map((seat) => seat.displayName);
}

/**
 * Selects an eligible AI profile from the authoritative room state and seats
 * it. Returns false without mutating when the roster is exhausted; the caller
 * decides between failing the request and leaving the seat empty.
 */
function seatRandomAi(
  state: MultiplayerCoordinatorState,
  seat: number,
  random: RandomSource,
  nowMs: number,
): boolean {
  const result = selectAiSeatIdentity({
    humanDisplayNames: humanDisplayNames(state),
    mostRecentlyRemovedForSeat: state.removedAiProfileIdBySeat[seat] ?? null,
    random,
    roster: multiwayAiRoster(state.config.aiDifficulty),
    seatedAiProfileIds: seatedAiProfileIds(state),
  });
  if (!result.ok) return false;
  state.seats.push({
    aiProfileId: result.identity.id,
    connection: 'online',
    control: 'ai',
    avatar: null,
    displayName: result.identity.name,
    isHost: false,
    joinedAtMs: nowMs,
    kind: 'ai',
    ledger: ledgerEntryFor({ playerId: `ai:${state.roomId}:${seat}:${result.identity.id}`, seat }, state.config.startingStackChips, nowMs),
    missedTurns: 0,
    participation: 'active',
    playerId: `ai:${state.roomId}:${seat}:${result.identity.id}`,
    ready: true,
    seat,
    userId: null,
  });
  return true;
}

/**
 * Human identity always wins: when a human joins with a display name that
 * collides with a seated AI (normalized, case-insensitive), the AI is replaced
 * with another eligible profile or removed when the roster is exhausted. The
 * joining human's own seat is never touched.
 */
function resolveHumanNameCollisions(
  state: MultiplayerCoordinatorState,
  random: RandomSource,
  nowMs: number,
): void {
  const foldedHumans = new Set(humanDisplayNames(state).map(foldAiNameForComparison));
  const colliding = state.seats.filter((seat) => (
    seat.kind === 'ai'
    && seat.aiProfileId !== null
    && foldedHumans.has(foldAiNameForComparison(seat.displayName))
  ));
  colliding.forEach((seat) => {
    const previousProfileId = seat.aiProfileId;
    state.seats = state.seats.filter((candidate) => candidate.playerId !== seat.playerId);
    if (previousProfileId !== null) {
      state.removedAiProfileIdBySeat[seat.seat] = previousProfileId;
      seatRandomAi(state, seat.seat, random, nowMs);
    }
  });
}

/**
 * Validates an ephemeral table moment against the authoritative room state
 * and derives the sender seat from the authenticated membership. This is the
 * coordinator's read-only moment gate: membership, current/recent-hand status,
 * hand sequence, authored reaction id, and bounded payload id are all revalidated
 * here immediately before the Edge Function claims the rate-limit slot and
 * emits the broadcast. Moments never mutate the state, never enter
 * processedCommands, and never appear in any durable shape.
 */
export function evaluateTableMoment(
  state: MultiplayerCoordinatorState,
  input: {
    actorUserId: string;
    handNumber: number;
    id: string;
    reactionId: TableMomentReactionId;
  },
  nowMs: number,
): TableMomentEnvelope {
  const seat = requireMember(state, input.actorUserId);
  const reactableHand = state.hand && (
    state.status === 'playing'
    || ((state.status === 'between-hands' || state.status === 'complete')
      && state.hand.street === 'complete'
      && state.hand.outcome !== null)
  );
  if (!reactableHand || !state.hand) {
    invalid('Table moments require the current hand or its result.');
  }
  if (state.hand.handNumber !== input.handNumber) {
    throw new MultiplayerCoordinatorError(
      'invalid-command',
      `Table moment hand ${input.handNumber} does not match the current hand ${state.hand.handNumber}.`,
    );
  }
  if (!isTableMomentReactionId(input.reactionId)) {
    invalid('Unknown table moment reaction.');
  }
  if (typeof input.id !== 'string' || input.id.trim().length === 0 || input.id.length > TABLE_MOMENT_MAX_PAYLOAD_ID_LENGTH) {
    invalid('Invalid table moment payload id.');
  }
  return createTableMomentEnvelope({
    atMs: nowMs,
    handNumber: state.hand.handNumber,
    id: input.id,
    playerId: seat.playerId,
    reactionId: input.reactionId,
    roomId: state.roomId,
    seat: seat.seat,
    seatCount: state.config.seatCount,
  });
}

function processAutomatedTurns(
  state: MultiplayerCoordinatorState,
  context: MultiplayerCoordinatorContext,
  actionBatch: MultiplayerPublicAction[],
): void {
  const random = context.random ?? Math.random;
  let guard = 0;

  while (state.status === 'playing') {
    const hand = state.hand;
    if (!hand) throw new MultiplayerCoordinatorError('invalid-room', 'A playing room has no hand.');
    if (hand.outcome) {
      settleCompletedHand(state, context.nowMs);
      return;
    }
    if (allHumansOffline(state)) {
      pauseRoom(state, 'playing');
      return;
    }

    const playerId = hand.toAct;
    if (!playerId) throw new MultiplayerCoordinatorError('invalid-room', 'A live hand has no current actor.');
    const seat = seatForPlayer(state, playerId);
    if (seat.participation === 'left') {
      // Q3: a permanently departed seat can NEVER hold a turn. If the action
      // reaches it (a leave that happened while another player was the actor,
      // or any later street handoff), the enforced fold fires immediately in
      // the SAME transition — no fake waiting clock is ever armed for a seat
      // that cannot act, no courtesy action is taken beyond the fold itself,
      // and the fold is batched into the committed public actions in
      // presentation order.
      const departed = hand.players[playerId];
      if (departed && !departed.folded) {
        const historyLengthBefore = hand.history.length;
        state.hand = applyEnforcedFold(hand, playerId);
        appendActions(state.hand, historyLengthBefore, actionBatch);
        state.turnDeadlineAtMs = null;
        guard += 1;
        if (guard > 200) {
          throw new MultiplayerCoordinatorError('invalid-room', 'Automated actions did not converge.');
        }
        continue;
      }
      // Defensive: a departed seat at the act marker with no foldable player
      // is corrupt state — it still never gets a clock.
      state.turnDeadlineAtMs = null;
      return;
    }
    if (seat.control === 'human') {
      // Arm the deadline only when none exists: resuming a paused room must
      // reuse the preserved deadline rather than grant a new turn budget
      // (scope 3.11F, adjacent check 2). A fresh turn always finds null here
      // because every accepted action clears it.
      if (state.turnDeadlineAtMs === null) {
        state.turnDeadlineAtMs = context.nowMs + state.config.turnSeconds * 1_000;
      }
      return;
    }

    const historyLengthBefore = hand.history.length;
    const identities = multiplayerAiIdentityMap(state);
    const identity = identities[playerId];
    if (!identity) {
      throw new MultiplayerCoordinatorError('invalid-room', 'An automated seat has no AI identity.');
    }
    const decision = decideMultiwayAiAction(
      createFairMultiwayDecisionState(hand, playerId),
      playerId,
      {
        difficulty: state.config.aiDifficulty,
        identity,
        identities,
        random,
        simulations: context.aiSimulations,
      },
    );
    state.hand = applyMultiwayAction(hand, playerId, decision.action);
    appendActions(state.hand, historyLengthBefore, actionBatch);
    state.turnDeadlineAtMs = null;
    guard += 1;
    if (guard > 200) {
      throw new MultiplayerCoordinatorError('invalid-room', 'Automated actions did not converge.');
    }
  }
}

/**
 * How long the room waits between hands before dealing the next hand
 * automatically. The countdown lives in canonical state and re-arms on
 * resume; the host can deal immediately or pause/resume it.
 */
export const NEXT_HAND_COUNTDOWN_MS = 10_000;

function transferHostAfterDeparture(
  state: MultiplayerCoordinatorState,
  departingPlayerId: string,
): void {
  if (state.hostPlayerId !== departingPlayerId) return;
  const candidates = state.seats
    .filter((seat) => seat.kind === 'human' && seat.playerId !== departingPlayerId);
  const nextHost = candidates
    .filter((seat) => seat.connection === 'online' && seat.control === 'human')
    .sort((left, right) => left.joinedAtMs - right.joinedAtMs || left.seat - right.seat)[0]
    ?? candidates
      .sort((left, right) => left.joinedAtMs - right.joinedAtMs || left.seat - right.seat)[0];
  state.seats.forEach((seat) => {
    seat.isHost = seat.playerId === nextHost?.playerId;
  });
  state.hostPlayerId = nextHost?.playerId ?? '';
}

function transferUnavailableHost(
  state: MultiplayerCoordinatorState,
  unavailablePlayerId: string,
): void {
  if (state.hostPlayerId !== unavailablePlayerId) return;
  const nextHost = state.seats
    .filter((seat) => (
      seat.kind === 'human'
      && seat.playerId !== unavailablePlayerId
      && seat.connection === 'online'
      && seat.control === 'human'
    ))
    .sort((left, right) => left.joinedAtMs - right.joinedAtMs || left.seat - right.seat)[0];
  if (!nextHost) return;
  state.seats.forEach((seat) => {
    seat.isHost = seat.playerId === nextHost.playerId;
  });
  state.hostPlayerId = nextHost.playerId;
}

function createTablePlayers(state: MultiplayerCoordinatorState): TablePlayerConfig[] {
  return [...state.seats]
    .sort((left, right) => left.seat - right.seat)
    .map((seat) => ({
      id: seat.playerId,
      name: seat.displayName,
      seat: seat.seat,
      stack: state.config.startingStackChips,
    }));
}

export function canStartMultiplayerRoom(state: MultiplayerCoordinatorState): boolean {
  if (state.status !== 'lobby' || state.seats.length < 2) return false;
  const humans = state.seats.filter((seat) => seat.kind === 'human');
  return humans.length > 0
    && humans.every((seat) => seat.ready && seat.connection === 'online');
}

/**
 * The participants dealt into the next hand (scope 3.11F): only seats whose
 * participation is ACTIVE are dealt. Disconnected, sitting-out, left, and
 * zero-stack seats are omitted — their ledger rows remain for Table stats,
 * standings, and chip conservation.
 */
function dealableTablePlayers(state: MultiplayerCoordinatorState): TablePlayerConfig[] {
  return [...state.seats]
    .sort((left, right) => left.seat - right.seat)
    .filter((seat) => seat.participation === 'active' || seat.participation === undefined)
    .map((seat) => ({
      id: seat.playerId,
      name: seat.displayName,
      seat: seat.seat,
      stack: seat.ledger?.settledStack ?? state.config.startingStackChips,
    }))
    .filter((player) => player.stack > 0);
}

function beginFirstHand(
  state: MultiplayerCoordinatorState,
  context: MultiplayerCoordinatorContext,
  actionBatch: MultiplayerPublicAction[],
): void {
  const players = createTablePlayers(state);
  const random = context.random ?? Math.random;
  const buttonIndex = Math.min(players.length - 1, Math.floor(random() * players.length));
  const buttonSeat = players[buttonIndex]?.seat;
  if (buttonSeat === undefined) invalid('The first dealer button could not be assigned.');
  state.hand = createMultiwayHand({
    bigBlind: state.config.bigBlindChips,
    buttonSeat,
    players,
    random,
    smallBlind: state.config.smallBlindChips,
  });
  state.completionReason = null;
  state.status = 'playing';
  state.resumeStatus = null;
  state.nextHandAtMs = null;
  processAutomatedTurns(state, context, actionBatch);
}

/**
 * Gates host-only between-hands commands (deal now, pause, resume) with the
 * same rules as the legacy next-hand flow: an available human host must be
 * the requester, and a missing host is transferred to the requester.
 */
function gateHostedBetweenHandsCommand(
  state: MultiplayerCoordinatorState,
  command: Extract<MultiplayerRoomCommand, { actorUserId: string }>,
  actionBatch: MultiplayerPublicAction[],
): MultiplayerSeatState {
  const seat = requireMember(state, command.actorUserId);
  if (state.status !== 'between-hands') invalid('The room is not between hands.');
  if (seat.connection !== 'online' || seat.control !== 'human') {
    throw new MultiplayerCoordinatorError('forbidden', 'Reconnect and take back the seat first.');
  }
  const currentHost = state.seats.find((candidate) => candidate.playerId === state.hostPlayerId);
  const hostIsAvailable = currentHost?.kind === 'human'
    && currentHost.connection === 'online'
    && currentHost.control === 'human';
  if (hostIsAvailable && currentHost.userId !== command.actorUserId) {
    throw new MultiplayerCoordinatorError('forbidden', 'Only the available host can control the countdown.');
  }
  if (!hostIsAvailable) {
    state.hostPlayerId = seat.playerId;
    state.seats.forEach((candidate) => {
      candidate.isHost = candidate.playerId === seat.playerId;
    });
  }
  return seat;
}

function beginNextHand(
  state: MultiplayerCoordinatorState,
  context: MultiplayerCoordinatorContext,
  actionBatch: MultiplayerPublicAction[],
): void {
  const previous = state.hand;
  if (!previous?.outcome) invalid('The current hand must finish before the next one is dealt.');
  // This gate belongs to dealing itself, not just the automatic tick. The
  // host's Deal now must exclude the same stale humans and publish the repair
  // even when their absence leaves too few players to deal.
  const livenessChanged = sweepStaleLiveness(state, context);
  if (livenessChanged && allHumansOffline(state)) {
    pauseRoom(state, 'between-hands');
    return;
  }
  // A hand is never dealt while a connected pending rebuy decision exists
  // (scope 3.11F): the decision deadline resolves it first.
  if (state.seats.some((seat) => seat.kind === 'human' && seat.participation === 'rebuy-pending' && seat.connection === 'online')) {
    if (livenessChanged) { state.nextHandAtMs = null; return; }
    invalid('Resolve the pending rebuy decision before dealing.');
  }
  const players = dealableTablePlayers(state);
  if (players.length < 2) {
    if (livenessChanged) { state.nextHandAtMs = null; return; }
    invalid('The table already has a winner.');
  }
  state.hand = createMultiwayHand({
    bigBlind: previous.bigBlind,
    buttonSeat: nextButtonSeat(players, previous.buttonSeat),
    handNumber: previous.handNumber + 1,
    players,
    random: context.random ?? Math.random,
    smallBlind: previous.smallBlind,
  });
  state.completionReason = null;
  state.status = 'playing';
  state.resumeStatus = null;
  state.nextHandAtMs = null;
  processAutomatedTurns(state, context, actionBatch);
}

function commandTransition(
  state: MultiplayerCoordinatorState,
  command: MultiplayerRoomCommand,
  context: MultiplayerCoordinatorContext,
  actionBatch: MultiplayerPublicAction[],
  timeout: MultiplayerTimeoutResult | null,
): MultiplayerCommandResult {
  state.version += 1;
  state.updatedAtMs = context.nowMs;
  const transition: MultiplayerTransition = {
    acceptedAtMs: context.nowMs,
    actionBatch,
    actorUserId: command.actorUserId,
    commandId: command.commandId,
    kind: command.type,
    timeout,
    version: state.version,
  };
  const processed: MultiplayerProcessedCommand = {
    commandId: command.commandId,
    fingerprint: commandFingerprint(command),
    transition,
  };
  state.processedCommands = [...state.processedCommands, processed].slice(-MAX_PROCESSED_COMMANDS);
  return { duplicate: false, state, transition };
}

function existingCommandResult(
  state: MultiplayerCoordinatorState,
  command: MultiplayerRoomCommand,
): MultiplayerCommandResult | null {
  const processed = state.processedCommands.find((entry) => entry.commandId === command.commandId);
  if (!processed) return null;
  if (processed.fingerprint !== commandFingerprint(command)) {
    throw new MultiplayerCoordinatorError(
      'command-conflict',
      'A command id cannot be reused for a different payload.',
    );
  }
  return { duplicate: true, state, transition: processed.transition };
}

export function createMultiplayerRoom(
  input: CreateMultiplayerRoomInput,
  context: MultiplayerCoordinatorContext,
): MultiplayerCoordinatorState {
  assertContext(context);
  assertConfig(input.config);
  assertIdentifier(input.roomId, 'Room id');
  assertIdentifier(input.hostUserId, 'Host user id');
  assertIdentifier(input.hostPlayerId, 'Host player id');
  assertDisplayName(input.hostDisplayName);
  if (!isCurrentMultiplayerRoomCode(input.roomCode)) {
    invalid('Current room codes must contain seven digits and begin with 4.');
  }
  const hostSeat = input.hostSeat ?? 0;
  if (!Number.isInteger(hostSeat) || hostSeat < 0 || hostSeat >= input.config.seatCount) {
    invalid('The host seat is outside this room.');
  }

  return {
    completionReason: null,
    config: { ...input.config },
    createdAtMs: context.nowMs,
    hand: null,
    hostPlayerId: input.hostPlayerId,
    nextHandAtMs: null,
    rebuyDecisionDeadlineAtMs: null,
    processedCommands: [],
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    removedAiProfileIdBySeat: {},
    resumeStatus: null,
    roomCode: input.roomCode,
    roomId: input.roomId,
    seats: [{
      aiProfileId: null,
      connection: 'online',
      control: 'human',
      avatar: validAvatar(input.hostAvatar),
      displayName: input.hostDisplayName.trim(),
      isHost: true,
      joinedAtMs: context.nowMs,
      kind: 'human',
      ledger: ledgerEntryFor({ playerId: input.hostPlayerId, seat: hostSeat }, input.config.startingStackChips, context.nowMs),
      missedTurns: 0,
      participation: 'active',
      playerId: input.hostPlayerId,
      ready: false,
      seat: hostSeat,
      userId: input.hostUserId,
    }],
    sessionNumber: 1,
    status: 'lobby',
    turnDeadlineAtMs: null,
    updatedAtMs: context.nowMs,
    version: 0,
  };
}

export function applyMultiplayerCommand(
  currentState: MultiplayerCoordinatorState,
  command: MultiplayerRoomCommand,
  context: MultiplayerCoordinatorContext,
): MultiplayerCommandResult {
  assertContext(context);
  assertIdentifier(command.commandId, 'Command id');
  assertIdentifier(command.actorUserId, 'Actor user id');
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 0) {
    invalid('Expected version must be a non-negative integer.');
  }

  const duplicate = existingCommandResult(currentState, command);
  if (duplicate) return duplicate;
  if (command.expectedVersion !== currentState.version) {
    throw new MultiplayerCoordinatorError(
      'stale-version',
      `Expected room version ${command.expectedVersion}, received ${currentState.version}.`,
    );
  }

  const state = cloneState(currentState);
  const actionBatch: MultiplayerPublicAction[] = [];
  let timeout: MultiplayerTimeoutResult | null = null;

  switch (command.type) {
    case 'join': {
      if (state.status !== 'lobby') invalid('Players can join only while the room is in the lobby.');
      assertSeatIndex(state, command.seat);
      assertDisplayName(command.displayName);
      assertIdentifier(command.playerId, 'Player id');
      if (state.seats.some((seat) => seat.seat === command.seat)) invalid('That seat is already occupied.');
      if (state.seats.some((seat) => seat.playerId === command.playerId)) invalid('That player id is already seated.');
      if (humanSeatForUser(state, command.actorUserId)) invalid('That user already has a room seat.');
      state.seats.push({
        aiProfileId: null,
        connection: 'online',
        control: 'human',
        avatar: validAvatar(command.avatar),
        displayName: command.displayName.trim(),
        ledger: ledgerEntryFor({ playerId: command.playerId, seat: command.seat }, state.config.startingStackChips, context.nowMs),
        participation: 'active',
        playRecord: validPlayRecord(command.playRecord),
        isHost: false,
        joinedAtMs: context.nowMs,
        kind: 'human',
        missedTurns: 0,
        playerId: command.playerId,
        ready: false,
        seat: command.seat,
        userId: command.actorUserId,
      });
      // A human display name always wins a normalized, case-insensitive
      // collision with a seated AI: replace that AI or remove it safely.
      resolveHumanNameCollisions(state, context.random ?? Math.random, context.nowMs);
      break;
    }

    case 'add-ai': {
      requireHost(state, command.actorUserId);
      if (state.status !== 'lobby') invalid('AI seats can change only in the lobby.');
      assertSeatIndex(state, command.seat);
      if (state.seats.some((seat) => seat.seat === command.seat)) invalid('That seat is already occupied.');
      if (!seatRandomAi(state, command.seat, context.random ?? Math.random, context.nowMs)) {
        throw new MultiplayerCoordinatorError(
          'roster-exhausted',
          'No eligible AI profile remains for that seat. Remove another AI or invite a friend.',
        );
      }
      break;
    }

    case 'remove-ai': {
      requireHost(state, command.actorUserId);
      if (state.status !== 'lobby') invalid('AI seats can change only in the lobby.');
      const seat = state.seats.find((candidate) => candidate.seat === command.seat);
      if (!seat || seat.kind !== 'ai') invalid('That seat does not contain removable AI.');
      // Remember the removed profile so a later add on this seat rerolls away
      // from it whenever another eligible profile exists.
      state.removedAiProfileIdBySeat[seat.seat] = seat.aiProfileId;
      state.seats = state.seats.filter((candidate) => candidate.playerId !== seat.playerId);
      break;
    }

    case 'set-ready': {
      const seat = requireMember(state, command.actorUserId);
      if (state.status !== 'lobby') invalid('Ready state can change only in the lobby.');
      seat.ready = command.ready;
      break;
    }

    case 'start': {
      requireHost(state, command.actorUserId);
      if (state.status !== 'lobby') invalid('The room is not waiting to start.');
      if (state.seats.length < 2) invalid('At least two occupied seats are required.');
      // A ready player can disappear while waiting in the lobby. Commit the
      // offline/unready state without dealing; the owner must reconnect and
      // ready again. No cards or starting blinds are issued to absent humans.
      if (sweepStaleLiveness(state, context)) break;
      if (!canStartMultiplayerRoom(state)) {
        invalid('Every human must be online and ready before the game starts.');
      }
      beginFirstHand(state, context, actionBatch);
      break;
    }

    case 'action': {
      const seat = requireMember(state, command.actorUserId);
      if (state.status !== 'playing' || !state.hand) invalid('The room is not accepting game actions.');
      if (seat.connection !== 'online' || seat.control !== 'human') {
        throw new MultiplayerCoordinatorError('forbidden', 'That seat is not under live human control.');
      }
      if (state.hand.toAct !== seat.playerId) invalid('It is not that player’s turn.');
      // Acting proves presence: a sitting-out seat that was dealt in (returned
      // via a later boundary) is active again (scope 3.11F).
      if (seat.participation === 'sitting-out' || seat.participation === 'disconnected') {
        seat.participation = 'active';
      }
      const historyLengthBefore = state.hand.history.length;
      state.hand = applyMultiwayAction(state.hand, seat.playerId, command.action);
      appendActions(state.hand, historyLengthBefore, actionBatch);
      seat.missedTurns = 0;
      state.turnDeadlineAtMs = null;
      processAutomatedTurns(state, context, actionBatch);
      break;
    }

    case 'tick': {
      requireMember(state, command.actorUserId);
      // Between hands a tick serves the recoverable auto-deal countdown:
      // the first due tick deals the next hand (host-agnostic, converging on
      // the same canonical deadline), and any client's redundant tick after
      // that is refused by the normal version check at the transport.
      if (state.status === 'between-hands') {
        // Q4: transport truth converges BEFORE any countdown decision —
        // online seats the SERVER stopped hearing from are demoted first,
        // so the expired-decision resolution and the deal gate below
        // evaluate the room as it actually is, the host authority moves if
        // the host's transport died, and a collective transport loss
        // pauses instead of dealing behind everyone's back. The repair
        // commits even when nothing is due to deal yet (the premature-tick
        // refusal below still stands for a sweep that changed nothing).
        if (sweepStaleLiveness(state, context)) {
          if (allHumansOffline(state)) {
            pauseRoom(state, 'between-hands');
            break;
          }
          const sweepPendingConnected = state.seats.some((candidate) => (
            candidate.kind === 'human'
            && candidate.participation === 'rebuy-pending'
            && candidate.connection === 'online'
          ));
          if (!sweepPendingConnected) {
            clearResolvedRebuyDeadline(state);
            // R3: ledger/lifecycle viability, not the settled hand's stacks.
            const funded = activeFundedCount(state);
            const humanCanReturn = humanCanReturnToSession(state);
            state.nextHandAtMs = funded >= 2 || !humanCanReturn
              ? context.nowMs + NEXT_HAND_COUNTDOWN_MS
              : null;
          }
          if (state.nextHandAtMs === null || context.nowMs < state.nextHandAtMs) {
            break;
          }
          // Due and fundable after the repair: fall through to the deal.
        }
        // Expired rebuy decisions resolve as Sitting out (scope 3.11F); the
        // seat keeps its chips-at-zero state and may rebuy at any later
        // between-hands boundary. The countdown arms only once every
        // connected pending decision is resolved — or never, when fewer
        // than two funded players remain and a human can still return.
        if (state.rebuyDecisionDeadlineAtMs !== null && context.nowMs >= state.rebuyDecisionDeadlineAtMs) {
          for (const seat of state.seats) {
            if (seat.kind === 'human' && seat.participation === 'rebuy-pending' && seat.connection === 'online') {
              seat.participation = 'sitting-out';
            }
          }
          state.rebuyDecisionDeadlineAtMs = null;
          // R3: viability comes from the ledger and lifecycle, never from the
          // settled hand's stale stacks — a rebought or sitting-out seat's
          // chips live in the ledger now.
          const funded = activeFundedCount(state);
          const humanCanReturn = humanCanReturnToSession(state);
          state.nextHandAtMs = funded >= 2 || !humanCanReturn ? context.nowMs + NEXT_HAND_COUNTDOWN_MS : null;
          // H05: resolving the expired decision is the transition — it commits
          // even when the room must keep waiting (no funded return). The tick
          // only proceeds to the deal when the re-armed countdown is also due.
          if (state.nextHandAtMs === null || context.nowMs < state.nextHandAtMs) {
            break;
          }
        }
        if (state.nextHandAtMs === null || context.nowMs < state.nextHandAtMs) {
          invalid('The next-hand countdown has not reached zero.');
        }
        const seat = requireMember(state, command.actorUserId);
        if (seat.connection !== 'online' || seat.control !== 'human') {
          throw new MultiplayerCoordinatorError('forbidden', 'Reconnect and take back the seat first.');
        }
        // A due tick deals from the ledger: if fewer than two active funded
        // participants exist, the room WAITS while a human can return (the
        // host may end the stalled session) and completes as
        // last-player-standing only when none can (R3 — the previous code
        // read the settled hand's stale stacks and completed a room whose
        // ledger held an accepted 4,000-chip rebuy).
        const previous = state.hand;
        if (!previous?.outcome) invalid('The current hand must finish before the next one is dealt.');
        if (activeFundedCount(state) < 2) {
          if (humanCanReturnToSession(state)) {
            state.nextHandAtMs = null;
            break;
          }
          state.status = 'complete';
          state.completionReason = 'last-player-standing';
          state.nextHandAtMs = null;
          break;
        }
        const currentHost = state.seats.find((candidate) => candidate.playerId === state.hostPlayerId);
        const hostIsAvailable = currentHost?.kind === 'human'
          && currentHost.connection === 'online'
          && currentHost.control === 'human';
        if (!hostIsAvailable) {
          state.hostPlayerId = seat.playerId;
          state.seats.forEach((candidate) => {
            candidate.isHost = candidate.playerId === seat.playerId;
          });
        }
        beginNextHand(state, context, actionBatch);
        break;
      }
      if (state.status !== 'playing' || !state.hand) invalid('The room has no running turn timer.');
      if (state.turnDeadlineAtMs === null || context.nowMs < state.turnDeadlineAtMs) {
        invalid('The current turn deadline has not passed.');
      }
      const playerId = state.hand.toAct;
      if (!playerId) throw new MultiplayerCoordinatorError('invalid-room', 'The timed hand has no actor.');
      const timedSeat = seatForPlayer(state, playerId);
      if (timedSeat.kind !== 'human' || timedSeat.control !== 'human') {
        throw new MultiplayerCoordinatorError('invalid-room', 'Only a human-controlled turn can time out.');
      }
      // Scope 3.11F seat-lifecycle contract at expiry (H07): a DISCONNECTED
      // human never receives an AI-style automatic check — the expiry folds
      // once, even when check is legal. An ONLINE human whose unchanged
      // deadline expires keeps the check-when-legal-else-fold rule.
      const legal = getMultiwayLegalActions(state.hand, playerId);
      // Q4: server-observed silence replaces the client-declared flag as
      // the liveness authority. A seat whose owner stopped contacting the
      // server is transport-dead no matter what its connection field
      // claims, and a transport-dead seat folds at expiry — it never
      // receives the online courtesy check. The worker refuses unavailable
      // liveness reads before entering this transition.
      if (seatLivenessIsStale(timedSeat, context)) demoteStaleSeat(state, timedSeat);
      const offline = timedSeat.connection === 'offline';
      const timeoutAction = !offline && legal.canCheck
        ? { type: 'check' as const }
        : { type: 'fold' as const };
      const historyLengthBefore = state.hand.history.length;
      // An offline seat's expiry uses the ENFORCED fold (the engine refuses a
      // plain fold when check is free — the enforcement path deliberately
      // bypasses that training guardrail, scope 3.11F/H07).
      state.hand = offline
        ? applyEnforcedFold(state.hand, playerId)
        : applyMultiwayAction(state.hand, playerId, timeoutAction);
      appendActions(state.hand, historyLengthBefore, actionBatch);
      timedSeat.missedTurns += 1;
      // A missed deadline NEVER hands the seat to AI — control stays human
      // forever. Participation: an offline seat is disconnected (and omitted
      // from later deals until the owner reconnects); an online seat sits out.
      if (!offline && timedSeat.participation !== 'rebuy-pending') {
        timedSeat.participation = 'sitting-out';
      }
      transferUnavailableHost(state, timedSeat.playerId);
      timeout = {
        action: timeoutAction.type,
        aiTookOver: false,
        missedTurns: timedSeat.missedTurns,
        playerId,
      };
      state.turnDeadlineAtMs = null;
      processAutomatedTurns(state, context, actionBatch);
      break;
    }

    case 'set-connection': {
      // Reconnecting a human returns them to active participation (scope
      // 3.11F) — unless they permanently left or intentionally sat out. A
      // busted seat can resume only its EXISTING unexpired decision window.
      const reconnectSeat = state.seats.find((candidate) => candidate.userId === command.actorUserId);
      if (reconnectSeat && reconnectSeat.participation !== 'left') {
        if (command.connection === 'offline' && reconnectSeat.participation !== 'disconnected'
          && reconnectSeat.participation !== 'sitting-out') {
          // Transport loss: the seat is DISCONNECTED — omitted from new deals,
          // recoverable only by this same authenticated owner, and its live
          // turn deadline is preserved untouched for a retry.
          reconnectSeat.participation = 'disconnected';
        }
        if (command.connection === 'online' && reconnectSeat.participation === 'disconnected') {
          if ((reconnectSeat.ledger?.settledStack ?? state.config.startingStackChips) === 0) {
            const boundary = state.status === 'between-hands'
              || state.status === 'paused' && state.resumeStatus === 'between-hands';
            reconnectSeat.participation = boundary
              && state.rebuyDecisionDeadlineAtMs !== null
              && context.nowMs < state.rebuyDecisionDeadlineAtMs
              ? 'rebuy-pending' : 'sitting-out';
            // No new clock, no chips, no silent reversal of Sit out. A late
            // owner retains the existing explicit between-hands Rebuy action.
          } else {
            reconnectSeat.participation = 'active';
          }
        }
      }
      const seat = requireMember(state, command.actorUserId);
      seat.connection = command.connection;
      if (command.connection === 'offline'
        && (state.status === 'playing' || state.status === 'between-hands')
        && allHumansOffline(state)) {
        pauseRoom(state, state.status);
      } else if (command.connection === 'online' && state.status === 'paused') {
        const resumeStatus = state.resumeStatus;
        if (!resumeStatus) throw new MultiplayerCoordinatorError('invalid-room', 'The paused room has no resume state.');
        state.status = resumeStatus;
        state.resumeStatus = null;
        // The countdown was cleared when the room paused; re-arm it so the
        // between-hands window is recoverable after a collective disconnect.
        if (resumeStatus === 'between-hands' && state.nextHandAtMs === null) {
          state.nextHandAtMs = context.nowMs + NEXT_HAND_COUNTDOWN_MS;
        }
        if (resumeStatus === 'playing') processAutomatedTurns(state, context, actionBatch);
      }
      break;
    }

    case 'reclaim': {
      // Scope 3.11F retires the reclaim path: a human seat is never handed to
      // AI, so there is nothing to reclaim — an upgraded client must never
      // normalize an absent human into AI control.
      invalid('This seat is always under its owner\'s control. Update the app to continue.');
    }

    case 'deal-now': {
      gateHostedBetweenHandsCommand(state, command, actionBatch);
      beginNextHand(state, context, actionBatch);
      break;
    }

    case 'pause': {
      gateHostedBetweenHandsCommand(state, command, actionBatch);
      if (state.nextHandAtMs === null) {
        invalid('The countdown is already paused.');
      }
      state.nextHandAtMs = null;
      break;
    }

    case 'resume': {
      gateHostedBetweenHandsCommand(state, command, actionBatch);
      if (state.nextHandAtMs !== null) {
        invalid('The countdown is already running.');
      }
      state.nextHandAtMs = context.nowMs + NEXT_HAND_COUNTDOWN_MS;
      break;
    }

    case 'rematch': {
      const requester = requireMember(state, command.actorUserId);
      if (state.status !== 'complete' || !state.hand?.outcome || !state.completionReason) {
        invalid('A rematch can begin only after the session is complete.');
      }
      sweepStaleLiveness(state, context);
      if (requester.connection !== 'online' || requester.control !== 'human') {
        throw new MultiplayerCoordinatorError('forbidden', 'Reconnect and take back the seat before starting a rematch.');
      }
      const currentHost = state.seats.find((seat) => seat.playerId === state.hostPlayerId);
      const hostIsAvailable = currentHost?.kind === 'human'
        && currentHost.connection === 'online'
        && currentHost.control === 'human';
      if (hostIsAvailable && currentHost.userId !== command.actorUserId) {
        throw new MultiplayerCoordinatorError('forbidden', 'Only the available host can start a rematch.');
      }

      // Scope 3.11F: a rematch starts a fresh session with fresh ledger
      // entries. Permanently departed seats drop from the seating; every
      // retained seat resets its participation and buy-in ledger to the
      // configured starting stack with zero rebuys.
      state.seats = state.seats.filter((seat) => (
        seat.kind === 'ai' || seat.participation !== 'left'
      ));
      state.seats.forEach((seat) => {
        seat.participation = seat.kind === 'human' && seat.connection === 'offline' ? 'disconnected' : 'active';
        seat.ledger = ledgerEntryFor(seat, state.config.startingStackChips, context.nowMs);
        seat.missedTurns = 0;
        seat.ready = seat.kind === 'ai';
      });
      const host = state.seats.find((seat) => seat.playerId === state.hostPlayerId);
      if (!hostIsAvailable || !host || host.kind !== 'human' || host.connection !== 'online') {
        state.hostPlayerId = requester.playerId;
        state.seats.forEach((seat) => {
          seat.isHost = seat.playerId === requester.playerId;
        });
      }
      state.completionReason = null;
      state.hand = null;
      state.nextHandAtMs = null;
      state.resumeStatus = null;
      state.sessionNumber += 1;
      state.status = 'lobby';
      state.turnDeadlineAtMs = null;
      break;
    }

    case 'rebuy': {
      // Owner-only (scope 3.11F): the seat resolves from the AUTHENTICATED
      // actor; the 4,000-chip amount is server-owned and never client-supplied.
      const seat = requireMember(state, command.actorUserId);
      if (seat.kind !== 'human') invalid('Only a human seat can rebuy.');
      if (state.status !== 'between-hands' || !state.hand?.outcome) {
        invalid('A rebuy is accepted only between hands.');
      }
      const ledger = seat.ledger;
      if (!ledger) invalid('This seat has no buy-in ledger row.');
      // H06: eligibility derives from the seat's settled ledger, never from
      // the last hand's dealt-player list — a sitting-out or omitted human
      // keeps their identity and can rebuy at any later boundary.
      if (ledger.settledStack !== 0) invalid('A rebuy is accepted only at exactly zero chips.');
      if (seat.participation === 'left') invalid('A seat that left this session cannot rebuy.');
      if (seat.connection !== 'online' || seat.control !== 'human') {
        invalid('Reconnect before rebuying.');
      }
      // H04: every accepted rebuy fact moves atomically — rebuyChips tracks
      // the cumulative purchased chips so the ledger invariants
      // rebuyChips = rebuyCount x 4,000, totalBuyIn = initialBuyIn +
      // rebuyChips, and net = settledStack - totalBuyIn all hold. The
      // purchased chips are carried by the ledger and dealt at the next safe
      // boundary (the completed hand object is never mutated).
      ledger.rebuyCount += 1;
      ledger.rebuyChips += MULTIPLAYER_REBUY_CHIPS;
      ledger.totalBuyIn = ledger.initialBuyIn + ledger.rebuyChips;
      ledger.settledStack = MULTIPLAYER_REBUY_CHIPS;
      ledger.settledAtMs = context.nowMs;
      seat.participation = 'active';
      // With the decision resolved, re-arm the auto-deal countdown when the
      // room is fundable (or no human can return) — R3: the count comes from
      // the ledger and lifecycle, never the settled hand's stale stacks.
      const pendingConnected = state.seats.some((candidate) => (
        candidate.kind === 'human'
        && candidate.participation === 'rebuy-pending'
        && candidate.connection === 'online'
      ));
      if (!pendingConnected && state.hand?.outcome) {
        clearResolvedRebuyDeadline(state);
        const funded = activeFundedCount(state);
        const humanCanReturn = humanCanReturnToSession(state);
        state.nextHandAtMs = funded >= 2 || !humanCanReturn
          ? context.nowMs + NEXT_HAND_COUNTDOWN_MS
          : null;
      }
      break;
    }

    case 'sit-out': {
      // Owner-only resolution of the pending decision (scope 3.11F): the seat
      // and identity stay; the player omits the next deal and may rebuy at
      // any later between-hands boundary.
      const seat = requireMember(state, command.actorUserId);
      if (seat.kind !== 'human') invalid('Only a human seat can sit out.');
      if (state.status !== 'between-hands') invalid('Sitting out applies only between hands.');
      if (seat.participation !== 'rebuy-pending') invalid('This seat has no pending rebuy decision.');
      seat.participation = 'sitting-out';
      const pendingConnected = state.seats.some((candidate) => (
        candidate.kind === 'human'
        && candidate.participation === 'rebuy-pending'
        && candidate.connection === 'online'
      ));
      if (!pendingConnected) {
        clearResolvedRebuyDeadline(state);
        // R3: ledger/lifecycle viability, not the settled hand's stale stacks.
        const funded = activeFundedCount(state);
        const humanCanReturn = humanCanReturnToSession(state);
        state.nextHandAtMs = state.status === 'between-hands' && (funded >= 2 || !humanCanReturn)
          ? context.nowMs + NEXT_HAND_COUNTDOWN_MS
          : null;
      }
      break;
    }

    case 'return-next-hand': {
      // Owner-only Return next hand (scope 3.11F/R3): a CONNECTED sitting-out
      // human with a positive settled stack rejoins the next deal. A busted
      // sitting-out human must use the fixed rebuy flow instead; reconnect
      // toggling is never a substitute for the explicit return.
      const seat = requireMember(state, command.actorUserId);
      if (seat.kind !== 'human') invalid('Only a human seat can return.');
      if (state.status !== 'between-hands' || !state.hand?.outcome) {
        invalid('Returning applies only between hands.');
      }
      if (seat.participation !== 'sitting-out') invalid('This seat is not sitting out.');
      if (seat.connection !== 'online' || seat.control !== 'human') {
        invalid('Reconnect before returning.');
      }
      if ((seat.ledger?.settledStack ?? 0) === 0) {
        invalid('A busted seat must rebuy before returning.');
      }
      seat.participation = 'active';
      // With the seat returned, the room may be fundable again: re-arm the
      // countdown when at least two active funded participants exist (R3).
      const pendingConnected = state.seats.some((candidate) => (
        candidate.kind === 'human'
        && candidate.participation === 'rebuy-pending'
        && candidate.connection === 'online'
      ));
      if (!pendingConnected) {
        const funded = activeFundedCount(state);
        const humanCanReturn = humanCanReturnToSession(state);
        state.nextHandAtMs = funded >= 2 || !humanCanReturn
          ? context.nowMs + NEXT_HAND_COUNTDOWN_MS
          : null;
      }
      break;
    }

    case 'end-stalled-session': {
      // Host-only (scope 3.11F): ends a stalled between-hands room where no
      // hand can be dealt because fewer than two active funded participants
      // remain. Completion reason 'host-ended' preserves every ledger row.
      const seat = requireMember(state, command.actorUserId);
      if (state.status !== 'between-hands' || !state.hand?.outcome) {
        invalid('A stalled session ends only between hands.');
      }
      const currentHost = state.seats.find((candidate) => candidate.playerId === state.hostPlayerId);
      if (!currentHost || currentHost.userId !== command.actorUserId) {
        throw new MultiplayerCoordinatorError('forbidden', 'Only the host can end a stalled session.');
      }
      const dealable = dealableTablePlayers(state).filter((player) => player.stack > 0);
      if (dealable.length >= 2) invalid('The session is not stalled: a hand can still be dealt.');
      state.completionReason = 'host-ended';
      state.status = 'complete';
      state.nextHandAtMs = null;
      state.rebuyDecisionDeadlineAtMs = null;
      break;
    }

    case 'update-play-record': {
      // Owner-only by construction: the seat resolves from the AUTHENTICATED
      // actor, never from a client-supplied player id (scope 3.11E).
      const seat = requireMember(state, command.actorUserId);
      if (seat.kind !== 'human') invalid('Only a human seat can publish a Play record.');
      const record = validPlayRecord(command.record);
      if (!record) invalid('The Play record snapshot is invalid.');
      if (publicPlayerRecordSerializedBytes(record) > PUBLIC_PLAYER_RECORD_MAX_BYTES) {
        invalid('The Play record snapshot exceeds its payload bound.');
      }
      // Convergence: a stale or equal revision never rolls the room's record
      // back to older data (scope 3.11E).
      if (seat.playRecord && record.revision <= seat.playRecord.revision) {
        invalid('A newer Play record snapshot already exists.');
      }
      seat.playRecord = record;
      break;
    }

    case 'leave': {
      const seat = requireMember(state, command.actorUserId);
      if (state.status === 'lobby') {
        state.seats = state.seats.filter((candidate) => candidate.playerId !== seat.playerId);
        transferHostAfterDeparture(state, seat.playerId);
        if (!state.seats.some((candidate) => candidate.kind === 'human')) state.status = 'complete';
        break;
      }
      // Scope 3.11F: leaving is a permanent exit for this running session.
      // The seat retires as LEFT — kind and control stay human forever (an
      // absent human is never normalized into AI control) — and the seat is
      // excluded from every future deal while its settled ledger row remains
      // for Table stats, standings, and chip conservation.
      seat.connection = 'offline';
      seat.participation = 'left';
      seat.ready = false;
      transferHostAfterDeparture(state, seat.playerId);
      if (state.status === 'playing' && state.hand && !state.hand.outcome) {
        const player = state.hand.players[seat.playerId];
        if (player && !player.folded && state.hand.toAct === seat.playerId) {
          // The coordinator folds the departed seat at the next legal
          // transition; it never asks AI to finish the hand for them. The
          // ENFORCED fold is required: the training engine refuses a plain
          // fold when checking is free, and a legal check must never be
          // made on the leaver's behalf (adjacent check 1).
          const historyLengthBefore = state.hand.history.length;
          state.hand = applyEnforcedFold(state.hand, seat.playerId);
          // Q3: the enforced fold belongs in the committed public actions in
          // presentation order — exactly like a timed fold. Without it the
          // persisted transition would carry a hand history the public
          // action ledger never shows.
          appendActions(state.hand, historyLengthBefore, actionBatch);
          // Q3: the departed seat's clock dies with the seat. The next actor
          // — human or AI — is processed from a cleared deadline, so a human
          // always arms a fresh FULL turn budget (the leave-at-deadline race
          // before, at, and after expiry all resolve identically) and a stale
          // leaver clock can never time out an innocent successor.
          state.turnDeadlineAtMs = null;
        }
        if (allHumansOffline(state)) pauseRoom(state, 'playing');
        else processAutomatedTurns(state, context, actionBatch);
      } else if (state.status === 'between-hands') {
        if (allHumansOffline(state)) pauseRoom(state, 'between-hands');
        // With the departed human unable to return, the completion reason is
        // recomputed: a one-stack room now completes as last-player-standing.
        if (state.hand?.outcome) {
          state.completionReason = sessionCompletionReason(state, state.hand);
          state.status = state.completionReason ? 'complete' : state.status;
          state.nextHandAtMs = state.completionReason ? null : state.nextHandAtMs;
        }
      }
      break;
    }
  }

  return commandTransition(state, command, context, actionBatch, timeout);
}
