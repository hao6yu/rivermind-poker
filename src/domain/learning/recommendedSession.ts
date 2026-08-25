import {
  learningConceptForActivityId,
  learningConceptForCurriculumStep,
  learningConceptForPracticePack,
  learningConceptForReview,
  type LearningConceptId,
} from './adaptiveRecommendation';
import { curriculumSteps } from './curriculum';
import { findLearningActivity } from './content';
import {
  practicePackById,
  practicePacks,
} from './practicePacks';
import {
  type PersonalPracticePlanItem,
  type PersonalPracticePlanReason,
  type PersonalPracticePlanTarget,
} from './personalPracticePlan';
import {
  selectDailyLearningReviewItems,
  type LearningReviewItem,
} from './reviewQueue';
import { tableMissions } from './tableMissions';
import type { LearningProgressEntry, PracticePackId } from './types';

/**
 * A recommended session is a short, coherent sequence of steps (typically 5-10
 * minutes) that RiverMind composes from the learner's personal plan. A session
 * carries a review, a primary learning or reinforcement step, and one more step
 * that practices the same concept. Every value here is serializable, so a
 * session can be resumed, completed, or reset after the app closes.
 *
 * The composer invents no lesson content or strategy logic: it only maps the
 * learner's own personal-plan targets (and the authored packs/missions they
 * point at) into a coherent, time-bounded sequence.
 */

export const SESSION_PLAN_VERSION = 1 as const;

/** A conservative duration used whenever authored metadata is unavailable, e.g. a review step. */
export const REVIEW_FALLBACK_MINUTES = 3;

export type RecommendedSessionStatus = 'planned' | 'active' | 'completed' | 'abandoned';

export type RecommendedSessionStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type RecommendedSessionStepKind = 'review' | 'activity' | 'practice' | 'curriculum';

export type RecommendedSessionStepTarget =
  | { kind: 'review'; dueCount: number }
  | { kind: 'practice'; packId: PracticePackId }
  | { kind: 'activity'; activityId: string }
  | { kind: 'curriculum'; stepId: string };

export interface RecommendedSessionStep {
  /** Stable, per-destination identifier used to resume/complete/skip a step after relaunch. */
  id: string;
  kind: RecommendedSessionStepKind;
  reason: PersonalPracticePlanReason;
  concept: LearningConceptId;
  estimatedMinutes: number;
  status: RecommendedSessionStepStatus;
  target: RecommendedSessionStepTarget;
  /** Short, non-localized label. The UI localizes this at render time. */
  titleHint: string;
}

export interface RecommendedSessionPlan {
  /** Stable identifier derived from the session's reason and primary concept. */
  id: string;
  /** The primary learning concept the whole session revolves around. */
  concept: LearningConceptId;
  createdAt: string;
  /** ISO timestamp recorded once every step is completed (null while open). */
  completedAt: string | null;
  /** Total estimated minutes across all routable steps. */
  estimatedMinutes: number;
  reason: PersonalPracticePlanReason;
  status: RecommendedSessionStatus;
  version: number;
  steps: RecommendedSessionStep[];
}

export interface ComposeOptions {
  now?: string;
  /** Deterministic seed used to pick among equally-aligned application steps. */
  seed?: number;
}

/** A normalization result: the plan plus enough diagnostics to report a mismatch. */
export interface RecommendedSessionNormalization {
  plan: RecommendedSessionPlan | null;
  skippableStepIds: string[];
  diagnostics: {
    missingActivity: string[];
    missingPackId: string[];
    missingStepId: string[];
  };
}

const stepStatuses = new Set<RecommendedSessionStepStatus>([
  'pending',
  'active',
  'completed',
  'skipped',
]);

const planStatuses = new Set<RecommendedSessionStatus>([
  'planned',
  'active',
  'completed',
  'abandoned',
]);

function planTargetKey(target: RecommendedSessionStepTarget): string {
  if (target.kind === 'review') return 'review';
  if (target.kind === 'practice') return `practice:${target.packId}`;
  if (target.kind === 'activity') return `activity:${target.activityId}`;
  return `curriculum:${target.stepId}`;
}

function toStepTarget(target: PersonalPracticePlanTarget): RecommendedSessionStepTarget | null {
  if (target.kind === 'review') return { kind: 'review', dueCount: target.dueCount };
  if (target.kind === 'practice') return { kind: 'practice', packId: target.pack.id };
  if (target.kind === 'activity') return { kind: 'activity', activityId: target.activity.id };
  return { kind: 'curriculum', stepId: target.step.id };
}

function titleHintFor(target: RecommendedSessionStepTarget): string {
  if (target.kind === 'review') return 'Review due';
  if (target.kind === 'practice') return target.packId;
  if (target.kind === 'activity') return target.activityId;
  return target.stepId;
}

