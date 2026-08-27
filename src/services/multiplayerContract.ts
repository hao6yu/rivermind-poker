import type {
  MultiplayerHandArchive,
  MultiplayerPublicAction,
  MultiplayerPublicTransition,
  MultiplayerRoomConfig,
  MultiplayerRoomSnapshot,
  MultiplayerSeatState,
  MultiplayerTimeoutResult,
  MultiplayerViewerProjection,
} from '../domain/multiplayer/contracts';
import {
  isValidPlayerDisplayName,
  type HumanAvatarSnapshot,
  validateHumanAvatarSnapshot,
} from '../domain/playerProfile';
import type { AiDifficulty } from '../domain/poker/aiProfiles';
import { MULTIWAY_AI_IDENTITIES } from '../domain/poker/multiwayAiProfiles';
import type {
  MultiwayActionRecord,
  MultiwayDecisionContext,
  MultiwayHandOutcome,
  MultiwayHandState,
  MultiwayLegalActions,
  MultiwayPlayerState,
  MultiwayPotAward,
  TablePosition,
} from '../domain/poker/multiway';
import type { Card, Street } from '../domain/poker/types';

export interface MultiplayerRoomEnvelope {
  duplicate?: boolean;
  left?: boolean;
  roomCode?: string;
  roomId: string;
  snapshot: MultiplayerViewerProjection | MultiplayerRoomSnapshot;
  transition?: MultiplayerPublicTransition;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function containsOwnKey(
  value: unknown,
  target: string,
  seen = new WeakSet<object>(),
): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsOwnKey(item, target, seen));
  }
  const source = value as Record<string, unknown>;
  return hasOwn(source, target)
    || Object.values(source).some((item) => containsOwnKey(item, target, seen));
}

function stringValue(value: unknown, allowEmpty = false): string | null {
  return typeof value === 'string' && (allowEmpty || value.trim().length > 0) ? value : null;
}

function finiteNumber(value: unknown, minimum?: number): number | null {
  return typeof value === 'number'
    && Number.isFinite(value)
    && (minimum === undefined || value >= minimum)
    ? value
    : null;
}

