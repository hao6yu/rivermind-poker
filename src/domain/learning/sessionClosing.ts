import {
  learningConceptForReview,
  type LearningConceptId,
} from './adaptiveRecommendation';
import type { LearningSessionRecord } from './history';
import {
  conceptImprovementTrend,
  conceptRecurringReview,
  IMPROVEMENT_MIN_ATTEMPTS,
  IMPROVEMENT_MIN_CHANGE,
  type ImprovingConceptInsight,
  type RecurringReviewInsight,
} from './progressInsights';
import type { LearningReviewItem } from './reviewQueue';
import type { RecommendedSessionPlan } from './recommendedSession';
import type { DecisionPresentationClass } from '../poker/decisionReviewPresentation';

/**
 * Phase 16, Slice 3 — the closing outcome. When a recommended session reaches a
 * terminal state the shell freezes a snapshot of its evidence and derives a
 * conservative closing summary that answers, in order: what did I practice, what
 * changed, and what is next. Everything here is pure domain logic: no React, no
 * localization (the presentation layer renders these structured values into
 * localized copy), and no Supabase — the next Home recommendation is only
 * composed after the learner dismisses the closing outcome.
 *
 * The evidence rules are deliberately conservative and never read chip profit:
 * - **Strength** is claimed only from either (a) enough scored decisions made
 *   during the session with no costly mistake, or (b) an existing concept
 *   strength backed by enough completed hands.
 * - **Improvement** reuses the existing progress-insight rule (at least two
 *   scored attempts and a five-point conservative trend).
 * - **Recurring focus** is named only when the concept's review queue still
 *   holds at least two active review items.
 * - When none is met the summary says **building evidence** rather than
 *   substituting an unsupported claim.
 */

export const SESSION_CLOSING_VERSION = 1 as const;

/**
 * A session-based strength claim needs at least this many scored decisions in
 * the concept, all free of a costly mistake. The just-below boundary (two
 * clean decisions) is not enough to claim strength from the session alone.
 */
export const SESSION_STRENGTH_DECISIONS = 3;

/**
 * The alternative strength basis: an existing concept strength must be backed
 * by at least this many completed hands. A single strong hand is not enough to
 * claim a durable strength.
 */
export const SESSION_STRENGTH_HANDS = 2;

/** Re-exported so callers and tests pin the exact improvement thresholds. */
export { IMPROVEMENT_MIN_ATTEMPTS, IMPROVEMENT_MIN_CHANGE };

/**
 * A recurring focus is named only when a concept's review queue holds at least
 * this many active review items (or an equivalent number of review spots).
 * Reused from the progress-insight rule so the closing copy matches the
 * progress screen's wording.
 */
export const RECURRING_MIN_SPOTS = 2;

/**
 * The recurring-focus alternative that does not depend on the live review queue:
 * at least this many distinct completed hands that each carry a costly-mistake
 * review spot for the concept.
 */
export const RECURRING_MIN_HANDS = 2;

/**
 * A frozen, serializable record of what the learner did in one session. The
 * shell builds this at terminal time (from the plan's step statuses plus the
 * decisions the session recorded) so the closing view can render it even after
 * the session has been reconciled and the next Home recommendation composed.
 */
export interface SessionEvidenceSnapshot {
  version: 1;
  concept: LearningConceptId;
  /** Steps the session settled as completed. */
  completedSteps: number;
  /** Steps skipped by a compatibility migration or an interrupted mission. */
  skippedSteps: number;
  /** Decisions the learner scored or reviewed during this session. */
  decisionsScored: number;
  /** Of those, the ones that resolved as a costly mistake. */
  costlyMistakes: number;
  /** ISO timestamp the snapshot was frozen. */
  createdAt: string;
}

/** The per-session decision totals the shell accumulates while running steps. */
export interface SessionStepDecisions {
  decisionsScored: number;
  costlyMistakes: number;
}

