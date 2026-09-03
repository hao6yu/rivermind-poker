import type { MessageKey } from '../../localization';
import type { MultiplayerSeatState, MultiplayerRoomStatus } from '../../domain/multiplayer/contracts';
import { NEXT_HAND_COUNTDOWN_MS } from '../../domain/multiplayer/coordinator';
import type { MultiwayPlayerState } from '../../domain/poker/multiway';

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * Q4 client heartbeat cadence for server-authoritative seat liveness (Slice
 * 3.11 follow-up). The server treats a seat as transport-stale when it has
 * observed no contact from its owner for MULTIPLAYER_LIVENESS_STALE_MS; the
 * beat runs every five seconds with a four-second request timeout, allowing
 * retries inside the stale window. Sustained network failure is still a
 * disconnect; this is not a guarantee against false positives. The window
 * itself has exactly one authority — the server-side coordinator.
 */
export const MULTIPLAYER_LIVENESS_HEARTBEAT_MS = 5_000;

/** Visible seconds are a projection of the canonical server deadline. */
export function multiplayerNextHandCountdownSeconds(
  nextHandAtMs: number | null,
  nowMs: number,
): number | null {
  return nextHandAtMs === null
    ? null
    : Math.min(
      NEXT_HAND_COUNTDOWN_MS / 1_000,
      Math.max(0, Math.ceil((nextHandAtMs - nowMs) / 1_000)),
    );
}

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
 * Return next hand eligibility for the viewer's own seat (scope 3.11F/R3,
 * extended by Phase 18 S3/P18-003): a CONNECTED sitting-out human with a
 * positive settled stack. Between hands the return command is legal right
 * away; during live play the client queues it and fires at the next
 * between-hands boundary, so the way back stays visible the whole hand. A
 * busted sitting-out seat must use the fixed rebuy flow; a left seat can
 * never return to the running session. The worker policy is unchanged: the
 * server still accepts the command only between hands.
 */
export function multiplayerViewerCanReturnNextHand(
  seat: MultiplayerSeatState,
  status: MultiplayerRoomStatus,
): boolean {
  return (status === 'between-hands' || status === 'playing')
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
 * P18-003: the hand-neutral player view of an occupied room seat. A seat the
 * current hand did not deal in (sitting out, disconnected, rebuy-pending,
 * left, or busted) still renders exactly one plaque built from room state:
 * the seat's identity and its authoritative settled stack. The ring can
 * never make a sat-out viewer disappear.
 */
export function multiplayerSeatHandPlayer(
  seat: MultiplayerSeatState,
): MultiwayPlayerState {
  return {
    allIn: false,
    folded: false,
    holeCards: [],
    id: seat.playerId,
    name: seat.displayName,
    position: undefined,
    seat: seat.seat,
    stack: seat.ledger?.settledStack ?? 0,
    streetBet: 0,
    totalCommitted: 0,
  };
}

/**
 * The seat plaque's status line (scope 3.11F/E; ordering corrected by Phase 18
 * S3/P18-003): explicit, localized human participation states outrank the
 * transient hand states — including at the settled boundary, where a
 * sitting-out, rebuy-pending, offline, or left seat must still name its own
 * state instead of showing nothing or a bare "Out". A human seat is never
 * shown as AI-controlled — the retired AI-control fallback is gone — and
 * permanent Left outranks folded/busted because the seat is retired for the
 * whole session, not just this hand.
 */
export function multiplayerSeatStatusBadge(
  seat: MultiplayerSeatState,
  input: MultiplayerSeatStatusInput,
  t: Translate,
): string | null {
  if (seat.participation === 'left') return t('multiplayer.game.left');
  if (seat.participation === 'rebuy-pending') return t('multiplayer.game.rebuyPending');
  if (seat.participation === 'sitting-out') return t('multiplayer.game.sittingOut');
  if (seat.participation === 'disconnected' || seat.connection === 'offline') {
    return t('multiplayer.game.offline');
  }
  if (input.handComplete) {
    return input.stack === 0 ? t('multiway.state.out') : null;
  }
  if (input.folded) return t('multiway.state.folded');
  if (input.allIn) return t('multiway.state.allIn');
  if (input.currentTurn) {
    return input.viewer ? t('multiplayer.game.yourTurn') : t('table.acting');
  }
  return null;
}
