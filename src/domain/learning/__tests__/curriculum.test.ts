import { describe, expect, it } from 'vitest';

import { applyLearningResult } from '../progress';
import {
  completedCurriculumStepCount,
  curriculumSteps,
  curriculumStepsForChapter,
  nextCurriculumStep,
} from '../curriculum';

describe('learning curriculum', () => {
  it('orders each chapter from teaching into application and mastery', () => {
    const preflop = curriculumStepsForChapter('preflop');
    const postflop = curriculumStepsForChapter('postflop');

    expect(preflop.map((step) => step.kind)).toEqual([
      'lesson', 'lesson', 'lesson', 'lesson',
      'practice', 'practice',
      'mission', 'mission',
      'mastery',
    ]);
    expect(postflop.map((step) => step.kind)).toEqual([
      'lesson', 'lesson', 'lesson', 'lesson', 'lesson',
      'practice', 'practice',
      'mission', 'mission',
      'mastery',
    ]);
  });

  it('moves the continue step through the full curriculum instead of skipping application', () => {
    let progress: ReturnType<typeof applyLearningResult> = [];
    expect(nextCurriculumStep(progress)?.id).toBe(curriculumSteps[0]!.id);

    for (const step of curriculumStepsForChapter('fundamentals')) {
      progress = applyLearningResult(progress, {
        activityId: step.id,
        activityType: 'lesson',
        completed: true,
      });
    }
    expect(nextCurriculumStep(progress)?.chapter).toBe('preflop');
    expect(completedCurriculumStepCount(progress, 'fundamentals')).toBe(6);

    for (const step of curriculumSteps.filter((item) => item.chapter !== 'postflop')) {
      progress = applyLearningResult(progress, {
        activityId: step.id,
        activityType: step.kind === 'lesson' ? 'lesson' : step.kind === 'mastery' ? step.trainer.type : 'scenario_drill',
        completed: true,
      });
    }
    expect(nextCurriculumStep(progress)?.chapter).toBe('postflop');
  });
});
