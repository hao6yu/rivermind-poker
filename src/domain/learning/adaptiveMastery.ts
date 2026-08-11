import { handQuiz, percentageTrainer } from './content';
import {
  curriculumStepsForChapter,
  nextCurriculumStep,
  type CurriculumChapterId,
  type CurriculumStep,
} from './curriculum';
import {
  buildLearningHistorySnapshot,
  learningDateKey,
  type LearningDaySnapshot,
  type LearningSessionRecord,
} from './history';
import { dueLearningReviewCount, type LearningReviewItem } from './reviewQueue';
import type { LearningProgressEntry } from './types';

export interface ChapterMasterySnapshot {
  chapter: CurriculumChapterId;
  completedSteps: number;
  dueReviews: number;
  masteryPercent: number;
  totalSteps: number;
}

export interface WeeklyLearningSnapshot {
  activeDays: number;
  completedSteps: number;
  currentStreak: number;
  days: LearningDaySnapshot[];
  longestStreak: number;
  previousWeekActivities: number;
  recentActivities: number;
  reviewAccuracy: number | null;
  sessionTrend: number;
}

export interface AdaptiveMasterySnapshot {
  chapters: Record<CurriculumChapterId, ChapterMasterySnapshot>;
  dueReviews: number;
  recommendedChapter: CurriculumChapterId;
  week: WeeklyLearningSnapshot;
}

const chapters: CurriculumChapterId[] = ['fundamentals', 'preflop', 'postflop'];

function stepMastery(step: CurriculumStep, entry?: LearningProgressEntry): number {
  if (!entry) return 0;
  if (step.kind === 'lesson') return entry.status === 'completed' ? 100 : 0;
  if (entry.bestScore !== null) return entry.bestScore;
  return entry.status === 'completed' ? 100 : 0;
}

export function learningReviewChapter(item: LearningReviewItem): CurriculumChapterId {
  for (const chapter of chapters) {
    if (curriculumStepsForChapter(chapter).some((step) => step.id === item.activityId)) return chapter;
  }
  if (item.activityId === percentageTrainer.id || item.activityId === handQuiz.id) return 'fundamentals';
  if (item.source !== 'trainer' && item.focusArea === 'preflop') return 'preflop';
  return 'postflop';
}

export function buildAdaptiveMasterySnapshot(
  progress: readonly LearningProgressEntry[],
  reviewQueue: readonly LearningReviewItem[],
  history: readonly LearningSessionRecord[] = [],
  now = new Date().toISOString(),
): AdaptiveMasterySnapshot {
  const progressById = new Map(progress.map((entry) => [entry.activityId, entry]));
  const dueItems = reviewQueue.filter((item) => item.nextReviewAt <= now);
  const chapterSnapshots = Object.fromEntries(chapters.map((chapter) => {
    const steps = curriculumStepsForChapter(chapter);
    const completedSteps = steps.filter((step) => progressById.get(step.id)?.status === 'completed').length;
    const dueReviews = dueItems.filter((item) => learningReviewChapter(item) === chapter).length;
    const baseMastery = steps.length === 0
      ? 0
      : Math.round(steps.reduce((total, step) => total + stepMastery(step, progressById.get(step.id)), 0) / steps.length);
    const masteryPercent = Math.max(0, baseMastery - Math.min(12, dueReviews * 3));
    return [chapter, {
      chapter,
      completedSteps,
      dueReviews,
      masteryPercent,
      totalSteps: steps.length,
    } satisfies ChapterMasterySnapshot];
  })) as Record<CurriculumChapterId, ChapterMasterySnapshot>;

  const nextChapter = nextCurriculumStep(progress)?.chapter ?? 'fundamentals';
  const recommendedChapter = dueItems.length > 0
    ? [...chapters].sort((left, right) => (
      chapterSnapshots[right].dueReviews - chapterSnapshots[left].dueReviews
      || chapterSnapshots[left].masteryPercent - chapterSnapshots[right].masteryPercent
      || chapters.indexOf(left) - chapters.indexOf(right)
    ))[0]!
    : nextChapter;

  const nowDate = new Date(now);
  const cutoff = new Date(nowDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - 6);
  cutoff.setUTCHours(0, 0, 0, 0);
  const cutoffIso = cutoff.toISOString();
  const recentProgress = progress.filter((entry) => entry.updatedAt >= cutoffIso && entry.updatedAt <= now);
  const recentReviewDates = reviewQueue.flatMap((item) => (
    item.lastReviewedAt && item.lastReviewedAt >= cutoffIso && item.lastReviewedAt <= now
      ? [item.lastReviewedAt.slice(0, 10)]
      : []
  ));
  const activeDays = new Set([
    ...recentProgress.map((entry) => entry.updatedAt.slice(0, 10)),
    ...recentReviewDates,
  ]).size;
  const historySnapshot = buildLearningHistorySnapshot(history, learningDateKey(nowDate));
  const curriculumIds = new Set(chapters.flatMap((chapter) => (
    curriculumStepsForChapter(chapter).map((step) => step.id)
  )));

  return {
    chapters: chapterSnapshots,
    dueReviews: dueLearningReviewCount(reviewQueue, now),
    recommendedChapter,
    week: {
      activeDays: history.length > 0 ? historySnapshot.activeDays : activeDays,
      completedSteps: progress.filter((entry) => (
        curriculumIds.has(entry.activityId)
        && entry.completedAt
        && entry.completedAt >= cutoffIso
        && entry.completedAt <= now
      )).length,
      currentStreak: historySnapshot.currentStreak,
      days: historySnapshot.days,
      longestStreak: historySnapshot.longestStreak,
      previousWeekActivities: historySnapshot.previousWeekSessions,
      recentActivities: history.length > 0 ? historySnapshot.sessions : recentProgress.length,
      reviewAccuracy: historySnapshot.reviewAccuracy,
      sessionTrend: historySnapshot.sessionTrend,
    },
  };
}
