import { describe, expect, it } from 'vitest';

import { practicePackById } from '../practicePacks';
import {
  type PersonalPracticePlanItem,
  type PersonalPracticePlanReason,
  type PersonalPracticePlanTarget,
} from '../personalPracticePlan';
import { applyLearningReviewUpdate } from '../reviewQueue';
import {
  composeRecommendedSessionPlan,
  isSessionPlannable,
  normalizeRecommendedSession,
  REVIEW_FALLBACK_MINUTES,
  SESSION_MAX_MINUTES,
  SESSION_PLAN_VERSION,
  LEARNING_CONCEPT_IDS,
  PRACTICE_PLAN_REASONS,
  type RecommendedSessionPlan,
  type RecommendedSessionStep,
} from '../recommendedSession';
import { curriculumSteps, type CurriculumStep } from '../curriculum';
import type { LearningProgressEntry, PracticePackId, ScenarioSpot } from '../types';

const NOW = '2026-01-15T10:00:00.000Z';

const scenario = {
  id: 'river-call-1',
  focus: 'Calling decisions',
  street: 'river',
  position: 'Button',
  opponentPosition: 'Big blind',
  effectiveStackBb: 80,
  potBb: 20,
  heroCards: [{ rank: 14, suit: 'spades' }, { rank: 12, suit: 'hearts' }],
  board: [
    { rank: 14, suit: 'clubs' },
    { rank: 9, suit: 'diamonds' },
    { rank: 4, suit: 'spades' },
    { rank: 7, suit: 'hearts' },
    { rank: 2, suit: 'clubs' },
  ],
  opponentAction: 'Opponent bets half pot.',
  practicePacks: ['betting'],
  prompt: 'What is the best baseline?',
  choices: [
    { id: 'call', label: 'Call', grade: 'best', feedback: 'Top pair can call this price.' },
    { id: 'fold', label: 'Fold', grade: 'mistake', feedback: 'Folding is too tight.' },
  ],
  bestChoiceId: 'call',
  reasoning: 'The price and hand strength support a call.',
  takeaway: 'Compare price with realistic bluffs.',
} satisfies ScenarioSpot;

/** A due scenario review that maps to the `postflop-betting` concept. */
const reviewQueue = applyLearningReviewUpdate(
  [],
  [{ activityId: 'scenario-pack-betting', focusArea: 'value-betting', scenario, source: 'scenario' }],
  [],
  '2026-01-10T00:00:00.000Z',
);

const postflopLesson = curriculumSteps.find(
  (candidate) => candidate.kind === 'lesson' && candidate.id === 'lesson-postflop-board-texture',
) as CurriculumStep;

function reasonItem(reason: PersonalPracticePlanItem['reason'], target: PersonalPracticePlanTarget): PersonalPracticePlanItem {
  return {
    id: `${reason}:${target.kind}:${Math.random().toString(36).slice(2)}`,
    reason,
    target,
  };
}

function reviewTarget(): PersonalPracticePlanTarget {
  return { kind: 'review', dueCount: 3 };
}

/** A "resume your started lesson" primary that practices `postflop-betting`. */
function resumePostflopItem(reason: PersonalPracticePlanReason = 'resume'): PersonalPracticePlanItem {
  return reasonItem(reason, { kind: 'curriculum', step: postflopLesson! });
}

/** A curriculum practice step (resume of a randomized drill pack). */
function resumeDrill(packId: PracticePackId): PersonalPracticePlanItem {
  const step = curriculumSteps.find((candidate) => (
    candidate.kind === 'practice' && candidate.pack.id === packId
  )) as CurriculumStep;
  return reasonItem('resume', { kind: 'curriculum', step });
}

/** A curriculum lesson primary. */
function resumeLesson(lessonId: string, reason: PersonalPracticePlanReason = 'resume'): PersonalPracticePlanItem {
  const step = curriculumSteps.find((candidate) => (
    candidate.kind === 'lesson' && candidate.id === lessonId
  )) as CurriculumStep;
  return reasonItem(reason, { kind: 'curriculum', step });
}

