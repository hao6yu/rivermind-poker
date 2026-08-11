import type { LearningConceptId } from './adaptiveRecommendation';
import {
  curriculumSteps,
  nextCurriculumStep,
  type CurriculumChapterId,
  type CurriculumStep,
} from './curriculum';
import type { LearningProgressEntry } from './types';

export const LEARNING_GOAL_IDS = [
  'balanced',
  'foundations',
  'cash-game',
  'tournament',
  'math',
  'opponents',
] as const;

export type LearningGoalId = typeof LEARNING_GOAL_IDS[number];

export const CALIBRATION_SKILL_IDS = [
  'fundamentals',
  'cash-game',
  'tournament',
  'math',
  'opponents',
] as const;

export type CalibrationSkillId = typeof CALIBRATION_SKILL_IDS[number];
export type CalibrationKind = 'baseline' | 'checkpoint';

export interface CalibrationQuestion {
  choiceIds: readonly string[];
  concept: LearningConceptId;
  correctChoiceId: string;
  id: string;
  skill: CalibrationSkillId;
}

export interface CalibrationAnswer {
  choiceId: string;
  questionId: string;
}

export interface LearningSkillSnapshot {
  completedAt: string;
  id: string;
  kind: CalibrationKind;
  overallScore: number;
  scores: Record<CalibrationSkillId, number>;
  sessionCount: number;
}

export interface LearningProfile {
  goal: LearningGoalId;
  setupStatus: 'not-started' | 'skipped' | 'complete';
  snapshots: LearningSkillSnapshot[];
  version: 1;
}

export interface GuidedLearningContext {
  goal: LearningGoalId;
  snapshot: LearningSkillSnapshot | null;
}

export interface LearningCheckpointStatus {
  due: boolean;
  sessionsCompleted: number;
  sessionsRemaining: number;
}

export interface LearningProgressComparison {
  goalChange: number;
  overallChange: number;
}

const checkpointInterval = 7;
const maximumSnapshots = 8;

export const calibrationQuestions: readonly CalibrationQuestion[] = [
  {
    id: 'calibration-hand-strength',
    skill: 'fundamentals',
    concept: 'poker-basics',
    choiceIds: ['flush', 'straight', 'three-kind'],
    correctChoiceId: 'flush',
  },
  {
    id: 'calibration-action-order',
    skill: 'fundamentals',
    concept: 'poker-basics',
    choiceIds: ['button', 'small-blind', 'big-blind'],
    correctChoiceId: 'small-blind',
  },
  {
    id: 'calibration-position-open',
    skill: 'cash-game',
    concept: 'preflop-entry',
    choiceIds: ['open', 'limp', 'fold'],
    correctChoiceId: 'open',
  },
  {
    id: 'calibration-range-advantage',
    skill: 'cash-game',
    concept: 'postflop-range',
    choiceIds: ['small-bet', 'large-bet', 'check-range'],
    correctChoiceId: 'small-bet',
  },
  {
    id: 'calibration-short-stack',
    skill: 'tournament',
    concept: 'tournament-short-stack',
    choiceIds: ['smaller-opens', 'more-limps', 'tighter-value-only'],
    correctChoiceId: 'smaller-opens',
  },
  {
    id: 'calibration-bubble-call',
    skill: 'tournament',
    concept: 'tournament-bubble',
    choiceIds: ['fold-more', 'call-chip-odds', 'ignore-stacks'],
    correctChoiceId: 'fold-more',
  },
  {
    id: 'calibration-pot-odds',
    skill: 'math',
    concept: 'table-math',
    choiceIds: ['20-percent', '25-percent', '33-percent'],
    correctChoiceId: '20-percent',
  },
  {
    id: 'calibration-bluff-threshold',
    skill: 'math',
    concept: 'advanced-math',
    choiceIds: ['25-percent', '33-percent', '50-percent'],
    correctChoiceId: '33-percent',
  },
  {
    id: 'calibration-read-sample',
    skill: 'opponents',
    concept: 'opponent-adjustments',
    choiceIds: ['one-showdown', 'repeated-actions', 'avatar-style'],
    correctChoiceId: 'repeated-actions',
  },
  {
    id: 'calibration-sticky-player',
    skill: 'opponents',
    concept: 'opponent-adjustments',
    choiceIds: ['value-thinner', 'bluff-more', 'trap-only'],
    correctChoiceId: 'value-thinner',
  },
];

