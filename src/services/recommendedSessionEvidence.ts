import type { SessionStepDecisions } from '../domain/learning/sessionClosing';

/**
 * Local, first-class store for the in-flight recommended session's decision
 * evidence. It persists the session's own tally of scored decisions and costly
 * mistakes, keyed by the plan's id, so a relaunch or a resume can hydrate the
 * closing outcome's evidence instead of restarting the count at zero. A
 * completed or abandoned plan keeps its stored evidence until the learner
 * dismisses the closing outcome (Finish), which clears it.
 */

const storageKey = 'rivermind.recommended-session-evidence.v1';

interface RecommendedSessionEvidenceStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}
export type { RecommendedSessionEvidenceStorage };

interface PersistedSessionEvidence {
  planId: string;
  decisions: SessionStepDecisions;
}

function deviceStorage(): RecommendedSessionEvidenceStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

/**
 * Reads the stored evidence for a plan. Returns the decisions only when the
 * stored record belongs to `planId`; a stored record for a different plan (a
 * newly composed session) is ignored so a fresh plan starts from zero.
 */
export function loadSessionEvidence(
  planId: string | null | undefined,
  storage: RecommendedSessionEvidenceStorage | null = deviceStorage(),
): SessionStepDecisions | null {
  if (!storage || !planId) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(storage.getItem(storageKey) ?? 'null');
  } catch {
    return null;
  }
  const record = raw as PersistedSessionEvidence | null;
  // A valid record is an object with a plan id matching this session and a
  // decisions tally with numeric fields. Anything malformed — e.g. an object
  // with only a `planId`, or a `decisions` that omits the counters — is ignored
  // rather than throwing, so a corrupt store never crashes launch.
  if (!record || typeof record.planId !== 'string' || record.planId !== planId) return null;
  const decisions = record.decisions;
  if (
    !decisions
    || typeof decisions.decisionsScored !== 'number'
    || typeof decisions.costlyMistakes !== 'number'
  ) {
    return null;
  }
  return {
    decisionsScored: Math.max(0, decisions.decisionsScored | 0),
    costlyMistakes: Math.max(0, decisions.costlyMistakes | 0),
  };
}

/** Stores the current session's evidence for `planId`. */
export function saveSessionEvidence(
  planId: string | null | undefined,
  decisions: SessionStepDecisions,
  storage: RecommendedSessionEvidenceStorage | null = deviceStorage(),
): void {
  if (!storage || !planId) return;
  try {
    storage.setItem(storageKey, JSON.stringify({ planId, decisions } satisfies PersistedSessionEvidence));
  } catch {
    // A full or unavailable store keeps the in-memory tally for this session.
  }
}

/** Clears the stored evidence (a dismissed closing outcome, or a reset). */
export function clearSessionEvidence(
  storage: RecommendedSessionEvidenceStorage | null = deviceStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // no-op
  }
}
