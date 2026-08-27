import { describe, expect, it } from 'vitest';

import type { TrainerDefinition } from '../../../domain/learning/types';
import { type RecommendedSessionPlan, type RecommendedSessionStep } from '../../../domain/learning/recommendedSession';
import { type StepLauncher } from '../recommendedSessionPresentation';
import {
  applyRecommendedSessionControllerEvent,
  type RecommendedSessionControllerState,
  createRecommendedSessionControllerState,
  selectRecommendedSessionControllerView,
} from '../recommendedSessionController';

/**
 * Coverage for the recommended-session controller's render-lifecycle decisions —
 * the precedence between a latched result screen and the terminal views, and the
 * record-then-dismiss latch. The controller renders these as a React component,
 * which the pure-function suite cannot exercise, so this model carries the
 * contract so the defects (a crash on the completed view, a result screen
 * replaced immediately, a bail that skips the step, a mutated review queue that
 * blanks a latched result) stay pinned.
 */

function step(id: string, status: RecommendedSessionStep['status']): RecommendedSessionStep {
  return {
    id,
    kind: 'activity',
    reason: 'continue-path',
    concept: 'poker-basics',
    estimatedMinutes: 5,
    status,
    target: { kind: 'activity', activityId: `${id}-activity` },
    titleHint: id,
  };
}

/** A plan whose steps have the given statuses; the session status defaults to active. */
function buildPlan(statuses: RecommendedSessionStep['status'][] = ['active'], planStatus: RecommendedSessionPlan['status'] = 'active'): RecommendedSessionPlan {
  return {
    id: 'session',
    concept: 'poker-basics',
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    estimatedMinutes: statuses.length * 5,
    reason: 'continue-path',
    status: planStatus,
    version: 1,
    steps: statuses.map((status, index) => step(`step-${index}`, status)),
  };
}

/** Simulate the shell marking `stepId` completed between controller events. */
function markCompleted(plan: RecommendedSessionPlan, stepId: string): void {
  plan.steps = plan.steps.map((candidate) => (candidate.id === stepId ? { ...candidate, status: 'completed' } : candidate));
}

/** A minimal review launcher: the kind the mutated-queue defect is about. */
const reviewTrainer: TrainerDefinition = {
  id: 'review-trainer',
  type: 'hand_quiz',
  title: 'Review',
  description: 'Review',
  estimatedMinutes: 3,
  questions: [],
};
function reviewLauncher(): StepLauncher {
  return { kind: 'review', trainer: reviewTrainer };
}

describe('createRecommendedSessionControllerState', () => {
  it('starts with no latch and no frozen launcher', () => {
    expect(createRecommendedSessionControllerState()).toEqual({ latchedStepId: null, launcher: null });
  });
});

describe('selectRecommendedSessionControllerView', () => {
  const idle = createRecommendedSessionControllerState();

  it('renders the active step for an open session', () => {
    const view = selectRecommendedSessionControllerView(buildPlan(['active']), idle);
    expect(view).toEqual({ kind: 'modal', step: buildPlan(['active']).steps[0] });
  });

  it('renders the latched step while its result screen is shown', () => {
    const planWithTwo = buildPlan(['active', 'pending']);
    const latched: RecommendedSessionControllerState = { latchedStepId: 'step-1', launcher: reviewLauncher() };
    const view = selectRecommendedSessionControllerView(planWithTwo, latched);
    expect(view).toEqual({ kind: 'modal', step: planWithTwo.steps[1] });
  });

  it('never throws when the plan has no routable step (the empty-shell guard)', () => {
    // A step-less plan is the null-guard: the completed view must not be reached
    // by dereferencing a null active step.
    const view = selectRecommendedSessionControllerView(buildPlan([], 'active'), idle);
    expect(view).toEqual({ kind: 'empty' });
  });

  it('falls back to the active step when the latched step has been removed', () => {
    const planWithTwo = buildPlan(['active', 'pending']);
    const latched: RecommendedSessionControllerState = { latchedStepId: 'step-does-not-exist', launcher: null };
    const view = selectRecommendedSessionControllerView(planWithTwo, latched);
    expect(view).toEqual({ kind: 'modal', step: planWithTwo.steps[0] });
  });

  it('reveals the completion view only after the latch clears', () => {
    const completed = buildPlan(['completed', 'completed'], 'completed');
    expect(selectRecommendedSessionControllerView(completed, idle)).toEqual({ kind: 'terminal', status: 'completed' });
  });

  it('keeps the latched result screen in front of a completed session', () => {
    // The final step's result screen must show before the completion view.
    const completed = buildPlan(['completed', 'completed'], 'completed');
    const latched: RecommendedSessionControllerState = { latchedStepId: 'step-1', launcher: reviewLauncher() };
    expect(selectRecommendedSessionControllerView(completed, latched)).toEqual({ kind: 'modal', step: completed.steps[1] });
  });

  it('reveals the abandoned view once the latch clears', () => {
    const abandoned = buildPlan(['pending'], 'abandoned');
    expect(selectRecommendedSessionControllerView(abandoned, idle)).toEqual({ kind: 'terminal', status: 'abandoned' });
  });
});

