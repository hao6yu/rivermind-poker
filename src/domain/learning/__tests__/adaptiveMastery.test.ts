import { describe, expect, it } from 'vitest';

import { buildAdaptiveMasterySnapshot, learningReviewChapter } from '../adaptiveMastery';
import { curriculumStepsForChapter } from '../curriculum';
import { applyLearningResult } from '../progress';
import { applyLearningReviewUpdate } from '../reviewQueue';

describe('adaptive learning mastery', () => {
  it('turns completed lessons and scored practice into chapter mastery', () => {
    const firstFundamental = curriculumStepsForChapter('fundamentals')[0]!;
    const firstPreflop = curriculumStepsForChapter('preflop')[0]!;
    let progress = applyLearningResult([], {
      activityId: firstFundamental.id,
      activityType: 'lesson',
      completed: true,
    }, '2026-08-10T10:00:00.000Z');
    progress = applyLearningResult(progress, {
      activityId: firstPreflop.id,
      activityType: 'lesson',
      completed: true,
    }, '2026-08-11T10:00:00.000Z');

    const snapshot = buildAdaptiveMasterySnapshot(progress, [], '2026-08-11T12:00:00.000Z');
    expect(snapshot.chapters.fundamentals.masteryPercent).toBe(17);
    expect(snapshot.chapters.preflop.masteryPercent).toBe(11);
    expect(snapshot.chapters.postflop.masteryPercent).toBe(0);
    expect(snapshot.week).toEqual({ activeDays: 2, completedSteps: 2, recentActivities: 2 });
  });

  it('prioritizes the chapter with due review decisions', () => {
    const queue = applyLearningReviewUpdate([], [{
      activityId: 'table-session',
      focusArea: 'draws',
      source: 'table',
    }], [], '2026-08-10T10:00:00.000Z');
    const snapshot = buildAdaptiveMasterySnapshot([], queue, '2026-08-11T12:00:00.000Z');

    expect(learningReviewChapter(queue[0]!)).toBe('postflop');
    expect(snapshot.recommendedChapter).toBe('postflop');
    expect(snapshot.dueReviews).toBe(1);
    expect(snapshot.chapters.postflop.dueReviews).toBe(1);
  });

  it('keeps future spaced reviews out of the due count', () => {
    const captured = applyLearningReviewUpdate([], [{
      activityId: 'table-session',
      focusArea: 'preflop',
      source: 'table',
    }], [], '2026-08-10T10:00:00.000Z');
    const scheduled = applyLearningReviewUpdate(captured, [], [{
      correct: true,
      itemId: captured[0]!.id,
    }], '2026-08-10T11:00:00.000Z');

    expect(buildAdaptiveMasterySnapshot([], scheduled, '2026-08-10T12:00:00.000Z').dueReviews).toBe(0);
    expect(buildAdaptiveMasterySnapshot([], scheduled, '2026-08-12T12:00:00.000Z').dueReviews).toBe(1);
  });
});
