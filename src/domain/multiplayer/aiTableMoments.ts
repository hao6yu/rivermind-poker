import type { RandomSource } from '../poker/cards.ts';
import type { MultiwayHandOutcome } from '../poker/multiway.ts';
import type { MultiplayerCoordinatorState, MultiplayerTransition } from './contracts.ts';
import {
  createTableMomentEnvelope,
  type TableMomentEnvelope,
  type TableMomentReactionId,
} from './tableMoments.ts';

/**
 * Coordinator-side AI table-moment selection.
 *
 * AI moments are never rolled by clients: the room coordinator classifies AI
 * seats against the authored trigger classes of the approved contract (an
 * accepted all-in while the hand still runs, or the settled-hand result,
 * which this engine computes together with the showdown reveal in the same
 * transition), rolls the authored 25 percent probability with the injected
 * RNG, and returns candidate envelopes. The Edge Function then claims each
 * candidate against the authoritative four-second room cooldown, hand cap,
 * and per-AI per-hand limit before broadcasting, so concurrent command
 * invocations cannot over-emit.
 */

/** Probability that one eligible AI trigger becomes a broadcast moment. */
export const AI_TABLE_MOMENT_PROBABILITY = 0.25;

/** Room-level spacing between AI moments; enforced by the SQL claim too. */
export const AI_TABLE_MOMENT_ROOM_COOLDOWN_MS = 4_000;

/** At most one AI moment per AI seat per hand. */
export const AI_TABLE_MOMENT_PER_AI_PER_HAND_LIMIT = 1;

/** At most two AI moments per room per hand. */
export const AI_TABLE_MOMENT_HAND_CAP = 2;

/** The authored trigger classes for AI reactions. */
export type AiMomentTriggerClass = 'accepted-all-in' | 'bad-beat' | 'scoop' | 'showdown-win';

export interface AiMomentTrigger {
  class: AiMomentTriggerClass;
  playerId: string;
  reactionId: TableMomentReactionId;
  seat: number;
}

/** How big a committed share counts as "bet hard and lost" for a bad beat. */
export const AI_BAD_BEAT_COMMIT_RATIO = 0.4;

/**
 * The players who committed their whole stack in this transition. A call or
 * raise by a player whose all-in flag is set in the CURRENT hand is the
 * action that committed it (an all-in player never acts again), so folds,
 * checks, and blind-only all-ins (which never enter the action batch) never
 * match. A transition that also settled the hand changes status away from
 * 'playing' and is handled by the settled-result classes instead.
 */
export function allInCommitPlayerIds(
  state: MultiplayerCoordinatorState,
  transition: MultiplayerTransition | null,
): string[] {
  if (!transition || state.status !== 'playing') return [];
  const ids: string[] = [];
  for (const action of transition.actionBatch) {
    if ((action.type === 'call' || action.type === 'raise')
      && state.hand?.players[action.playerId]?.allIn === true
      && !ids.includes(action.playerId)) {
      ids.push(action.playerId);
    }
  }
  return ids;
}

/**
 * Classifies an accepted all-in (hand still running) into AI moment
 * triggers: every AI seat still in the hand except the player who committed
 * it, in seat order. The committed player's own seat is excluded — reacting
 * to your own all-in is noise, and the human all-in flash already presents
 * the event to every viewer.
 */
export function classifyAiAllInMomentTriggers(
  state: MultiplayerCoordinatorState,
  allInPlayerId: string,
): AiMomentTrigger[] {
  const triggers: AiMomentTrigger[] = [];
  for (const seat of state.seats) {
    if (seat.kind !== 'ai') continue;
    if (seat.playerId === allInPlayerId) continue;
    const player = state.hand?.players[seat.playerId];
    if (!player || player.folded) continue;
    triggers.push({
      class: 'accepted-all-in',
      playerId: seat.playerId,
      reactionId: TRIGGER_REACTIONS['accepted-all-in'],
      seat: seat.seat,
    });
  }
  return triggers;
}

