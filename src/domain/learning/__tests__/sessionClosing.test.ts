import { describe, expect, it } from 'vitest';

import type { LearningConceptId } from '../adaptiveRecommendation';
import type { LearningSessionRecord } from '../history';
import {
  conceptImprovementTrend,
  conceptRecurringReview,
} from '../progressInsights';
import { applyLearningReviewUpdate, type LearningReviewItem } from '../reviewQueue';
import type {
  RecommendedSessionPlan,
  RecommendedSessionStep,
  RecommendedSessionStepStatus,
} from '../recommendedSession';
import {
  buildClosingSummary,
  buildSessionEvidenceSnapshot,
  IMPROVEMENT_MIN_ATTEMPTS,
  IMPROVEMENT_MIN_CHANGE,
  RECURRING_MIN_HANDS,
  RECURRING_MIN_SPOTS,
  SESSION_STRENGTH_DECISIONS,
  SESSION_STRENGTH_HANDS,
  reviewSpotHandCount,
  strongHandCount,
  type ClosingSummary,
  type GradedHandEvidence,
  type SessionStepDecisions,
} from '../sessionClosing';
import type { DecisionPresentationClass } from '../../poker/decisionReviewPresentation';

const NOW = '2026-01-15T10:00:00.000Z';
// A scored practice activity (the betting pack's progress activity) that maps to
// the session concept, and a stable concept used throughout the corpus.
const CONCEPT: LearningConceptId = 'postflop-betting';
const ACTIVITY = 'scenario-pack-betting';

function buildPlan(stepStatuses: RecommendedSessionStepStatus[] = ['completed']): RecommendedSessionPlan {
  const steps: RecommendedSessionStep[] = stepStatuses.map((status, index) => ({
    id: `step-${index}`,
    kind: 'activity',
    reason: 'continue-path',
    concept: CONCEPT,
    estimatedMinutes: 5,
    status,
    target: { kind: 'activity', activityId: ACTIVITY },
    titleHint: 'Postflop betting',
  }));
  return {
    id: 'postflop-session',
    concept: CONCEPT,
    createdAt: '2026-01-15T09:00:00.000Z',
    completedAt: stepStatuses.every((status) => status === 'completed') ? NOW : null,
    estimatedMinutes: steps.length * 5,
    reason: 'continue-path',
    status: stepStatuses.every((status) => status === 'completed' || status === 'skipped') ? 'completed' : 'active',
    version: 1,
    steps,
  };
}

/**
 * A scored drill/attempt record (lesson, trainer, or review activity) for the
 * session concept. These are the only history rows the closing outcome reads —
 * for the improvement trend — distinct from graded hand evidence.
 */
function scoredAttempt(score: number, occurredAt: string, activityId = ACTIVITY): LearningSessionRecord {
  return {
    activityId,
    correctCount: null,
    id: `attempt-${activityId}-${occurredAt}`,
    kind: 'practice',
    localDate: occurredAt.slice(0, 10),
    occurredAt,
    score,
    totalCount: null,
  };
}

/** A graded, chip-free hand-evidence row for the session concept. */
function gradedHand(handId: string, classification: DecisionPresentationClass): GradedHandEvidence {
  return { concept: CONCEPT, handId, classification };
}

/** Distinct review items for the session concept, all scheduled for `nextReviewAt`. */
function reviewItems(count: number, nextReviewAt = '2026-01-14T00:00:00.000Z'): LearningReviewItem[] {
  return applyLearningReviewUpdate(
    [],
    Array.from({ length: count }, (_, index) => ({
      activityId: ACTIVITY,
      questionId: `q-${index}`,
      source: 'trainer' as const,
    })),
    [],
    nextReviewAt,
  );
}

/** A frozen snapshot from a plan plus the session's own decision totals. */
function snapshot(
  decisions: SessionStepDecisions,
  stepStatuses: RecommendedSessionStepStatus[] = ['completed'],
): ReturnType<typeof buildSessionEvidenceSnapshot> {
  return buildSessionEvidenceSnapshot(buildPlan(stepStatuses), decisions, NOW);
}

