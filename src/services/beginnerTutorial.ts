import type { BeginnerTutorialStepId } from '../domain/tutorial/beginnerTutorial';

/**
 * Local persistence for the beginner tutorial ("Your first poker hand").
 *
 * Fully on-device (docs/BEGINNER_TUTORIAL_IMPLEMENTATION_PLAN.md §6.2): a
 * small, versioned record under `rivermind.tutorial.v1`. Missing data means
 * never started. Invalid, partial, or future-version data fails safely to
 * never started, and storage errors never stop the user entering the app —
 * every reader degrades to "not started" and every writer swallows failures.
 * Only a step id / status is stored; the table state is always derived from
 * the step (src/domain/tutorial/beginnerTutorial.ts).
 */

const tutorialStorageKey = 'rivermind.tutorial.v1';

interface TutorialStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function deviceStorage(): TutorialStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export type BeginnerTutorialProgressV1 =
  | {
      version: 1;
      status: 'in-progress';
      stepId: BeginnerTutorialStepId;
    }
  | {
      version: 1;
      status: 'completed';
      completedAt: string;
    }
  | {
      version: 1;
      status: 'dismissed';
    };

export type BeginnerTutorialProgress = BeginnerTutorialProgressV1;

const STEP_IDS: readonly string[] = [
  'welcome',
  'seats-and-blinds',
  'hole-cards',
  'preflop-raise',
  'flop-reveal',
  'flop-decision',
  'turn-check',
  'river-value-bet',
  'showdown',
  'recap',
];

function parseProgress(raw: string | null): BeginnerTutorialProgress | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1) return null;
    // Fail closed on unknown fields: a future version may attach new meaning
    // to extra data, and half-interpreting it would be worse than restarting.
    if (record.status === 'in-progress') {
      const keys = Object.keys(record).sort();
      if (keys.length !== 3 || keys[0] !== 'status' || keys[1] !== 'stepId' || keys[2] !== 'version') return null;
      const stepId = record.stepId;
      return typeof stepId === 'string' && STEP_IDS.includes(stepId)
        ? { version: 1, status: 'in-progress', stepId: stepId as BeginnerTutorialStepId }
        : null;
    }
    if (record.status === 'completed') {
      const keys = Object.keys(record).sort();
      if (keys.length !== 3 || keys[0] !== 'completedAt' || keys[1] !== 'status' || keys[2] !== 'version') return null;
      return typeof record.completedAt === 'string' && record.completedAt.length > 0
        ? { version: 1, status: 'completed', completedAt: record.completedAt }
        : null;
    }
    if (record.status === 'dismissed') {
      const keys = Object.keys(record).sort();
      return keys.length === 2 && keys[0] === 'status' && keys[1] === 'version'
        ? { version: 1, status: 'dismissed' }
        : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Missing, corrupt, partial, or future-version data all read as never started. */
export function loadBeginnerTutorialProgress(
  storage: TutorialStorage | null = deviceStorage(),
): BeginnerTutorialProgress | null {
  if (!storage) return null;
  try {
    return parseProgress(storage.getItem(tutorialStorageKey));
  } catch {
    return null;
  }
}

/** Best-effort write; a storage failure never blocks or fails the tutorial. */
export function saveBeginnerTutorialProgress(
  progress: BeginnerTutorialProgress,
  storage: TutorialStorage | null = deviceStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(tutorialStorageKey, JSON.stringify(progress));
  } catch {
    // The in-memory session still works; the next save retries.
  }
}

/** Convenience writer for the in-progress checkpoint after every completed step. */
export function saveBeginnerTutorialCheckpoint(
  stepId: BeginnerTutorialStepId,
  storage: TutorialStorage | null = deviceStorage(),
): void {
  saveBeginnerTutorialProgress({ version: 1, status: 'in-progress', stepId }, storage);
}

/** Convenience writer for the completion record. */
export function saveBeginnerTutorialCompletion(
  completedAt = new Date().toISOString(),
  storage: TutorialStorage | null = deviceStorage(),
): void {
  saveBeginnerTutorialProgress({ version: 1, status: 'completed', completedAt }, storage);
}

/**
 * Clears tutorial state (with the existing local reset/account-deletion flow)
 * so the next person on the device receives a clean first-run experience.
 */
export function clearBeginnerTutorialProgress(storage: TutorialStorage | null = deviceStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(tutorialStorageKey);
  } catch {
    // A failed clear must not fail the reset flow.
  }
}

/** The entry-point label state Home/Learn derive their row copy from. */
export type BeginnerTutorialEntryStatus = 'not-started' | 'in-progress' | 'completed';

export function beginnerTutorialEntryStatus(
  progress: BeginnerTutorialProgress | null,
): BeginnerTutorialEntryStatus {
  if (!progress) return 'not-started';
  if (progress.status === 'completed') return 'completed';
  // A dismissed prompt reads like a fresh start at the entry points: the
  // tutorial remains discoverable, nothing about it is pending.
  return progress.status === 'in-progress' ? 'in-progress' : 'not-started';
}

/** True when the tutorial screen should offer Resume / Start over on entry. */
export function shouldOfferTutorialResume(
  progress: BeginnerTutorialProgress | null,
): boolean {
  return progress?.status === 'in-progress' && progress.stepId !== 'welcome';
}

export const beginnerTutorialStorageContract = {
  key: tutorialStorageKey,
  version: 1,
} as const;
