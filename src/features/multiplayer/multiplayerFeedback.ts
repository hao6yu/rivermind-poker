import type {
  MultiplayerPublicTransition,
  MultiplayerViewerProjection,
} from '../../domain/multiplayer/contracts';
import type { MultiwayActionRecord, MultiwayHandState } from '../../domain/poker/multiway';
import type { GameplayFeedbackCue, HandResultKind } from '../../services/gameplayFeedback';
import { feedbackDescriptorForCue } from '../../services/gameplayFeedback';
import type { MultiplayerRealtimeStatus } from '../../services/multiplayer';
import type { MultiplayerActionFrame, MultiplayerPresentationTransition } from './multiplayerActionQueue';
import type { MultiplayerResultPresentation } from './multiplayerGamePresentation';

export interface MultiplayerRealtimeFeedbackState {
  disconnected: boolean;
  hasSubscribed: boolean;
  sequence: number;
}

export interface MultiplayerPresentationReadinessState {
  deferredRestoreSequence: number | null;
  ready: boolean;
}

export type MultiplayerPresentationReadinessEvent =
  | { type: 'inactive' }
  | { type: 'sync-succeeded' }
  | { cue: 'disconnect' | 'restore'; sequence: number; type: 'transport' };

export interface MultiplayerTransportFeedbackEmission {
  cue: 'disconnect' | 'restore';
  sequence: number;
}

export interface MultiplayerFeedbackTransition {
  action: { cue: Extract<GameplayFeedbackCue, string>; delayMs: number; eventId: string; viewerActed: boolean } | null;
  boardEventId: string | null;
  freshDealEventId: string | null;
  result: { cue: Extract<GameplayFeedbackCue, { type: 'handResult' }>; eventId: string } | null;
  timerEventId: string | null;
  viewerTurnEventId: string | null;
}

export type MultiplayerFeedbackStepKind = 'newHand' | 'action' | 'streetReveal' | 'viewerTurn' | 'timerWarning' | 'handResult';

export interface MultiplayerFeedbackStep {
  cue: GameplayFeedbackCue;
  delayMs: number;
  eventId: string;
  haptic: boolean;
  kind: MultiplayerFeedbackStepKind;
}

export interface MultiplayerBoardFeedbackEvent {
  boardCount: number;
  eventId: string;
  handNumber: number;
}

export const initialMultiplayerRealtimeFeedbackState: MultiplayerRealtimeFeedbackState = {
  disconnected: false,
  hasSubscribed: false,
  sequence: 0,
};

export const initialMultiplayerPresentationReadinessState: MultiplayerPresentationReadinessState = {
  deferredRestoreSequence: null,
  ready: true,
};

/**
 * Holds a foreground restore until one authoritative post-background snapshot
 * has seeded the table. Disconnect warnings remain immediate, while a newer
 * disconnect invalidates a restore that has not yet become visible.
 */
export function advanceMultiplayerPresentationReadiness(
  current: MultiplayerPresentationReadinessState,
  event: MultiplayerPresentationReadinessEvent,
): {
  emission: MultiplayerTransportFeedbackEmission | null;
  state: MultiplayerPresentationReadinessState;
} {
  if (event.type === 'inactive') {
    return {
      emission: null,
      state: { deferredRestoreSequence: null, ready: false },
    };
  }
  if (event.type === 'sync-succeeded') {
    const emission = current.deferredRestoreSequence === null
      ? null
      : { cue: 'restore' as const, sequence: current.deferredRestoreSequence };
    return {
      emission,
      state: { deferredRestoreSequence: null, ready: true },
    };
  }
  if (event.cue === 'disconnect') {
    return {
      emission: { cue: event.cue, sequence: event.sequence },
      state: { ...current, deferredRestoreSequence: null },
    };
  }
  if (current.ready) {
    return {
      emission: { cue: event.cue, sequence: event.sequence },
      state: current,
    };
  }
  return {
    emission: null,
    state: { ...current, deferredRestoreSequence: event.sequence },
  };
}

export function multiplayerPresentationTransitionFromEnvelope(input: {
  snapshot: Pick<MultiplayerViewerProjection, 'hand' | 'version'>;
  transition?: MultiplayerPublicTransition;
} | null): MultiplayerPresentationTransition | null {
  const handNumber = input?.snapshot.hand?.handNumber;
  const transition = input?.transition;
  if (
    handNumber === undefined
    || !transition
    || transition.version !== input.snapshot.version
  ) return null;
  return { handNumber, transition };
}

export function multiplayerLiveTransitionForVersion(
  transitions: readonly MultiplayerPresentationTransition[],
  handNumber: number | undefined,
  roomVersion: number,
): MultiplayerPresentationTransition | null {
  if (handNumber === undefined) return null;
  return transitions.findLast(({ handNumber: transitionHand, transition }) => (
    transitionHand === handNumber && transition.version === roomVersion
  )) ?? null;
}