/**
 * Builds the frozen evidence snapshot for a plan. The plan supplies the concept
 * and the settled step counts; `decisions` carries the session's own decision
 * totals (reviewed/scored decisions and the costly mistakes among them). Chip
 * profit is deliberately not an input: a winning hand is not evidence.
 */
export function buildSessionEvidenceSnapshot(
  plan: RecommendedSessionPlan,
  decisions: SessionStepDecisions,
  createdAt = new Date().toISOString(),
): SessionEvidenceSnapshot {
  return {
    version: SESSION_CLOSING_VERSION,
    concept: plan.concept,
    completedSteps: plan.steps.filter((step) => step.status === 'completed').length,
    skippedSteps: plan.steps.filter((step) => step.status === 'skipped').length,
    decisionsScored: Math.max(0, decisions.decisionsScored),
    costlyMistakes: Math.max(0, decisions.costlyMistakes),
    createdAt,
  };
}

/** The kind of "what changed" statement the closing summary can carry. */
export type ClosingEvidenceKind = 'strength' | 'improvement' | 'building-evidence';

/** Whether a strength claim is backed by the session itself or by prior hands. */
export type ClosingStrengthBasis = 'session' | 'history';

/** Which of the three "what is next" answers the summary carries. */
export type ClosingNextKind = 'review' | 'continue-path' | 'more-evidence';

export interface ClosingStrength {
  basis: ClosingStrengthBasis;
  decisionsScored: number;
  costlyMistakes: number;
  /** Distinct completed hands with a clean "recommended" presentation that back the claim. */
  supportingHands: number;
}

export interface ClosingNext {
  kind: ClosingNextKind;
  /** Days until the next review is due for the concept; 0 means due now. */
  daysUntilReview: number | null;
  /** The next continue-path activity id, localized at render time. */
  activityId: string | null;
}

/**
 * The structured closing summary. The presentation layer turns the structured
 * values (concept, counts, next-action id) into localized copy and an ordered
 * VoiceOver summary; the domain stays locale-free.
 */
export interface ClosingSummary {
  concept: LearningConceptId;
  completedSteps: number;
  skippedSteps: number;
  decisionsReviewed: number;
  /** The single "what changed" claim: strength, improvement, or building evidence. */
  statement: ClosingEvidenceKind;
  strength: ClosingStrength | null;
  improvement: ImprovingConceptInsight | null;
  /** A recurring focus for the concept, present only when its evidence is met. */
  focus: RecurringReviewInsight | null;
  /** The "what is next" answer. */
  next: ClosingNext;
}

export interface ClosingSummaryInput {
  snapshot: SessionEvidenceSnapshot;
  history: readonly LearningSessionRecord[];
  reviewQueue: readonly LearningReviewItem[];
  /** Graded hand reports projected to presentation-level evidence (chip-free). */
  handEvidence: readonly GradedHandEvidence[];
  /** Stable id of the next continue-path activity, or null when none. */
  nextActivityId?: string | null;
  now?: string;
}

/**
 * A presentation-level, per-hand record the shell projects from graded
 * `SessionHandRecord` reports. It is deliberately small and locale-free so the
 * domain can count distinct completed hands (by `handId`) without depending on
 * the table-session types. Chip profit is not carried: only the hand's own
 * presentation classification is, so a big winner that made a costly mistake
 * does not read as "strong".
 */
export interface GradedHandEvidence {
  /** Stable identifier for the completed hand (its client id). */
  handId: string;
  /** The concept this hand's graded decisions belong to. */
  concept: LearningConceptId;
  /** The hand's player-facing presentation class, or null when nothing graded. */
  classification: DecisionPresentationClass | null;
}

/**
 * Distinct completed hands that demonstrate a concept strength: a hand only
 * supports a strength claim when its presentation is a clean "recommended"
 * result (not an acceptable alternative, a close decision, or a costly mistake).
 */
export function strongHandCount(
  evidence: readonly GradedHandEvidence[],
  concept: LearningConceptId,
): number {
  return new Set(
    evidence
      .filter((hand) => hand.concept === concept && hand.classification === 'recommended')
      .map((hand) => hand.handId),
  ).size;
}

