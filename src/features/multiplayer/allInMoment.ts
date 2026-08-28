import type {
  MultiplayerPublicTransition,
  MultiplayerViewerProjection,
} from '../../domain/multiplayer/contracts';
import type { MultiwayActionRecord } from '../../domain/poker/multiway';

/**
 * Slice 3.8C: the sub-900-millisecond all-in presentation.
 *
 * The all-in flash must fire only from a *newly accepted* all-in transition
 * (the Realtime broadcast envelope), never from a snapshot replay, reconnect,
 * or sync — exactly once per seat per hand. The engine does not participate:
 * this module is a pure function of the broadcast envelope, and the presenter
 * keeps animation and sound outside the settlement await chain.
 */

export interface AllInMomentTrigger {
  displayName: string;
  handNumber: number;
  historyIndex: number;
  /** Per-seat-per-hand dedup key: `${handNumber}:${playerId}`. */
  key: string;
  playerId: string;
  seat: number;
}

export interface AllInMomentEnvelope {
  snapshot: {
    hand: MultiplayerViewerProjection['hand'];
    seats: MultiplayerViewerProjection['seats'];
    version: number;
  } | null;
  transition: MultiplayerPublicTransition | null;
}

function sameAllInAction(
  left: MultiwayActionRecord,
  right: MultiwayActionRecord,
): boolean {
  return left.playerId === right.playerId
    && left.type === right.type
    && left.amount === right.amount
    && left.street === right.street
    && left.potAfter === right.potAfter;
}

function actionIsAllIn(
  hand: NonNullable<MultiplayerViewerProjection['hand']>,
  action: MultiwayActionRecord,
  historyIndex: number,
): boolean {
  if (action.type === 'fold' || action.type === 'check') return false;
  // The all-in player cannot act again in this hand: the flash must fire on
  // the decisive wager, not on a later street continuation.
  const laterActionByPlayer = hand.history
    .slice(Math.max(0, historyIndex) + 1)
    .some((candidate) => candidate.playerId === action.playerId);
  return !laterActionByPlayer && hand.players[action.playerId]?.allIn === true;
}

/**
 * Detects all-in presentations in a broadcast envelope. Only the pair
 * `(snapshot, transition)` the Realtime channel delivers together is
 * authoritative: the transition's actions must appear in the snapshot's hand
 * history at the same version, or the broadcast is ignored (delayed or
 * replayed). Presented keys are never re-emitted.
 */
export function detectAllInMoments(input: {
  envelope: AllInMomentEnvelope;
  presentedKeys: ReadonlySet<string>;
}): AllInMomentTrigger[] {
  const { envelope, presentedKeys } = input;
  const hand = envelope.snapshot?.hand ?? null;
  const transition = envelope.transition;
  if (!hand || !transition) return [];
  // The envelope pairs the transition with the snapshot at the SAME version;
  // anything else is a replay or a laggard broadcast.
  if (transition.version !== envelope.snapshot?.version) return [];
  const triggers: AllInMomentTrigger[] = [];
  for (const publicAction of transition.actionBatch) {
    const action = publicAction as MultiwayActionRecord;
    if (action.type === 'fold' || action.type === 'check') continue;
    const historyIndex = hand.history.findIndex((candidate) => (
      sameAllInAction(candidate, action)
    ));
    if (historyIndex < 0) continue;
    if (!actionIsAllIn(hand, action, historyIndex)) continue;
    const key = `${hand.handNumber}:${action.playerId}`;
    if (presentedKeys.has(key)) continue;
    const seat = envelope.snapshot?.seats.find((candidate) => (
      candidate.playerId === action.playerId
    ));
    if (!seat) continue;
    triggers.push({
      displayName: seat.displayName,
      handNumber: hand.handNumber,
      historyIndex,
      key,
      playerId: action.playerId,
      seat: seat.seat,
    });
  }
  return triggers;
}