describe('applyRecommendedSessionControllerEvent', () => {
  it('latches the step on record and freezes the launcher with it', () => {
    const launcher = reviewLauncher();
    const next = applyRecommendedSessionControllerEvent(createRecommendedSessionControllerState(), { action: 'record', stepId: 'step-1', launcher });
    expect(next).toEqual({ state: { latchedStepId: 'step-1', launcher }, abortController: false });
  });

  it('clears the latch and its launcher on dismissal', () => {
    const latched: RecommendedSessionControllerState = { latchedStepId: 'step-1', launcher: reviewLauncher() };
    const next = applyRecommendedSessionControllerEvent(latched, { action: 'dismiss' });
    expect(next).toEqual({ state: { latchedStepId: null, launcher: null }, abortController: false });
  });

  it('asks to unmount on an abort over an unlatched screen', () => {
    const next = applyRecommendedSessionControllerEvent(createRecommendedSessionControllerState(), { action: 'abort' });
    expect(next).toEqual({ state: { latchedStepId: null, launcher: null }, abortController: true });
  });

  it('clears the latch and its launcher without aborting on an abort over a latched result', () => {
    const latched: RecommendedSessionControllerState = { latchedStepId: 'step-1', launcher: reviewLauncher() };
    const next = applyRecommendedSessionControllerEvent(latched, { action: 'abort' });
    expect(next).toEqual({ state: { latchedStepId: null, launcher: null }, abortController: false });
  });

  it('freezes the launcher so a completed step keeps its result routable', () => {
    // The mutable-review-data defect: a mastered review step blanks the live
    // queue, so the launcher must be stored with the latch rather than
    // re-resolved from data that can disappear.
    const frozen = reviewLauncher();
    const plan = buildPlan(['active', 'pending']);
    const recorded = applyRecommendedSessionControllerEvent(createRecommendedSessionControllerState(), { action: 'record', stepId: 'step-0', launcher: frozen });

    // The launcher is carried alongside the latch, unchanged.
    expect(recorded.state.latchedStepId).toBe('step-0');
    expect(recorded.state.launcher).toBe(frozen);

    // The step is then checkpointed completed — its review items mastered away.
    // The carried launcher is still the frozen one, so the result screen stays
    // routable (the component renders state.launcher, not a blank re-resolution).
    markCompleted(plan, 'step-0');
    expect(selectRecommendedSessionControllerView(plan, recorded.state)).toEqual({ kind: 'modal', step: plan.steps[0] });
    expect(recorded.state.launcher).toBe(frozen);
  });
});

describe('record-then-dismiss through the model', () => {
  it('advances one step per dismissal and reaches completion only after the last result is dismissed', () => {
    const plan = buildPlan(['active', 'active', 'pending']);
    const idle = createRecommendedSessionControllerState();
    const view = (state: RecommendedSessionControllerState) => selectRecommendedSessionControllerView(plan, state);

    // Step 1 is on screen.
    expect(view(idle)).toEqual({ kind: 'modal', step: plan.steps[0] });

    // Recording latches the result screen; the plan is advanced (by the shell)
    // underneath the latched step.
    const recorded = applyRecommendedSessionControllerEvent(idle, { action: 'record', stepId: 'step-0', launcher: reviewLauncher() });
    markCompleted(plan, 'step-0');
    expect(recorded.state).toEqual({ latchedStepId: 'step-0', launcher: expect.any(Object) });
    expect(view(recorded.state)).toEqual({ kind: 'modal', step: plan.steps[0] });

    // Dismissing the result view advances to the next step.
    const dismissed = applyRecommendedSessionControllerEvent(recorded.state, { action: 'dismiss' });
    expect(dismissed.state).toEqual({ latchedStepId: null, launcher: null });
    expect(dismissed.abortController).toBe(false);
    expect(view(dismissed.state)).toEqual({ kind: 'modal', step: plan.steps[1] });

    // Record+dismiss step 2.
    const recorded1 = applyRecommendedSessionControllerEvent(dismissed.state, { action: 'record', stepId: 'step-1', launcher: reviewLauncher() });
    markCompleted(plan, 'step-1');
    const dismissed1 = applyRecommendedSessionControllerEvent(recorded1.state, { action: 'dismiss' });

    // Recording step 3, then dismissing it, settles the session.
    const recorded2 = applyRecommendedSessionControllerEvent(dismissed1.state, { action: 'record', stepId: 'step-2', launcher: reviewLauncher() });
    markCompleted(plan, 'step-2');
    const dismissed2 = applyRecommendedSessionControllerEvent(recorded2.state, { action: 'dismiss' });
    expect(dismissed2.abortController).toBe(false);
    expect(dismissed2.state).toEqual({ latchedStepId: null, launcher: null });
    expect(view(dismissed2.state)).toEqual({ kind: 'terminal', status: 'completed' });
  });

  it('a bail before recording never advances and asks the shell to unmount', () => {
    const plan = buildPlan(['active']);
    const next = applyRecommendedSessionControllerEvent(createRecommendedSessionControllerState(), { action: 'abort' });
    expect(next.abortController).toBe(true);
    expect(next.state).toEqual({ latchedStepId: null, launcher: null });
    // The step is untouched, so the next view is still its modal, not terminal.
    expect(selectRecommendedSessionControllerView(plan, next.state)).toEqual({ kind: 'modal', step: plan.steps[0] });
  });
});