/** A curriculum mission primary. */
function missionPrimary(missionId: string, reason: PersonalPracticePlanReason = 'continue-path'): PersonalPracticePlanItem {
  const step = curriculumSteps.find((candidate) => (
    candidate.kind === 'mission' && candidate.mission.id === missionId
  )) as CurriculumStep;
  return reasonItem(reason, { kind: 'curriculum', step });
}

function compose(items: readonly PersonalPracticePlanItem[], progress: readonly LearningProgressEntry[] = [], seed = 0): RecommendedSessionPlan {
  return composeRecommendedSessionPlan(items, progress, reviewQueue, { now: NOW, seed });
}

describe('recommended session composer', () => {
  it('composes a coherent review-plus-primary session within the authored boundary', () => {
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())], [], 0);

    expect(plan.version).toBe(SESSION_PLAN_VERSION);
    expect(plan.concept).toBe('postflop-betting');
    // Ordered: review first, then the resume/primary. The matching 5-min practice
    // pack does not fit the 10-min ceiling once the 3-min review and 4-min lesson
    // are taken (3 + 4 + 5 = 12 > 10), so it is correctly excluded.
    expect(plan.steps.map((step) => step.kind)).toEqual(['review', 'curriculum']);
    // Every remaining step practices the same concept — conceptual coherence.
    expect(plan.steps.every((step) => step.concept === 'postflop-betting')).toBe(true);

    const [review, primary] = plan.steps;
    expect(review?.titleHint).toBe('Review due');
    expect(primary?.kind).toBe('curriculum');
    expect(primary?.id).toBe('curriculum:lesson-postflop-board-texture');
    expect(primary?.reason).toBe('resume');
    expect(plan.steps.filter((step) => step.kind === 'practice')).toHaveLength(0);
    expect(plan.estimatedMinutes).toBe(7);
  });

  it('keeps the session time-bounded from authored metadata', () => {
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())], [], 0);
    const perStep = plan.steps.map((step) => step.estimatedMinutes);

    // The review step has no authored duration and uses the conservative fallback.
    expect(plan.steps.find((step) => step.kind === 'review')?.estimatedMinutes).toBe(REVIEW_FALLBACK_MINUTES);
    // Authored steps carry their authored minutes, not the fallback.
    expect(perStep.every((minutes) => minutes >= 1)).toBe(true);
    expect(plan.estimatedMinutes).toBe(plan.steps.reduce((total, step) => total + step.estimatedMinutes, 0));
  });

  it('lets a due review win the first step without displacing a resume', () => {
    // Both a resume and a due review exist; the review is step one, the resume stays primary.
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())], [], 0);
    expect(plan.steps[0]?.kind).toBe('review');
    expect(plan.steps.find((step) => step.kind === 'curriculum')?.reason).toBe('resume');
  });

  it('selects an application step deterministically by seed', () => {
    const first = compose([resumePostflopItem()], [], 3);
    const second = compose([resumePostflopItem()], [], 3);
    // Same seed always yields the same, routable application destination.
    expect(second.steps.find((step) => step.kind === 'practice')?.id).toBe(
      first.steps.find((step) => step.kind === 'practice')?.id,
    );
  });

  it('composes a short due-review-only session when nothing else is available', () => {
    const plan = compose([reasonItem('review', reviewTarget())]);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.kind).toBe('review');
    expect(plan.concept).toBe('postflop-betting');
  });

  it('shows a single button when two items resolve to the same drill', () => {
    const pack = practicePackById('betting');
    const sameDrill = (reason: PersonalPracticePlanItem['reason']): PersonalPracticePlanItem => reasonItem(reason, {
      focus: null,
      kind: 'practice',
      pack,
    });
    // The plan maps the personal-plan targets to a coherent session; two items
    // for the same drill must not produce two buttons for it.
    const plan = compose([reasonItem('review', reviewTarget()), sameDrill('reinforce'), sameDrill('continue-path')]);
    expect(plan.steps.filter((step) => step.kind === 'practice')).toHaveLength(1);
    expect(plan.steps.filter((step) => step.target.kind === 'practice' && step.target.packId === 'betting')).toHaveLength(1);
  });

  it('skips an application step the learner has already completed', () => {
    const completed: LearningProgressEntry[] = [{
      activityId: practicePackById('betting').progressActivityId,
      activityType: 'scenario_drill',
      status: 'completed',
      bestScore: 90,
      attempts: 12,
      completedAt: NOW,
      updatedAt: NOW,
    }];
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())], completed, 0);
    // The betting drill is completed, so the application step must not reuse it.
    expect(plan.steps.find((step) => step.kind === 'practice')).toBeUndefined();
    expect(plan.steps).toHaveLength(2);
  });

  it('does not repeat the primary step when evidence is recomposed', () => {
    const first = compose([resumePostflopItem(), reasonItem('review', reviewTarget())]);
    const again = compose([resumePostflopItem(), reasonItem('review', reviewTarget())]);
    expect(again.id).toBe(first.id);
    expect(again.steps.map((step) => step.id)).toEqual(first.steps.map((step) => step.id));
  });

  it('reports an empty plan when there is nothing to compose', () => {
    const plan = compose([], [], 0);
    expect(plan.steps).toHaveLength(0);
    expect(isSessionPlannable(plan)).toBe(false);
    expect(plan.reason).toBe('continue-path');
    expect(plan.concept).toBe('poker-basics');
  });

  it('keeps every session within the authored duration boundary', () => {
    const cases: PersonalPracticePlanItem[][] = [
      [resumePostflopItem(), reasonItem('review', reviewTarget())],
      [reasonItem('review', reviewTarget())],
      [reasonItem('continue-path', { kind: 'curriculum', step: curriculumSteps.find((c) => c.kind === 'lesson')! })],
    ];
    for (const items of cases) {
      const plan = compose(items, [], 0);
      // Every routable step is bounded, and the session never exceeds the cap.
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.estimatedMinutes).toBeLessThanOrEqual(SESSION_MAX_MINUTES);
    }
  });

  it('yields an empty plan when the dictated mission exceeds the cap, so the fallback presents it', () => {
    // A 12-minute postflop-cbet mission alone already exceeds the ten-minute cap,
    // so it can never be part of a compliant two-to-four-step session. The
    // composer yields no plan; the controller's one-step fallback presents the
    // dictated mission instead of silently presenting an over-budget session.
    const plan = compose([reasonItem('review', reviewTarget()), missionPrimary('mission-postflop-cbet')]);
    expect(plan.steps).toHaveLength(0);
    expect(isSessionPlannable(plan)).toBe(false);
    expect(plan.concept).toBe('postflop-betting');
  });

  it('yields an empty plan when a 14-minute mission primary exceeds the cap', () => {
    // 14 > the cap, so the dictated mission cannot be part of a compliant
    // session; the composer yields no plan and the controller's one-step
    // fallback presents it.
    const plan = compose([reasonItem('review', reviewTarget()), missionPrimary('mission-opponent-adjustments')]);
    expect(plan.steps).toHaveLength(0);
    expect(isSessionPlannable(plan)).toBe(false);
    expect(plan.steps.some((step) => step.kind === 'review')).toBe(false);
    expect(plan.steps.some((step) => step.kind === 'practice')).toBe(false);
  });

  it('does not stack a duplicate drill when the primary is a curriculum practice step', () => {
    // The primary is the betting drill; the application must not open it again.
    const plan = compose([reasonItem('review', reviewTarget()), resumeDrill('betting')]);
    expect(plan.steps.map((step) => step.kind)).toEqual(['review', 'curriculum']);
    expect(plan.steps.some((step) => step.kind === 'practice')).toBe(false);
  });

  it('omits a cross-concept review when the primary concept does not match it', () => {
    // A review is requested, but the only due review practices postflop-betting,
    // which does not match the preflop entry primary. Selecting it would label a
    // preflop session as postflop, so the review is omitted rather than forcing a
    // mismatched step (the review stays due for a later, coherent session).
    const plan = compose([resumeLesson('lesson-preflop-opening-position'), reasonItem('review', reviewTarget())], [], 0);
    expect(plan.concept).toBe('preflop-entry');
    expect(plan.steps.some((step) => step.kind === 'review')).toBe(false);
  });

  it('keeps the due review conceptually coherent with the primary', () => {
    // When the primary and a due review share a concept, the review is included,
    // so the session never labels a step differently from its concept.
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())], [], 0);
    expect(plan.concept).toBe('postflop-betting');
    expect(plan.steps[0]?.kind).toBe('review');
  });

  it('freezes the matched review item id into the review step target', () => {
    // The matching due review practices postflop-betting, matching the primary, so
    // its stable id is pinned to the review step. A relaunch launches this exact
    // review rather than re-selecting the first due items globally.
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())], [], 0);
    const [review] = plan.steps;
    expect(review?.kind).toBe('review');
    expect(review?.target).toEqual({
      kind: 'review',
      dueCount: 3,
      itemIds: ['scenario:scenario-pack-betting:river-call-1'],
    });

    // The frozen selection survives serialization.
    const restored = normalizeRecommendedSession(JSON.parse(JSON.stringify(plan)));
    expect(restored.plan?.steps[0]?.target).toEqual(review!.target);
  });

  it('does not freeze a cross-concept review into the review step target', () => {
    // A review is requested but the only due review is postflop-betting, so no
    // review step is produced and no cross-concept id is frozen.
    const plan = compose([resumeLesson('lesson-preflop-opening-position'), reasonItem('review', reviewTarget())], [], 0);
    expect(plan.steps.every((step) => step.target.kind !== 'review')).toBe(true);
  });

  it('resolves a table-mission concept through the curriculum mapping even for an over-cap primary', () => {
    // mission-postflop-cbet authors board-texture/continuation-betting as its raw
    // concept ids, but the session concept resolves through the curriculum mapping
    // to the domain concept 'postflop-betting'. The 12-minute mission alone exceeds
    // the cap, so the composer yields no session; the fallback presents it.
    const plan = compose([missionPrimary('mission-postflop-cbet')]);
    expect(plan.concept).toBe('postflop-betting');
    expect(plan.steps).toHaveLength(0);
    expect(isSessionPlannable(plan)).toBe(false);
  });
});