function safeInteger(value: unknown, minimum?: number, maximum?: number): number | null {
  return Number.isSafeInteger(value)
    && (minimum === undefined || (value as number) >= minimum)
    && (maximum === undefined || (value as number) <= maximum)
    ? value as number
    : null;
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
): Values[number] | null {
  return typeof value === 'string' && allowed.includes(value) ? value as Values[number] : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result = value.map((item) => stringValue(item));
  return result.every((item): item is string => item !== null) ? result : null;
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const ACTION_STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
const ACTION_TYPES = ['fold', 'check', 'call', 'raise'] as const;
const AI_DIFFICULTIES = ['friendly', 'club', 'sharp', 'elite', 'nemesis'] as const;
const COMPLETION_REASONS = ['hand-limit', 'last-player-standing'] as const;
const CONNECTION_STATES = ['online', 'offline'] as const;
const POSITIONS = ['BTN/SB', 'BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'] as const;
const ROOM_STATUSES = ['lobby', 'playing', 'between-hands', 'paused', 'complete'] as const;
const STREETS = [...ACTION_STREETS, 'complete'] as const;
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
const TRANSITION_KINDS = [
  'join',
  'add-ai',
  'remove-ai',
  'set-ready',
  'start',
  'action',
  'tick',
  'set-connection',
  'reclaim',
  'next-hand',
  'rematch',
  'leave',
] as const;

const MULTIPLAYER_AI_NAMES = new Set(
  MULTIWAY_AI_IDENTITIES.map((identity) => identity.name),
);

function isSafePublicPlayerName(value: string): boolean {
  return isValidPlayerDisplayName(value) || MULTIPLAYER_AI_NAMES.has(value);
}

function card(value: unknown): Card | null {
  const source = record(value);
  const rank = safeInteger(source?.rank, 2, 14);
  const suit = enumValue(source?.suit, SUITS);
  return source && rank !== null && suit ? { rank: rank as Card['rank'], suit } : null;
}

function cards(value: unknown): Card[] | null {
  if (!Array.isArray(value)) return null;
  const result = value.map(card);
  return result.every((item): item is Card => item !== null) ? result : null;
}

function legalActions(value: unknown): MultiwayLegalActions | null {
  const source = record(value);
  const toCall = safeInteger(source?.toCall, 0);
  const minRaiseTo = safeInteger(source?.minRaiseTo, 0);
  const maxRaiseTo = safeInteger(source?.maxRaiseTo, 0);
  const suggestedRaiseTo = safeInteger(source?.suggestedRaiseTo, 0);
  if (
    !source
    || typeof source.canFold !== 'boolean'
    || typeof source.canCheck !== 'boolean'
    || typeof source.canCall !== 'boolean'
    || typeof source.canRaise !== 'boolean'
    || typeof source.raiseReopened !== 'boolean'
    || toCall === null
    || minRaiseTo === null
    || maxRaiseTo === null
    || suggestedRaiseTo === null
  ) return null;
  return {
    canCall: source.canCall,
    canCheck: source.canCheck,
    canFold: source.canFold,
    canRaise: source.canRaise,
    maxRaiseTo,
    minRaiseTo,
    raiseReopened: source.raiseReopened,
    suggestedRaiseTo,
    toCall,
  };
}

function roomConfig(value: unknown): MultiplayerRoomConfig | null {
  const source = record(value);
  const aiDifficulty = enumValue(source?.aiDifficulty, AI_DIFFICULTIES);
  const bigBlindChips = safeInteger(source?.bigBlindChips, 1);
  const seatCount = safeInteger(source?.seatCount);
  const smallBlindChips = safeInteger(source?.smallBlindChips, 1);
  const startingStackChips = safeInteger(source?.startingStackChips, 1);
  const turnSeconds = safeInteger(source?.turnSeconds);
  const handTarget = source?.handTarget;
  if (
    !source
    || !aiDifficulty
    || bigBlindChips === null
    || ![2, 3, 6].includes(seatCount ?? -1)
    || smallBlindChips === null
    || smallBlindChips > bigBlindChips
    || startingStackChips === null
    || startingStackChips < bigBlindChips
    || ![30, 45, 60].includes(turnSeconds ?? -1)
    || ![5, 10, 'open'].includes(handTarget as string | number)
  ) return null;
  return {
    aiDifficulty: aiDifficulty as AiDifficulty,
    bigBlindChips,
    handTarget: handTarget as MultiplayerRoomConfig['handTarget'],
    seatCount: seatCount as MultiplayerRoomConfig['seatCount'],
    smallBlindChips,
    startingStackChips,
    turnSeconds: turnSeconds as MultiplayerRoomConfig['turnSeconds'],
  };
}

function seatState(value: unknown, seatCount: number): MultiplayerSeatState | null {
  const source = record(value);
  const aiProfileId = source?.aiProfileId === null ? null : stringValue(source?.aiProfileId);
  const connection = enumValue(source?.connection, CONNECTION_STATES);
  const control = enumValue(source?.control, ['human', 'ai'] as const);
  const displayName = stringValue(source?.displayName);
  const joinedAtMs = finiteNumber(source?.joinedAtMs, 0);
  const kind = enumValue(source?.kind, ['human', 'ai'] as const);
  const missedTurns = safeInteger(source?.missedTurns, 0);
  const playerId = stringValue(source?.playerId);
  const seat = safeInteger(source?.seat, 0, seatCount - 1);
  // A human avatar is a bounded reference, so an untrusted/malformed snapshot is
  // safely coerced to null (presentation falls back to initials) rather than
  // dropped: it can never leak or crash the seat.
  // A human avatar is a bounded reference, so an untrusted/malformed snapshot is
  // safely coerced to null (presentation falls back to initials) rather than
  // dropped: it can never leak or crash the seat.
  const rawAvatar = source?.avatar as HumanAvatarSnapshot | null | undefined;
  const avatar = (rawAvatar !== null && rawAvatar !== undefined
    && validateHumanAvatarSnapshot(rawAvatar))
    ? rawAvatar
    : null;
  if (
    !source
    || (source.aiProfileId !== null && aiProfileId === null)
    || !connection
    || !control
    || !displayName
    || typeof source.isHost !== 'boolean'
    || joinedAtMs === null
    || !kind
    || (kind === 'human' && (aiProfileId !== null || !isValidPlayerDisplayName(displayName)))
    || (kind === 'ai' && (aiProfileId === null || !MULTIPLAYER_AI_NAMES.has(displayName)))
    || missedTurns === null
    || !playerId
    || typeof source.ready !== 'boolean'
    || seat === null
    // Personalized and public projections deliberately replace every auth id with null.
    || source.userId !== null
  ) return null;
  return {
    aiProfileId,
    avatar,
    connection,
    control,
    displayName,
    isHost: source.isHost,
    joinedAtMs,
    kind,
    missedTurns,
    playerId,
    ready: source.ready,
    seat,
    userId: null,
  };
}

function publicAction(value: unknown): MultiplayerPublicAction | null {
  const source = record(value);
  const amount = safeInteger(source?.amount, 0);
  const playerId = stringValue(source?.playerId);
  const potAfter = safeInteger(source?.potAfter, 0);
  const street = enumValue(source?.street, ACTION_STREETS);
  const type = enumValue(source?.type, ACTION_TYPES);
  if (!source || amount === null || !playerId || potAfter === null || !street || !type) return null;
  return { amount, playerId, potAfter, street, type };
}

function timeoutResult(value: unknown): MultiplayerTimeoutResult | null {
  const source = record(value);
  const action = enumValue(source?.action, ['check', 'fold'] as const);
  const missedTurns = safeInteger(source?.missedTurns, 0);
  const playerId = stringValue(source?.playerId);
  if (!source || !action || typeof source.aiTookOver !== 'boolean' || missedTurns === null || !playerId) {
    return null;
  }
  return { action, aiTookOver: source.aiTookOver, missedTurns, playerId };
}

function publicTransition(value: unknown): MultiplayerPublicTransition | null {
  const source = record(value);
  if (!source || containsOwnKey(source, 'decisionContext') || !Array.isArray(source.actionBatch)) {
    return null;
  }
  const actionBatch = source.actionBatch.map(publicAction);
  const acceptedAtMs = finiteNumber(source.acceptedAtMs, 0);
  const commandId = stringValue(source.commandId);
  const kind = enumValue(source.kind, TRANSITION_KINDS);
  const timeout = source.timeout === null ? null : timeoutResult(source.timeout);
  const version = safeInteger(source.version, 0);
  if (
    !actionBatch.every((item): item is MultiplayerPublicAction => item !== null)
    || acceptedAtMs === null
    || !commandId
    || !kind
    || (source.timeout !== null && timeout === null)
    || version === null
  ) return null;
  return { acceptedAtMs, actionBatch, commandId, kind, timeout, version };
}

function playerState(value: unknown): MultiwayPlayerState | null {
  const source = record(value);
  const allIn = source?.allIn;
  const folded = source?.folded;
  const holeCards = cards(source?.holeCards);
  const id = stringValue(source?.id);
  const name = stringValue(source?.name);
  const position = source?.position === undefined
    ? undefined
    : enumValue(source.position, POSITIONS);
  const seat = safeInteger(source?.seat, 0, 5);
  const stack = safeInteger(source?.stack, 0);
  const streetBet = safeInteger(source?.streetBet, 0);
  const totalCommitted = safeInteger(source?.totalCommitted, 0);
  if (
    !source
    || typeof allIn !== 'boolean'
    || typeof folded !== 'boolean'
    || !holeCards
    || !id
    || !name
    || position === null
    || seat === null
    || stack === null
    || streetBet === null
    || totalCommitted === null
  ) return null;
  return {
    allIn,
    folded,
    holeCards,
    id,
    name,
    ...(position ? { position: position as TablePosition } : {}),
    seat,
    stack,
    streetBet,
    totalCommitted,
  };
}

function stringNumberRecord(value: unknown, nullable: false): Record<string, number> | null;
function stringNumberRecord(value: unknown, nullable: true): Record<string, number | null> | null;
function stringNumberRecord(
  value: unknown,
  nullable: boolean,
): Record<string, number | null> | null {
  const source = record(value);
  if (!source) return null;
  const entries: Array<[string, number | null]> = [];
  for (const [key, raw] of Object.entries(source)) {
    if (!stringValue(key)) return null;
    if (nullable && raw === null) {
      entries.push([key, null]);
      continue;
    }
    const parsed = safeInteger(raw, 0);
    if (parsed === null) return null;
    entries.push([key, parsed]);
  }
  return Object.fromEntries(entries);
}

function stringStringRecord(value: unknown): Record<string, string> | null {
  const source = record(value);
  if (!source) return null;
  const entries: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(source)) {
    const parsed = stringValue(raw, true);
    if (!stringValue(key) || parsed === null) return null;
    entries.push([key, parsed]);
  }
  return Object.fromEntries(entries);
}