export function multiplayerLatestLiveTransitionForHand(
  transitions: readonly MultiplayerPresentationTransition[],
  handNumber: number | undefined,
  roomVersion: number,
): MultiplayerPresentationTransition | null {
  if (handNumber === undefined) return null;
  return transitions.reduce<MultiplayerPresentationTransition | null>((latest, entry) => {
    if (entry.handNumber !== handNumber || entry.transition.version > roomVersion) return latest;
    return latest === null || entry.transition.version > latest.transition.version
      ? entry
      : latest;
  }, null);
}

export function multiplayerLatestLiveActionTransitionForHand(
  transitions: readonly MultiplayerPresentationTransition[],
  handNumber: number | undefined,
  roomVersion: number,
): MultiplayerPresentationTransition | null {
  if (handNumber === undefined) return null;
  return transitions.reduce<MultiplayerPresentationTransition | null>((latest, entry) => {
    if (
      entry.handNumber !== handNumber
      || entry.transition.version > roomVersion
      || entry.transition.actionBatch.length === 0
    ) return latest;
    return latest === null || entry.transition.version > latest.transition.version
      ? entry
      : latest;
  }, null);
}

export function multiplayerTransitionMatchesHandTail(
  entry: MultiplayerPresentationTransition | null,
  hand: Pick<MultiwayHandState, 'history'> | null,
): boolean {
  const publicAction = entry?.transition.actionBatch.at(-1);
  const handAction = hand?.history.at(-1);
  if (!publicAction || !handAction) return false;
  return publicAction.playerId === handAction.playerId
    && publicAction.type === handAction.type
    && publicAction.amount === handAction.amount
    && publicAction.street === handAction.street
    && publicAction.potAfter === handAction.potAfter;
}

export function multiplayerTransitionIsCurrentFreshDeal(
  entry: MultiplayerPresentationTransition | null,
  roomVersion: number,
): boolean {
  return entry?.transition.version === roomVersion
    && (entry.transition.kind === 'start' || entry.transition.kind === 'next-hand');
}

export function multiplayerActionFeedbackCue(
  action: Pick<MultiwayActionRecord, 'type'>,
  allIn: boolean,
): Extract<GameplayFeedbackCue, string> {
  if (allIn) return 'allIn';
  return action.type;
}

export function multiplayerActionFeedbackDelayMs(freshDeal: boolean): number {
  return freshDeal ? feedbackDescriptorForCue('newHand').durationMs + 35 : 0;
}

/** Keeps related semantic cues ordered instead of collapsing their readable beats. */
export function multiplayerFollowupFeedbackDelayMs(
  priorCue: GameplayFeedbackCue | null,
  priorDelayMs = 0,
  priorEventId?: string,
): number {
  if (priorCue === null) return 0;
  return priorDelayMs + feedbackDescriptorForCue(priorCue, priorEventId).durationMs + 35;
}

/**
 * Builds one coherent cue sequence for a multiplayer presentation transition.
 * Urgent timer feedback supersedes a simultaneous viewer-turn tap; terminal
 * results suppress board/turn follow-ups; and exactly one step owns haptics.
 */
export function planMultiplayerFeedback(
  transition: MultiplayerFeedbackTransition,
): MultiplayerFeedbackStep[] {
  const steps: MultiplayerFeedbackStep[] = [];
  let cursorMs = 0;
  if (transition.freshDealEventId) {
    steps.push({
      cue: 'newHand',
      delayMs: 0,
      eventId: transition.freshDealEventId,
      haptic: false,
      kind: 'newHand',
    });
    cursorMs = multiplayerFollowupFeedbackDelayMs('newHand');
  }
  if (transition.action) {
    const delayMs = Math.max(cursorMs, transition.action.delayMs);
    steps.push({
      cue: transition.action.cue,
      delayMs,
      eventId: transition.action.eventId,
      haptic: false,
      kind: 'action',
    });
    cursorMs = multiplayerFollowupFeedbackDelayMs(
      transition.action.cue,
      delayMs,
      transition.action.eventId,
    );
  }
  if (transition.result) {
    steps.push({
      cue: transition.result.cue,
      delayMs: cursorMs,
      eventId: transition.result.eventId,
      haptic: true,
      kind: 'handResult',
    });
  } else if (transition.boardEventId) {
    steps.push({
      cue: 'streetReveal',
      delayMs: cursorMs,
      eventId: transition.boardEventId,
      haptic: true,
      kind: 'streetReveal',
    });
  } else if (transition.timerEventId) {
    steps.push({
      cue: 'timerWarning',
      delayMs: cursorMs,
      eventId: transition.timerEventId,
      haptic: true,
      kind: 'timerWarning',
    });
  } else if (transition.viewerTurnEventId && !transition.freshDealEventId) {
    steps.push({
      cue: 'viewerTurn',
      delayMs: cursorMs,
      eventId: transition.viewerTurnEventId,
      haptic: true,
      kind: 'viewerTurn',
    });
  }

  const finalHapticKind = steps.findLast((step) => step.haptic)?.kind;
  if (!finalHapticKind) {
    const action = steps.find((step) => step.kind === 'action');
    if (action && transition.action?.viewerActed) action.haptic = true;
    else {
      const deal = steps.find((step) => step.kind === 'newHand');
      if (deal) deal.haptic = true;
      else if (steps.length === 1 && steps[0]) steps[0].haptic = true;
    }
  }
  return steps;
}