function progressActivityIdForPack(packId: PracticePackId): string {
  return practicePackById(packId).progressActivityId;
}

function estimatedMinutesForTarget(target: RecommendedSessionStepTarget): number {
  if (target.kind === 'review') return REVIEW_FALLBACK_MINUTES;
  if (target.kind === 'activity') {
    return findLearningActivity(target.activityId)?.estimatedMinutes ?? REVIEW_FALLBACK_MINUTES;
  }
  if (target.kind === 'practice') {
    const entry = findLearningActivity(progressActivityIdForPack(target.packId));
    return entry?.estimatedMinutes ?? REVIEW_FALLBACK_MINUTES;
  }
  const step = curriculumSteps.find((candidate) => candidate.id === target.stepId);
  if (!step) return REVIEW_FALLBACK_MINUTES;
  if (step.kind === 'lesson') return step.lesson.estimatedMinutes;
  if (step.kind === 'practice') {
    const entry = findLearningActivity(step.pack.progressActivityId);
    return entry?.estimatedMinutes ?? REVIEW_FALLBACK_MINUTES;
  }
  if (step.kind === 'mission') return step.mission.estimatedMinutes;
  return step.trainer.estimatedMinutes;
}

/** Resolves the learning concept a target practices, used to keep a session coherent. */
function conceptForTarget(
  target: PersonalPracticePlanTarget,
  dueReviewItem: LearningReviewItem | null,
): LearningConceptId {
  if (target.kind === 'review') {
    return dueReviewItem ? learningConceptForReview(dueReviewItem) : 'poker-basics';
  }
  if (target.kind === 'practice') return learningConceptForPracticePack(target.pack.id);
  if (target.kind === 'activity') {
    return learningConceptForActivityId(target.activity.id) ?? 'poker-basics';
  }
  return learningConceptForCurriculumStep(target.step);
}

/**
 * Recomputes a concept from a serialized step target, used by the migration
 * path when a persisted step has lost its concept. A review step carries no
 * durable concept and falls back to the neutral default.
 */
function recoveredConcept(target: RecommendedSessionStepTarget): LearningConceptId {
  if (target.kind === 'practice') return learningConceptForPracticePack(target.packId);
  if (target.kind === 'activity') return learningConceptForActivityId(target.activityId) ?? 'poker-basics';
  if (target.kind === 'curriculum') {
    const step = curriculumSteps.find((candidate) => candidate.id === target.stepId);
    return step ? learningConceptForCurriculumStep(step) : 'poker-basics';
  }
  return 'poker-basics';
}

/**
 * Authored packs and missions that practice `concept` and could be an application
 * step. Every candidate is a real, authored target (never invented), already
 * filtered to a different step kind than the primary and to destinations the
 * learner has not completed.
 */
function sessionCandidatesForConcept(
  concept: LearningConceptId,
  excludeKeys: ReadonlySet<string>,
  excludeKinds: ReadonlySet<RecommendedSessionStepKind>,
  completedIds: ReadonlySet<string>,
): RecommendedSessionStepTarget[] {
  const candidates: RecommendedSessionStepTarget[] = [];

  for (const pack of practicePacks) {
    if (learningConceptForPracticePack(pack.id) !== concept) continue;
    const key = `practice:${pack.id}`;
    if (excludeKeys.has(key) || excludeKinds.has('practice')) continue;
    if (completedIds.has(pack.progressActivityId)) continue;
    candidates.push({ kind: 'practice', packId: pack.id });
  }

  for (const mission of tableMissions) {
    if (!mission.conceptIds.includes(concept)) continue;
    const key = `curriculum:${mission.id}`;
    if (excludeKeys.has(key) || excludeKinds.has('curriculum')) continue;
    if (completedIds.has(mission.id)) continue;
    candidates.push({ kind: 'curriculum', stepId: mission.id });
  }

  return candidates;
}

function makeStep(
  target: RecommendedSessionStepTarget,
  reason: PersonalPracticePlanReason,
  concept: LearningConceptId,
): RecommendedSessionStep {
  return {
    id: planTargetKey(target),
    kind: target.kind,
    reason,
    concept,
    estimatedMinutes: estimatedMinutesForTarget(target),
    status: 'pending',
    target,
    titleHint: titleHintFor(target),
  };
}

/**
 * Composes a coherent, sequenced session from the learner's personal plan.
 *
 * The plan carries: at most one due-review step, one primary learning or
 * reinforcement step chosen from the current plan, and one further step for the
 * same concept when a compatible authored pack or table mission exists. A
 * shorter due-review-only session is allowed when no credible additional target
 * is available. When composition yields nothing, the plan has no steps and the
 * UI should fall back to the existing one-step recommendation.
 */