function close(
  decisions: SessionStepDecisions,
  options: {
    history?: readonly LearningSessionRecord[];
    reviewQueue?: readonly LearningReviewItem[];
    handEvidence?: readonly GradedHandEvidence[];
    nextActivityId?: string | null;
    stepStatuses?: RecommendedSessionStepStatus[];
  } = {},
): ClosingSummary {
  return buildClosingSummary({
    snapshot: snapshot(decisions, options.stepStatuses),
    history: options.history ?? [],
    reviewQueue: options.reviewQueue ?? [],
    handEvidence: options.handEvidence ?? [],
    nextActivityId: options.nextActivityId ?? null,
    now: NOW,
  });
}

describe('buildSessionEvidenceSnapshot', () => {
  it('reads the concept from the plan and counts settled steps', () => {
    const snap = buildSessionEvidenceSnapshot(buildPlan(['completed', 'completed', 'skipped']), { decisionsScored: 4, costlyMistakes: 1 }, NOW);
    expect(snap.concept).toBe(CONCEPT);
    expect(snap.completedSteps).toBe(2);
    expect(snap.skippedSteps).toBe(1);
    expect(snap.decisionsScored).toBe(4);
    expect(snap.costlyMistakes).toBe(1);
    expect(snap.version).toBe(1);
  });

  it('clamps negative decision tallies to zero', () => {
    const snap = buildSessionEvidenceSnapshot(buildPlan(), { decisionsScored: -2, costlyMistakes: -1 }, NOW);
    expect(snap.decisionsScored).toBe(0);
    expect(snap.costlyMistakes).toBe(0);
  });
});

describe('closing outcome — no evidence (building evidence)', () => {
  it('claims nothing from a thin session with no history, focus, or next activity', () => {
    const summary = close({ decisionsScored: 1, costlyMistakes: 0 });
    expect(summary.statement).toBe('building-evidence');
    expect(summary.strength).toBeNull();
    expect(summary.improvement).toBeNull();
    expect(summary.focus).toBeNull();
    expect(summary.next).toEqual({ kind: 'more-evidence', daysUntilReview: null, activityId: null });
    expect(summary.decisionsReviewed).toBe(1);
  });
});

describe('closing outcome — session strength', () => {
  it('claims strength from enough scored decisions with no costly mistake', () => {
    const summary = close({ decisionsScored: SESSION_STRENGTH_DECISIONS, costlyMistakes: 0 });
    expect(summary.statement).toBe('strength');
    expect(summary.strength).toEqual({
      basis: 'session',
      decisionsScored: SESSION_STRENGTH_DECISIONS,
      costlyMistakes: 0,
      supportingHands: 0,
    });
  });

  it('does not claim session strength just below the decision threshold', () => {
    const summary = close({ decisionsScored: SESSION_STRENGTH_DECISIONS - 1, costlyMistakes: 0 });
    expect(summary.statement).toBe('building-evidence');
  });

  it('blocks a session strength claim when any decision was a costly mistake', () => {
    const summary = close({ decisionsScored: SESSION_STRENGTH_DECISIONS, costlyMistakes: 1 });
    expect(summary.statement).toBe('building-evidence');
    expect(summary.strength).toBeNull();
  });
});

