import { describe, expect, it } from 'vitest';

import {
  CALIBRATION_SKILL_IDS,
  LEARNING_GOAL_IDS,
  calibrationQuestions,
  createDefaultLearningProfile,
  learningCheckpointStatus,
  scoreSkillCalibration,
} from '../guidedProgress';
import { translate } from '../../../localization/core';
import type { MessageKey } from '../../../localization/messages';
import {
  phase8EnglishMessages,
  phase8SimplifiedMessages,
  phase8TraditionalMessages,
} from '../../../localization/phase8Messages';

describe('Phase 8 guided-progress quality', () => {
  it('ships every Phase 8 message in all supported languages', () => {
    for (const key of Object.keys(phase8EnglishMessages) as Array<keyof typeof phase8EnglishMessages>) {
      expect(phase8EnglishMessages[key].trim()).not.toBe('');
      expect(phase8SimplifiedMessages[key].trim()).not.toBe('');
      expect(phase8TraditionalMessages[key].trim()).not.toBe('');
    }
  });

  it('localizes every calibration prompt and choice in both Chinese scripts', () => {
    for (const question of calibrationQuestions) {
      const keys = [
        `guided.calibration.${question.id}.context`,
        `guided.calibration.${question.id}.prompt`,
        ...question.choiceIds.map((choice) => `guided.calibration.${question.id}.choice.${choice}`),
      ] as MessageKey[];
      for (const key of keys) {
        const english = translate('en', key);
        const simplified = translate('zh-Hans', key);
        const traditional = translate('zh-Hant', key);
        expect(simplified.trim()).not.toBe('');
        expect(traditional.trim()).not.toBe('');
        if (!/^\d+%$/.test(english)) {
          expect(simplified).not.toBe(english);
          expect(traditional).not.toBe(english);
        }
      }
    }
  });

  it('keeps every goal and skill label complete in all supported languages', () => {
    const keys = [
      ...LEARNING_GOAL_IDS.flatMap((goal) => [
        `guided.goal.${goal}.title`,
        `guided.goal.${goal}.description`,
      ]),
      ...CALIBRATION_SKILL_IDS.map((skill) => `guided.skill.${skill}`),
    ] as MessageKey[];
    for (const key of keys) {
      expect(translate('en', key).trim().length).toBeGreaterThan(3);
      expect(translate('zh-Hans', key).trim().length).toBeGreaterThan(1);
      expect(translate('zh-Hant', key).trim().length).toBeGreaterThan(1);
    }
  });

  it('does not convert calibration into artificial completion evidence', () => {
    const snapshot = scoreSkillCalibration(calibrationQuestions.map((question) => ({
      choiceId: question.correctChoiceId,
      questionId: question.id,
    })), 'baseline', 0, '2026-08-12T12:00:00.000Z');
    expect(snapshot.overallScore).toBe(100);
    expect(snapshot).not.toHaveProperty('activityId');
    expect(snapshot).not.toHaveProperty('completed');
  });

  it('makes an uncalibrated baseline available without pretending it is overdue', () => {
    expect(learningCheckpointStatus(createDefaultLearningProfile(), 40)).toEqual({
      due: true,
      sessionsCompleted: 0,
      sessionsRemaining: 0,
    });
  });
});