export function composeRecommendedSessionPlan(
  items: readonly PersonalPracticePlanItem[],
  progress: readonly LearningProgressEntry[],
  reviewQueue: readonly LearningReviewItem[],
  options: ComposeOptions = {},
): RecommendedSessionPlan {
  const now = options.now ?? new Date().toISOString();
  const seed = options.seed ?? 0;

  const reviewItem = items.find((item) => item.reason === 'review') ?? null;
  const primaryItem = items.find((item) => item.reason !== 'review') ?? null;

  const dueReviews = selectDailyLearningReviewItems(reviewQueue, 3, now);
  const dueReviewItem = dueReviews[0] ?? null;
  const dueReviewConcept = dueReviewItem
    ? learningConceptForReview(dueReviewItem)
    : 'poker-basics';

  const steps: RecommendedSessionStep[] = [];
  const excludeKeys = new Set<string>();

  const addStep = (item: PersonalPracticePlanItem, concept: LearningConceptId) => {
    const target = toStepTarget(item.target);
    if (!target) return;
    const key = planTargetKey(target);
    if (excludeKeys.has(key)) return;
    excludeKeys.add(key);
    steps.push(makeStep(target, item.reason, concept));
  };

  // A due review wins the first step but never displaces the resumable/primary target.
  if (primaryItem) {
    if (reviewItem) addStep(reviewItem, dueReviewConcept);
    addStep(primaryItem, conceptForTarget(primaryItem.target, dueReviewItem));
  } else if (reviewItem) {
    addStep(reviewItem, dueReviewConcept);
  }

  // One more step for the same concept, unless the session is review-only or the
  // primary already filled the only coherent destination.
  const primaryStep = primaryItem ? steps.find((step) => step.reason === primaryItem.reason) ?? null : null;
  if (primaryStep) {
    const completedIds = new Set(progress
      .filter((entry) => entry.status === 'completed')
      .map((entry) => entry.activityId));
    const candidates = sessionCandidatesForConcept(
      primaryStep.concept,
      excludeKeys,
      new Set([primaryStep.kind]),
      completedIds,
    );
    const appTarget = candidates[seed % candidates.length];
    if (appTarget) {
      steps.push(makeStep(appTarget, primaryStep.reason, primaryStep.concept));
    }
  }

  const reason = primaryItem?.reason ?? reviewItem?.reason ?? 'continue-path';
  const concept = primaryStep?.concept ?? (reviewItem ? dueReviewConcept : 'poker-basics');

  return {
    id: `${reason}:${concept}`,
    concept,
    createdAt: now,
    completedAt: null,
    estimatedMinutes: steps.reduce((total, step) => total + step.estimatedMinutes, 0),
    reason,
    status: 'planned',
    version: SESSION_PLAN_VERSION,
    steps,
  };
}

/** True when the composed plan has at least one step worth showing. */
export function isSessionPlannable(plan: RecommendedSessionPlan): boolean {
  return plan.steps.length > 0;
}

/** True once every step is completed or safely skipped. */
export function isRecommendedSessionCompleted(plan: RecommendedSessionPlan): boolean {
  return plan.steps.length > 0
    && plan.steps.every((step) => step.status === 'completed' || step.status === 'skipped');
}

/** True when the session was explicitly abandoned. */
export function isRecommendedSessionAbandoned(plan: RecommendedSessionPlan): boolean {
  return plan.status === 'abandoned';
}

/**
 * The next step the learner can continue from, or null when the session is
 * done. Prefers the step already in progress so a resumed session restarts
 * where it left off rather than replaying earlier steps.
 */
export function firstIncompleteRecommendedStep(plan: RecommendedSessionPlan): RecommendedSessionStep | null {
  return plan.steps.find((step) => step.status === 'active')
    ?? plan.steps.find((step) => step.status === 'pending')
    ?? null;
}

/* -------------------------------------------------------------------------
 * Serialization, compatibility normalization, and app-update migration.
 *
 * Every plan is persisted exactly as the composer produces it, so migration is
 * just: validate the shape, normalize the version, drop targets that an app
 * update removed, and keep the rest of the journey intact.
 * ----------------------------------------------------------------------- */

export function isRecommendedSessionStepTarget(value: unknown): value is RecommendedSessionStepTarget {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  switch (candidate.kind) {
    case 'review':
      return typeof candidate.dueCount === 'number';
    case 'practice':
      return typeof candidate.packId === 'string';
    case 'activity':
      return typeof candidate.activityId === 'string';
    case 'curriculum':
      return typeof candidate.stepId === 'string';
    default:
      return false;
  }
}