describe('closing outcome — existing strength from completed hands', () => {
  it('claims strength when at least two strong (recommended) graded hands back the concept', () => {
    const evidence = [
      gradedHand('hand-a', 'recommended'),
      gradedHand('hand-b', 'recommended'),
    ];
    const summary = close({ decisionsScored: 1, costlyMistakes: 0 }, { handEvidence: evidence });
    expect(summary.statement).toBe('strength');
    expect(summary.strength?.basis).toBe('history');
    expect(summary.strength?.supportingHands).toBe(SESSION_STRENGTH_HANDS);
  });

  it('does not claim strength from a single strong hand (just below the hand bar)', () => {
    const summary = close(
      { decisionsScored: 1, costlyMistakes: 0 },
      { handEvidence: [gradedHand('hand-a', 'recommended')] },
    );
    expect(summary.statement).toBe('building-evidence');
    expect(summary.strength).toBeNull();
  });

  it('ignores hands whose grade is not a strong (recommended) one', () => {
    // Two non-recommended hands (an acceptable alternative and a close call) plus
    // no drill attempts: neither the hand-strength bar nor the improvement rule
    // fires, so no strength is claimed.
    const evidence = [
      gradedHand('hand-a', 'acceptableAlternative'),
      gradedHand('hand-b', 'closeDecision'),
    ];
    expect(close({ decisionsScored: 1, costlyMistakes: 0 }, { handEvidence: evidence }).statement).toBe('building-evidence');
  });

  it('counts distinct hands, not duplicate rows for the same hand', () => {
    const evidence = [
      gradedHand('hand-a', 'recommended'),
      gradedHand('hand-a', 'recommended'),
    ];
    expect(strongHandCount(evidence, CONCEPT)).toBe(1);
    expect(reviewSpotHandCount(evidence, CONCEPT)).toBe(0);
  });
});

describe('closing outcome — improvement trend', () => {
  it('claims improvement when the existing progress-insight rule fires for the concept', () => {
    const history = [
      scoredAttempt(50, '2026-01-10T12:00:00.000Z'),
      scoredAttempt(72, '2026-01-12T12:00:00.000Z'),
    ];
    const summary = close({ decisionsScored: 1, costlyMistakes: 0 }, { history });
    expect(summary.statement).toBe('improvement');
    expect(summary.improvement).toEqual({ attempts: 2, change: 22, concept: CONCEPT });
  });

  it('does not claim improvement just below the change threshold (4 points)', () => {
    // Two sub-strength hands (below 70) so strength is not the claim; a 3-point
    // rise stays just under the existing five-point rule.
    const history = [
      scoredAttempt(40, '2026-01-10T12:00:00.000Z'),
      scoredAttempt(43, '2026-01-12T12:00:00.000Z'),
    ];
    expect(close({ decisionsScored: 1, costlyMistakes: 0 }, { history }).statement).toBe('building-evidence');
  });

  it('claims improvement at exactly the change threshold (5 points)', () => {
    const history = [
      scoredAttempt(40, '2026-01-10T12:00:00.000Z'),
      scoredAttempt(45, '2026-01-12T12:00:00.000Z'),
    ];
    expect(close({ decisionsScored: 1, costlyMistakes: 0 }, { history }).statement).toBe('improvement');
  });

  it('requires at least two scored attempts (just below the attempt bar)', () => {
    expect(conceptImprovementTrend([scoredAttempt(90, '2026-01-12T12:00:00.000Z')], CONCEPT)).toBeNull();
    expect(IMPROVEMENT_MIN_ATTEMPTS).toBe(2);
    expect(IMPROVEMENT_MIN_CHANGE).toBe(5);
  });
});

describe('closing outcome — recurring focus', () => {
  it('names a recurring focus when the concept holds at least two active review items', () => {
    const summary = close({ decisionsScored: 1, costlyMistakes: 0 }, { reviewQueue: reviewItems(RECURRING_MIN_SPOTS) });
    expect(summary.statement).toBe('building-evidence');
    expect(summary.focus).toEqual({ concept: CONCEPT, dueCount: RECURRING_MIN_SPOTS, spots: RECURRING_MIN_SPOTS });
  });

  it('does not name a recurring focus with a single review item (just below the bar)', () => {
    expect(close({ decisionsScored: 1, costlyMistakes: 0 }, { reviewQueue: reviewItems(1) }).focus).toBeNull();
    expect(RECURRING_MIN_SPOTS).toBe(2);
  });

  it('only counts review items that map to the session concept', () => {
    const otherConceptItem = applyLearningReviewUpdate(
      [],
      [{ activityId: 'scenario-pack-odds', questionId: 'o-0', source: 'trainer' }],
      [],
      '2026-01-14T00:00:00.000Z',
    )[0]!;
    const summary = close({ decisionsScored: 1, costlyMistakes: 0 }, { reviewQueue: [otherConceptItem] });
    expect(summary.focus).toBeNull();
  });

  it('names a recurring focus from review-spot hands (two costly-mistake hands) with no queue', () => {
    // The alternative basis: the concept has two distinct completed hands whose
    // grade was a costly mistake (review spots), even when no review item is due.
    const evidence = [
      gradedHand('hand-a', 'costlyMistake'),
      gradedHand('hand-b', 'costlyMistake'),
    ];
    const summary = close({ decisionsScored: 1, costlyMistakes: 0 }, { handEvidence: evidence });
    expect(summary.focus).toEqual({ concept: CONCEPT, dueCount: 0, spots: RECURRING_MIN_HANDS });
  });

  it('does not name a hand-basis focus from a single review-spot hand (just below the bar)', () => {
    const evidence = [gradedHand('hand-a', 'costlyMistake')];
    expect(close({ decisionsScored: 1, costlyMistakes: 0 }, { handEvidence: evidence }).focus).toBeNull();
    expect(RECURRING_MIN_HANDS).toBe(2);
  });
});

