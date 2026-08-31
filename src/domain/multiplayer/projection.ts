import { getMultiwayLegalActions, type MultiwayHandState } from '../poker/multiway.ts';
import {
  MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION,
  type MultiplayerCoordinatorState,
  type MultiplayerHandArchive,
  type MultiplayerPublicTransition,
  type MultiplayerRoomSnapshot,
  type MultiplayerTransition,
  type MultiplayerViewerProjection,
} from './contracts.ts';

function redactedHand(
  hand: MultiwayHandState | null,
  viewerPlayerId: string | null,
  preserveViewerDecisionContext = false,
): MultiwayHandState | null {
  if (!hand) return null;
  const showdown = Boolean(hand.outcome?.showdown);
  const players = Object.fromEntries(hand.tablePlayerIds.map((playerId) => {
    const player = hand.players[playerId];
    if (!player) throw new Error(`Player ${playerId} is missing from the multiplayer hand.`);
    const mayReveal = viewerPlayerId !== null
      && (playerId === viewerPlayerId || (showdown && !player.folded));
    return [playerId, {
      ...player,
      holeCards: mayReveal ? [...player.holeCards] : [],
    }];
  }));

  return {
    ...hand,
    players,
    tablePlayerIds: [...hand.tablePlayerIds],
    activePlayerIds: [...hand.activePlayerIds],
    dealOrder: [...hand.dealOrder],
    preflopActionOrder: [...hand.preflopActionOrder],
    postflopActionOrder: [...hand.postflopActionOrder],
    deck: [],
    board: [...hand.board],
    actedAtBet: { ...hand.actedAtBet },
    pending: [...hand.pending],
    history: hand.history.map((record) => ({
      amount: record.amount,
      playerId: record.playerId,
      potAfter: record.potAfter,
      street: record.street,
      type: record.type,
      ...(preserveViewerDecisionContext
        && record.playerId === viewerPlayerId
        && record.decisionContext
        ? {
          decisionContext: {
            ...record.decisionContext,
            board: [...record.decisionContext.board],
            legalActions: { ...record.decisionContext.legalActions },
          },
        }
        : {}),
    })),
    outcome: hand.outcome ? {
      ...hand.outcome,
      awards: hand.outcome.awards.map((award) => ({
        ...award,
        eligiblePlayerIds: [...award.eligiblePlayerIds],
        shares: { ...award.shares },
        winnerPlayerIds: [...award.winnerPlayerIds],
      })),
      handDescriptions: hand.outcome.handDescriptions
        ? { ...hand.outcome.handDescriptions }
        : undefined,
      winnerPlayerIds: [...hand.outcome.winnerPlayerIds],
    } : undefined,
  };
}

function baseSnapshot(
  state: MultiplayerCoordinatorState,
  viewerPlayerId: string | null,
  roomCode: string,
): MultiplayerRoomSnapshot {
  return {
    completionReason: state.completionReason,
    config: { ...state.config },
    createdAtMs: state.createdAtMs,
    hand: redactedHand(state.hand, viewerPlayerId),
    hostPlayerId: state.hostPlayerId,
    nextHandAtMs: state.nextHandAtMs,
    rebuyDecisionDeadlineAtMs: state.rebuyDecisionDeadlineAtMs,
    protocolVersion: MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION,
    roomCode,
    roomId: state.roomId,
    seats: state.seats.map((seat) => ({ ...seat, userId: null })),
    sessionNumber: state.sessionNumber,
    status: state.status,
    turnDeadlineAtMs: state.turnDeadlineAtMs,
    updatedAtMs: state.updatedAtMs,
    version: state.version,
  };
}

/** Realtime-safe transition without the actor's anonymous Auth user id. */
export function createMultiplayerPublicTransition(
  transition: MultiplayerTransition,
): MultiplayerPublicTransition {
  const { actorUserId: _actorUserId, ...publicTransition } = transition;
  return publicTransition;
}

/** Realtime-safe snapshot. It contains no deck and no private hole cards. */
export function createMultiplayerPublicSnapshot(
  state: MultiplayerCoordinatorState,
): MultiplayerRoomSnapshot {
  return baseSnapshot(state, null, '');
}

/** Personalized sync response. Only the viewer's live hole cards are included. */
export function createMultiplayerViewerProjection(
  state: MultiplayerCoordinatorState,
  viewerUserId: string,
): MultiplayerViewerProjection {
  const viewerSeat = state.seats.find((seat) => seat.kind === 'human' && seat.userId === viewerUserId);
  if (!viewerSeat) throw new Error('The viewer is not a member of this multiplayer room.');
  const snapshot = baseSnapshot(state, viewerSeat.playerId, state.roomCode);
  const mayAct = state.status === 'playing'
    && viewerSeat.connection === 'online'
    && viewerSeat.control === 'human'
    && state.hand?.toAct === viewerSeat.playerId;
  return {
    ...snapshot,
    legalActions: mayAct && state.hand
      ? getMultiwayLegalActions(state.hand, viewerSeat.playerId)
      : null,
    viewerPlayerId: viewerSeat.playerId,
  };
}

/**
 * Creates the only hand shape allowed in persistent multiplayer history.
 * This archive is personalized before it crosses the private-state boundary:
 * it has no deck, never reveals folded opponents, and retains decision context
 * only for the viewer's own actions.
 */
export function createMultiplayerViewerHandArchive(
  state: MultiplayerCoordinatorState,
  viewerUserId: string,
  completedAtMs = state.updatedAtMs,
): MultiplayerHandArchive | null {
  if (!state.hand?.outcome) return null;
  const viewerSeat = state.seats.find(
    (seat) => seat.kind === 'human' && seat.userId === viewerUserId,
  );
  if (!viewerSeat) throw new Error('The archive viewer is not a member of this multiplayer room.');
  const hand = redactedHand(state.hand, viewerSeat.playerId, true);
  if (!hand) return null;
  return {
    completedAtMs,
    completionReason: state.completionReason,
    hand: {
      ...hand,
      deck: [],
      pending: [],
      toAct: null,
    },
    roomId: state.roomId,
    sessionNumber: state.sessionNumber,
    viewerPlayerId: viewerSeat.playerId,
  };
}