function potAward(value: unknown): MultiwayPotAward | null {
  const source = record(value);
  const amount = safeInteger(source?.amount, 0);
  const contributionCap = safeInteger(source?.contributionCap, 0);
  const eligiblePlayerIds = stringArray(source?.eligiblePlayerIds);
  const kind = enumValue(source?.kind, ['main', 'side'] as const);
  const shares = stringNumberRecord(source?.shares, false);
  const winnerPlayerIds = stringArray(source?.winnerPlayerIds);
  if (
    !source
    || amount === null
    || contributionCap === null
    || !eligiblePlayerIds
    || !kind
    || !shares
    || !winnerPlayerIds
  ) return null;
  return { amount, contributionCap, eligiblePlayerIds, kind, shares, winnerPlayerIds };
}

function handOutcome(value: unknown): MultiwayHandOutcome | null {
  const source = record(value);
  if (!source || !Array.isArray(source.awards)) return null;
  const awards = source.awards.map(potAward);
  const handDescriptions = source.handDescriptions === undefined
    ? undefined
    : stringStringRecord(source.handDescriptions);
  const totalPot = safeInteger(source.totalPot, 0);
  const winnerPlayerIds = stringArray(source.winnerPlayerIds);
  if (
    !awards.every((item): item is MultiwayPotAward => item !== null)
    || (source.handDescriptions !== undefined && handDescriptions === null)
    || typeof source.showdown !== 'boolean'
    || totalPot === null
    || !winnerPlayerIds
  ) return null;
  return {
    awards,
    ...(handDescriptions ? { handDescriptions } : {}),
    showdown: source.showdown,
    totalPot,
    winnerPlayerIds,
  };
}