/**
 * Distinct completed hands that carry a costly-mistake review spot for a
 * concept — the recurring-focus evidence that exists even when the live review
 * queue has been emptied.
 */
export function reviewSpotHandCount(
  evidence: readonly GradedHandEvidence[],
  concept: LearningConceptId,
): number {
  return new Set(
    evidence
      .filter((hand) => hand.concept === concept && hand.classification === 'costlyMistake')
      .map((hand) => hand.handId),
  ).size;
}

function daysUntil(targetIso: string, nowIso: string): number {
  const target = new Date(targetIso).getTime();
  const now = new Date(nowIso).getTime();
  const ms = target - now;
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/**
 * Resolves the "what is next" answer. A scheduled or due review for the concept
 * is the concrete next step and wins; otherwise a continue-path activity is
 * named; otherwise the learner simply has more evidence to build.
 */
function resolveNext(
  reviewQueue: readonly LearningReviewItem[],
  concept: LearningConceptId,
  now: string,
  nextActivityId: string | null,
): ClosingNext {
  const nextReviewAt = reviewQueue
    .filter((item) => learningConceptForReview(item) === concept)
    .map((item) => item.nextReviewAt)
    .sort((left, right) => left.localeCompare(right))[0] ?? null;

  if (nextReviewAt !== null) {
    return { kind: 'review', daysUntilReview: daysUntil(nextReviewAt, now), activityId: null };
  }
  if (nextActivityId !== null) {
    return { kind: 'continue-path', daysUntilReview: null, activityId: nextActivityId };
  }
  return { kind: 'more-evidence', daysUntilReview: null, activityId: null };
}

/**
 * Derives the evidence-bounded closing summary for a finished (or early-ended)
 * session. The session's own evidence decides the strength claim; the concept's
 * prior scored history decides the improvement trend; the live review queue and
 * the graded-hand projection decide the recurring focus and the next review
 * timing. Chip profit never enters these rules.
 */
export function buildClosingSummary(input: ClosingSummaryInput): ClosingSummary {
  const { snapshot, history, reviewQueue, handEvidence } = input;
  const now = input.now ?? new Date().toISOString();
  const concept = snapshot.concept;
  const nextActivityId = input.nextActivityId ?? null;

  const sessionStrength = snapshot.decisionsScored >= SESSION_STRENGTH_DECISIONS && snapshot.costlyMistakes === 0;
  const supportingHands = strongHandCount(handEvidence, concept);
  const historyStrength = supportingHands >= SESSION_STRENGTH_HANDS;
  const strength = sessionStrength || historyStrength;

  const improvement = conceptImprovementTrend(history, concept);

  // A recurring focus is supported by the live review queue (reused from the
  // progress-insight rule) or, when the queue is quiet, by two or more distinct
  // completed hands that each carry a costly-mistake review spot.
  const queueRecurring = conceptRecurringReview(reviewQueue, concept, now);
  const handSpots = reviewSpotHandCount(handEvidence, concept);
  const focus = queueRecurring
    ?? (handSpots >= RECURRING_MIN_HANDS
      ? { concept, dueCount: 0, spots: handSpots }
      : null);

  const statement: ClosingEvidenceKind = strength
    ? 'strength'
    : improvement
      ? 'improvement'
      : 'building-evidence';

  return {
    concept,
    completedSteps: snapshot.completedSteps,
    skippedSteps: snapshot.skippedSteps,
    decisionsReviewed: snapshot.decisionsScored,
    statement,
    strength: strength
      ? {
        basis: sessionStrength ? 'session' : 'history',
        decisionsScored: snapshot.decisionsScored,
        costlyMistakes: snapshot.costlyMistakes,
        supportingHands,
      }
      : null,
    improvement,
    focus,
    next: resolveNext(reviewQueue, concept, now, nextActivityId),
  };
}
