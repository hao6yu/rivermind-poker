import {
  firstIncompleteRecommendedStep,
  isRecommendedSessionCompleted,
  type RecommendedSessionPlan,
  type RecommendedSessionStep,
} from '../../domain/learning/recommendedSession';
import {
  loadRecommendedSession,
  saveRecommendedSession,
  setRecommendedSessionStatus,
  updateRecommendedSessionStep,
} from '../../services/recommendedSessionCheckpoint';

/**
 * The recommended-session journey state machine. This module is intentionally
 * React-free: it models the whole journey lifecycle — Start, Close, Complete,
 * Done, End Early, mission exit, and relaunch — as pure transitions over the
 * persisted plan, so the controller and shell can call it without a render
 * harness and the behaviour stays fully unit-testable.
 *
 * Each transition reads and writes the passed storage and returns a result the
 * shell commits, so the transitions can be exercised against an in-memory store.
 * Only `journeyStart`/`journeyClose` take the current plan directly (start needs
 * to decide whether to activate or compose; close preserves the open plan); the
 * mutating transitions read the plan from storage so they always see the latest
 * checkpoint rather than a possibly-stale snapshot.
 */

/** The minimal storage surface the journey layer depends on. */
export interface RecommendedSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The lifecycle a session is in, derived from its persisted plan. */
export type JourneyPhase = 'idle' | 'active' | 'completed' | 'abandoned';

/** A snapshot of the current journey, used to drive the UI. */
export interface JourneyState {
  plan: RecommendedSessionPlan | null;
  phase: JourneyPhase;
  /** The next step the learner can run, or null when the session is finished. */
  nextStep: RecommendedSessionStep | null;
}

/**
 * The result of applying a transition. The shell commits `plan` to React state
 * and acts on the flags without re-reading storage.
 */
export interface JourneyTransition {
  /** The plan after the transition, or null when it was rejected/failed. */
  plan: RecommendedSessionPlan | null;
  /** True when the UI must leave the journey (return to Home). */
  closes: boolean;
  /**
   * True when the session reached a terminal state (completed or abandoned) and
   * the shell should compose the next Home session rather than resume.
   */
  terminal: boolean;
  /** True when the transition opened an active journey (only `start`). */
  opened: boolean;
}

/** Advance a settled step, reconciling the session to a terminal status. */
function advanceStep(
  stepId: string,
  status: 'completed' | 'skipped',
  storage?: RecommendedSessionStorage,
): JourneyTransition {
  const plan = updateRecommendedSessionStep(stepId, status, storage);
  if (!plan) return { plan: null, closes: false, terminal: false, opened: false };
  const done = isRecommendedSessionCompleted(plan);
  return { plan, closes: done, terminal: done, opened: false };
}

/** Derive the lifecycle phase from a plan (null → idle). */
export function journeyPhase(plan: RecommendedSessionPlan | null): JourneyPhase {
  if (!plan) return 'idle';
  if (plan.status === 'abandoned') return 'abandoned';
  if (isRecommendedSessionCompleted(plan)) return 'completed';
  if (plan.status === 'active' || plan.status === 'planned') return 'active';
  return 'idle';
}

/** The next step the learner can run from a plan, or null unless it is active. */
export function journeyNextStep(plan: RecommendedSessionPlan | null): RecommendedSessionStep | null {
  // Only an open, active session has a runnable next step: a finished or
  // abandoned session exposes none even though it still has pending steps.
  if (!plan || journeyPhase(plan) !== 'active') return null;
  return firstIncompleteRecommendedStep(plan);
}

/** Build a `JourneyState` from a plan — the view model the UI reads. */
export function fromPlan(plan: RecommendedSessionPlan | null): JourneyState {
  return { plan, phase: journeyPhase(plan), nextStep: journeyNextStep(plan) };
}

/**
 * Start the journey. When an open (planned/active) plan already exists it is
 * activated in place; otherwise a fresh plan is composed, saved, and activated.
 * `closes`/`terminal` stay false (the session is open), but `opened` is true so
 * the shell knows to reveal the controller.
 */
export function journeyStart(
  plan: RecommendedSessionPlan | null,
  compose: () => RecommendedSessionPlan | null,
  storage?: RecommendedSessionStorage,
): JourneyTransition {
  if (plan && (plan.status === 'active' || plan.status === 'planned') && plan.steps.length > 0) {
    const activated = setRecommendedSessionStatus('active', storage);
    return { plan: activated ?? plan, closes: false, terminal: false, opened: Boolean(activated) };
  }
  const fresh = compose();
  if (!fresh) return { plan: null, closes: false, terminal: false, opened: false };
  saveRecommendedSession(fresh, storage);
  const activated = setRecommendedSessionStatus('active', storage);
  return { plan: activated ?? fresh, closes: false, terminal: false, opened: true };
}

/**
 * Close the journey early without finishing it (the modal back button, a table
 * mission the user abandons, or Change Setup). The plan is returned untouched so
 * its active/pending step resumes next time — this is the opposite of a skip.
 * `closes` is true so the shell returns to Home.
 */
export function journeyClose(plan: RecommendedSessionPlan | null): JourneyTransition {
  return { plan, closes: true, terminal: false, opened: false };
}

/**
 * Advance a single step after its result screen is dismissed. The step is
 * marked completed; once every step is settled the plan reconciles to
 * `completed`, which flips `closes`/`terminal` so the UI shows the completion
 * view and the shell composes the next session.
 */
export function journeyDone(stepId: string, storage?: RecommendedSessionStorage): JourneyTransition {
  return advanceStep(stepId, 'completed', storage);
}

/**
 * Skip a step an app update can no longer reach: a compatibility skip, not an
 * interruption, so the checkpoint reconciles the target while the rest of the
 * session stays intact.
 */
export function journeySkip(stepId: string, storage?: RecommendedSessionStorage): JourneyTransition {
  return advanceStep(stepId, 'skipped', storage);
}

/**
 * The table mission returned with a result. A mission that ran (passed or not)
 * is a finished step, so it is recorded completed — mirroring the result the
 * shell already grades — and the session reconciles to `completed` when it is the
 * last step.
 */
export function journeyMissionExit(stepId: string, storage?: RecommendedSessionStorage): JourneyTransition {
  return advanceStep(stepId, 'completed', storage);
}

/**
 * End the session early. The plan is explicitly abandoned — the transition is
 * terminal and `closes` is true, but the plan is never marked `completed`.
 */
export function journeyEndEarly(storage?: RecommendedSessionStorage): JourneyTransition {
  const plan = setRecommendedSessionStatus('abandoned', storage);
  if (!plan) return { plan: null, closes: false, terminal: false, opened: false };
  return { plan, closes: true, terminal: true, opened: false };
}

/**
 * Relaunch: read the persisted plan from storage and derive its lifecycle view.
 */
export function journeyRelaunch(storage?: RecommendedSessionStorage): JourneyState {
  const { plan } = loadRecommendedSession(storage);
  return fromPlan(plan);
}
