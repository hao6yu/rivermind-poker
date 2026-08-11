import { describe, expect, it } from 'vitest';

import { applyLearningResult } from '../progress';
import { curriculumSteps } from '../curriculum';
import {
  CALIBRATION_SKILL_IDS,
  calibrationQuestions,
  createDefaultLearningProfile,
  goalAwareCurriculumStep,
  guidedProgressContract,
  learningCheckpointStatus,
  learningProgressComparison,
  recordLearningSnapshot,
  scoreSkillCalibration,
  selectLearningGoal,
} from '../guidedProgress';

describe('guided learning progress', () => {
  it('keeps the quick calibration balanced and gives every question one answer', () => {
    expect(calibrationQuestions).toHaveLength(10);
    for (const skill of CALIBRATION_SKILL_IDS) {
      expect(calibrationQuestions.filter((question) => question.skill === skill)).toHaveLength(2);
    }
    for (const question of calibrationQuestions) {
      expect(new Set(question.choiceIds).size).toBe(question.choiceIds.length);
      expect(question.choiceIds).toContain(question.correctChoiceId);
    }
  });

  it('scores a snapshot by skill without changing curriculum progress', () => {
    const answers = calibrationQuestions.map((question, index) => ({
      choiceId: index === 0 ? question.choiceIds.find((choice) => choice !== question.correctChoiceId)! : question.correctChoiceId,
      questionId: question.id,
    }));
    const snapshot = scoreSkillCalibration(answers, 'baseline', 4, '2026-08-12T12:00:00.000Z');
    expect(snapshot).toMatchObject({ kind: 'baseline', overallScore: 90, sessionCount: 4 });
    expect(snapshot.scores.fundamentals).toBe(50);
    expect(snapshot.scores.math).toBe(100);
  });

  it('protects essential fundamentals before following a specialist goal', () => {
    const context = {
      goal: 'tournament' as const,
      snapshot: scoreSkillCalibration([], 'baseline', 0, '2026-08-12T12:00:00.000Z'),
    };
    expect(goalAwareCurriculumStep([], context)?.chapter).toBe('fundamentals');

    const firstThree = curriculumSteps.filter((step) => step.chapter === 'fundamentals').slice(0, 3);
    const progress = firstThree.reduce((current, step) => applyLearningResult(current, {
      activityId: step.id,
      activityType: step.kind === 'lesson' ? 'lesson' : 'hand_quiz',
      completed: true,
    }), [] as ReturnType<typeof applyLearningResult>);
    expect(goalAwareCurriculumStep(progress, context)?.chapter).toBe('tournament');
  });

  it('uses a balanced calibration to route toward the weakest measured area', () => {
    const answers = calibrationQuestions
      .filter((question) => question.skill !== 'opponents')
      .map((question) => ({ choiceId: question.correctChoiceId, questionId: question.id }));
    const context = {
      goal: 'balanced' as const,
      snapshot: scoreSkillCalibration(answers, 'baseline', 0, '2026-08-12T12:00:00.000Z'),
    };

    expect(goalAwareCurriculumStep([], context)).toMatchObject({ chapter: 'opponents' });
  });

  it('makes a checkpoint due after seven later learning activities', () => {
    const snapshot = scoreSkillCalibration([], 'baseline', 5, '2026-08-12T12:00:00.000Z');
    const profile = recordLearningSnapshot(createDefaultLearningProfile(), snapshot);
    expect(learningCheckpointStatus(profile, 11)).toEqual({
      due: false,
      sessionsCompleted: 6,
      sessionsRemaining: 1,
    });
    expect(learningCheckpointStatus(profile, 12)).toEqual({
      due: true,
      sessionsCompleted: guidedProgressContract.checkpointInterval,
      sessionsRemaining: 0,
    });
  });

  it('counts checkpoint activity from timestamps even when stored history is bounded', () => {
    const snapshot = scoreSkillCalibration([], 'baseline', 499, '2026-08-12T12:00:00.000Z');
    const profile = recordLearningSnapshot(createDefaultLearningProfile(), snapshot);
    const sessions = Array.from({ length: 7 }, (_, index) => ({
      occurredAt: `2026-08-13T12:00:0${index}.000Z`,
    }));

    expect(learningCheckpointStatus(profile, sessions)).toMatchObject({ due: true, sessionsCompleted: 7 });
  });

  it('compares a learner only with the preceding local snapshot', () => {
    let profile = selectLearningGoal(createDefaultLearningProfile(), 'math');
    const baseline = scoreSkillCalibration([], 'baseline', 0, '2026-08-10T12:00:00.000Z');
    const improvedAnswers = calibrationQuestions
      .filter((question) => question.skill === 'math')
      .map((question) => ({ choiceId: question.correctChoiceId, questionId: question.id }));
    const checkpoint = scoreSkillCalibration(improvedAnswers, 'checkpoint', 7, '2026-08-12T12:00:00.000Z');
    profile = recordLearningSnapshot(recordLearningSnapshot(profile, baseline), checkpoint);
    expect(learningProgressComparison(profile)).toEqual({ goalChange: 100, overallChange: 20 });
  });

  it('bounds locally retained calibration history', () => {
    let profile = createDefaultLearningProfile();
    for (let index = 0; index < 12; index += 1) {
      profile = recordLearningSnapshot(profile, scoreSkillCalibration(
        [],
        index === 0 ? 'baseline' : 'checkpoint',
        index,
        `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      ));
    }
    expect(profile.snapshots).toHaveLength(guidedProgressContract.maximumSnapshots);
    expect(profile.snapshots[0]?.sessionCount).toBe(11);
  });
});
