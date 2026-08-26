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
  PRACTICE_PACK_MINUTES,
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

/**
 * The upper bound of the authored session-duration boundary (Phase 16:
 * five-to-ten-minute sessions). The review and application steps are gated so
 * they never push the session past it. A dictated primary — resuming or
 * continuing a long lesson or table mission — is always kept, but a primary
 * whose own duration already exceeds the ceiling can never be part of a
 * compliant session, so the composer yields no plan and the controller falls
 * back to the existing one-step recommendation instead.
 */
export const SESSION_MAX_MINUTES = 10;

/**
 * The lower bound of the authored session-duration boundary (Phase 16:
 * five-to-ten-minute sessions). Normal sessions must reach it; only a
 * due-review-only session is allowed to fall below it.
 */
export const SESSION_MIN_MINUTES = 5;

/**
 * The maximum number of due review items the composer can freeze into a single
 * review step per day. A review step never launches more due items than this.
 */
export const LEARNING_REVIEW_DAILY_LIMIT = 3;

/** Known concept and reason identifiers, used to reject corrupted or future payloads. */
export const LEARNING_CONCEPT_IDS: readonly LearningConceptId[] = [
  'poker-basics',
  'table-math',
  'betting-purpose',
  'preflop-entry',
  'preflop-pressure',
  'preflop-three-bet',
  'postflop-betting',
  'postflop-odds',
  'postflop-range',
  'postflop-river',
  'tournament-short-stack',
  'tournament-bubble',
  'opponent-adjustments',
  'advanced-math',
] as const;

export const PRACTICE_PLAN_REASONS: readonly PersonalPracticePlanReason[] = [
  'resume',
  'review',
  'table-focus',
  'reinforce',
  'goal-focus',
  'continue-path',
] as const;

export type RecommendedSessionStatus = 'planned' | 'active' | 'completed' | 'abandoned';

export type RecommendedSessionStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type RecommendedSessionStepKind = 'review' | 'activity' | 'practice' | 'curriculum';

export type RecommendedSessionStepTarget =
  | { kind: 'review'; dueCount: number; itemIds?: readonly string[] | null }
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

/**
 * The stable progress destination a target writes to, derived from the
 * activity id rather than the target's shape. A direct practice-pack step and
 * the same curriculum practice step (whose id is the pack's progressActivityId)
 * collapse to one key, so they can never both enter a session even though they
 * open and grade the same drill.
 */
function destinationKey(target: RecommendedSessionStepTarget): string {
  if (target.kind === 'review') return 'review';
  if (target.kind === 'practice') return `activity:${progressActivityIdForPack(target.packId)}`;
  if (target.kind === 'activity') return `activity:${target.activityId}`;
  // A curriculum step's id is already the activity id (lesson/trainer id, pack
  // progressActivityId, or mission id), so it shares a key with the equivalent
  // direct target of the same destination.
  return `activity:${target.stepId}`;
}

function toStepTarget(target: PersonalPracticePlanTarget): RecommendedSessionStepTarget | null {
  if (target.kind === 'review') return { kind: 'review', dueCount: target.dueCount };
  if (target.kind === 'practice') return { kind: 'practice', packId: target.pack.id };
  if (target.kind === 'activity') return { kind: 'activity', activityId: target.activity.id };
  return { kind: 'curriculum', stepId: target.step.id };
}

/**
 * Builds the review step target for the matched due reviews. The review step
 * pins every matched review item's stable id (up to the daily limit) so a
 * relaunch launches the exact set the composer matched instead of re-selecting
 * the first due items globally, which could be a cross-concept review. Each id
 * is stable across relaunches, so the frozen review survives an app restart or
 * an interrupted session.
 *
 * The selected count (`dueCount`) is the number of frozen items, so it always
 * agrees with `itemIds` rather than advertising the personal plan's (possibly
 * larger) due total.
 */