/** Suppresses every table-semantic cue until foreground sync has reseeded it. */
export function planMultiplayerFeedbackWhenReady(
  ready: boolean,
  transition: MultiplayerFeedbackTransition,
): MultiplayerFeedbackStep[] {
  return ready ? planMultiplayerFeedback(transition) : [];
}

/** Latches a board event until its delayed cue fires across render-only churn. */
export function retainMultiplayerBoardFeedbackEvent(input: {
  boardCount: number;
  detected: MultiplayerBoardFeedbackEvent | null;
  handNumber: number | undefined;
  pending: MultiplayerBoardFeedbackEvent | null;
}): MultiplayerBoardFeedbackEvent | null {
  if (input.detected) return input.detected;
  return input.pending
    && input.pending.handNumber === input.handNumber
    && input.pending.boardCount === input.boardCount
    ? input.pending
    : null;
}

/** Stable event identity for an effect scheduler; render-only churn keeps it unchanged. */
export function multiplayerFeedbackPlanKey(
  steps: readonly MultiplayerFeedbackStep[],
): string {
  return steps
    .map(({ delayMs, eventId, haptic, kind }) => `${kind}:${eventId}:${delayMs}:${haptic ? 1 : 0}`)
    .join('|');
}

export function multiplayerPresentationLifecycleBoundary(
  previous: string,
  next: string,
): boolean {
  return (previous === 'active') !== (next === 'active');
}

export function multiplayerShouldCaptureLivePresentation(appState: string): boolean {
  return appState === 'active';
}

export function isLiveMultiplayerActionFrame(
  frame: Pick<MultiplayerActionFrame, 'key'> | null | undefined,
): boolean {
  return frame?.key.startsWith('transition:') ?? false;
}

export function multiplayerResultFeedbackKind(
  tone: MultiplayerResultPresentation['tone'],
): HandResultKind {
  if (tone === 'split') return 'split';
  return tone;
}

export function multiplayerResultFeedbackEventId(
  roomId: string,
  handNumber: number,
  result: MultiplayerResultPresentation,
): string {
  const payouts = result.payouts
    .map(({ amount, playerId }) => `${playerId}:${amount}`)
    .sort()
    .join(',');
  return `${roomId}:hand:${handNumber}:result:${result.tone}:${result.totalPot}:${payouts}`;
}

export function multiplayerTimerWarningEventId(input: {
  actingPlayerId: string | null | undefined;
  deadlineAtMs: number | null;
  handNumber: number | undefined;
  roomId: string;
  secondsLeft: number | null;
}): string | null {
  if (
    input.secondsLeft === null
    || input.secondsLeft > 10
    || input.deadlineAtMs === null
    || input.handNumber === undefined
    || !input.actingPlayerId
  ) return null;
  return `${input.roomId}:hand:${input.handNumber}:timer:${input.actingPlayerId}:${input.deadlineAtMs}`;
}

/**
 * Initial subscription and background status churn are silent. Once a live
 * channel has subscribed, one transport failure emits a warning and the next
 * successful subscription emits a single restore cue.
 */
export function advanceMultiplayerRealtimeFeedback(
  current: MultiplayerRealtimeFeedbackState,
  status: MultiplayerRealtimeStatus,
  appActive: boolean,
): { cue: 'disconnect' | 'restore' | null; state: MultiplayerRealtimeFeedbackState } {
  if (status === 'SUBSCRIBED') {
    if (!current.hasSubscribed) {
      return {
        cue: null,
        state: { ...current, disconnected: false, hasSubscribed: true },
      };
    }
    if (!current.disconnected) return { cue: null, state: current };
    if (!appActive) {
      return { cue: null, state: { ...current, disconnected: false } };
    }
    return {
      cue: 'restore',
      state: { ...current, disconnected: false, sequence: current.sequence + 1 },
    };
  }
  if (!current.hasSubscribed || current.disconnected) return { cue: null, state: current };
  if (!appActive) {
    // Background transport churn is intentionally silent and must not arm a
    // foreground "restored" announcement for a disconnect the player never
    // saw or heard. A later active failure will still emit normally.
    return { cue: null, state: current };
  }
  return {
    cue: 'disconnect',
    state: { ...current, disconnected: true, sequence: current.sequence + 1 },
  };
}
