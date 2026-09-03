import type { MessageKey } from '../../localization';
import { curriculumSteps } from '../../domain/learning/curriculum';
import { tableMissionById } from '../../domain/learning/tableMissions';
import { findLearningActivity } from '../../domain/learning/content';
import { practicePackById, type PracticePackDefinition } from '../../domain/learning/practicePacks';
import type {
  LessonDefinition,
  LearningActivityDefinition,
  LearningProgressEntry,
  PracticePackId,
  ScenarioSpot,
  TrainerDefinition,
} from '../../domain/learning/types';
import type { LearningReviewItem } from '../../domain/learning/reviewQueue';
import type { RecommendedSessionPlan, RecommendedSessionStep } from '../../domain/learning/recommendedSession';
import type { PersonalPracticePlanReason } from '../../domain/learning/personalPracticePlan';
import { learningProgressById } from '../../domain/learning/progress';
import type { TableMissionId } from '../../domain/learning/tableMissions';
import { buildDailyLearningReviewTrainer } from './dailyReviewTrainer';

/**
 * Pure presentation helpers for the recommended-session journey: concept labels,
 * the compact header, and the resolver that maps a plan step to the modal the
 * controller renders. Keeping them free of React makes them fully unit-testable
 * and lets the Learn screen reuse the concept label if it wants to.
 */

/** Localization accessors the controller needs to render and launch a step. */
export interface SessionLoc {
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  /** Count-aware translation matching the provider's tCount. */
  tCount: (key: MessageKey, count: number, values?: Record<string, string | number>) => string;
  scenarioContent: (spot: ScenarioSpot) => ScenarioSpot;
  trainerContent: (trainer: TrainerDefinition) => TrainerDefinition;
  activityText: (activity: LearningActivityDefinition, field: 'title' | 'description') => string;
  practicePackText: (pack: PracticePackDefinition, field: 'title' | 'description') => string;
}

export type StepLauncher =
  | { kind: 'lesson'; lesson: LessonDefinition; completed: boolean }
  | { kind: 'trainer'; trainer: TrainerDefinition; bestScore: number | null }
  | { kind: 'scenario'; practicePackId?: PracticePackId; bestScore: number | null }
  | { kind: 'review'; trainer: TrainerDefinition }
  | { kind: 'mission'; missionId: TableMissionId };

function conceptLabelKey(conceptId: string): MessageKey {
  const camel = conceptId
    .split('-')
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
  return `concept.${camel}` as MessageKey;
}

/** The human-friendly name of a concept id, localized. */
export function learningConceptLabel(conceptId: string, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  return t(conceptLabelKey(conceptId));
}

const REASON_KEYS: Record<PersonalPracticePlanReason, MessageKey> = {
  resume: 'learn.reasonResume',
  review: 'learn.reasonReview',
  'table-focus': 'learn.reasonTableFocus',
  reinforce: 'learn.reasonReinforce',
  'goal-focus': 'learn.reasonGoalFocus',
  'continue-path': 'learn.reasonContinuePath',
};

/**
 * Why RiverMind selected this session, e.g. "On the path to level up" or "You
 * paused here". Localized via the caller's `t`; it falls back to the
 * "continue path" copy when an unknown reason is somehow persisted.
 */
export function sessionReasonLabel(reason: PersonalPracticePlanReason, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  return t(REASON_KEYS[reason] ?? 'learn.reasonContinuePath');
}

/**
 * The 1-based position of `step` within the plan, used to render the compact
 * header ("Step 2 of 3"). Steps fall back to 1 when the step is not found, so a
 * resumed session never reports a negative or out-of-range index.
 */
export function sessionStepIndex(plan: RecommendedSessionPlan, step: RecommendedSessionStep): number {
  const index = plan.steps.findIndex((candidate) => candidate.id === step.id);
  return index < 0 ? 1 : index + 1;
}

/**
 * A compact, localized header for the active step, e.g. "Step 2 of 3". A
 * dedicated message is used (rather than `learn.pathCount`) so the number is
 * announced as the current position, not a completed-step count.
 */
