import {
  firstIncompleteRecommendedStep,
  isRecommendedSessionAbandoned,
  isRecommendedSessionCompleted,
  type RecommendedSessionPlan,
  type RecommendedSessionStep,
} from '../../domain/learning/recommendedSession';
import type { StepLauncher } from './recommendedSessionPresentation';

/**
 * Pure, React-free model of the recommended-session controller's local decisions.
 *
 * The controller (a React component) renders the modals, but the decisions that
 * drive it — which view to render, and how the record-then-dismiss latch moves —
 * are modelled here so the render lifecycle can be exercised without a render
 * harness. Persistence of the step itself lives in the shell (`journeyDone`,
 * `journeySkip`, `journeyEndEarly`, …); this module only owns the latch and the
 * precedence between the latched result screen and the terminal views.
 *
 * The record-then-dismiss contract:
 *  - `record` latches the just-recorded step — together with its launcher frozen
 *    at that moment — so its result screen stays visible until dismissed, even
 *    though the shell has already persisted completion.
 *  - `dismiss` and an abort-over-a-latched-screen clear the latch so the next
 *    step renders.
 *  - `abort` over an unlatched screen leaves the step so the session resumes,
 *    and asks the shell to unmount the controller (`abortController`).
 *
 * The launcher is frozen with the latch rather than re-resolved from the live
 * review queue: a mastered review step removes its items from the queue, and a
 * live re-resolution would blank the launcher, stranding the latched result on
 * an undismissable empty shell. Keeping it in the latch keeps the result screen
 * routable until the learner dismisses it.
 */

/** The controller's only local state: the latch. */
export interface RecommendedSessionControllerState {
  /** The id of the step whose result is latched, or null when nothing is. */
  latchedStepId: string | null;
  /**
   * The launcher frozen when `latchedStepId` was recorded, keeping the latched
   * result screen routable even if the review queue that built it mutates.
   * Kept in lockstep with `latchedStepId`; null whenever the latch clears.
   */
  launcher: StepLauncher | null;
}

/** The view the controller renders. */
export type RecommendedSessionControllerView =
  | { kind: 'modal'; step: RecommendedSessionStep }
  | { kind: 'terminal'; status: 'completed' | 'abandoned' }
  | { kind: 'empty' };

/** A controller event plus the latch state it produces and whether to unmount. */
export interface RecommendedSessionControllerTransition {
  /** The next latch state to persist in React state. */
  state: RecommendedSessionControllerState;
  /**
   * True when the shell should unmount the controller: an `abort` with nothing
   * latched (the learner bailed before recording) leaves the step for the next
   * session and returns to Home.
   */
  abortController: boolean;
}

/** The initial latch state: nothing is recorded, so nothing is latched. */
export function createRecommendedSessionControllerState(): RecommendedSessionControllerState {
  return { latchedStepId: null, launcher: null };
}

/**
 * The view to render for a plan, given the latch. A latched result screen is the
 * highest-priority view: it shows until dismissed, even after the session has
 * reconciled to completed (the final step's result screen precedes the
 * completion view). Terminal views are only reachable once the latch clears, and
 * an all-settled, non-terminal plan renders an empty shell rather than throwing.
 */
export function selectRecommendedSessionControllerView(
  plan: RecommendedSessionPlan,
  state: RecommendedSessionControllerState,
): RecommendedSessionControllerView {
  const activeStep = firstIncompleteRecommendedStep(plan);
  if (state.latchedStepId) {
    // The latched step is rendered until dismissed; fall back to the active step
    // only if the latched step has somehow been removed from the plan.
    const step = plan.steps.find((candidate) => candidate.id === state.latchedStepId) ?? activeStep;
    return step ? { kind: 'modal', step } : { kind: 'empty' };
  }
  if (isRecommendedSessionAbandoned(plan)) return { kind: 'terminal', status: 'abandoned' };
  if (isRecommendedSessionCompleted(plan)) return { kind: 'terminal', status: 'completed' };
  return activeStep ? { kind: 'modal', step: activeStep } : { kind: 'empty' };
}

/**
 * Apply a controller event and return the next latch state. Only `record` sets a
 * latch (freezing that step's launcher with it); `dismiss` and an
 * abort-over-a-latched-screen clear the latch and its frozen launcher. `abort`
 * over an unlatched screen leaves the latch null and asks the shell to unmount.
 */
export function applyRecommendedSessionControllerEvent(
  state: RecommendedSessionControllerState,
  event:
    | { action: 'record'; stepId: string; launcher: StepLauncher }
    | { action: 'dismiss' }
    | { action: 'abort' },
): RecommendedSessionControllerTransition {
  if (event.action === 'record') {
    // Freeze the launcher with the latch so the latched result screen keeps its
    // modal target even after the review queue that built it mutates.
    return { state: { latchedStepId: event.stepId, launcher: event.launcher }, abortController: false };
  }
  // Both `dismiss` and an `abort` over a latched result clear the latch and its
  // frozen launcher so the next step renders.
  const next: RecommendedSessionControllerState = { latchedStepId: null, launcher: null };
  return {
    state: next,
    // An abort over an unlatched screen leaves the latch null and asks the shell
    // to unmount; over a latched result it just clears the latch.
    abortController: event.action === 'abort' && state.latchedStepId === null,
  };
}
