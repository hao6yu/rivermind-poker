import type { MessageKey } from '../../localization';
import type { MultiplayerSeatState, MultiplayerRoomStatus } from '../../domain/multiplayer/contracts';

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * Q4 client heartbeat cadence for server-authoritative seat liveness (Slice
 * 3.11 follow-up). The server treats a seat as transport-stale when it has
 * observed no contact from its owner for MULTIPLAYER_LIVENESS_STALE_MS; the
 * beat runs at 3x that redundancy so one dropped request (or one slow
 * network) can never stale-fold an attentive player. The staleness window
 * itself has exactly one authority — the server-side coordinator.
 */
export const MULTIPLAYER_LIVENESS_HEARTBEAT_MS = 5_000;

/**
 * Active funded seats for the between-hands stall decision (scope 3.11F/R3):
 * seats that are dealt into the next hand AND hold chips. Disconnected,
 * sitting-out, left, and busted seats wait for a return or rebuy instead.
 */
export function multiplayerActiveFundedSeatCount(seats: readonly MultiplayerSeatState[]): number {
  return seats.filter((seat) => (
    (seat.participation === undefined || seat.participation === 'active')
    && (seat.ledger?.settledStack ?? 0) > 0
  )).length;
}

/**
 * True while a between-hands room has no deal countdown armed and fewer than
 * two active funded participants: the room is stalled, waiting for a human
 * who can return (reconnect, Return next hand, or Rebuy). The host may end
 * such a session explicitly; the coordinator completes
 * `last-player-standing` only when nobody can return.
 */
export function multiplayerStalledBetweenHands(
  status: MultiplayerRoomStatus,
  nextHandAtMs: number | null,
  seats: readonly MultiplayerSeatState[],
): boolean {
  return status === 'between-hands'
    && nextHandAtMs === null
    && multiplayerActiveFundedSeatCount(seats) < 2;
}

/**
 * Q5: honest between-hands copy. A stalled room (no countdown because fewer
 * than two active funded humans remain and someone can still return) must
 * not be labelled as a merely paused countdown — nothing is waiting on the
 * host's pause button, the table is waiting on PLAYERS. A genuine host pause
 * (or any other un-armed countdown on a healthy room) keeps the paused copy.
 */
export function multiplayerSettledCountdownCopy(
  stalled: boolean,
): 'multiplayer.game.countdownPaused' | 'multiplayer.game.waitingForPlayers' {
  return stalled ? 'multiplayer.game.waitingForPlayers' : 'multiplayer.game.countdownPaused';
}

/**
 * Return next hand eligibility for the viewer's own seat (scope 3.11F/R3):
 * a CONNECTED sitting-out human with a positive settled stack, between
 * hands. A busted sitting-out seat must use the fixed rebuy flow; a left
 * seat can never return to the running session.
 */
export function multiplayerViewerCanReturnNextHand(
  seat: MultiplayerSeatState,
  status: MultiplayerRoomStatus,
): boolean {
  return status === 'between-hands'
    && seat.kind === 'human'
    && seat.participation === 'sitting-out'
    && seat.connection === 'online'
    && seat.control === 'human'
    && (seat.ledger?.settledStack ?? 0) > 0;
}

export interface MultiplayerSeatStatusInput {
  allIn: boolean;
  currentTurn: boolean;
  folded: boolean;
  handComplete: boolean;
  stack: number;
  viewer: boolean;
}

/**
 * The seat plaque's status line (scope 3.11F/E): explicit, localized human
 * participation states outrank the transient hand states. A human seat is
 * never shown as AI-controlled — the retired AI-control fallback is gone —
 * and permanent Left outranks folded/busted because the seat is retired for
 * the whole session, not just this hand.
 */
export function multiplayerSeatStatusBadge(
  seat: MultiplayerSeatState,
  input: MultiplayerSeatStatusInput,
  t: Translate,
): string | null {
  if (seat.participation === 'left') return t('multiplayer.game.left');
  if (input.handComplete) {
    return input.stack === 0 ? t('multiway.state.out') : null;
  }
  if (seat.participation === 'rebuy-pending') return t('multiplayer.game.rebuyPending');
  if (seat.participation === 'sitting-out') return t('multiplayer.game.sittingOut');
  if (seat.participation === 'disconnected' || seat.connection === 'offline') {
    return t('multiplayer.game.offline');
  }
  if (input.folded) return t('multiway.state.folded');
  if (input.allIn) return t('multiway.state.allIn');
  if (input.currentTurn) {
    return input.viewer ? t('multiplayer.game.yourTurn') : t('table.acting');
  }
  return null;
}
