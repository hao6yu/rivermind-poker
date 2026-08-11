import type { CoachFocusArea } from '../poker/types';
import { buildAdaptiveLearningRecommendation } from './adaptiveRecommendation';
import { curriculumSteps, type CurriculumStep } from './curriculum';
import { findLearningActivity } from './content';
import { practicePackForFocus, type PracticePackDefinition } from './practicePacks';
import { selectDailyLearningReviewItems, type LearningReviewItem } from './reviewQueue';
import type { LearningActivityDefinition, LearningProgressEntry } from './types';

export type PersonalPracticePlanReason =
  | 'resume'
  | 'review'
  | 'table-focus'
  | 'reinforce'
  | 'continue-path';

export type PersonalPracticePlanTarget =
  | { kind: 'review'; dueCount: number }
  | { focus: Exclude<CoachFocusArea, 'none'> | null; kind: 'practice'; pack: PracticePackDefinition }
  | { activity: LearningActivityDefinition; kind: 'activity' }
  | { kind: 'curriculum'; step: CurriculumStep };

export interface PersonalPracticePlanItem {
  id: string;
  reason: PersonalPracticePlanReason;
  score?: number;
  target: PersonalPracticePlanTarget;
}

function targetKey(target: PersonalPracticePlanTarget): string {
  if (target.kind === 'review') return 'review';
  if (target.kind === 'practice') return `practice:${target.pack.id}`;
  if (target.kind === 'activity') return `activity:${target.activity.id}`;
  if (target.step.kind === 'practice') return `practice:${target.step.pack.id}`;
  return `activity:${target.step.id}`;
}

function resumableTarget(entry: LearningProgressEntry): PersonalPracticePlanTarget | null {
  const step = curriculumSteps.find((candidate) => candidate.id === entry.activityId);
  if (step) return { kind: 'curriculum', step };
  const activity = findLearningActivity(entry.activityId);
  return activity ? { activity, kind: 'activity' } : null;
}

/**
 * Builds a short local-only plan from evidence the learner has already created.
 * Items are deduplicated by their actual destination so a table leak and a low
 * practice score never produce two buttons that open the same drill.
 */
export function buildPersonalPracticePlan(
  progress: readonly LearningProgressEntry[],
  reviewQueue: readonly LearningReviewItem[],
  practiceFocus?: string | null,
  includeReview = true,
  now = new Date().toISOString(),
): PersonalPracticePlanItem[] {
  const items: PersonalPracticePlanItem[] = [];
  const keys = new Set<string>();
  const append = (
    reason: PersonalPracticePlanReason,
    target: PersonalPracticePlanTarget,
    score?: number,
  ) => {
    const key = targetKey(target);
    if (keys.has(key) || items.length >= 3) return;
    keys.add(key);
    items.push({ id: `${reason}:${key}`, reason, score, target });
  };

  const started = [...progress]
    .filter((entry) => entry.status === 'started')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .find((entry) => resumableTarget(entry));
  if (started) {
    const target = resumableTarget(started);
    if (target) append('resume', target);
  }

  const dueReviews = includeReview
    ? selectDailyLearningReviewItems(reviewQueue, 3, now)
    : [];
  if (dueReviews.length > 0) append('review', { dueCount: dueReviews.length, kind: 'review' });

  const focusPack = practicePackForFocus(practiceFocus);
  if (focusPack && practiceFocus && practiceFocus !== 'none') {
    append('table-focus', {
      focus: practiceFocus as Exclude<CoachFocusArea, 'none'>,
      kind: 'practice',
      pack: focusPack,
    });
  }

  const adaptive = buildAdaptiveLearningRecommendation(progress, reviewQueue, false, now);
  if (adaptive?.kind === 'reinforce-practice') {
    append('reinforce', { focus: null, kind: 'practice', pack: adaptive.pack }, adaptive.score);
  } else if (adaptive?.kind === 'reinforce-activity') {
    append('reinforce', { activity: adaptive.activity, kind: 'activity' }, adaptive.score);
  } else if (adaptive?.kind === 'curriculum') {
    append('continue-path', { kind: 'curriculum', step: adaptive.step });
  }

  const nextIncomplete = curriculumSteps.find((step) => (
    progress.find((entry) => entry.activityId === step.id)?.status !== 'completed'
  ));
  if (nextIncomplete) append('continue-path', { kind: 'curriculum', step: nextIncomplete });

  return items;
}