describe('recommended session normalization', () => {
  it('round-trips a valid plan unchanged', () => {
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())], [], 0);
    const result = normalizeRecommendedSession(JSON.parse(JSON.stringify(plan)));
    expect(result.plan).toEqual(plan);
    expect(result.skippableStepIds).toEqual([]);
    expect(result.diagnostics).toEqual({ missingActivity: [], missingPackId: [], missingStepId: [] });
  });

  it('marks a target removed by an app update as safely skippable', () => {
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())], [], 0);
    // A shape-valid step whose target was removed by an app update is marked
    // safely skippable, while the authored review and primary survive.
    const corrupted = JSON.parse(JSON.stringify(plan)) as RecommendedSessionPlan;
    corrupted.steps.push({
      id: 'activity:lesson-removed-content',
      kind: 'activity',
      reason: 'reinforce',
      concept: 'postflop-betting',
      estimatedMinutes: 5,
      status: 'pending',
      target: { kind: 'activity', activityId: 'lesson-removed-content' },
      titleHint: 'lesson-removed-content',
    });
    const result = normalizeRecommendedSession(corrupted);
    expect(result.plan).not.toBeNull();
    expect(result.skippableStepIds).toHaveLength(1);
    expect(result.diagnostics.missingActivity).toEqual(['lesson-removed-content']);
    expect(result.diagnostics.missingPackId).toEqual([]);

    const skipped = result.plan!.steps.find((step) => step.id === result.skippableStepIds[0]);
    expect(skipped?.status).toBe('skipped');
    // The coherent journey is preserved around the skipped step.
    expect(result.plan!.steps.filter((step) => step.status !== 'skipped')).toHaveLength(2);
  });

  it('normalizes an older plan version while keeping the journey', () => {
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())]);
    const legacy = JSON.parse(JSON.stringify(plan)) as RecommendedSessionPlan;
    legacy.version = 0;
    const result = normalizeRecommendedSession(legacy);
    expect(result.plan?.version).toBe(SESSION_PLAN_VERSION);
    expect(result.plan?.steps).toHaveLength(legacy.steps.length);
    expect(result.skippableStepIds).toEqual([]);
  });

  it('recovers fields the composer needs without dropping a routable step', () => {
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())]);
    const faded = JSON.parse(JSON.stringify(plan)) as RecommendedSessionPlan;
    const primary = faded.steps[1] as unknown as Record<string, unknown>;
    delete primary.estimatedMinutes;
    delete primary.concept;
    const result = normalizeRecommendedSession(faded);
    expect(result.plan).not.toBeNull();
    const step = result.plan!.steps.find((candidate) => candidate.id === 'curriculum:lesson-postflop-board-texture');
    expect(step?.status).not.toBe('skipped');
    // The derived concept and duration are restored, not dropped.
    expect(step?.concept).toBe('postflop-betting');
    expect(step?.estimatedMinutes).toBeGreaterThanOrEqual(1);
  });

  it('reports null when the payload cannot be parsed', () => {
    expect(normalizeRecommendedSession(null).plan).toBeNull();
    expect(normalizeRecommendedSession('nope').plan).toBeNull();
    expect(normalizeRecommendedSession({}).plan).toBeNull();
  });

  it('reconciles to completed when an app update removes every routable step', () => {
    const raw = {
      id: 'resume:postflop-betting',
      concept: 'postflop-betting',
      createdAt: NOW,
      completedAt: null,
      estimatedMinutes: 12,
      reason: 'resume',
      status: 'active',
      version: 1,
      steps: [
        {
          id: 'curriculum:lesson-removed-1',
          kind: 'curriculum',
          reason: 'resume',
          concept: 'postflop-betting',
          estimatedMinutes: 6,
          status: 'pending',
          target: { kind: 'curriculum', stepId: 'lesson-removed-1' },
          titleHint: 'a',
        },
        {
          id: 'curriculum:lesson-removed-2',
          kind: 'curriculum',
          reason: 'resume',
          concept: 'postflop-betting',
          estimatedMinutes: 6,
          status: 'pending',
          target: { kind: 'curriculum', stepId: 'lesson-removed-2' },
          titleHint: 'b',
        },
      ],
    } as unknown as RecommendedSessionPlan;
    const result = normalizeRecommendedSession(raw, NOW);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.steps.every((step) => step.status === 'skipped')).toBe(true);
    // The plan is logically complete, so it is reconciled to completed (not
    // persisted as an open-but-done plan), and the completion timestamp is set.
    expect(result.plan!.status).toBe('completed');
    expect(result.plan!.completedAt).toBe(NOW);
    expect(result.diagnostics.missingStepId).toEqual(['lesson-removed-1', 'lesson-removed-2']);
  });

  it('preserves an abandoned plan instead of reconciling it to completed', () => {
    // A fully-settled abandoned plan is logically done, but abandonment is
    // terminal. Reconciliation only applies to open (planned/active) plans, so the
    // abandoned plan must remain abandoned and never be flipped to completed.
    const raw = {
      id: 'resume:postflop-betting',
      concept: 'postflop-betting',
      createdAt: NOW,
      completedAt: null,
      estimatedMinutes: 12,
      reason: 'resume',
      status: 'abandoned',
      version: 1,
      steps: [
        {
          id: 'curriculum:lesson-removed-1',
          kind: 'curriculum',
          reason: 'resume',
          concept: 'postflop-betting',
          estimatedMinutes: 6,
          status: 'pending',
          target: { kind: 'curriculum', stepId: 'lesson-removed-1' },
          titleHint: 'a',
        },
        {
          id: 'curriculum:lesson-removed-2',
          kind: 'curriculum',
          reason: 'resume',
          concept: 'postflop-betting',
          estimatedMinutes: 6,
          status: 'pending',
          target: { kind: 'curriculum', stepId: 'lesson-removed-2' },
          titleHint: 'b',
        },
      ],
    } as unknown as RecommendedSessionPlan;
    const result = normalizeRecommendedSession(raw, NOW);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.steps.every((step) => step.status === 'skipped')).toBe(true);
    // Terminal status is preserved: the abandoned plan is not reconciled.
    expect(result.plan!.status).toBe('abandoned');
    expect(result.plan!.completedAt).toBeNull();
    expect(result.diagnostics.missingStepId).toEqual(['lesson-removed-1', 'lesson-removed-2']);
  });

  it('re-skips a previously skipped step without re-reporting it', () => {
    const raw = {
      id: 'resume:postflop-betting',
      concept: 'postflop-betting',
      createdAt: NOW,
      completedAt: null,
      estimatedMinutes: 9,
      reason: 'resume',
      status: 'active',
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
          // Already skipped by an earlier migration.
          id: 'curriculum:lesson-removed',
          kind: 'curriculum',
          reason: 'resume',
          concept: 'postflop-betting',
          estimatedMinutes: 0,
          status: 'skipped',
          target: { kind: 'curriculum', stepId: 'lesson-removed' },
          titleHint: 'removed',
        },
      ],
    } as unknown as RecommendedSessionPlan;
    const result = normalizeRecommendedSession(raw, NOW);
    // The carried-through skipped step is not re-diagnosed: no diagnostic.
    expect(result.diagnostics).toEqual({ missingActivity: [], missingPackId: [], missingStepId: [] });
    expect(result.skippableStepIds).toEqual([]);
    // The routable review is preserved, so the session is not reconciled.
    expect(result.plan!.steps.find((step) => step.id === 'review')?.status).toBe('pending');
    expect(result.plan!.status).toBe('active');
  });

  it('rejects a future schema version', () => {
    const raw = {
      id: 'resume:postflop-betting',
      concept: 'postflop-betting',
      createdAt: NOW,
      completedAt: null,
      estimatedMinutes: 6,
      reason: 'resume',
      status: 'planned',
      version: SESSION_PLAN_VERSION + 1,
      steps: [],
    } as unknown as RecommendedSessionPlan;
    expect(normalizeRecommendedSession(raw).plan).toBeNull();
  });

  it('rejects a plan whose concept or reason is not a known identifier', () => {
    const badConcept = JSON.parse(JSON.stringify(compose([resumePostflopItem()], []))) as RecommendedSessionPlan;
    (badConcept as unknown as Record<string, unknown>).concept = 'unknown-concept';
    expect(normalizeRecommendedSession(badConcept).plan).toBeNull();

    const badReason = JSON.parse(JSON.stringify(compose([resumePostflopItem()], []))) as RecommendedSessionPlan;
    (badReason as unknown as Record<string, unknown>).reason = 'unknown-reason';
    expect(normalizeRecommendedSession(badReason).plan).toBeNull();
  });

  it('drops a step carrying an unknown concept or reason, keeping routable steps', () => {
    const faded = JSON.parse(JSON.stringify(compose([resumePostflopItem(), reasonItem('review', reviewTarget())]))) as RecommendedSessionPlan;
    // A step corrupted with unknown identifiers is dropped rather than carried.
    const corrupted = { ...faded.steps[0], concept: 'unknown-concept', reason: 'not-a-reason' } as unknown as RecommendedSessionStep;
    faded.steps[0] = corrupted;
    const result = normalizeRecommendedSession(faded);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.steps.some((step) => step.id === corrupted.id)).toBe(false);
    // The routable steps survive the corrupted step.
    expect(result.plan!.steps.length).toBeGreaterThan(0);
  });

  it('recovers an impossible estimatedMinutes without dropping the step', () => {
    const faded = JSON.parse(JSON.stringify(compose([resumePostflopItem()], []))) as RecommendedSessionPlan;
    const primary = faded.steps.find((step) => step.kind === 'curriculum')!;
    (primary as unknown as Record<string, unknown>).estimatedMinutes = -5;
    const result = normalizeRecommendedSession(faded);
    const step = result.plan!.steps.find((candidate) => candidate.id === primary.id);
    // The negative value is rejected and the authored duration is restored.
    expect(step?.estimatedMinutes).toBeGreaterThanOrEqual(1);
  });

  it('drops a review step with an invalid dueCount', () => {
    const faded = JSON.parse(JSON.stringify(compose([reasonItem('review', reviewTarget())]))) as RecommendedSessionPlan;
    (faded.steps[0]!.target as unknown as Record<string, unknown>).dueCount = NaN;
    expect(normalizeRecommendedSession(faded).plan?.steps).toHaveLength(0);
  });

  it('exposes the known identifiers as a stable contract', () => {
    // Sanity: the exported sets are populated and cover the documented ids.
    expect(LEARNING_CONCEPT_IDS).toContain('postflop-betting');
    expect(PRACTICE_PLAN_REASONS).toContain('continue-path');
  });
});