function reviewTargetForMatch(matchedItems: readonly LearningReviewItem[]): RecommendedSessionStepTarget {
  const itemIds = matchedItems.map((item) => item.id);
  return {
    kind: 'review',
    dueCount: itemIds.length,
    itemIds,
  };
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
    // A practice-pack scenario session is authored as PRACTICE_PACK_MINUTES. The
    // pack trainers are generated dynamically and are not in the static activity
    // registry, so the constant (shared with the trainers) is the source of
    // truth here rather than a lookup that always misses and falls back to 3.
    return PRACTICE_PACK_MINUTES;
  }
  const step = curriculumSteps.find((candidate) => candidate.id === target.stepId);
  if (!step) return REVIEW_FALLBACK_MINUTES;
  if (step.kind === 'lesson') return step.lesson.estimatedMinutes;
  if (step.kind === 'practice') {
    // See `estimatedMinutesForTarget` for the direct practice target: the
    // pack-scenario session is authored as PRACTICE_PACK_MINUTES.
    return PRACTICE_PACK_MINUTES;
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
 * filtered to destinations the learner has not completed, that have not already
 * been claimed by an earlier step (deduped by their shared progress
 * destination, not by step shape), and that fit the remaining session budget.
 */
function sessionCandidatesForConcept(
  concept: LearningConceptId,
  excludeKeys: ReadonlySet<string>,
  completedIds: ReadonlySet<string>,
  budget: number,
): RecommendedSessionStepTarget[] {
  const candidates: RecommendedSessionStepTarget[] = [];

  for (const pack of practicePacks) {
    if (learningConceptForPracticePack(pack.id) !== concept) continue;
    if (excludeKeys.has(destinationKey({ kind: 'practice', packId: pack.id }))) continue;
    if (completedIds.has(pack.progressActivityId)) continue;
    if (estimatedMinutesForTarget({ kind: 'practice', packId: pack.id }) > budget) continue;
    candidates.push({ kind: 'practice', packId: pack.id });
  }

  // A mission's concept is resolved through the activity/curriculum concept
  // mapping (mission.conceptIds are lower-level, non-domain identifiers), so it
  // aligns with the primary concept like any other destination.
  for (const mission of tableMissions) {
    const missionStep = curriculumSteps.find((candidate) => (
      candidate.kind === 'mission' && candidate.mission.id === mission.id
    ));
    if (!missionStep || learningConceptForCurriculumStep(missionStep) !== concept) continue;
    const target: RecommendedSessionStepTarget = { kind: 'curriculum', stepId: missionStep.id };
    if (excludeKeys.has(destinationKey(target))) continue;
    if (completedIds.has(missionStep.id)) continue;
    if (estimatedMinutesForTarget(target) > budget) continue;
    candidates.push(target);
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
 * Builds an empty recommended session plan. The controller falls back to the
 * one-step Home recommendation for these, so it is not counted as a session.
 */
function emptySessionPlan(reason: PersonalPracticePlanReason, concept: LearningConceptId, now: string): RecommendedSessionPlan {
  return {
    version: SESSION_PLAN_VERSION,
    id: `${reason}:${concept}`,
    concept,
    createdAt: now,
    completedAt: null,
    estimatedMinutes: 0,
    reason,
    status: 'planned',
    steps: [],
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

  const primaryTarget = primaryItem ? toStepTarget(primaryItem.target) : null;
  const primaryConcept = primaryTarget ? conceptForTarget(primaryItem!.target, null) : null;
  const primaryMinutes = primaryTarget ? estimatedMinutesForTarget(primaryTarget) : 0;

  // A dictated primary whose own duration already exceeds the authored ceiling
  // can never be part of a compliant (two-to-four-step, five-to-ten-minute)
  // session, so the composer yields nothing. The controller's one-step fallback
  // (a single Home action) presents the dictated primary instead.
  if (primaryTarget && primaryMinutes > SESSION_MAX_MINUTES) {
    return emptySessionPlan(primaryItem?.reason ?? 'continue-path', primaryConcept ?? 'poker-basics', now);
  }

  // A due review practices the concept the session is already working, so its
  // step stays conceptually coherent with the primary. When a primary exists,
  // prefer a due review that practices the primary concept; omit the review
  // when only a cross-concept review is due so coherence is preserved (the
  // review remains due for the next session).
  const dueReviews = selectDailyLearningReviewItems(reviewQueue, LEARNING_REVIEW_DAILY_LIMIT, now);
  // Freeze every matching due review up to the daily limit so the step launches
  // exactly the set it promises, not just the first due item.
  const dueReviewItems = primaryConcept
    ? dueReviews.filter((item) => learningConceptForReview(item) === primaryConcept)
    : dueReviews;
  const dueReviewItem = dueReviewItems[0] ?? null;
  const dueReviewConcept = dueReviewItem
    ? learningConceptForReview(dueReviewItem)
    : 'poker-basics';

  const steps: RecommendedSessionStep[] = [];
  const excludeKeys = new Set<string>();

  const addStep = (item: PersonalPracticePlanItem, concept: LearningConceptId) => {
    const target = toStepTarget(item.target);
    if (!target) return;
    const key = destinationKey(target);
    if (excludeKeys.has(key)) return;
    excludeKeys.add(key);
    steps.push(makeStep(target, item.reason, concept));
  };

  // A primary step is dictated by the plan, so it is always kept. A due review
  // is a short, first step; when a primary exists it is added only when it fits
  // the session's duration boundary (a long primary is not padded with a
  // review), but a review-only session is a valid short session and is always
  // produced. The review only appears when a matching due review exists, so a
  // cross-concept review does not break the session's coherence.
  const reviewTarget = (reviewItem && dueReviewItem)
    ? primaryTarget
      ? primaryMinutes + REVIEW_FALLBACK_MINUTES <= SESSION_MAX_MINUTES
        ? reviewTargetForMatch(dueReviewItems)
        : null
      : reviewTargetForMatch(dueReviewItems)
    : null;

  // The due review wins the first step but never displaces the resumable/primary target.
  // Its matched review item's stable id is frozen into the target, so a relaunch
  // launches the same review the composer matched instead of re-selecting the first
  // due items globally, which could be a cross-concept review.
  if (reviewTarget) {
    const key = destinationKey(reviewTarget);
    if (!excludeKeys.has(key)) {
      excludeKeys.add(key);
      steps.push(makeStep(reviewTarget, reviewItem!.reason, dueReviewConcept));
    }
  }
  if (primaryTarget) addStep(primaryItem!, primaryConcept as LearningConceptId);

  // One more step for the same concept, when it fits the remaining budget relative
  // to the primary and review (so a long primary never pulls in an extra step).
  const primaryStep = primaryTarget ? steps.find((step) => step.reason === primaryItem!.reason) ?? null : null;
  if (primaryStep) {
    const used = steps.reduce((total, step) => total + step.estimatedMinutes, 0);
    const completedIds = new Set(progress
      .filter((entry) => entry.status === 'completed')
      .map((entry) => entry.activityId));
    const candidates = sessionCandidatesForConcept(
      primaryStep.concept,
      excludeKeys,
      completedIds,
      SESSION_MAX_MINUTES - used,
    );
    const appTarget = candidates[seed % candidates.length];
    if (appTarget) {
      steps.push(makeStep(appTarget, primaryStep.reason, primaryStep.concept));
    }
  }

  const reason = primaryItem?.reason ?? reviewItem?.reason ?? 'continue-path';
  const concept = primaryStep?.concept ?? (reviewItem ? dueReviewConcept : 'poker-basics');
  const estimatedMinutes = steps.reduce((total, step) => total + step.estimatedMinutes, 0);

  // Release acceptance requires normal sessions to be two-to-four steps totaling
  // five-to-ten minutes. A due-review-only session is the only shorter shape, so
  // any non-review-only result with fewer than two steps or below the minimum
  // duration cannot be a compliant session: yield no plan so the controller
  // falls back to the existing one-step recommendation instead.
  const [firstStep] = steps;
  const isReviewOnly = steps.length === 1 && firstStep?.kind === 'review';
  if (!isReviewOnly && (steps.length < 2 || estimatedMinutes < SESSION_MIN_MINUTES)) {
    return emptySessionPlan(reason, concept, now);
  }

  return {
    id: `${reason}:${concept}`,
    concept,
    createdAt: now,
    completedAt: null,
    estimatedMinutes,
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

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidConcept(value: unknown): value is LearningConceptId {
  return typeof value === 'string' && (LEARNING_CONCEPT_IDS as readonly string[]).includes(value);
}

function isValidReason(value: unknown): value is PersonalPracticePlanReason {
  return typeof value === 'string' && (PRACTICE_PLAN_REASONS as readonly string[]).includes(value);
}

export function isRecommendedSessionStepTarget(value: unknown): value is RecommendedSessionStepTarget {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  switch (candidate.kind) {
    case 'review': {
      const dueCount = isFiniteNonNegativeNumber(candidate.dueCount) ? candidate.dueCount : undefined;
      if (dueCount === undefined) return false;
      // Legacy review targets carry no frozen ids (produced before selection was
      // pinned). Accept them so older plans still parse — the composer never
      // produces one, but the parser must tolerate it.
      if (candidate.itemIds === undefined || candidate.itemIds === null) return true;
      if (!Array.isArray(candidate.itemIds)) return false;
      // A present itemIds array is nonempty, bounded by the daily limit, unique,
      // and consistent with the selected count (dueCount).
      if (
        candidate.itemIds.length < 1
        || candidate.itemIds.length > LEARNING_REVIEW_DAILY_LIMIT
        || new Set(candidate.itemIds).size !== candidate.itemIds.length
        || dueCount !== candidate.itemIds.length
      ) return false;
      return candidate.itemIds.every((id) => typeof id === 'string' && id.length > 0);
    }
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

function parseStep(raw: unknown): RecommendedSessionStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (!isStepStatus(candidate.status)) return null;
  if (!isRecommendedSessionStepTarget(candidate.target)) return null;

  // A missing concept or reason is recovered from the target (corrupted-by-hand
  // or older content). A present-but-unknown identifier means the payload is
  // corrupt: the step cannot be localized or routed, so it is dropped rather
  // than carried into the journey.
  const reasonRaw = typeof candidate.reason === 'string' ? candidate.reason : undefined;
  if (!isValidReason(reasonRaw)) return null;
  const conceptRaw = typeof candidate.concept === 'string' ? candidate.concept : undefined;
  const concept = isValidConcept(conceptRaw)
    ? conceptRaw
    : conceptRaw === undefined
      ? recoveredConcept(candidate.target)
      : null;
  if (!concept) return null;

  const target = candidate.target;
  const estimatedMinutes = isFiniteNonNegativeNumber(candidate.estimatedMinutes)
    ? candidate.estimatedMinutes
    : estimatedMinutesForTarget(target);

  return {
    id: typeof candidate.id === 'string' ? candidate.id : planTargetKey(target),
    kind: target.kind,
    reason: reasonRaw,
    concept,
    estimatedMinutes,
    status: candidate.status,
    target,
    titleHint: typeof candidate.titleHint === 'string' ? candidate.titleHint : titleHintFor(target),
  };
}

function parsePlan(raw: unknown): RecommendedSessionPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  if (!isPlanStatus(candidate.status)) return null;
  // Reject unsupported future versions; an older (but non-negative) version is
  // normalized up so the journey is preserved.
  const version = candidate.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0 || version > SESSION_PLAN_VERSION) return null;
  if (!isValidConcept(candidate.concept)) return null;
  if (!isValidReason(candidate.reason)) return null;
  if (!Array.isArray(candidate.steps)) return null;

  const steps = candidate.steps.flatMap((value) => {
    const step = parseStep(value);
    return step ? [step] : [];
  });

  const estimatedMinutes = isFiniteNonNegativeNumber(candidate.estimatedMinutes)
    ? candidate.estimatedMinutes
    : steps.reduce((total, step) => total + step.estimatedMinutes, 0);

  return {
    id: typeof candidate.id === 'string' ? candidate.id : 'session',
    concept: candidate.concept,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
    completedAt: candidate.completedAt === null
      ? null
      : typeof candidate.completedAt === 'string'
        ? candidate.completedAt
        : null,
    estimatedMinutes,
    reason: candidate.reason,
    status: candidate.status,
    version,
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
 *
 * Targets already marked skipped are carried through without being re-diagnosed,
 * so a migration is applied once, not on every launch. When every step is then
 * settled, the plan is reconciled to `completed` so it is not persisted as open.
 */
export function normalizeRecommendedSession(
  raw: unknown,
  now = new Date().toISOString(),
): RecommendedSessionNormalization {
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
    // A step already skipped by an earlier migration is not re-diagnosed: only
    // newly-unreachable targets produce a diagnostic.
    if (step.status === 'skipped') {
      steps.push(step);
      continue;
    }
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

  // A planned or active plan whose every step is settled is logically complete.
  // Reconcile it so it is persisted as completed, not as an open-but-done plan.
  // Abandoned plans are terminal and are preserved as-is (reconciliation only
  // applies to open plans), so an incomplete journey is never rewritten as a
  // successful completion.
  const estimatedMinutes = steps.reduce((total, step) => total + step.estimatedMinutes, 0);
  const reconciledPlan: RecommendedSessionPlan = {
    ...plan,
    version,
    steps,
    estimatedMinutes,
  };
  let resultPlan = reconciledPlan;
  if (isRecommendedSessionCompleted(reconciledPlan)
    && (reconciledPlan.status === 'planned' || reconciledPlan.status === 'active')) {
    resultPlan = {
      ...reconciledPlan,
      status: 'completed',
      completedAt: reconciledPlan.completedAt ?? now,
    };
  }

  return {
    plan: resultPlan,
    skippableStepIds,
    diagnostics,
  };
}

