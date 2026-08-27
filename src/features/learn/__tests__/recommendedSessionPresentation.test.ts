import { describe, expect, it, vi } from 'vitest';

// The review resolver builds its trainer through a builder that imports
// `secureRandom`, which pulls in `expo-crypto`. In vitest's SSR resolution
// `expo-crypto` resolves to react-native's build (Flow source) and fails to
// parse, so we stub the crypto entry point the builder only needs.
vi.mock('expo-crypto', () => ({ getRandomValues: () => new Uint32Array(64) }));

import { curriculumSteps, type CurriculumStep } from '../../../domain/learning/curriculum';
import { practicePackById } from '../../../domain/learning/practicePacks';
import { tableMissionById } from '../../../domain/learning/tableMissions';
import { applyLearningReviewUpdate, type LearningReviewItem } from '../../../domain/learning/reviewQueue';
import {
  learningConceptLabel,
  resolveStepLauncher,
  sessionHeaderTitle,
  sessionReasonLabel,
  sessionStepIndex,
  sessionStepLabel,
  type StepLauncher,
  type SessionLoc,
} from '../recommendedSessionPresentation';
import type { RecommendedSessionPlan, RecommendedSessionStep, RecommendedSessionStepTarget } from '../../../domain/learning/recommendedSession';
import type { LearningConceptId } from '../../../domain/learning/adaptiveRecommendation';
import type { LearningProgressEntry, ScenarioSpot } from '../../../domain/learning/types';

const NOW = '2026-01-15T10:00:00.000Z';

// A stub `t` that echoes the key and any interpolation values so call sites can
// assert the exact localization contract the helpers depend on.
const t = (key: string, values?: Record<string, string | number>): string =>
  values ? `${key}|${JSON.stringify(values)}` : key;

function loc(overrides: Partial<SessionLoc> = {}): SessionLoc {
  return {
    t,
    activityText: (activity, field) => `${activity.id}:${field}`,
    practicePackText: (pack, field) => `${pack.id}:${field}`,
    scenarioContent: (spot) => spot,
    trainerContent: (trainer) => trainer,
    ...overrides,
  };
}

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

const matchingItem: LearningReviewItem = {
  activityId: 'scenario-pack-betting',
  focusArea: 'value-betting',
  scenario,
  source: 'scenario',
  id: 'scenario:scenario-pack-betting:river-call-1',
  correctStreak: 1,
  createdAt: '2026-01-12T00:00:00.000Z',
  lastReviewedAt: null,
  nextReviewAt: NOW,
  updatedAt: '2026-01-12T00:00:00.000Z',
};

const postflopLesson = curriculumSteps.find(
  (candidate) => candidate.kind === 'lesson' && candidate.id === 'lesson-postflop-board-texture',
) as Extract<CurriculumStep, { kind: 'lesson' }>;

const missionCurriculum = curriculumSteps.find(
  (candidate) => candidate.kind === 'mission' && candidate.mission.id === 'mission-preflop-enter-pot',
) as Extract<CurriculumStep, { kind: 'mission' }>;

const practiceCurriculum = curriculumSteps.find(
  (candidate) => candidate.kind === 'practice',
) as Extract<CurriculumStep, { kind: 'practice' }>;

const masteryCurriculum = curriculumSteps.find(
  (candidate) => candidate.kind === 'mastery',
) as Extract<CurriculumStep, { kind: 'mastery' }>;

const completedProgress: LearningProgressEntry[] = [
  {
    activityId: 'trainer-percentages',
    activityType: 'percentage_drill',
    status: 'completed',
    bestScore: 88,
    attempts: 5,
    completedAt: NOW,
    updatedAt: NOW,
  },
  {
    activityId: 'lesson-hand-rankings',
    activityType: 'lesson',
    status: 'completed',
    bestScore: null,
    attempts: 1,
    completedAt: NOW,
    updatedAt: NOW,
  },
];

function makeStep(target: RecommendedSessionStepTarget, concept: LearningConceptId = 'postflop-betting', minutes = 5): RecommendedSessionStep {
  return {
    id: `step-${target.kind}-${Math.random().toString(36).slice(2)}`,
    kind: target.kind,
    reason: 'resume',
    concept,
    estimatedMinutes: minutes,
    status: 'pending',
    target,
    titleHint: '',
  };
}