describe('closing outcome — combined supported evidence', () => {
  it('shows a strength statement and a recurring focus together', () => {
    const summary = close(
      { decisionsScored: SESSION_STRENGTH_DECISIONS, costlyMistakes: 0 },
      { reviewQueue: reviewItems(2) },
    );
    expect(summary.statement).toBe('strength');
    expect(summary.strength?.basis).toBe('session');
    expect(summary.focus).not.toBeNull();
    expect(summary.focus?.spots).toBe(2);
  });

  it('can pair an improvement statement with a recurring focus', () => {
    const history = [
      scoredAttempt(50, '2026-01-10T12:00:00.000Z'),
      scoredAttempt(72, '2026-01-12T12:00:00.000Z'),
    ];
    const summary = close(
      { decisionsScored: 1, costlyMistakes: 0 },
      { history, reviewQueue: reviewItems(2) },
    );
    expect(summary.statement).toBe('improvement');
    expect(summary.focus?.concept).toBe(CONCEPT);
  });
});

describe('closing outcome — skipped steps and review-only sessions', () => {
  it('reports skipped steps in the practice recap', () => {
    const summary = close({ decisionsScored: 0, costlyMistakes: 0 }, { stepStatuses: ['completed', 'skipped'] });
    expect(summary.completedSteps).toBe(1);
    expect(summary.skippedSteps).toBe(1);
  });

  it('handles a review-only session whose mistakes block a strength claim', () => {
    // Five review decisions, two missed: below the "no costly mistake" bar and
    // with no history, so no strength; the due review item drives "what is next".
    const summary = close(
      { decisionsScored: 5, costlyMistakes: 2 },
      { reviewQueue: reviewItems(1) },
    );
    expect(summary.decisionsReviewed).toBe(5);
    expect(summary.statement).toBe('building-evidence');
    expect(summary.next).toEqual({ kind: 'review', daysUntilReview: 0, activityId: null });
  });
});

describe('closing outcome — mission and scenario sessions', () => {
  it('treats a clean mission/scenario session as session strength', () => {
    const summary = close({ decisionsScored: 4, costlyMistakes: 0 });
    expect(summary.statement).toBe('strength');
    expect(summary.strength?.basis).toBe('session');
    expect(summary.strength?.decisionsScored).toBe(4);
  });

  it('blocks strength when a graded hand decision was a costly mistake', () => {
    const summary = close({ decisionsScored: 4, costlyMistakes: 1 });
    expect(summary.statement).toBe('building-evidence');
  });
});

