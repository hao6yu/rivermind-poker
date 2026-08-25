import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import {
  firstIncompleteRecommendedStep,
  loadRecommendedSession,
  clearRecommendedSession,
  isRecommendedSessionAbandoned,
  isRecommendedSessionCompleted,
  isRecommendedSessionPlan,
  saveRecommendedSession,
  setRecommendedSessionStatus,
  updateRecommendedSessionStep,
  type RecommendedSessionPlan,
  type RecommendedSessionStep,
} from './recommendedSessionCheckpoint';

const storageKey = 'rivermind.recommended-session.v1';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(storageKey, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

function buildPlan(): RecommendedSessionPlan {
  return {
    id: 'review:postflop-betting',
    concept: 'postflop-betting',
    createdAt: '2026-01-15T10:00:00.000Z',
    completedAt: null,
    estimatedMinutes: 14,
    reason: 'resume',
    status: 'planned',
    version: 1,
    steps: [
      {
        id: 'review',
        kind: 'review',
        reason: 'review',
        concept: 'postflop-betting',
        estimatedMinutes: 3,
        status: 'pending',
        target: { kind: 'review', dueCount: 2 },
        titleHint: 'Review due',
      },
      {
        id: 'curriculum:lesson-postflop-board-texture',
        kind: 'curriculum',
        reason: 'resume',
        concept: 'postflop-betting',
        estimatedMinutes: 6,
        status: 'pending',
        target: { kind: 'curriculum', stepId: 'lesson-postflop-board-texture' },
        titleHint: 'lesson-postflop-board-texture',
      },
      {
        id: 'practice:betting',
        kind: 'practice',
        reason: 'reinforce',
        concept: 'postflop-betting',
        estimatedMinutes: 5,
        status: 'pending',
        target: { kind: 'practice', packId: 'betting' },
        titleHint: 'betting',
      },
    ],
  };
}

describe('recommended session checkpoint', () => {
  it('returns an empty result when nothing is stored', () => {
    const result = loadRecommendedSession(memoryStorage());
    expect(result.plan).toBeNull();
    expect(result.diagnostics).toEqual({ missingActivity: [], missingPackId: [], missingStepId: [] });
  });

  it('round-trips a saved session', () => {
    const storage = memoryStorage();
    saveRecommendedSession(buildPlan(), storage);
    expect(loadRecommendedSession(storage).plan).toEqual(buildPlan());
  });

  it('resolves a saved session as routable', () => {
    const storage = memoryStorage();
    saveRecommendedSession(buildPlan(), storage);
    expect(isRecommendedSessionPlan(loadRecommendedSession(storage).plan)).toBe(true);
  });

  it('resumes the next incomplete step and does not restart the session', () => {
    const plan = buildPlan();
    plan.status = 'active';
    plan.steps[1]!.status = 'active';
    const storage = memoryStorage(JSON.stringify(plan));
    const { plan: loaded } = loadRecommendedSession(storage);
    // The session is preserved (not recomposed) and the in-progress step is next.
    expect(loaded?.id).toBe(plan.id);
    expect(loaded?.status).toBe('active');
    expect(firstIncompleteRecommendedStep(loaded!)?.id).toBe(plan.steps[1]!.id);
  });

  it('records completion once every step is settled', () => {
    const storage = memoryStorage();
    saveRecommendedSession(buildPlan(), storage);

    updateRecommendedSessionStep('review', 'completed', storage);
    let plan = loadRecommendedSession(storage).plan!;
    expect(plan.status).toBe('planned');
    expect(plan.completedAt).toBeNull();

    updateRecommendedSessionStep('practice:betting', 'completed', storage);
    plan = loadRecommendedSession(storage).plan!;
    // Two steps done, one still pending — the session stays open.
    expect(plan.status).toBe('planned');

    // The final step flips the whole session to completed.
    updateRecommendedSessionStep('curriculum:lesson-postflop-board-texture', 'completed', storage);
    plan = loadRecommendedSession(storage).plan!;
    expect(plan.steps.every((step) => step.status === 'completed')).toBe(true);
    expect(plan.status).toBe('completed');
    expect(plan.completedAt).not.toBeNull();
  });

  it('treats safely skipped steps as settled', () => {
    const plan = buildPlan();
    plan.status = 'active';
    plan.steps[0]!.status = 'skipped';
    plan.steps[1]!.status = 'skipped';
    plan.steps[2]!.status = 'skipped';
    const storage = memoryStorage(JSON.stringify(plan));
    expect(isRecommendedSessionCompleted(loadRecommendedSession(storage).plan!)).toBe(true);
    expect(firstIncompleteRecommendedStep(loadRecommendedSession(storage).plan!)).toBeNull();
  });

  it('abandons a session without marking it complete', () => {
    const storage = memoryStorage();
    saveRecommendedSession(buildPlan(), storage);
    const plan = setRecommendedSessionStatus('abandoned', storage)!;
    expect(plan.status).toBe('abandoned');
    expect(isRecommendedSessionAbandoned(plan)).toBe(true);
    expect(isRecommendedSessionCompleted(plan)).toBe(false);
  });

  it('does nothing when an unknown step is updated', () => {
    const storage = memoryStorage();
    saveRecommendedSession(buildPlan(), storage);
    expect(updateRecommendedSessionStep('nope', 'completed', storage)).toBeNull();
    expect(loadRecommendedSession(storage).plan?.status).toBe('planned');
  });

  it('drops the checkpoint', () => {
    const storage = memoryStorage();
    saveRecommendedSession(buildPlan(), storage);
    clearRecommendedSession(storage);
    expect(loadRecommendedSession(storage).plan).toBeNull();
  });

  it('reconciles a stale plan after an app update without losing the journey', () => {
    const plan = buildPlan();
    // Simulate an app update that removed the betting drill.
    const stale = JSON.parse(JSON.stringify(plan)) as RecommendedSessionPlan;
    stale.version = 0;
    stale.steps[2] = {
      ...stale.steps[2],
      target: { kind: 'activity', activityId: 'lesson-removed' },
    } as RecommendedSessionStep;
    const storage = memoryStorage(JSON.stringify(stale));
    const { plan: loaded, diagnostics } = loadRecommendedSession(storage);
    expect(loaded?.version).toBe(1);
    expect(diagnostics.missingActivity).toEqual(['lesson-removed']);
    expect(loaded?.steps.filter((step) => step.status !== 'skipped')).toHaveLength(2);
    expect(isRecommendedSessionPlan(loaded)).toBe(true);
  });

  it('does not throw on malformed stored data', () => {
    const storage = memoryStorage('{ this is not json');
    expect(() => loadRecommendedSession(storage)).not.toThrow();
    expect(loadRecommendedSession(storage).plan).toBeNull();
  });
});