function optionalSafeInteger(
  source: Record<string, unknown>,
  key: string,
  minimum = 0,
): number | undefined | null {
  return source[key] === undefined ? undefined : safeInteger(source[key], minimum);
}

function optionalFiniteNumber(
  source: Record<string, unknown>,
  key: string,
): number | undefined | null {
  return source[key] === undefined ? undefined : finiteNumber(source[key]);
}

function decisionContext(value: unknown): MultiwayDecisionContext | null {
  const source = record(value);
  const board = cards(source?.board);
  const currentBet = safeInteger(source?.currentBet, 0);
  const effectiveStack = safeInteger(source?.effectiveStack, 0);
  const estimatedEquity = source ? optionalFiniteNumber(source, 'estimatedEquity') : null;
  const initiative = enumValue(source?.initiative, ['player', 'opponent', 'none'] as const);
  const legal = legalActions(source?.legalActions);
  const limperCount = safeInteger(source?.limperCount, 0);
  const opponentCount = safeInteger(source?.opponentCount, 0);
  const playerCount = safeInteger(source?.playerCount, 1);
  const playersBehind = safeInteger(source?.playersBehind, 0);
  const playerStackBefore = safeInteger(source?.playerStackBefore, 0);
  const playerStreetBetBefore = safeInteger(source?.playerStreetBetBefore, 0);
  const position = source?.position === undefined
    ? undefined
    : enumValue(source.position, POSITIONS);
  const potBefore = safeInteger(source?.potBefore, 0);
  const preflopCallersAfterRaise = source
    ? optionalSafeInteger(source, 'preflopCallersAfterRaise')
    : null;
  const preflopFacing = enumValue(source?.preflopFacing, ['unopened', 'limped', 'raised'] as const);
  const preflopRaiseCount = source ? optionalSafeInteger(source, 'preflopRaiseCount') : null;
  const preflopRaiserPosition = source?.preflopRaiserPosition === undefined
    ? undefined
    : enumValue(source.preflopRaiserPosition, POSITIONS);
  const toCall = safeInteger(source?.toCall, 0);
  const tournamentPressureLabel = source?.tournamentPressureLabel === undefined
    ? undefined
    : stringValue(source.tournamentPressureLabel, true);
  const tournamentRiskPremium = source ? optionalFiniteNumber(source, 'tournamentRiskPremium') : null;
  if (
    !source
    || !board
    || board.length > 5
    || currentBet === null
    || effectiveStack === null
    || estimatedEquity === null
    || (estimatedEquity !== undefined && (estimatedEquity < 0 || estimatedEquity > 1))
    || !initiative
    || !legal
    || limperCount === null
    || opponentCount === null
    || playerCount === null
    || playersBehind === null
    || playerStackBefore === null
    || playerStreetBetBefore === null
    || position === null
    || potBefore === null
    || preflopCallersAfterRaise === null
    || !preflopFacing
    || preflopRaiseCount === null
    || preflopRaiserPosition === null
    || toCall === null
    || tournamentPressureLabel === null
    || tournamentRiskPremium === null
  ) return null;
  return {
    board,
    currentBet,
    effectiveStack,
    ...(estimatedEquity === undefined ? {} : { estimatedEquity }),
    initiative,
    legalActions: legal,
    limperCount,
    opponentCount,
    playerCount,
    playersBehind,
    playerStackBefore,
    playerStreetBetBefore,
    ...(position ? { position: position as TablePosition } : {}),
    potBefore,
    ...(preflopCallersAfterRaise === undefined ? {} : { preflopCallersAfterRaise }),
    preflopFacing,
    ...(preflopRaiseCount === undefined ? {} : { preflopRaiseCount }),
    ...(preflopRaiserPosition ? {
      preflopRaiserPosition: preflopRaiserPosition as TablePosition,
    } : {}),
    toCall,
    ...(tournamentPressureLabel === undefined ? {} : { tournamentPressureLabel }),
    ...(tournamentRiskPremium === undefined ? {} : { tournamentRiskPremium }),
  };
}