export function sessionHeaderTitle(
  activeStep: RecommendedSessionStep,
  activeIndex: number,
  total: number,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string {
  return t('learn.sessionStepOf', { current: activeIndex, total });
}

/** The localized label for a step, shown in the compact header. */
export function sessionStepLabel(step: RecommendedSessionStep, loc: SessionLoc): string {
  const target = step.target;
  if (target.kind === 'review') return loc.t('learn.reviewToday');
  if (target.kind === 'practice') {
    const pack = practicePackById(target.packId);
    return pack ? loc.practicePackText(pack, 'title') : learningConceptLabel(step.concept, loc.t);
  }
  if (target.kind === 'activity') {
    const activity = findLearningActivity(target.activityId);
    return activity ? loc.activityText(activity, 'title') : learningConceptLabel(step.concept, loc.t);
  }
  if (target.kind === 'curriculum') {
    const curriculumStep = curriculumSteps.find((candidate) => candidate.id === target.stepId);
    if (!curriculumStep) return learningConceptLabel(step.concept, loc.t);
    if (curriculumStep.kind === 'lesson') return loc.activityText(curriculumStep.lesson, 'title');
    if (curriculumStep.kind === 'practice') return loc.practicePackText(curriculumStep.pack, 'title');
    if (curriculumStep.kind === 'mission') {
      const mission = tableMissionById(curriculumStep.mission.id);
      return mission.title;
    }
    return loc.activityText(curriculumStep.trainer, 'title');
  }
  return learningConceptLabel(step.concept, loc.t);
}

/** Resolves the modal to render for a step, or null when it is not routable. */
export function resolveStepLauncher(
  step: RecommendedSessionStep,
  progress: readonly LearningProgressEntry[],
  reviewItems: readonly LearningReviewItem[],
  loc: SessionLoc,
): StepLauncher | null {
  const progressById = learningProgressById(progress);
  const bestScore = (id: string | undefined): number | null => (id ? progressById.get(id)?.bestScore ?? null : null);
  const completed = (id: string | undefined): boolean => (id ? progressById.get(id)?.status === 'completed' : false);

  const target = step.target;
  switch (target.kind) {
    case 'review': {
      // The frozen ids pin the exact set the composer matched; build a trainer
      // from those items so a relaunch reviews the same decisions.
      const frozen = reviewItems.filter((item) => target.itemIds?.includes(item.id));
      const trainer = buildDailyLearningReviewTrainer(frozen, {
        scenarioContent: loc.scenarioContent,
        trainerContent: loc.trainerContent,
        t: loc.t,
      });
      return trainer ? { kind: 'review', trainer } : null;
    }
    case 'practice': {
      const pack = practicePackById(target.packId);
      if (!pack) return null;
      return { kind: 'scenario', practicePackId: pack.id, bestScore: bestScore(pack.progressActivityId) };
    }
    case 'activity': {
      const activity = findLearningActivity(target.activityId);
      if (!activity) return null;
      if (activity.type === 'lesson') return { kind: 'lesson', lesson: activity, completed: completed(activity.id) };
      if (activity.type === 'scenario_drill') return { kind: 'scenario', bestScore: bestScore(activity.id) };
      return { kind: 'trainer', trainer: activity, bestScore: bestScore(activity.id) };
    }
    case 'curriculum': {
      const curriculumStep = curriculumSteps.find((candidate) => candidate.id === target.stepId);
      if (!curriculumStep) return null;
      if (curriculumStep.kind === 'lesson') return { kind: 'lesson', lesson: curriculumStep.lesson, completed: completed(curriculumStep.lesson.id) };
      if (curriculumStep.kind === 'practice') return { kind: 'scenario', practicePackId: curriculumStep.pack.id, bestScore: bestScore(curriculumStep.pack.progressActivityId) };
      if (curriculumStep.kind === 'mission') return { kind: 'mission', missionId: curriculumStep.mission.id };
      return { kind: 'trainer', trainer: curriculumStep.trainer, bestScore: bestScore(curriculumStep.trainer.id) };
    }
  }
}