const TRIGGER_REACTIONS: Readonly<Record<AiMomentTriggerClass, TableMomentReactionId>> = {
  'accepted-all-in': 'surprised',
  'bad-beat': 'disappointed',
  scoop: 'cheer',
  'showdown-win': 'niceHand',
};

/**
 * Classifies settled-hand outcomes into AI moment triggers, in seat order.
 * Pure: given the same state and outcome it always returns the same classes.
 * A showdown win or a no-showdown scoop (everyone folded to the winner) both
 * trigger; a big-commit showdown loss is a bad beat. AI seats that are not
 * still in the hand (folded/absent) can never trigger.
 */
export function classifyAiMomentTriggers(
  state: MultiplayerCoordinatorState,
  outcome: MultiwayHandOutcome,
): AiMomentTrigger[] {
  const triggers: AiMomentTrigger[] = [];
  const winners = new Set(outcome.winnerPlayerIds);
  const totalPot = outcome.totalPot > 0 ? outcome.totalPot : 1;
  for (const seat of state.seats) {
    if (seat.kind !== 'ai') continue;
    const player = state.hand?.players[seat.playerId];
    if (!player || player.folded) continue;
    let triggerClass: AiMomentTriggerClass | null = null;
    if (winners.has(seat.playerId)) {
      triggerClass = outcome.showdown ? 'showdown-win' : 'scoop';
    } else if (outcome.showdown && player.totalCommitted / totalPot >= AI_BAD_BEAT_COMMIT_RATIO) {
      triggerClass = 'bad-beat';
    }
    if (triggerClass) {
      triggers.push({
        class: triggerClass,
        playerId: seat.playerId,
        reactionId: TRIGGER_REACTIONS[triggerClass],
        seat: seat.seat,
      });
    }
  }
  return triggers;
}

/**
 * Rolls the authored probability for each classified trigger and builds
 * candidate envelopes, honoring the per-AI per-hand limit and the room-level
 * cooldown and hand cap. Deterministic under an injected RNG and clock. The
 * envelopes are candidates: the authoritative SQL claim still gates each one
 * before the broadcast, so this function never over-emits on its own.
 */
export function selectAiTableMoments(input: {
  aiMomentsThisHand: number;
  nowMs: number;
  random: RandomSource;
  roomLastAiMomentAtMs: number | null;
  state: MultiplayerCoordinatorState;
  triggers: AiMomentTrigger[];
}): TableMomentEnvelope[] {
  const {
    aiMomentsThisHand,
    nowMs,
    random,
    roomLastAiMomentAtMs,
    state,
    triggers,
  } = input;
  if (aiMomentsThisHand >= AI_TABLE_MOMENT_HAND_CAP) return [];
  if (roomLastAiMomentAtMs !== null
    && nowMs - roomLastAiMomentAtMs < AI_TABLE_MOMENT_ROOM_COOLDOWN_MS) {
    return [];
  }
  const emittedBySeat = new Set<number>();
  const moments: TableMomentEnvelope[] = [];
  for (const trigger of triggers) {
    if (emittedBySeat.has(trigger.seat)) continue;
    if (aiMomentsThisHand + moments.length >= AI_TABLE_MOMENT_HAND_CAP) break;
    if (random() >= AI_TABLE_MOMENT_PROBABILITY) continue;
    emittedBySeat.add(trigger.seat);
    moments.push(createTableMomentEnvelope({
      atMs: nowMs,
      handNumber: state.hand?.handNumber ?? 0,
      id: `ai:${state.roomId}:${state.hand?.handNumber ?? 0}:${trigger.seat}:${trigger.class}`,
      playerId: trigger.playerId,
      reactionId: trigger.reactionId,
      roomId: state.roomId,
      seat: trigger.seat,
      seatCount: state.config.seatCount,
    }));
  }
  return moments;
}