function actionRecord(
  value: unknown,
  decisionContextPlayerId: string | null = null,
): MultiwayActionRecord | null {
  const source = record(value);
  const action = publicAction(value);
  if (!source || !action) return null;
  if (!hasOwn(source, 'decisionContext')) return { ...action };
  if (action.playerId !== decisionContextPlayerId) return null;
  const context = decisionContext(source.decisionContext);
  return context ? { ...action, decisionContext: context } : null;
}

function referencesKnownPlayers(ids: readonly string[], players: Record<string, MultiwayPlayerState>): boolean {
  return ids.every((id) => hasOwn(players, id));
}

function handState(
  value: unknown,
  viewerPlayerId: string | null,
  preserveViewerDecisionContext = false,
): MultiwayHandState | null {
  const source = record(value);
  if (!source || (!preserveViewerDecisionContext && containsOwnKey(source, 'decisionContext'))) {
    return null;
  }
  const rawPlayers = record(source.players);
  if (!rawPlayers) return null;
  const playerEntries: Array<[string, MultiwayPlayerState]> = [];
  for (const [playerId, rawPlayer] of Object.entries(rawPlayers)) {
    const player = playerState(rawPlayer);
    if (!player || player.id !== playerId) return null;
    playerEntries.push([playerId, player]);
  }
  const players = Object.fromEntries(playerEntries);
  const activePlayerIds = stringArray(source.activePlayerIds);
  const actedAtBet = stringNumberRecord(source.actedAtBet, true);
  const bigBlind = safeInteger(source.bigBlind, 1);
  const bigBlindPlayerId = stringValue(source.bigBlindPlayerId);
  const board = cards(source.board);
  const buttonPlayerId = stringValue(source.buttonPlayerId);
  const buttonSeat = safeInteger(source.buttonSeat, 0, 5);
  const currentBet = safeInteger(source.currentBet, 0);
  const dealOrder = stringArray(source.dealOrder);
  const deck = cards(source.deck);
  const handNumber = safeInteger(source.handNumber, 1);
  const history = Array.isArray(source.history)
    ? source.history.map((action) => actionRecord(
      action,
      preserveViewerDecisionContext ? viewerPlayerId : null,
    ))
    : null;
  const lastFullRaise = safeInteger(source.lastFullRaise, 0);
  const outcome = source.outcome === undefined ? undefined : handOutcome(source.outcome);
  const pending = stringArray(source.pending);
  const postflopActionOrder = stringArray(source.postflopActionOrder);
  const pot = safeInteger(source.pot, 0);
  const preflopActionOrder = stringArray(source.preflopActionOrder);
  const smallBlind = safeInteger(source.smallBlind, 1);
  const smallBlindPlayerId = stringValue(source.smallBlindPlayerId);
  const street = enumValue(source.street, STREETS);
  const tablePlayerIds = stringArray(source.tablePlayerIds);
  const toAct = source.toAct === null ? null : stringValue(source.toAct);
  if (
    !activePlayerIds
    || !actedAtBet
    || bigBlind === null
    || !bigBlindPlayerId
    || !board
    || board.length > 5
    || !buttonPlayerId
    || buttonSeat === null
    || currentBet === null
    || !dealOrder
    || !deck
    || deck.length !== 0
    || handNumber === null
    || !history
    || !history.every((item): item is MultiwayActionRecord => item !== null)
    || lastFullRaise === null
    || (source.outcome !== undefined && outcome === null)
    || !pending
    || !postflopActionOrder
    || pot === null
    || !preflopActionOrder
    || smallBlind === null
    || !smallBlindPlayerId
    || !street
    || !tablePlayerIds
    || (source.toAct !== null && toAct === null)
    || !hasUniqueValues(tablePlayerIds)
    || tablePlayerIds.length < 2
    || tablePlayerIds.length > 6
    || tablePlayerIds.length !== playerEntries.length
    || !tablePlayerIds.every((id) => hasOwn(players, id))
    || !hasUniqueValues(activePlayerIds)
    || !referencesKnownPlayers(activePlayerIds, players)
    || !referencesKnownPlayers(dealOrder, players)
    || !referencesKnownPlayers(preflopActionOrder, players)
    || !referencesKnownPlayers(postflopActionOrder, players)
    || !referencesKnownPlayers(pending, players)
    || (toAct !== null && !hasOwn(players, toAct))
    || !hasOwn(players, buttonPlayerId)
    || !hasOwn(players, smallBlindPlayerId)
    || !hasOwn(players, bigBlindPlayerId)
    || !Object.keys(actedAtBet).every((id) => hasOwn(players, id))
    || !history.every((action) => hasOwn(players, action.playerId))
    || (outcome !== undefined && (
      street !== 'complete'
      || toAct !== null
      || pending.length > 0
    ))
    || (street === 'complete' && outcome === undefined)
  ) return null;

  const showdown = outcome?.showdown === true;
  for (const player of Object.values(players)) {
    if (player.holeCards.length !== 0 && player.holeCards.length !== 2) return null;
    const maySeeCards = viewerPlayerId !== null
      && (player.id === viewerPlayerId || (showdown && !player.folded));
    if (!maySeeCards && player.holeCards.length > 0) return null;
  }

  return {
    activePlayerIds,
    actedAtBet,
    bigBlind,
    bigBlindPlayerId,
    board,
    buttonPlayerId,
    buttonSeat,
    currentBet,
    dealOrder,
    deck: [],
    handNumber,
    history,
    lastFullRaise,
    ...(outcome ? { outcome } : {}),
    pending,
    players,
    postflopActionOrder,
    pot,
    preflopActionOrder,
    smallBlind,
    smallBlindPlayerId,
    street: street as Street,
    tablePlayerIds,
    toAct,
  };
}

