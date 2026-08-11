import { describe, expect, it } from 'vitest';

import type { LearningSessionRecord } from '../history';
import { buildLearningProgressInsights } from '../progressInsights';
import { applyLearningReviewUpdate } from '../reviewQueue';

function session(activityId: string, score: number, occurredAt: string): LearningSessionRecord {
  return {
    activityId,
    correctCount: null,
    id: `${activityId}:${occurredAt}`,
    kind: 'practice',
    localDate: occurredAt.slice(0, 10),
    occurredAt,
    score,
    totalCount: null,
  };
}

describe('learning progress insights', () => {
  it('shows a concept as improving only after comparable scored attempts', () => {
    const insight = buildLearningProgressInsights([
      session('scenario-pack-postflop-range', 50, '2026-08-01T12:00:00.000Z'),
      session('scenario-pack-postflop-range', 72, '2026-08-08T12:00:00.000Z'),
    ], []);

    expect(insight.improving).toEqual({
      attempts: 2,
      change: 22,
      concept: 'postflop-range',
    });
  });

  it('does not claim improvement from one score or a flat result', () => {
    expect(buildLearningProgressInsights([
      session('scenario-pack-betting', 70, '2026-08-01T12:00:00.000Z'),
    ], []).improving).toBeNull();
    expect(buildLearningProgressInsights([
      session('scenario-pack-betting', 70, '2026-08-01T12:00:00.000Z'),
      session('scenario-pack-betting', 72, '2026-08-08T12:00:00.000Z'),
    ], []).improving).toBeNull();
  });

  it('requires multiple active items before naming a recurring review area', () => {
    const queue = applyLearningReviewUpdate([], [
      { activityId: 'scenario-pack-odds', focusArea: 'draws', source: 'table' },
      { activityId: 'scenario-pack-odds', focusArea: 'pot-odds', source: 'table' },
    ], [], '2026-08-10T12:00:00.000Z');

    expect(buildLearningProgressInsights([], queue, '2026-08-10T13:00:00.000Z').recurringReview).toEqual({
      concept: 'postflop-odds',
      dueCount: 2,
      spots: 2,
    });
    expect(buildLearningProgressInsights([], queue.slice(0, 1)).recurringReview).toBeNull();
  });
});
