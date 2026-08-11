import { describe, expect, it } from 'vitest';

import { applyLearningResult } from '../progress';
import { buildPersonalPracticePlan } from '../personalPracticePlan';
import { applyLearningReviewUpdate } from '../reviewQueue';
import { calibrationQuestions, scoreSkillCalibration } from '../guidedProgress';

describe('personal practice plan', () => {
  it('combines a resume, due review, and table focus in priority order', () => {
    const progress = applyLearningResult([], {
      activityId: 'lesson-position-blinds',
      activityType: 'lesson',
    }, '2026-08-10T12:00:00.000Z');
    const queue = applyLearningReviewUpdate([], [{
      activityId: 'scenario-pack-odds',
      focusArea: 'draws',
      source: 'table',
    }], [], '2026-08-11T12:00:00.000Z');

    const plan = buildPersonalPracticePlan(
      progress,
      queue,
      'bet-sizing',
      true,
      '2026-08-11T13:00:00.000Z',
    );

    expect(plan.map((item) => item.reason)).toEqual(['resume', 'review', 'table-focus']);
    expect(plan[0]?.target).toMatchObject({ kind: 'curriculum', step: { id: 'lesson-position-blinds' } });
    expect(plan[1]?.target).toEqual({ dueCount: 1, kind: 'review' });
    expect(plan[2]?.target).toMatchObject({ kind: 'practice', pack: { id: 'betting' } });
  });

  it('does not duplicate a table-focus drill when reinforcement points to the same pack', () => {
    const progress = applyLearningResult([], {
      activityId: 'scenario-pack-betting',
      activityType: 'scenario_drill',
      completed: true,
      score: 45,
    }, '2026-08-10T12:00:00.000Z');

    const plan = buildPersonalPracticePlan(progress, [], 'bluffing');

    expect(plan.filter((item) => item.target.kind === 'practice' && item.target.pack.id === 'betting')).toHaveLength(1);
    expect(plan[0]?.reason).toBe('table-focus');
    expect(plan.some((item) => item.reason === 'continue-path')).toBe(true);
  });

  it('starts a new learner on the first incomplete curriculum step', () => {
    const plan = buildPersonalPracticePlan([], []);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      reason: 'continue-path',
      target: { kind: 'curriculum', step: { id: 'lesson-hand-rankings' } },
    });
  });

  it('omits due review when no usable review session can be built', () => {
    const queue = applyLearningReviewUpdate([], [{
      activityId: 'missing-trainer',
      questionId: 'missing-question',
      source: 'trainer',
    }], [], '2026-08-11T12:00:00.000Z');

    expect(buildPersonalPracticePlan([], queue, null, false, '2026-08-11T13:00:00.000Z'))
      .toEqual(expect.not.arrayContaining([expect.objectContaining({ reason: 'review' })]));
  });

  it('uses a calibrated specialist goal without duplicating the curriculum fallback', () => {
    const snapshot = scoreSkillCalibration(calibrationQuestions.map((question) => ({
      choiceId: question.correctChoiceId,
      questionId: question.id,
    })), 'baseline', 0, '2026-08-12T12:00:00.000Z');
    const plan = buildPersonalPracticePlan([], [], null, true, undefined, {
      goal: 'tournament',
      snapshot,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      reason: 'goal-focus',
      target: { kind: 'curriculum', step: { chapter: 'tournament', id: 'lesson-tournament-stack-zones' } },
    });
  });
});
