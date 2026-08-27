import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import {
  type RecommendedSessionPlan,
} from '../../../domain/learning/recommendedSession';
import { saveRecommendedSession } from '../../../services/recommendedSessionCheckpoint';
import {
  fromPlan,
  journeyClose,
  journeyDone,
  journeyEndEarly,
  journeyMissionExit,
  journeyNextStep,
  journeyPhase,
  journeyRelaunch,
  journeySkip,
  journeyStart,
} from '../recommendedSessionJourney';

const storageKey = 'rivermind.recommended-session.v1';

interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  values: Map<string, string>;
}

function memoryStorage(initial?: string): MemoryStorage {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(storageKey, initial);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

/** Save a plan to storage and hand back the object as the shell would. */
function save(storage: MemoryStorage, plan: RecommendedSessionPlan): RecommendedSessionPlan {
  saveRecommendedSession(plan, storage);
  return JSON.parse(storage.values.get(storageKey)!) as RecommendedSessionPlan;
}

/** A three-step session (review, curriculum, practice) in a chosen status. */
function buildPlan(status: 'planned' | 'active' | 'completed' | 'abandoned'): RecommendedSessionPlan {
  return {
    id: 'review:postflop-betting',
    concept: 'postflop-betting',
    createdAt: '2026-01-15T10:00:00.000Z',
    completedAt: null,
    estimatedMinutes: 14,
    reason: 'resume',
    status,
    version: 1,
    steps: [
      {
        id: 'review',
        kind: 'review',
        reason: 'review',
        concept: 'postflop-betting',
        estimatedMinutes: 3,
        status: status === 'completed' ? 'completed' : status === 'active' ? 'active' : 'pending',
        target: { kind: 'review', dueCount: 2 },
        titleHint: 'Review due',
      },
      {
        id: 'curriculum:lesson-postflop-board-texture',
        kind: 'curriculum',
        reason: 'resume',
        concept: 'postflop-betting',
        estimatedMinutes: 6,
        status: status === 'completed' ? 'completed' : 'pending',
        target: { kind: 'curriculum', stepId: 'lesson-postflop-board-texture' },
        titleHint: 'lesson-postflop-board-texture',
      },
      {
        id: 'practice:betting',
        kind: 'practice',
        reason: 'reinforce',
        concept: 'postflop-betting',
        estimatedMinutes: 5,
        status: status === 'completed' ? 'completed' : 'pending',
        target: { kind: 'practice', packId: 'betting' },
        titleHint: 'betting',
      },
    ],
  };
}

describe('recommended session journey', () => {
  describe('journeyPhase / journeyNextStep', () => {
    it('derives an idle phase and no next step when nothing exists', () => {
      expect(journeyPhase(null)).toBe('idle');
      expect(journeyNextStep(null)).toBeNull();
      expect(fromPlan(null).phase).toBe('idle');
    });

    it('reports active while a step is in progress, then completed', () => {
      const plan = buildPlan('active');
      expect(journeyPhase(plan)).toBe('active');
      expect(journeyNextStep(plan)?.id).toBe('review');

      plan.steps[0]!.status = 'completed';
      expect(journeyNextStep(plan)?.id).toBe('curriculum:lesson-postflop-board-texture');
    });

    it('reports abandoned without treating it as completed', () => {
      expect(journeyPhase(buildPlan('abandoned'))).toBe('abandoned');
      expect(journeyNextStep(buildPlan('abandoned'))).toBeNull();
    });

    it('reports completed only when every step is settled', () => {
      const plan = buildPlan('active');
      plan.steps[0]!.status = 'completed';
      expect(journeyPhase(plan)).toBe('active');
      plan.steps[1]!.status = 'completed';
      expect(journeyPhase(plan)).toBe('active');
      plan.steps[2]!.status = 'completed';
      expect(journeyPhase(plan)).toBe('completed');
    });
  });

  describe('journeyStart', () => {
    it('activates an already-open plan without composing a new one', () => {
      const storage = memoryStorage();
      const plan = save(storage, buildPlan('planned'));
      const result = journeyStart(plan, () => null, storage);

      expect(result.opened).toBe(true);
      expect(result.plan?.status).toBe('active');
      expect(result.closes).toBe(false);
      // The existing plan is preserved, not recomposed.
      expect(storage.values.get(storageKey)).toBe(JSON.stringify(result.plan));
    });

    it('resumes an in-progress (active) plan in place', () => {
      const storage = memoryStorage();
      const plan = save(storage, buildPlan('active'));
      const result = journeyStart(plan, () => null, storage);

      expect(result.plan?.id).toBe(plan.id);
      expect(result.plan?.status).toBe('active');
      expect(journeyNextStep(result.plan!)?.id).toBe('review');
    });

    it('composes and activates a fresh plan when nothing is open', () => {
      const storage = memoryStorage();
      const fresh = buildPlan('planned');
      const result = journeyStart(null, () => fresh, storage);

      expect(result.opened).toBe(true);
      expect(result.plan?.status).toBe('active');
      // The composed plan was saved to storage and activated.
      const loaded = JSON.parse(storage.values.get(storageKey)!) as RecommendedSessionPlan;
      expect(loaded.status).toBe('active');
      expect(loaded.steps).toHaveLength(3);
    });

    it('does nothing to open when composition yields no plan', () => {
      const storage = memoryStorage();
      const result = journeyStart(null, () => null, storage);
      expect(result.opened).toBe(false);
      expect(result.plan).toBeNull();
    });
  });

  describe('journeyClose', () => {
    it('returns the plan untouched so the active step resumes', () => {
      const plan = buildPlan('active');
      const result = journeyClose(plan);

      expect(result.closes).toBe(true);
      expect(result.plan).toEqual(plan);
      expect(result.terminal).toBe(false);
      expect(result.opened).toBe(false);
    });

    it('keeps an in-progress step pending rather than skipping it', () => {
      const plan = buildPlan('active');
      plan.steps[0]!.status = 'active';
      const result = journeyClose(plan);
      expect(result.plan!.steps[0]!.status).toBe('active');
    });
  });

  describe('journeyDone', () => {
    it('advances one step while the session stays open', () => {
      const storage = memoryStorage();
      save(storage, buildPlan('active'));
      const result = journeyDone('review', storage);

      expect(result.plan!.steps[0]!.status).toBe('completed');
      expect(result.closes).toBe(false);
      expect(result.terminal).toBe(false);
      expect(journeyNextStep(result.plan!)?.id).toBe('curriculum:lesson-postflop-board-texture');
    });

    it('reconciles to completed and closes when the final step finishes', () => {
      const storage = memoryStorage();
      const plan = save(storage, buildPlan('active'));
      plan.steps[0]!.status = 'completed';
      plan.steps[1]!.status = 'completed';
      save(storage, plan);
      const result = journeyDone('practice:betting', storage);

      expect(result.plan!.steps.every((step) => step.status === 'completed')).toBe(true);
      expect(result.plan!.status).toBe('completed');
      expect(result.closes).toBe(true);
      expect(result.terminal).toBe(true);
    });

    it('rejects a step on a terminal session', () => {
      const storage = memoryStorage();
      save(storage, buildPlan('completed'));
      const result = journeyDone('review', storage);
      // A stale completion callback cannot resurrect a finished session.
      expect(result.plan).toBeNull();
      expect(result.closes).toBe(false);
    });
  });

  describe('journeySkip', () => {
    it('records a compatibility skip without completing the session', () => {
      const storage = memoryStorage();
      const plan = save(storage, buildPlan('active'));
      plan.steps[0]!.status = 'completed'; // review done; the curriculum step is current
      save(storage, plan);
      const result = journeySkip('curriculum:lesson-postflop-board-texture', storage);

      expect(result.plan!.steps[1]!.status).toBe('skipped');
      expect(journeyPhase(result.plan!)).toBe('active');
      expect(journeyNextStep(result.plan!)?.id).toBe('practice:betting');
    });

    it('reconciles to completed only when every step is settled', () => {
      const storage = memoryStorage();
      const plan = save(storage, buildPlan('active'));
      plan.steps[0]!.status = 'completed';
      plan.steps[1]!.status = 'skipped';
      save(storage, plan);
      const result = journeySkip('practice:betting', storage);

      expect(result.plan!.status).toBe('completed');
      expect(result.terminal).toBe(true);
    });

    it('never regresses a completed step', () => {
      const storage = memoryStorage();
      const plan = save(storage, buildPlan('active'));
      plan.steps[0]!.status = 'completed';
      save(storage, plan);
      const result = journeySkip('review', storage);
      // A completed step cannot become skipped, so the transition is rejected.
      expect(result.plan).toBeNull();
    });
  });

  describe('journeyMissionExit', () => {
    it('records a returned mission as a completed step', () => {
      const storage = memoryStorage();
      save(storage, buildPlan('active'));
      const result = journeyMissionExit('review', storage);

      expect(result.plan!.steps[0]!.status).toBe('completed');
      expect(result.terminal).toBe(false);
      expect(journeyNextStep(result.plan!)?.id).toBe('curriculum:lesson-postflop-board-texture');
    });

    it('keeps the journey open — does not close the controller — when a step remains', () => {
      // The shell only closes the controller (recommendedSessionOpen) on an
      // abandonment; a completed mission return must leave it open so the next
      // journey step renders. The transition signals that: not terminal, not
      // closing, and a runnable next step remains.
      const storage = memoryStorage();
      const plan = save(storage, buildPlan('active'));
      plan.steps[0]!.status = 'completed';
      save(storage, plan);
      const result = journeyMissionExit('curriculum:lesson-postflop-board-texture', storage);

      expect(result.plan!.steps[1]!.status).toBe('completed');
      expect(result.closes).toBe(false);
      expect(result.terminal).toBe(false);
      expect(journeyNextStep(result.plan!)?.id).toBe('practice:betting');
    });

    it('reconciles to completed when the mission was the last step', () => {
      const storage = memoryStorage();
      const plan = save(storage, buildPlan('active'));
      plan.steps[0]!.status = 'completed';
      plan.steps[1]!.status = 'completed';
      save(storage, plan);
      const result = journeyMissionExit('practice:betting', storage);

      expect(result.plan!.status).toBe('completed');
      expect(result.closes).toBe(true);
      expect(result.terminal).toBe(true);
    });
  });

  describe('journeyEndEarly', () => {
    it('abandons the session without marking it complete', () => {
      const storage = memoryStorage();
      save(storage, buildPlan('active'));
      const result = journeyEndEarly(storage);

      expect(result.plan!.status).toBe('abandoned');
      expect(result.closes).toBe(true);
      expect(result.terminal).toBe(true);
      // No step is flipped to completed: the interruption is preserved as abandoned.
      expect(result.plan!.steps.some((step) => step.status === 'completed')).toBe(false);
    });

    it('rejects abandoning an already terminal session', () => {
      const storage = memoryStorage();
      save(storage, buildPlan('completed'));
      const result = journeyEndEarly(storage);
      // A completed session cannot be abandoned, so the transition is rejected.
      expect(result.plan).toBeNull();
      expect(result.closes).toBe(false);
    });
  });

  describe('journeyRelaunch', () => {
    it('loads a persisted active plan and resumes it', () => {
      const plan = buildPlan('active');
      plan.steps[0]!.status = 'active';
      const storage = memoryStorage(JSON.stringify(plan));
      const state = journeyRelaunch(storage);

      expect(state.phase).toBe('active');
      expect(state.plan?.id).toBe(plan.id);
      expect(state.nextStep?.id).toBe('review');
    });

    it('returns idle when there is no stored plan', () => {
      const state = journeyRelaunch(memoryStorage());
      expect(state.phase).toBe('idle');
      expect(state.plan).toBeNull();
    });
  });
});