function roomSnapshot(value: unknown): MultiplayerViewerProjection | MultiplayerRoomSnapshot | null {
  const source = record(value);
  if (!source) return null;
  const personalized = hasOwn(source, 'viewerPlayerId') || hasOwn(source, 'legalActions');
  if (personalized && (!hasOwn(source, 'viewerPlayerId') || !hasOwn(source, 'legalActions'))) return null;
  const viewerPlayerId = personalized ? stringValue(source.viewerPlayerId) : null;
  const completionReason = source.completionReason === undefined || source.completionReason === null
    ? null
    : enumValue(source.completionReason, COMPLETION_REASONS);
  const config = roomConfig(source.config);
  const createdAtMs = finiteNumber(source.createdAtMs, 0);
  const hand = source.hand === null ? null : handState(source.hand, viewerPlayerId);
  const hostPlayerId = stringValue(source.hostPlayerId, true);
  const roomCode = stringValue(source.roomCode, true);
  const roomId = stringValue(source.roomId);
  const sessionNumber = source.sessionNumber === undefined ? 1 : safeInteger(source.sessionNumber, 1);
  const status = enumValue(source.status, ROOM_STATUSES);
  const turnDeadlineAtMs = source.turnDeadlineAtMs === null
    ? null
    : finiteNumber(source.turnDeadlineAtMs, 0);
  const updatedAtMs = finiteNumber(source.updatedAtMs, 0);
  const version = safeInteger(source.version, 0);
  if (
    viewerPlayerId === null && personalized
    || (source.completionReason !== undefined && source.completionReason !== null && !completionReason)
    || !config
    || createdAtMs === null
    || (source.hand !== null && hand === null)
    || hostPlayerId === null
    || roomCode === null
    || (personalized ? !(roomCode === '' || /^\d{6}$/.test(roomCode)) : roomCode !== '')
    || !roomId
    || sessionNumber === null
    || !status
    || (source.turnDeadlineAtMs !== null && turnDeadlineAtMs === null)
    || updatedAtMs === null
    || version === null
    || !Array.isArray(source.seats)
  ) return null;
  const seats = source.seats.map((seat) => seatState(seat, config.seatCount));
  if (
    !seats.every((seat): seat is MultiplayerSeatState => seat !== null)
    || new Set(seats.map((seat) => seat.seat)).size !== seats.length
    || new Set(seats.map((seat) => seat.playerId)).size !== seats.length
    || (hostPlayerId !== '' && !seats.some((seat) => seat.playerId === hostPlayerId))
    || (viewerPlayerId !== null && !seats.some((seat) => (
      seat.playerId === viewerPlayerId && seat.kind === 'human'
    )))
    || (hand !== null && !hand.tablePlayerIds.every((playerId) => {
      const player = hand.players[playerId];
      const seat = seats.find((candidate) => candidate?.playerId === playerId);
      return player && seat && player.name === seat.displayName;
    }))
  ) return null;

  const base: MultiplayerRoomSnapshot = {
    completionReason,
    config,
    createdAtMs,
    hand,
    hostPlayerId,
    roomCode,
    roomId,
    seats,
    sessionNumber,
    status,
    turnDeadlineAtMs,
    updatedAtMs,
    version,
  };
  if (!personalized || !viewerPlayerId) return base;
  const parsedLegalActions = source.legalActions === null ? null : legalActions(source.legalActions);
  const viewerSeat = seats.find((seat) => seat.playerId === viewerPlayerId);
  if (
    (source.legalActions !== null && parsedLegalActions === null)
    || (parsedLegalActions !== null && (
      status !== 'playing'
      || hand?.toAct !== viewerPlayerId
      || viewerSeat?.connection !== 'online'
      || viewerSeat.control !== 'human'
    ))
  ) return null;
  return { ...base, legalActions: parsedLegalActions, viewerPlayerId };
}