const goalChapterPriorities: Record<LearningGoalId, readonly CurriculumChapterId[]> = {
  balanced: ['fundamentals', 'preflop', 'postflop', 'tournament', 'opponents', 'advanced-math'],
  foundations: ['fundamentals', 'preflop', 'postflop', 'advanced-math', 'opponents', 'tournament'],
  'cash-game': ['preflop', 'postflop', 'opponents', 'advanced-math', 'fundamentals', 'tournament'],
  tournament: ['tournament', 'preflop', 'advanced-math', 'postflop', 'fundamentals', 'opponents'],
  math: ['advanced-math', 'postflop', 'fundamentals', 'preflop', 'tournament', 'opponents'],
  opponents: ['opponents', 'postflop', 'preflop', 'advanced-math', 'fundamentals', 'tournament'],
};

const skillChapterPriorities: Record<CalibrationSkillId, readonly CurriculumChapterId[]> = {
  fundamentals: ['fundamentals', 'preflop'],
  'cash-game': ['preflop', 'postflop'],
  tournament: ['tournament'],
  math: ['advanced-math', 'postflop'],
  opponents: ['opponents'],
};

const goalConceptPriorities: Record<LearningGoalId, readonly LearningConceptId[]> = {
  balanced: [
    'poker-basics', 'table-math', 'betting-purpose', 'preflop-entry',
    'preflop-pressure', 'preflop-three-bet', 'postflop-betting', 'postflop-odds',
    'postflop-range', 'postflop-river', 'tournament-short-stack',
    'tournament-bubble', 'opponent-adjustments', 'advanced-math',
  ],
  foundations: [
    'poker-basics', 'table-math', 'betting-purpose', 'preflop-entry',
    'preflop-pressure', 'postflop-betting', 'postflop-odds', 'preflop-three-bet',
    'postflop-range', 'postflop-river', 'advanced-math', 'opponent-adjustments',
    'tournament-short-stack', 'tournament-bubble',
  ],
  'cash-game': [
    'preflop-entry', 'preflop-pressure', 'preflop-three-bet', 'postflop-betting',
    'postflop-odds', 'postflop-range', 'postflop-river', 'opponent-adjustments',
    'advanced-math', 'table-math', 'poker-basics', 'betting-purpose',
    'tournament-short-stack', 'tournament-bubble',
  ],
  tournament: [
    'tournament-short-stack', 'tournament-bubble', 'preflop-entry',
    'preflop-pressure', 'advanced-math', 'table-math', 'postflop-odds',
    'postflop-betting', 'postflop-range', 'postflop-river', 'poker-basics',
    'betting-purpose', 'preflop-three-bet', 'opponent-adjustments',
  ],
  math: [
    'table-math', 'postflop-odds', 'advanced-math', 'postflop-betting',
    'postflop-range', 'postflop-river', 'preflop-pressure', 'preflop-three-bet',
    'poker-basics', 'betting-purpose', 'preflop-entry', 'tournament-short-stack',
    'tournament-bubble', 'opponent-adjustments',
  ],
  opponents: [
    'opponent-adjustments', 'postflop-river', 'postflop-range',
    'postflop-betting', 'preflop-pressure', 'preflop-three-bet', 'advanced-math',
    'postflop-odds', 'preflop-entry', 'table-math', 'poker-basics',
    'betting-purpose', 'tournament-short-stack', 'tournament-bubble',
  ],
};

export function createDefaultLearningProfile(): LearningProfile {
  return { goal: 'balanced', setupStatus: 'not-started', snapshots: [], version: 1 };
}

export function selectLearningGoal(
  profile: LearningProfile,
  goal: LearningGoalId,
): LearningProfile {
  return { ...profile, goal, setupStatus: 'complete' };
}

export function skipLearningSetup(profile: LearningProfile): LearningProfile {
  return { ...profile, goal: 'balanced', setupStatus: 'skipped' };
}

export function scoreSkillCalibration(
  answers: readonly CalibrationAnswer[],
  kind: CalibrationKind,
  sessionCount: number,
  completedAt = new Date().toISOString(),
): LearningSkillSnapshot {
  const selected = new Map(answers.map((answer) => [answer.questionId, answer.choiceId]));
  const counts = Object.fromEntries(CALIBRATION_SKILL_IDS.map((skill) => [skill, { correct: 0, total: 0 }])) as Record<CalibrationSkillId, { correct: number; total: number }>;
  let totalCorrect = 0;
  calibrationQuestions.forEach((question) => {
    counts[question.skill].total += 1;
    if (selected.get(question.id) === question.correctChoiceId) {
      counts[question.skill].correct += 1;
      totalCorrect += 1;
    }
  });
  const scores = Object.fromEntries(CALIBRATION_SKILL_IDS.map((skill) => {
    const count = counts[skill];
    return [skill, count.total === 0 ? 0 : Math.round((count.correct / count.total) * 100)];
  })) as Record<CalibrationSkillId, number>;
  return {
    completedAt,
    id: `${kind}:${completedAt}`,
    kind,
    overallScore: Math.round((totalCorrect / calibrationQuestions.length) * 100),
    scores,
    sessionCount: Math.max(0, Math.floor(sessionCount)),
  };
}