describe('learningConceptLabel', () => {
  it('converts a hyphenated concept id into its localized concept key', () => {
    expect(learningConceptLabel('postflop-betting', t)).toBe('concept.postflopBetting');
    expect(learningConceptLabel('table-math', t)).toBe('concept.tableMath');
  });
});

describe('sessionHeaderTitle', () => {
  it('labels the active step (1-based) against the total as the current position', () => {
    const step = makeStep({ kind: 'practice', packId: 'betting' });
    expect(sessionHeaderTitle(step, 1, 3, t)).toBe('learn.sessionStepOf|{"current":1,"total":3}');
    expect(sessionHeaderTitle(step, 3, 3, t)).toBe('learn.sessionStepOf|{"current":3,"total":3}');
  });
});

describe('sessionReasonLabel', () => {
  const reasons = ['resume', 'review', 'table-focus', 'reinforce', 'goal-focus', 'continue-path'] as const;

  it('maps each known reason to its localized copy', () => {
    for (const reason of reasons) {
      const camel = reason.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
      expect(sessionReasonLabel(reason, t)).toBe(`learn.reason${camel}`);
    }
  });

  it('falls back to the continue-path copy for an unknown reason', () => {
    expect(sessionReasonLabel('continue-path' as never, t)).toBe('learn.reasonContinuePath');
  });
});

describe('sessionStepIndex', () => {
  const plan: RecommendedSessionPlan = {
    steps: [makeStep({ kind: 'review', dueCount: 1 }), makeStep({ kind: 'practice', packId: 'betting' }), makeStep({ kind: 'activity', activityId: 'trainer-percentages' })],
  } as RecommendedSessionPlan;

  it('reports the 1-based position of a step', () => {
    expect(sessionStepIndex(plan, plan.steps[0]!)).toBe(1);
    expect(sessionStepIndex(plan, plan.steps[1]!)).toBe(2);
    expect(sessionStepIndex(plan, plan.steps[2]!)).toBe(3);
  });

  it('falls back to 1 for an unknown step', () => {
    const orphan = makeStep({ kind: 'review', dueCount: 1 });
    expect(sessionStepIndex(plan, orphan)).toBe(1);
  });
});

describe('sessionStepLabel', () => {
  it('reports the review label for a review step', () => {
    const step = makeStep({ kind: 'review', dueCount: 1 });
    expect(sessionStepLabel(step, loc())).toBe('learn.reviewToday');
  });

  it('reports the practice pack title for a practice step', () => {
    const step = makeStep({ kind: 'practice', packId: 'betting' });
    expect(sessionStepLabel(step, loc())).toBe('betting:title');
  });

  it('reports the activity title for an activity step', () => {
    const step = makeStep({ kind: 'activity', activityId: 'lesson-hand-rankings' });
    expect(sessionStepLabel(step, loc())).toBe('lesson-hand-rankings:title');
  });

  it('reports the concept when the target cannot be resolved', () => {
    const step = makeStep({ kind: 'activity', activityId: 'activity-nonexistent' });
    expect(sessionStepLabel(step, loc())).toBe('concept.postflopBetting');
  });

  it('reports the lesson title for a curriculum lesson step', () => {
    const step = makeStep({ kind: 'curriculum', stepId: postflopLesson.id });
    expect(sessionStepLabel(step, loc())).toBe(`${postflopLesson.lesson.id}:title`);
  });

  it('reports the pack title for a curriculum practice step', () => {
    const step = makeStep({ kind: 'curriculum', stepId: practiceCurriculum.id });
    expect(sessionStepLabel(step, loc())).toBe(`${practiceCurriculum.pack.id}:title`);
  });

  it('reports the authored mission title for a curriculum mission step', () => {
    const step = makeStep({ kind: 'curriculum', stepId: missionCurriculum.id });
    expect(sessionStepLabel(step, loc())).toBe(tableMissionById(missionCurriculum.mission.id).title);
  });

  it('reports the trainer title for a curriculum mastery step', () => {
    const step = makeStep({ kind: 'curriculum', stepId: masteryCurriculum.id });
    expect(sessionStepLabel(step, loc())).toBe(`${masteryCurriculum.trainer.id}:title`);
  });
});

