import type { RandomSource } from '../poker/cards.ts';
import { createFairMultiwayDecisionState } from '../poker/fairness.ts';
import {
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
}

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
  state.turnDeadlineAtMs = null;
}

function sessionCompletionReason(
  state: MultiplayerCoordinatorState,
  hand: MultiwayHandState,
): MultiplayerCompletionReason | null {
  const livePlayers = hand.tablePlayerIds.filter((playerId) => (hand.players[playerId]?.stack ?? 0) > 0);
  if (livePlayers.length < 2) return 'last-player-standing';
  if (state.config.handTarget !== 'open' && hand.handNumber >= state.config.handTarget) {
    return 'hand-limit';
  }
  return null;
}

function settleCompletedHand(state: MultiplayerCoordinatorState): void {
  const hand = state.hand;
  if (!hand?.outcome) return;
  state.turnDeadlineAtMs = null;
  state.completionReason = sessionCompletionReason(state, hand);
  state.status = state.completionReason ? 'complete' : 'between-hands';
  state.resumeStatus = null;
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
    missedTurns: 0,
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
 * coordinator's read-only moment gate: membership, live-hand status, hand
 * sequence, authored reaction id, and bounded payload id are all revalidated
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
  if (state.status !== 'playing' || !state.hand) {
    invalid('Table moments require a live hand.');
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
      settleCompletedHand(state);
      return;
    }
    if (allHumansOffline(state)) {
      pauseRoom(state, 'playing');
      return;
    }

    const playerId = hand.toAct;
    if (!playerId) throw new MultiplayerCoordinatorError('invalid-room', 'A live hand has no current actor.');
    const seat = seatForPlayer(state, playerId);
    if (seat.control === 'human') {
      state.turnDeadlineAtMs = context.nowMs + state.config.turnSeconds * 1_000;
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

function nextTablePlayers(hand: MultiwayHandState): TablePlayerConfig[] {
  return hand.tablePlayerIds.map((playerId) => {
    const player = hand.players[playerId];
    if (!player) throw new MultiplayerCoordinatorError('invalid-room', `Player ${playerId} is missing.`);
    return {
      id: player.id,
      name: player.name,
      seat: player.seat,
      stack: player.stack,
    };
  });
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
  processAutomatedTurns(state, context, actionBatch);
}

function beginNextHand(
  state: MultiplayerCoordinatorState,
  context: MultiplayerCoordinatorContext,
  actionBatch: MultiplayerPublicAction[],
): void {
  const previous = state.hand;
  if (!previous?.outcome) invalid('The current hand must finish before the next one is dealt.');
  const players = nextTablePlayers(previous);
  if (players.filter((player) => player.stack > 0).length < 2) invalid('The table already has a winner.');
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
  if (!/^\d{6}$/.test(input.roomCode)) invalid('Room codes must contain exactly six digits.');
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
    processedCommands: [],
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
      missedTurns: 0,
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
      const legal = getMultiwayLegalActions(state.hand, playerId);
      const timeoutAction = legal.canCheck ? { type: 'check' as const } : { type: 'fold' as const };
      const historyLengthBefore = state.hand.history.length;
      state.hand = applyMultiwayAction(state.hand, playerId, timeoutAction);
      appendActions(state.hand, historyLengthBefore, actionBatch);
      timedSeat.missedTurns += 1;
      if (timedSeat.missedTurns >= 2) {
        timedSeat.control = 'ai';
        transferUnavailableHost(state, timedSeat.playerId);
      }
      timeout = {
        action: timeoutAction.type,
        aiTookOver: timedSeat.control === 'ai',
        missedTurns: timedSeat.missedTurns,
        playerId,
      };
      state.turnDeadlineAtMs = null;
      processAutomatedTurns(state, context, actionBatch);
      break;
    }

    case 'set-connection': {
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
        if (resumeStatus === 'playing') processAutomatedTurns(state, context, actionBatch);
      }
      break;
    }

    case 'reclaim': {
      const seat = requireMember(state, command.actorUserId);
      const betweenHands = state.status === 'between-hands'
        || (state.status === 'paused' && state.resumeStatus === 'between-hands');
      if (!betweenHands && state.status !== 'complete') {
        invalid('A human can reclaim an AI-controlled seat only between hands or after a session.');
      }
      if (seat.connection !== 'online') invalid('Reconnect before reclaiming the seat.');
      if (seat.control !== 'ai') invalid('That seat is already under human control.');
      seat.control = 'human';
      seat.missedTurns = 0;
      break;
    }

    case 'next-hand': {
      const seat = requireMember(state, command.actorUserId);
      if (state.status !== 'between-hands') invalid('The room is not ready for another hand.');
      if (seat.connection !== 'online' || seat.control !== 'human') {
        throw new MultiplayerCoordinatorError('forbidden', 'Reconnect and take back the seat before dealing.');
      }
      const currentHost = state.seats.find((candidate) => candidate.playerId === state.hostPlayerId);
      const hostIsAvailable = currentHost?.kind === 'human'
        && currentHost.connection === 'online'
        && currentHost.control === 'human';
      if (hostIsAvailable && currentHost.userId !== command.actorUserId) {
        throw new MultiplayerCoordinatorError('forbidden', 'Only the available host can deal the next hand.');
      }
      if (!hostIsAvailable) {
        state.hostPlayerId = seat.playerId;
        state.seats.forEach((candidate) => {
          candidate.isHost = candidate.playerId === seat.playerId;
        });
      }
      beginNextHand(state, context, actionBatch);
      break;
    }

    case 'rematch': {
      const requester = requireMember(state, command.actorUserId);
      if (state.status !== 'complete' || !state.hand?.outcome || !state.completionReason) {
        invalid('A rematch can begin only after the session is complete.');
      }
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

      // Explicit leavers remain in the completed snapshot so everyone can see
      // final standings, then leave the table when a new session is requested.
      state.seats = state.seats.filter((seat) => (
        seat.kind === 'ai' || seat.connection === 'online' || seat.control === 'human'
      ));
      state.seats.forEach((seat) => {
        seat.missedTurns = 0;
        seat.ready = seat.kind === 'ai';
        seat.control = seat.kind === 'ai' ? 'ai' : 'human';
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
      state.resumeStatus = null;
      state.sessionNumber += 1;
      state.status = 'lobby';
      state.turnDeadlineAtMs = null;
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
      seat.connection = 'offline';
      seat.control = 'ai';
      seat.ready = false;
      transferHostAfterDeparture(state, seat.playerId);
      if (state.status === 'playing') {
        if (allHumansOffline(state)) pauseRoom(state, 'playing');
        else processAutomatedTurns(state, context, actionBatch);
      } else if (state.status === 'between-hands' && allHumansOffline(state)) {
        pauseRoom(state, 'between-hands');
      }
      break;
    }
  }

  return commandTransition(state, command, context, actionBatch, timeout);
}
