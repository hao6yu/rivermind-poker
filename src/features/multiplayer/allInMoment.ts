import type {
  MultiplayerPublicTransition,
  MultiplayerViewerProjection,
} from '../../domain/multiplayer/contracts';
import type { MultiwayActionRecord } from '../../domain/poker/multiway';

/** Upper bound on queued all-in flashes; older queued triggers are dropped. */
export const ALL_IN_MOMENT_QUEUE_CAP = 8;

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
 * Admits triggers into the bounded presentation queue. Within a single
 * burst the earliest actions (lowest history index) win, so a 9-player
 * all-in showdown keeps the first all-ins instead of dropping the oldest
 * queued ones; only admitted triggers count as presented so a redelivery
 * can still present the dropped ones.
 */
export function admitAllInMomentTriggers(
  current: AllInMomentTrigger[],
  incoming: AllInMomentTrigger[],
  cap = ALL_IN_MOMENT_QUEUE_CAP,
): { admitted: AllInMomentTrigger[]; presented: ReadonlySet<string> } {
  const sorted = [...incoming].sort((left, right) => (
    left.historyIndex !== right.historyIndex
      ? left.historyIndex - right.historyIndex
      : left.seat - right.seat
  ));
  // The burst's earliest actions fill the remaining slots; only an already
  // queued overflow drops the oldest queued flash.
  const roomForBurst = Math.max(0, cap - current.length);
  const admitted = [...current, ...sorted.slice(0, roomForBurst)];
  return { admitted, presented: new Set(admitted.map((trigger) => trigger.key)) };
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
    const trigger = triggerForPlayer(envelope, hand, action.playerId, historyIndex, presentedKeys);
    if (trigger) triggers.push(trigger);
  }
  // Blind-induced all-ins post no history entry, so they surface only on the
  // transition that CREATED the hand: start, Deal now, or the auto-deal tick
  // (a timeout tick is distinguished by its non-null timeout). A player who
  // is already all-in at hand start with no actions was all-in from the
  // blind; the per-hand dedup key keeps this at one flash per seat.
  const dealsTheHand = transition.kind === 'start'
    || transition.kind === 'deal-now'
    || (transition.kind === 'tick' && transition.timeout === null);
  if (dealsTheHand) {
    for (const player of Object.values(hand.players)) {
      if (!player.allIn) continue;
      if (hand.history.some((candidate) => candidate.playerId === player.id)) continue;
      const trigger = triggerForPlayer(envelope, hand, player.id, -1, presentedKeys);
      if (trigger) triggers.push(trigger);
    }
  }
  return triggers;
}

function triggerForPlayer(
  envelope: AllInMomentEnvelope,
  hand: NonNullable<MultiplayerViewerProjection['hand']>,
  playerId: string,
  historyIndex: number,
  presentedKeys: ReadonlySet<string>,
): AllInMomentTrigger | null {
  const key = `${hand.handNumber}:${playerId}`;
  if (presentedKeys.has(key)) return null;
  const seat = envelope.snapshot?.seats.find((candidate) => (
    candidate.playerId === playerId
  ));
  if (!seat) return null;
  return {
    displayName: seat.displayName,
    handNumber: hand.handNumber,
    historyIndex,
    key,
    playerId,
    seat: seat.seat,
  };
}
