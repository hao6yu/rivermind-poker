import { describe, expect, it } from 'vitest';

import { lessons } from '../content';
import {
  applyLearningResult,
  completedLessonCount,
  mergeLearningProgress,
  percentageScore,
  recommendedLearningActivityId,
} from '../progress';

describe('learning progress', () => {
  it('completes lessons without inventing drill attempts', () => {
    const progress = applyLearningResult([], {
      activityId: lessons[0]!.id,
      activityType: 'lesson',
      completed: true,
    }, '2026-08-01T00:00:00.000Z');

    expect(progress[0]).toMatchObject({ status: 'completed', attempts: 0, bestScore: null });
    expect(completedLessonCount(progress)).toBe(1);
  });

  it('keeps the best trainer score while counting attempts', () => {
    const first = applyLearningResult([], {
      activityId: 'trainer-percentages',
      activityType: 'percentage_drill',
      completed: true,
      score: 80,
      countAttempt: true,
    }, '2026-08-01T00:00:00.000Z');
    const second = applyLearningResult(first, {
      activityId: 'trainer-percentages',
      activityType: 'percentage_drill',
      completed: true,
      score: 60,
      countAttempt: true,
    }, '2026-08-01T00:01:00.000Z');

    expect(second[0]).toMatchObject({ bestScore: 80, attempts: 2 });
    expect(percentageScore(4, 5)).toBe(80);
  });

  it('recommends the path first and a relevant focus after foundations begin', () => {
    expect(recommendedLearningActivityId([])).toBe(lessons[0]!.id);
    let progress = applyLearningResult([], {
      activityId: lessons[0]!.id,
      activityType: 'lesson',
      completed: true,
    });
    progress = applyLearningResult(progress, {
      activityId: lessons[1]!.id,
      activityType: 'lesson',
      completed: true,
    });

    expect(recommendedLearningActivityId(progress, 'pot-odds')).toBe('lesson-outs-equity-odds');
  });

  it('merges offline and remote records without losing completion or best score', () => {
    const merged = mergeLearningProgress(
      [{ activityId: 'trainer-percentages', activityType: 'percentage_drill', status: 'completed', bestScore: 60, attempts: 1, completedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
      [{ activityId: 'trainer-percentages', activityType: 'percentage_drill', status: 'started', bestScore: 80, attempts: 2, completedAt: null, updatedAt: '2026-08-01T00:01:00.000Z' }],
    );

    expect(merged[0]).toMatchObject({ status: 'completed', bestScore: 80, attempts: 2 });
    expect(merged[0]!.completedAt).toBe('2026-08-01T00:00:00.000Z');
  });
});