export function parseMultiplayerRoomEnvelope(value: unknown): MultiplayerRoomEnvelope | null {
  const source = record(value);
  const snapshot = roomSnapshot(source?.snapshot);
  const roomId = typeof source?.roomId === 'string' && source.roomId.trim().length > 0
    ? source.roomId
    : snapshot?.roomId ?? null;
  const transition = source?.transition === undefined ? undefined : publicTransition(source.transition);
  const duplicate = source?.duplicate === undefined ? undefined : source.duplicate;
  const left = source?.left === undefined ? undefined : source.left;
  const envelopeRoomCode = source?.roomCode === undefined ? undefined : stringValue(source.roomCode);
  if (
    !source
    || !roomId
    || !snapshot
    || snapshot.roomId !== roomId
    || transition === null
    || (duplicate !== undefined && typeof duplicate !== 'boolean')
    || (left !== undefined && typeof left !== 'boolean')
    || (source.roomCode !== undefined && (!envelopeRoomCode || !/^\d{6}$/.test(envelopeRoomCode)))
    || (envelopeRoomCode !== undefined && !isPersonalizedMultiplayerSnapshot(snapshot))
    || (left === true && isPersonalizedMultiplayerSnapshot(snapshot))
    || (transition !== undefined && (
      transition.version > snapshot.version
      || (duplicate !== true && transition.version !== snapshot.version)
    ))
  ) return null;

  return {
    duplicate,
    left,
    roomCode: envelopeRoomCode ?? undefined,
    roomId,
    snapshot,
    transition,
  };
}

