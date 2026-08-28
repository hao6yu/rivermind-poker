import type { RandomSource } from '../poker/cards';
import type { MultiwayHandOutcome } from '../poker/multiway';
import type { MultiplayerCoordinatorState } from './contracts';
import {
  createTableMomentEnvelope,
  type TableMomentEnvelope,
  type TableMomentReactionId,
} from './tableMoments';

/**
 * Coordinator-side AI table-moment selection.
 *
 * AI moments are never rolled by clients: after a hand settles, the room
 * coordinator classifies every AI seat against the three authored trigger
 * classes, rolls the authored probability with the injected RNG, and returns
 * candidate envelopes. The Edge Function then claims each candidate against
 * the authoritative room-cooldown and per-AI per-hand limits before
 * broadcasting, so concurrent command invocations cannot over-emit.
 */

/** Probability that one eligible AI trigger becomes a broadcast moment. */
export const AI_TABLE_MOMENT_PROBABILITY = 0.5;

/** Room-level spacing between AI moments; enforced by the SQL claim too. */
export const AI_TABLE_MOMENT_ROOM_COOLDOWN_MS = 10_000;

/** At most one AI moment per AI seat per hand. */
export const AI_TABLE_MOMENT_PER_AI_PER_HAND_LIMIT = 1;

/** At most two AI moments per room per hand. */
export const AI_TABLE_MOMENT_HAND_CAP = 2;

/** The three authored trigger classes for AI reactions. */
export type AiMomentTriggerClass = 'bad-beat' | 'scoop' | 'showdown-win';

export interface AiMomentTrigger {
  class: AiMomentTriggerClass;
  playerId: string;
  reactionId: TableMomentReactionId;
  seat: number;
}

/** How big a committed share counts as "bet hard and lost" for a bad beat. */
export const AI_BAD_BEAT_COMMIT_RATIO = 0.4;

const TRIGGER_REACTIONS: Readonly<Record<AiMomentTriggerClass, TableMomentReactionId>> = {
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
