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

  it('never regresses a completed step and treats duplicate callbacks as a no-op', () => {
    const storage = memoryStorage();
    saveRecommendedSession(buildPlan(), storage);

    // A completed step can never be flipped back to an earlier state.
    updateRecommendedSessionStep('review', 'completed', storage);
    expect(updateRecommendedSessionStep('review', 'active', storage)).toBeNull();
    expect(updateRecommendedSessionStep('review', 'pending', storage)).toBeNull();
    expect(loadRecommendedSession(storage).plan!.steps.find((step) => step.id === 'review')?.status).toBe('completed');

    // A duplicate completion callback is a harmless no-op that returns the plan.
    const again = updateRecommendedSessionStep('review', 'completed', storage);
    expect(again).not.toBeNull();
    expect(again!.steps.find((step) => step.id === 'review')?.status).toBe('completed');
    expect(loadRecommendedSession(storage).plan!.steps.find((step) => step.id === 'review')?.status).toBe('completed');
  });

  it('advances a step through active before completing', () => {
    const storage = memoryStorage();
    saveRecommendedSession(buildPlan(), storage);

    const active = updateRecommendedSessionStep('practice:betting', 'active', storage);
    expect(active!.steps.find((step) => step.id === 'practice:betting')?.status).toBe('active');

    const completed = updateRecommendedSessionStep('practice:betting', 'completed', storage);
    expect(completed!.steps.find((step) => step.id === 'practice:betting')?.status).toBe('completed');
  });

  it('advances the plan lifecycle only forward, until it is terminal', () => {
    const storage = memoryStorage();
    saveRecommendedSession(buildPlan(), storage);

    // A planned session can be started, then abandoned — the open path.
    expect(setRecommendedSessionStatus('active', storage)!.status).toBe('active');
    expect(setRecommendedSessionStatus('abandoned', storage)!.status).toBe('abandoned');

    // An abandoned plan is terminal: it cannot be started again.
    expect(setRecommendedSessionStatus('active', storage)).toBeNull();
    expect(loadRecommendedSession(storage).plan?.status).toBe('abandoned');
  });

  it('does not reactivate or abandon a completed or abandoned plan', () => {
    // A completed plan cannot be reactivated.
    const completedStorage = memoryStorage();
    saveRecommendedSession(buildPlan(), completedStorage);
    updateRecommendedSessionStep('review', 'completed', completedStorage);
    updateRecommendedSessionStep('practice:betting', 'completed', completedStorage);
    updateRecommendedSessionStep('curriculum:lesson-postflop-board-texture', 'completed', completedStorage);
    expect(loadRecommendedSession(completedStorage).plan?.status).toBe('completed');
    expect(setRecommendedSessionStatus('active', completedStorage)).toBeNull();
    expect(setRecommendedSessionStatus('abandoned', completedStorage)).toBeNull();
    expect(loadRecommendedSession(completedStorage).plan?.status).toBe('completed');

    // An abandoned plan cannot be reactivated.
    const abandonedStorage = memoryStorage();
    saveRecommendedSession(buildPlan(), abandonedStorage);
    expect(setRecommendedSessionStatus('abandoned', abandonedStorage)!.status).toBe('abandoned');
    expect(setRecommendedSessionStatus('active', abandonedStorage)).toBeNull();
  });

  it('persists a migration once and does not re-report it on reload', () => {
    const plan = buildPlan();
    // Simulate an app update that removed the betting drill.
    const stale = JSON.parse(JSON.stringify(plan)) as RecommendedSessionPlan;
    stale.version = 0;
    stale.steps[2] = {
      ...stale.steps[2],
      target: { kind: 'activity', activityId: 'lesson-removed' },
    } as RecommendedSessionStep;
    const storage = memoryStorage(JSON.stringify(stale));

    // First load migrates: bumps the version, skips the unreachable target, and
    // writes the normalized result back to storage.
    const first = loadRecommendedSession(storage);
    expect(first.plan?.version).toBe(1);
    expect(first.diagnostics.missingActivity).toEqual(['lesson-removed']);
    expect(storage.values.get(storageKey)).not.toBe(JSON.stringify(stale));

    // Second load reads the already-migrated checkpoint: no new diagnostic, and
    // the migration is not re-applied.
    const second = loadRecommendedSession(storage);
    expect(second.plan?.version).toBe(1);
    expect(second.diagnostics).toEqual({ missingActivity: [], missingPackId: [], missingStepId: [] });
    expect(second.plan?.steps.find((step) => step.id === 'practice:betting')?.status).toBe('skipped');
  });

  it('reconciles a fully-skipped plan to completed', () => {
    const plan = buildPlan();
    const stale = JSON.parse(JSON.stringify(plan)) as RecommendedSessionPlan;
    // Every target is unreachable after an app update.
    stale.status = 'active';
    stale.steps = [
      { ...stale.steps[0], target: { kind: 'activity', activityId: 'lesson-removed-1' } } as unknown as RecommendedSessionStep,
      { ...stale.steps[1], target: { kind: 'activity', activityId: 'lesson-removed-2' } } as unknown as RecommendedSessionStep,
      { ...stale.steps[2], target: { kind: 'activity', activityId: 'lesson-removed-3' } } as unknown as RecommendedSessionStep,
    ];
    const storage = memoryStorage(JSON.stringify(stale));
    const loaded = loadRecommendedSession(storage);
    expect(loaded.plan?.steps.every((step) => step.status === 'skipped')).toBe(true);
    // No steps remain, so the plan is logically complete and is reconciled to
    // completed rather than persisted as open.
    expect(loaded.plan?.status).toBe('completed');
    expect(loaded.plan?.completedAt).not.toBeNull();
    expect(loaded.diagnostics.missingActivity).toEqual([
      'lesson-removed-1',
      'lesson-removed-2',
      'lesson-removed-3',
    ]);
  });
});
