import { describe, expect, it } from 'vitest';

import { buildLearningHistorySnapshot, type LearningSessionRecord } from '../history';

function session(
  localDate: string,
  overrides: Partial<LearningSessionRecord> = {},
): LearningSessionRecord {
  return {
    activityId: 'hand-quiz',
    correctCount: null,
    id: `${localDate}:${overrides.kind ?? 'practice'}`,
    kind: 'practice',
    localDate,
    occurredAt: `${localDate}T12:00:00.000Z`,
    score: null,
    totalCount: null,
    ...overrides,
  };
}

describe('learning history', () => {
  it('builds rolling seven-day activity and review accuracy', () => {
    const snapshot = buildLearningHistorySnapshot([
      session('2026-08-04'),
      session('2026-08-10'),
      session('2026-08-11', {
        correctCount: 2,
        kind: 'review',
        totalCount: 3,
      }),
    ], '2026-08-11');

    expect(snapshot.activeDays).toBe(2);
    expect(snapshot.sessions).toBe(2);
    expect(snapshot.previousWeekSessions).toBe(1);
    expect(snapshot.sessionTrend).toBe(1);
    expect(snapshot.reviewAccuracy).toBe(67);
    expect(snapshot.days.map((day) => day.sessions)).toEqual([0, 0, 0, 0, 0, 1, 1]);
  });

  it('keeps a streak alive through the end of the following day', () => {
    const history = [
      session('2026-08-07'),
      session('2026-08-09'),
      session('2026-08-10'),
    ];

    expect(buildLearningHistorySnapshot(history, '2026-08-10').currentStreak).toBe(2);
    expect(buildLearningHistorySnapshot(history, '2026-08-11').currentStreak).toBe(2);
    expect(buildLearningHistorySnapshot(history, '2026-08-12').currentStreak).toBe(0);
    expect(buildLearningHistorySnapshot(history, '2026-08-12').longestStreak).toBe(2);
  });

  it('does not count invalid calendar keys', () => {
    const invalid = session('not-a-date');
    const snapshot = buildLearningHistorySnapshot([invalid], '2026-08-11');

    expect(snapshot.sessions).toBe(0);
    expect(snapshot.longestStreak).toBe(0);
  });
});