function isStepStatus(value: unknown): value is RecommendedSessionStepStatus {
  return stepStatuses.has(value as RecommendedSessionStepStatus);
}

function isPlanStatus(value: unknown): value is RecommendedSessionStatus {
  return planStatuses.has(value as RecommendedSessionStatus);
}

function toInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function parseStep(raw: unknown): RecommendedSessionStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (!isStepStatus(candidate.status)) return null;
  if (!isRecommendedSessionStepTarget(candidate.target)) return null;

  const target = candidate.target;
  return {
    id: typeof candidate.id === 'string' ? candidate.id : planTargetKey(target),
    kind: target.kind,
    reason: candidate.reason as PersonalPracticePlanReason,
    concept: typeof candidate.concept === 'string' ? (candidate.concept as LearningConceptId) : recoveredConcept(target),
    estimatedMinutes: typeof candidate.estimatedMinutes === 'number'
      ? candidate.estimatedMinutes
      : estimatedMinutesForTarget(target),
    status: candidate.status,
    target,
    titleHint: typeof candidate.titleHint === 'string' ? candidate.titleHint : titleHintFor(target),
  };
}

function parsePlan(raw: unknown): RecommendedSessionPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  if (!isPlanStatus(candidate.status)) return null;
  if (!Number.isInteger(candidate.version)) return null;
  if (typeof candidate.concept !== 'string') return null;
  if (typeof candidate.reason !== 'string') return null;
  if (!Array.isArray(candidate.steps)) return null;

  const steps = candidate.steps.flatMap((value) => {
    const step = parseStep(value);
    return step ? [step] : [];
  });

  return {
    id: typeof candidate.id === 'string' ? candidate.id : 'session',
    concept: candidate.concept as LearningConceptId,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
    completedAt: candidate.completedAt === null
      ? null
      : typeof candidate.completedAt === 'string'
        ? candidate.completedAt
        : null,
    estimatedMinutes: toInteger(candidate.estimatedMinutes, steps.reduce((total, step) => total + step.estimatedMinutes, 0)),
    reason: candidate.reason as PersonalPracticePlanReason,
    status: candidate.status,
    version: toInteger(candidate.version, SESSION_PLAN_VERSION),
    steps,
  };
}

function routabilityDiagnostic(target: RecommendedSessionStepTarget): 'ok' | 'missing-activity' | 'missing-pack' | 'missing-step' {
  if (target.kind === 'review') return 'ok';
  if (target.kind === 'activity') {
    return findLearningActivity(target.activityId) ? 'ok' : 'missing-activity';
  }
  if (target.kind === 'practice') {
    return practicePacks.some((pack) => pack.id === target.packId) ? 'ok' : 'missing-pack';
  }
  return curriculumSteps.some((step) => step.id === target.stepId) ? 'ok' : 'missing-step';
}

/**
 * Validates a persisted (or migrated) plan: re-derives the schema version,
 * keeps the journey when an app update removed a field, and marks targets the
 * current content set can no longer reach as safely skippable. A target that is
 * routable stays; one that is not becomes a `skipped` step whose id is returned
 * for a bounded, logged diagnostic.
 */
export function normalizeRecommendedSession(raw: unknown): RecommendedSessionNormalization {
  const plan = parsePlan(raw);
  const diagnostics: RecommendedSessionNormalization['diagnostics'] = {
    missingActivity: [],
    missingPackId: [],
    missingStepId: [],
  };
  const skippableStepIds: string[] = [];

  if (!plan) {
    return { plan: null, skippableStepIds, diagnostics };
  }

  // Normalize the version (keep the journey — never drop the plan on a bump).
  const version = plan.version < SESSION_PLAN_VERSION ? SESSION_PLAN_VERSION : plan.version;

  const steps: RecommendedSessionStep[] = [];
  for (const step of plan.steps) {
    const missing = routabilityDiagnostic(step.target);
    if (missing === 'ok') {
      steps.push(step);
      continue;
    }
    if (missing === 'missing-activity') {
      if (step.target.kind === 'activity') diagnostics.missingActivity.push(step.target.activityId);
    }
    if (missing === 'missing-pack') {
      if (step.target.kind === 'practice') diagnostics.missingPackId.push(step.target.packId);
    }
    if (missing === 'missing-step') {
      if (step.target.kind === 'curriculum') diagnostics.missingStepId.push(step.target.stepId);
    }
    skippableStepIds.push(step.id);
    steps.push({ ...step, status: 'skipped', estimatedMinutes: 0 });
  }

  return {
    plan: {
      ...plan,
      version,
      steps,
      estimatedMinutes: steps.reduce((total, step) => total + step.estimatedMinutes, 0),
    },
    skippableStepIds,
    diagnostics,
  };
}

