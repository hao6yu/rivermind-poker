import type { CoachFocusArea } from '../poker/types';
import { handQuiz, lessons, percentageTrainer, scenarioTrainer } from './content';
import type { LearningProgressEntry, LearningResultInput } from './types';

const focusActivityIds: Record<Exclude<CoachFocusArea, 'none'>, string> = {
  preflop: scenarioTrainer.id,
  'value-betting': handQuiz.id,
  bluffing: handQuiz.id,
  calling: handQuiz.id,
  'bet-sizing': scenarioTrainer.id,
  'pot-odds': percentageTrainer.id,
  draws: percentageTrainer.id,
};

export function learningActivityIdForFocus(
  practiceFocus?: string | null,
): string | null {
  if (!practiceFocus || practiceFocus === 'none') return null;
  return focusActivityIds[practiceFocus as Exclude<CoachFocusArea, 'none'>] ?? null;
}

export function learningProgressById(
  progress: readonly LearningProgressEntry[],
): Map<string, LearningProgressEntry> {
  return new Map(progress.map((entry) => [entry.activityId, entry]));
}

export function applyLearningResult(
  progress: readonly LearningProgressEntry[],
  input: LearningResultInput,
  updatedAt = new Date().toISOString(),
): LearningProgressEntry[] {
  const current = progress.find((entry) => entry.activityId === input.activityId);
  const completed = Boolean(input.completed || current?.status === 'completed');
  const score = input.score === undefined
    ? current?.bestScore ?? null
    : Math.max(current?.bestScore ?? 0, Math.max(0, Math.min(100, Math.round(input.score))));
  const next: LearningProgressEntry = {
    activityId: input.activityId,
    activityType: input.activityType,
    status: completed ? 'completed' : 'started',
    bestScore: score,
    attempts: (current?.attempts ?? 0) + (input.countAttempt ? 1 : 0),
    completedAt: completed ? current?.completedAt ?? updatedAt : null,
    updatedAt,
  };
  return [...progress.filter((entry) => entry.activityId !== input.activityId), next]
    .sort((left, right) => left.activityId.localeCompare(right.activityId));
}

export function mergeLearningProgress(
  left: readonly LearningProgressEntry[],
  right: readonly LearningProgressEntry[],
): LearningProgressEntry[] {
  const ids = new Set([...left, ...right].map((entry) => entry.activityId));
  return [...ids].map((id) => {
    const first = left.find((entry) => entry.activityId === id);
    const second = right.find((entry) => entry.activityId === id);
    if (!first) return second as LearningProgressEntry;
    if (!second) return first;
    const newer = first.updatedAt >= second.updatedAt ? first : second;
    const completed = first.status === 'completed' || second.status === 'completed';
    const merged: LearningProgressEntry = {
      ...newer,
      status: completed ? 'completed' : 'started',
      bestScore: first.bestScore === null
        ? second.bestScore
        : second.bestScore === null
          ? first.bestScore
          : Math.max(first.bestScore, second.bestScore),
      attempts: Math.max(first.attempts, second.attempts),
      completedAt: completed ? first.completedAt ?? second.completedAt ?? newer.updatedAt : null,
    };
    return merged;
  }).sort((a, b) => a.activityId.localeCompare(b.activityId));
}

export function completedLessonCount(progress: readonly LearningProgressEntry[]): number {
  const byId = learningProgressById(progress);
  return lessons.filter((lesson) => byId.get(lesson.id)?.status === 'completed').length;
}

export function recommendedLearningActivityId(
  progress: readonly LearningProgressEntry[],
  practiceFocus?: string | null,
): string {
  const byId = learningProgressById(progress);
  const focusedId = learningActivityIdForFocus(practiceFocus);
  if (focusedId) return focusedId;

  const firstIncomplete = lessons.find((lesson) => byId.get(lesson.id)?.status !== 'completed');
  if (firstIncomplete) return firstIncomplete.id;

  const practiceActivities = [percentageTrainer, handQuiz, scenarioTrainer];
  return practiceActivities.reduce((lowest, activity) => {
    const lowestScore = byId.get(lowest.id)?.bestScore ?? -1;
    const activityScore = byId.get(activity.id)?.bestScore ?? -1;
    return activityScore < lowestScore ? activity : lowest;
  }).id;
}

export function percentageScore(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.max(0, Math.min(correct, total)) / total) * 100);
}