describe('closing outcome — next action', () => {
  it('reports a due review (due now) before any continue-path activity', () => {
    const summary = close({ decisionsScored: 1, costlyMistakes: 0 }, {
      reviewQueue: reviewItems(1, NOW),
      nextActivityId: ACTIVITY,
    });
    expect(summary.next).toEqual({ kind: 'review', daysUntilReview: 0, activityId: null });
  });

  it('reports the timing of a future review', () => {
    const inFiveDays = '2026-01-20T10:00:00.000Z';
    const summary = close({ decisionsScored: 1, costlyMistakes: 0 }, { reviewQueue: reviewItems(1, inFiveDays) });
    expect(summary.next).toEqual({ kind: 'review', daysUntilReview: 5, activityId: null });
  });

  it('names the continue-path activity when there is no pending review', () => {
    const summary = close({ decisionsScored: 1, costlyMistakes: 0 }, { nextActivityId: ACTIVITY });
    expect(summary.next).toEqual({ kind: 'continue-path', daysUntilReview: null, activityId: ACTIVITY });
  });

  it('falls back to a more-evidence statement when nothing concrete is pending', () => {
    const summary = close({ decisionsScored: 1, costlyMistakes: 0 });
    expect(summary.next).toEqual({ kind: 'more-evidence', daysUntilReview: null, activityId: null });
  });
});

describe('closing outcome — chip profit never becomes evidence', () => {
  // Hand evidence carries only the classification, never the chip result. A
  // hand that won a big pot but was graded a costly mistake is a review spot,
  // not a strength — and the strength rule still needs two strong hands.
  it('does not count a winning (chip-profit) hand that was graded a costly mistake', () => {
    // One costly-mistake hand (implying a big pot won anyway) is below the
    // two-strong-hand bar and not a recommended grade, so no strength.
    const summary = close(
      { decisionsScored: 1, costlyMistakes: 0 },
      { handEvidence: [gradedHand('hand-winner', 'costlyMistake')] },
    );
    expect(summary.strength).toBeNull();
    // It IS a review spot for the focus, not a strength.
    expect(reviewSpotHandCount([gradedHand('hand-winner', 'costlyMistake')], CONCEPT)).toBe(1);
  });

  it('leaves the result unchanged when the drill scores high versus low', () => {
    // Drill (practice activity) scores feed only the improvement trend; a single
    // sub-strength drill on either side of the change threshold claims nothing.
    const low = close({ decisionsScored: 1, costlyMistakes: 0 }, { history: [scoredAttempt(40, '2026-01-12T12:00:00.000Z')] });
    const high = close({ decisionsScored: 1, costlyMistakes: 0 }, { history: [scoredAttempt(49, '2026-01-12T12:00:00.000Z')] });
    expect(high.statement).toBe('building-evidence');
    expect(low).toEqual(high);
  });

  it('reuses the per-concept helpers so the recurring-focus rule is defined once', () => {
    const queue = reviewItems(3);
    expect(conceptRecurringReview(queue, CONCEPT, NOW)).toEqual({ concept: CONCEPT, dueCount: 3, spots: 3 });
    expect(conceptRecurringReview(queue, 'postflop-odds', NOW)).toBeNull();
    expect(conceptImprovementTrend([], CONCEPT)).toBeNull();
  });
});

describe('closing outcome — frozen evidence across dismissal', () => {
  it('keeps the evidence frozen while only the next action follows the recomposed plan', () => {
    const snapshot = buildSessionEvidenceSnapshot(buildPlan(['completed']), { decisionsScored: 3, costlyMistakes: 0 }, NOW);
    // The closing view reads this snapshot before the learner dismisses it; the
    // next Home recommendation is only composed afterwards.
    const dismissed = buildClosingSummary({ snapshot, history: [], reviewQueue: [], handEvidence: [], nextActivityId: null, now: NOW });
    const recomposed = buildClosingSummary({ snapshot, history: [], reviewQueue: [], handEvidence: [], nextActivityId: ACTIVITY, now: NOW });

    // The evidence statement, counts, strength, and focus are fixed by the
    // snapshot and are not altered by the recomposed next session.
    expect(recomposed.statement).toBe(dismissed.statement);
    expect(recomposed.decisionsReviewed).toBe(dismissed.decisionsReviewed);
    expect(recomposed.strength).toEqual(dismissed.strength);
    expect(recomposed.focus).toEqual(dismissed.focus);
    // Only the "what is next" answer moves with the recomposed next session.
    expect(dismissed.next).toEqual({ kind: 'more-evidence', daysUntilReview: null, activityId: null });
    expect(recomposed.next).toEqual({ kind: 'continue-path', daysUntilReview: null, activityId: ACTIVITY });
  });
});
