import { describe, expect, it } from 'vitest';

import { handQuiz, lessons, percentageTrainer, scenarioTrainer } from '../content';
import {
  applyLearningResult,
  completedLessonCount,
  learningActivityIdForFocus,
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

  it('recommends the path without a review and the mapped practice after one exists', () => {
    expect(recommendedLearningActivityId([])).toBe(lessons[0]!.id);
    expect(recommendedLearningActivityId([], 'pot-odds')).toBe(percentageTrainer.id);
  });

  it('routes every coach focus to the matching repeatable practice activity', () => {
    expect(learningActivityIdForFocus('preflop')).toBe(scenarioTrainer.id);
    expect(learningActivityIdForFocus('bet-sizing')).toBe(scenarioTrainer.id);
    expect(learningActivityIdForFocus('value-betting')).toBe(handQuiz.id);
    expect(learningActivityIdForFocus('bluffing')).toBe(handQuiz.id);
    expect(learningActivityIdForFocus('calling')).toBe(handQuiz.id);
    expect(learningActivityIdForFocus('pot-odds')).toBe(percentageTrainer.id);
    expect(learningActivityIdForFocus('draws')).toBe(percentageTrainer.id);
  });

  it('falls back to the learning path without a reviewed or recognized focus', () => {
    expect(learningActivityIdForFocus(null)).toBeNull();
    expect(learningActivityIdForFocus('none')).toBeNull();
    expect(learningActivityIdForFocus('future-focus')).toBeNull();
    expect(recommendedLearningActivityId([], 'future-focus')).toBe(lessons[0]!.id);
  });

  it('keeps recommending a recurring focus after the lesson path is complete', () => {
    const completedLessons = lessons.reduce((current, lesson) => applyLearningResult(current, {
      activityId: lesson.id,
      activityType: lesson.type,
      completed: true,
    }), [] as ReturnType<typeof applyLearningResult>);

    expect(recommendedLearningActivityId(completedLessons, 'bluffing')).toBe(handQuiz.id);
  });

  it('recommends the lowest-scoring practice activity after the lesson path', () => {
    let progress = lessons.reduce((current, lesson) => applyLearningResult(current, {
      activityId: lesson.id,
      activityType: 'lesson',
      completed: true,
    }), [] as ReturnType<typeof applyLearningResult>);
    expect(recommendedLearningActivityId(progress)).toBe(percentageTrainer.id);

    progress = applyLearningResult(progress, {
      activityId: percentageTrainer.id,
      activityType: percentageTrainer.type,
      completed: true,
      score: 80,
      countAttempt: true,
    });
    expect(recommendedLearningActivityId(progress)).toBe(handQuiz.id);

    progress = applyLearningResult(progress, {
      activityId: handQuiz.id,
      activityType: handQuiz.type,
      completed: true,
      score: 70,
      countAttempt: true,
    });
    expect(recommendedLearningActivityId(progress)).toBe(scenarioTrainer.id);
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