export function recordLearningSnapshot(
  profile: LearningProfile,
  snapshot: LearningSkillSnapshot,
): LearningProfile {
  const snapshots = [snapshot, ...profile.snapshots.filter((item) => item.id !== snapshot.id)]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, maximumSnapshots);
  return { ...profile, setupStatus: 'complete', snapshots };
}

export function latestLearningSnapshot(profile: LearningProfile): LearningSkillSnapshot | null {
  return profile.snapshots[0] ?? null;
}

export function guidedLearningContext(profile: LearningProfile): GuidedLearningContext {
  return { goal: profile.goal, snapshot: latestLearningSnapshot(profile) };
}

export function calibrationSkillForGoal(goal: LearningGoalId): CalibrationSkillId | null {
  if (goal === 'balanced') return null;
  if (goal === 'foundations') return 'fundamentals';
  return goal;
}

export function learningGoalConceptPriority(goal: LearningGoalId): readonly LearningConceptId[] {
  return goalConceptPriorities[goal];
}

function completedFundamentalCount(progress: readonly LearningProgressEntry[]): number {
  const completed = new Set(progress.filter((entry) => entry.status === 'completed').map((entry) => entry.activityId));
  return curriculumSteps.filter((step) => step.chapter === 'fundamentals' && completed.has(step.id)).length;
}

export function goalAwareCurriculumStep(
  progress: readonly LearningProgressEntry[],
  context?: GuidedLearningContext | null,
): CurriculumStep | null {
  if (!context) return nextCurriculumStep(progress);
  const completed = new Set(progress.filter((entry) => entry.status === 'completed').map((entry) => entry.activityId));
  if (context.goal === 'balanced') {
    if (!context.snapshot) return nextCurriculumStep(progress);
    const weakestSkill = [...CALIBRATION_SKILL_IDS]
      .sort((left, right) => context.snapshot!.scores[left] - context.snapshot!.scores[right])[0]!;
    if (context.snapshot.scores[weakestSkill] < 80) {
      for (const chapter of skillChapterPriorities[weakestSkill]) {
        const step = curriculumSteps.find((candidate) => candidate.chapter === chapter && !completed.has(candidate.id));
        if (step) return step;
      }
    }
    return nextCurriculumStep(progress);
  }
  const foundationScore = context.snapshot?.scores.fundamentals ?? null;
  if (completedFundamentalCount(progress) < 3 && (foundationScore === null || foundationScore < 60)) {
    return curriculumSteps.find((step) => step.chapter === 'fundamentals' && !completed.has(step.id)) ?? null;
  }
  for (const chapter of goalChapterPriorities[context.goal]) {
    const step = curriculumSteps.find((candidate) => candidate.chapter === chapter && !completed.has(candidate.id));
    if (step) return step;
  }
  return nextCurriculumStep(progress);
}

export function learningCheckpointStatus(
  profile: LearningProfile,
  sessions: number | readonly { occurredAt: string }[],
): LearningCheckpointStatus {
  const latest = latestLearningSnapshot(profile);
  if (!latest) {
    return { due: true, sessionsCompleted: 0, sessionsRemaining: 0 };
  }
  const sessionsCompleted = typeof sessions === 'number'
    ? Math.max(0, Math.floor(sessions) - latest.sessionCount)
    : sessions.filter((session) => session.occurredAt > latest.completedAt).length;
  return {
    due: sessionsCompleted >= checkpointInterval,
    sessionsCompleted,
    sessionsRemaining: Math.max(0, checkpointInterval - sessionsCompleted),
  };
}

export function learningProgressComparison(profile: LearningProfile): LearningProgressComparison | null {
  const [latest, previous] = profile.snapshots;
  if (!latest || !previous) return null;
  const skill = calibrationSkillForGoal(profile.goal);
  return {
    goalChange: skill ? latest.scores[skill] - previous.scores[skill] : latest.overallScore - previous.overallScore,
    overallChange: latest.overallScore - previous.overallScore,
  };
}

export const guidedProgressContract = {
  checkpointInterval,
  maximumSnapshots,
};