describe('resolveStepLauncher', () => {
  it('resolves a review step to a trainer built from the frozen items', () => {
    const step = makeStep({
      kind: 'review',
      dueCount: 1,
      itemIds: ['scenario:scenario-pack-betting:river-call-1'],
    });
    const launcher = resolveStepLauncher(step, [], [matchingItem], loc());
    expect(launcher).toMatchObject({
      kind: 'review',
      trainer: { id: 'daily-learning-review', type: 'hand_quiz' },
    });
  });

  it('resolves to null when a review step has no matching items', () => {
    const step = makeStep({ kind: 'review', dueCount: 1, itemIds: ['scenario:scenario-pack-betting:river-call-1'] });
    expect(resolveStepLauncher(step, [], [], loc())).toBeNull();
    expect(resolveStepLauncher(step, [], [{ ...matchingItem, id: 'other' }], loc())).toBeNull();
  });

  it('resolves a practice step to a scenario launcher with the pack id and best score', () => {
    const step = makeStep({ kind: 'practice', packId: 'betting' });
    const pack = practicePackById('betting');
    const launcher = resolveStepLauncher(step, [], [], loc()) as Extract<StepLauncher, { kind: 'scenario' }>;
    expect(launcher.kind).toBe('scenario');
    expect(launcher.practicePackId).toBe(pack.id);
  });

  it('resolves a lesson activity to a lesson launcher reflecting prior completion', () => {
    const step = makeStep({ kind: 'activity', activityId: 'lesson-hand-rankings' });
    const completed = resolveStepLauncher(step, completedProgress, [], loc()) as Extract<StepLauncher, { kind: 'lesson' }>;
    const fresh = resolveStepLauncher(step, [], [], loc()) as Extract<StepLauncher, { kind: 'lesson' }>;
    expect(completed.kind).toBe('lesson');
    expect(completed.lesson.id).toBe('lesson-hand-rankings');
    expect(completed.completed).toBe(true);
    expect(fresh.completed).toBe(false);
  });

  it('resolves a trainer activity to a trainer launcher reflecting the best score', () => {
    const step = makeStep({ kind: 'activity', activityId: 'trainer-percentages' });
    const launcher = resolveStepLauncher(step, completedProgress, [], loc()) as Extract<StepLauncher, { kind: 'trainer' }>;
    expect(launcher.kind).toBe('trainer');
    expect(launcher.trainer.id).toBe('trainer-percentages');
    expect(launcher.bestScore).toBe(88);
  });

  it('resolves a scenario drill activity to a scenario launcher', () => {
    const step = makeStep({ kind: 'activity', activityId: 'scenario-core-decisions' });
    const launcher = resolveStepLauncher(step, [], [], loc());
    expect(launcher?.kind).toBe('scenario');
  });

  it('returns null for an activity step whose activity is missing', () => {
    const step = makeStep({ kind: 'activity', activityId: 'activity-nonexistent' });
    expect(resolveStepLauncher(step, [], [], loc())).toBeNull();
  });

  it('resolves each curriculum step kind to the matching launcher', () => {
    const lesson = resolveStepLauncher(makeStep({ kind: 'curriculum', stepId: postflopLesson.id }), [], [], loc());
    expect(lesson?.kind).toBe('lesson');

    const practice = resolveStepLauncher(makeStep({ kind: 'curriculum', stepId: practiceCurriculum.id }), [], [], loc());
    expect(practice?.kind).toBe('scenario');

    const mission = resolveStepLauncher(makeStep({ kind: 'curriculum', stepId: missionCurriculum.id }), [], [], loc());
    expect(mission?.kind).toBe('mission');
    if (mission?.kind === 'mission') expect(mission.missionId).toBe(missionCurriculum.mission.id);

    const trainer = resolveStepLauncher(makeStep({ kind: 'curriculum', stepId: masteryCurriculum.id }), [], [], loc());
    expect(trainer?.kind).toBe('trainer');
  });

  it('returns null for a curriculum step whose id is unknown', () => {
    const step = makeStep({ kind: 'curriculum', stepId: 'curriculum-nonexistent' });
    expect(resolveStepLauncher(step, [], [], loc())).toBeNull();
  });
});
