export type LearningSessionKind = 'lesson' | 'practice' | 'review';

export interface LearningSessionRecord {
  activityId: string;
  correctCount: number | null;
  id: string;
  kind: LearningSessionKind;
  localDate: string;
  occurredAt: string;
  score: number | null;
  totalCount: number | null;
}

export interface LearningSessionInput {
  activityId: string;
  correctCount?: number;
  kind: LearningSessionKind;
  score?: number;
  totalCount?: number;
}

export interface LearningDaySnapshot {
  date: string;
  sessions: number;
}

export interface LearningHistorySnapshot {
  activeDays: number;
  currentStreak: number;
  days: LearningDaySnapshot[];
  longestStreak: number;
  previousWeekSessions: number;
  reviewAccuracy: number | null;
  sessions: number;
  sessionTrend: number;
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

export function isLearningDateKey(value: string): boolean {
  if (!dateKeyPattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function learningDateKey(timestamp = new Date()): string {
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, '0');
  const day = String(timestamp.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function offsetDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function longestLearningStreak(activeDates: ReadonlySet<string>): number {
  const dates = [...activeDates].sort();
  let longest = 0;
  let current = 0;
  let previous: string | null = null;

  for (const date of dates) {
    current = previous && offsetDateKey(previous, 1) === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

function currentLearningStreak(activeDates: ReadonlySet<string>, today: string): number {
  let cursor = activeDates.has(today) ? today : offsetDateKey(today, -1);
  let streak = 0;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = offsetDateKey(cursor, -1);
  }
  return streak;
}

export function buildLearningHistorySnapshot(
  history: readonly LearningSessionRecord[],
  today = learningDateKey(),
): LearningHistorySnapshot {
  const validHistory = history.filter((item) => isLearningDateKey(item.localDate));
  const activeDates = new Set(validHistory.map((item) => item.localDate));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = offsetDateKey(today, index - 6);
    return {
      date,
      sessions: validHistory.filter((item) => item.localDate === date).length,
    };
  });
  const previousWeekDates = new Set(Array.from({ length: 7 }, (_, index) => (
    offsetDateKey(today, index - 13)
  )));
  const previousWeekSessions = validHistory.filter((item) => previousWeekDates.has(item.localDate)).length;
  const recentDateSet = new Set(days.map((day) => day.date));
  const recentHistory = validHistory.filter((item) => recentDateSet.has(item.localDate));
  const reviewTotals = recentHistory.reduce((totals, item) => ({
    correct: totals.correct + (item.correctCount ?? 0),
    decisions: totals.decisions + (item.totalCount ?? 0),
  }), { correct: 0, decisions: 0 });
  const sessions = days.reduce((total, day) => total + day.sessions, 0);

  return {
    activeDays: days.filter((day) => day.sessions > 0).length,
    currentStreak: currentLearningStreak(activeDates, today),
    days,
    longestStreak: longestLearningStreak(activeDates),
    previousWeekSessions,
    reviewAccuracy: reviewTotals.decisions > 0
      ? Math.round((reviewTotals.correct / reviewTotals.decisions) * 100)
      : null,
    sessions,
    sessionTrend: sessions - previousWeekSessions,
  };
}
