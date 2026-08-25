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
  SESSION_PLAN_VERSION,
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
) as CurriculumStep | undefined;

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

function compose(items: readonly PersonalPracticePlanItem[], progress: readonly LearningProgressEntry[] = [], seed = 0): RecommendedSessionPlan {
  return composeRecommendedSessionPlan(items, progress, reviewQueue, { now: NOW, seed });
}

describe('recommended session composer', () => {
  it('composes a coherent three-step session around the primary concept', () => {
    const plan = compose([resumePostflopItem(), reasonItem('review', reviewTarget())], [], 0);

    expect(plan.version).toBe(SESSION_PLAN_VERSION);
    expect(plan.concept).toBe('postflop-betting');
    // Ordered: review first, then the resume/primary, then the application.
    expect(plan.steps.map((step) => step.kind)).toEqual(['review', 'curriculum', 'practice']);
    // Every step practices the same concept — conceptual coherence over variety.
    expect(plan.steps.every((step) => step.concept === 'postflop-betting')).toBe(true);

    const [review, primary, application] = plan.steps;
    expect(review?.titleHint).toBe('Review due');
    expect(primary?.kind).toBe('curriculum');
    expect(primary?.id).toBe('curriculum:lesson-postflop-board-texture');
    expect(application?.target).toEqual({ kind: 'practice', packId: 'betting' });
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
    const corrupted = JSON.parse(JSON.stringify(plan)) as RecommendedSessionPlan;
    corrupted.steps[2] = { ...corrupted.steps[2], target: { kind: 'activity', activityId: 'lesson-removed-content' } } as RecommendedSessionStep;
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
});
