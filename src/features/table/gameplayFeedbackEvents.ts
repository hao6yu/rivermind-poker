import type { MultiwayActionRecord, MultiwayHandOutcome } from '../../domain/poker/multiway';
import type { ActionRecord } from '../../domain/poker/types';
import {
  feedbackDescriptorForCue,
  type GameplayFeedbackCue,
  type HandResultKind,
} from '../../services/gameplayFeedback';

export type GameplayActionCue = Extract<
  GameplayFeedbackCue,
  'fold' | 'check' | 'call' | 'raise' | 'allIn'
>;

type FeedbackActionRecord = Pick<ActionRecord, 'amount' | 'type'> & {
  decisionContext?: Pick<
    ActionRecord['decisionContext'],
    'playerStackBefore' | 'playerStreetBetBefore'
  >;
};

/**
 * Maps the engine's committed history entry to one semantic cue. All-in is a
 * payment fact, not a separate engine action, so derive it from the exact
 * pre-action stack captured for replay/coaching.
 */
export function gameplayCueForAction(
  action: FeedbackActionRecord | MultiwayActionRecord,
): GameplayActionCue {
  if (action.type === 'fold' || action.type === 'check') return action.type;
  const context = action.decisionContext;
  if (context) {
    const paid = action.type === 'raise'
      ? Math.max(0, action.amount - context.playerStreetBetBefore)
      : action.amount;
    if (paid >= context.playerStackBefore) return 'allIn';
  }
  return action.type;
}

export function headsUpResultKind(winner: 'hero' | 'villain' | 'tie'): HandResultKind {
  if (winner === 'tie') return 'split';
  return winner === 'hero' ? 'win' : 'loss';
}

export function multiwayResultKind(
  outcome: Pick<MultiwayHandOutcome, 'awards'>,
  viewerPlayerId = 'hero',
): HandResultKind {
  const recipients = new Set<string>();
  outcome.awards.forEach(({ shares }) => {
    Object.entries(shares).forEach(([playerId, amount]) => {
      if (amount > 0) recipients.add(playerId);
    });
  });
  if (!recipients.has(viewerPlayerId)) return 'loss';
  return recipients.size === 1 ? 'win' : 'split';
}

export interface BoardFeedbackSnapshot {
  boardCount: number;
  handKey: string;
}

export function localActionPresentationPending(input: {
  currentHandNumber: number;
  currentHistoryLength: number;
  hasVisibleAction: boolean;
  observedHandNumber: number;
  observedHistoryLength: number;
}): boolean {
  if (input.hasVisibleAction) return true;
  return input.currentHandNumber === input.observedHandNumber
    && input.currentHistoryLength > input.observedHistoryLength;
}

/** A restored hand seeds this snapshot, while a live street transition grows it. */
export function isLiveBoardReveal(
  previous: BoardFeedbackSnapshot,
  current: BoardFeedbackSnapshot,
): boolean {
  return previous.handKey === current.handKey
    && current.boardCount > previous.boardCount;
}

export interface LocalTableActionFeedback {
  cue: GameplayActionCue;
  eventId: string;
  viewerActed: boolean;
}

export interface LocalTableDealFeedback {
  eventId: string;
}

export type LocalTableFeedbackStepKind =
  | 'newHand'
  | 'action'
  | 'streetReveal'
  | 'viewerTurn'
  | 'handResult';

export interface LocalTableFeedbackStep {
  delayMs: number;
  haptic: boolean;
  kind: LocalTableFeedbackStepKind;
}

export interface LocalTableFeedbackTransition {
  action: LocalTableActionFeedback | null;
  boardRevealed: boolean;
  deal?: LocalTableDealFeedback | null;
  result: HandResultKind | null;
  viewerTurnReady: boolean;
}

const followupPaddingMs = 35;

/**
 * Produces one ordered, non-overlapping feedback sequence for a single engine
 * transition. The small pauses keep consecutive tactile and visual events
 * readable without coupling the table engine to an output implementation.
 */
export function planLocalTableFeedback(
  transition: LocalTableFeedbackTransition,
): LocalTableFeedbackStep[] {
  const { action, boardRevealed, deal = null, result, viewerTurnReady } = transition;
  const followupDelayMs = action
    ? feedbackDescriptorForCue(action.cue, action.eventId).durationMs + followupPaddingMs
    : 0;
  const dealFollowupDelayMs = deal
    ? feedbackDescriptorForCue('newHand', deal.eventId).durationMs + followupPaddingMs
    : 0;
  const hapticOwner: LocalTableFeedbackStepKind | null = result
    ? 'handResult'
    : action?.viewerActed
      ? 'action'
      : deal
        ? 'newHand'
        : boardRevealed
          ? 'streetReveal'
          : viewerTurnReady
            ? 'viewerTurn'
            : null;
  const steps: LocalTableFeedbackStep[] = [];

  if (deal) {
    steps.push({ delayMs: 0, haptic: hapticOwner === 'newHand', kind: 'newHand' });
  }

  if (action) {
    steps.push({ delayMs: 0, haptic: hapticOwner === 'action', kind: 'action' });
  }

  if (result) {
    steps.push({
      delayMs: action ? 0 : dealFollowupDelayMs,
      haptic: true,
      kind: 'handResult',
    });
    return steps;
  }

  // A fresh deal owns its opening beat. Initial viewer readiness is visible in
  // the controls and does not need a second cue on the same transition.
  if (deal) return steps;

  if (boardRevealed) {
    steps.push({
      delayMs: followupDelayMs,
      haptic: hapticOwner === 'streetReveal',
      kind: 'streetReveal',
    });
    // The reveal already explains why controls became ready. A viewer-turn
    // tap in the same render would add noise rather than useful information.
    return steps;
  }

  if (viewerTurnReady) {
    steps.push({
      delayMs: followupDelayMs,
      haptic: hapticOwner === 'viewerTurn',
      kind: 'viewerTurn',
    });
  }

  return steps;
}

export function localTableFeedbackStep(
  steps: readonly LocalTableFeedbackStep[],
  kind: LocalTableFeedbackStepKind,
): LocalTableFeedbackStep | null {
  return steps.find((step) => step.kind === kind) ?? null;
}

/** Result feedback follows the full readable terminal action bubble. */
export function localTerminalResultDelayMs(input: {
  hasCommittedAction: boolean;
  presentationDurationMs: number;
}): number {
  return input.hasCommittedAction ? Math.max(0, input.presentationDurationMs) : 0;
}

/**
 * Schedules terminal feedback as soon as the outcome exists. Visual
 * presentation may still be showing the committed action; that action selects
 * the provider delay and must never block enqueueing the result itself.
 */
export function localTerminalResultSchedule(input: {
  hasCommittedAction: boolean;
  hasOutcome: boolean;
  presentationDurationMs: number;
}): { delayMs: number } | null {
  if (!input.hasOutcome) return null;
  return {
    delayMs: localTerminalResultDelayMs({
      hasCommittedAction: input.hasCommittedAction,
      presentationDurationMs: input.presentationDurationMs,
    }),
  };
}
