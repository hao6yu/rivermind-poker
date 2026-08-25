import 'expo-sqlite/localStorage/install';

import {
  firstIncompleteRecommendedStep,
  isRecommendedSessionAbandoned,
  isRecommendedSessionCompleted,
  normalizeRecommendedSession,
  type RecommendedSessionPlan,
  type RecommendedSessionStep,
  type RecommendedSessionStepStatus,
  type RecommendedSessionStatus,
} from '../domain/learning/recommendedSession';

/**
 * Local, first-class checkpoint for the recommended session. It persists the
 * versioned plan, the current step, and the completion state so the session can
 * resume, complete, be reset, or be reconciled after an app update — without
 * touching any server store (that is the analytics layer's job).
 */

const storageKey = 'rivermind.recommended-session.v1';

interface RecommendedSessionStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface RecommendedSessionResult {
  plan: RecommendedSessionPlan | null;
  diagnostics: {
    missingActivity: string[];
    missingPackId: string[];
    missingStepId: string[];
  };
}

function deviceStorage(): RecommendedSessionStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function emptyDiagnostics(): RecommendedSessionResult['diagnostics'] {
  return { missingActivity: [], missingPackId: [], missingStepId: [] };
}

/** True when `value` parses to a valid session plan. */
export function isRecommendedSessionPlan(value: unknown): value is RecommendedSessionPlan {
  return normalizeRecommendedSession(value).plan !== null;
}

/**
 * Reads and normalizes the persisted session. A plan that is stale after an app
 * update (removed target, older version) is reconciled on read: the journey is
 * kept, and unreachable targets are reported in the diagnostics so the UI can
 * skip them safely.
 */
export function loadRecommendedSession(
  storage: RecommendedSessionStorage | null = deviceStorage(),
): RecommendedSessionResult {
  if (!storage) return { plan: null, diagnostics: emptyDiagnostics() };
  let raw: unknown;
  try {
    raw = JSON.parse(storage.getItem(storageKey) ?? 'null');
  } catch {
    return { plan: null, diagnostics: emptyDiagnostics() };
  }
  const result = normalizeRecommendedSession(raw);
  return { plan: result.plan, diagnostics: result.diagnostics };
}

export function saveRecommendedSession(
  plan: RecommendedSessionPlan,
  storage: RecommendedSessionStorage | null = deviceStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(plan));
  } catch {
    // A full or unavailable store keeps the in-memory session for this app session.
  }
}

/**
 * Sets a step's status and records completion once every step is settled.
 * Returns the updated plan, or null when the step does not exist.
 */
export function updateRecommendedSessionStep(
  stepId: string,
  status: RecommendedSessionStepStatus,
  storage: RecommendedSessionStorage | null = deviceStorage(),
): RecommendedSessionPlan | null {
  const { plan } = loadRecommendedSession(storage);
  if (!plan) return null;
  if (!plan.steps.some((candidate) => candidate.id === stepId)) return null;

  const next: RecommendedSessionPlan = {
    ...plan,
    steps: plan.steps.map((step) => (step.id === stepId ? { ...step, status } : step)),
  };

  if (isRecommendedSessionCompleted(next) && next.completedAt === null) {
    next.completedAt = new Date().toISOString();
    next.status = 'completed';
  }

  saveRecommendedSession(next, storage);
  return next;
}

/** Transitions the session itself (e.g. starting or abandoning it). */
export function setRecommendedSessionStatus(
  status: 'active' | 'abandoned',
  storage: RecommendedSessionStorage | null = deviceStorage(),
): RecommendedSessionPlan | null {
  const { plan } = loadRecommendedSession(storage);
  if (!plan) return null;
  const next: RecommendedSessionPlan = { ...plan, status };
  saveRecommendedSession(next, storage);
  return next;
}

/** Clears the checkpoint. */
export function clearRecommendedSession(
  storage: RecommendedSessionStorage | null = deviceStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // no-op
  }
}

export {
  firstIncompleteRecommendedStep,
  isRecommendedSessionAbandoned,
  isRecommendedSessionCompleted,
};
export type { RecommendedSessionPlan, RecommendedSessionStep };