export function parseMultiplayerHandHistoryEnvelope(
  value: unknown,
): MultiplayerHandArchive[] | null {
  const source = record(value);
  if (!source || !Array.isArray(source.history)) return null;
  const history = source.history.map((value): MultiplayerHandArchive | null => {
    const archive = record(value);
    const completedAtMs = finiteNumber(archive?.completedAtMs, 0);
    const completionReason = archive?.completionReason === null
      ? null
      : enumValue(archive?.completionReason, COMPLETION_REASONS);
    const roomId = stringValue(archive?.roomId);
    const sessionNumber = safeInteger(archive?.sessionNumber, 1);
    const viewerPlayerId = stringValue(archive?.viewerPlayerId);
    const hand = viewerPlayerId
      ? handState(archive?.hand, viewerPlayerId, true)
      : null;
    if (
      !archive
      || completedAtMs === null
      || (archive.completionReason !== null && completionReason === null)
      || !roomId
      || sessionNumber === null
      || !viewerPlayerId
      || !hand
      || !hasOwn(hand.players, viewerPlayerId)
      || !Object.values(hand.players).every((player) => isSafePublicPlayerName(player.name))
      || hand.street !== 'complete'
      || hand.toAct !== null
      || hand.pending.length > 0
      || !hand.outcome
    ) return null;
    return {
      completedAtMs,
      completionReason,
      hand,
      roomId,
      sessionNumber,
      viewerPlayerId,
    };
  });
  return history.every((archive): archive is MultiplayerHandArchive => archive !== null)
    ? history
    : null;
}

/** Database Broadcast callbacks wrap the room envelope in a `payload` field. */
export function parseMultiplayerBroadcastEnvelope(value: unknown): MultiplayerRoomEnvelope | null {
  const source = record(value);
  const envelope = parseMultiplayerRoomEnvelope(source?.payload ?? value);
  if (!envelope || isPersonalizedMultiplayerSnapshot(envelope.snapshot)) return null;
  return envelope;
}

export function isPersonalizedMultiplayerSnapshot(
  snapshot: MultiplayerViewerProjection | MultiplayerRoomSnapshot,
): snapshot is MultiplayerViewerProjection {
  return 'viewerPlayerId' in snapshot
    && typeof snapshot.viewerPlayerId === 'string'
    && 'legalActions' in snapshot;
}
