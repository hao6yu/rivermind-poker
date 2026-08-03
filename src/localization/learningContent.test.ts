import { describe, expect, it } from 'vitest';

import { cheatSheets, lessons, trainers } from '../domain/learning/content';
import { generateScenarioSession, scenarioTemplateCount } from '../domain/learning/scenarios';
import {
  localizeCheatSheetContent,
  localizeLessonContent,
  localizeTrainerContent,
} from './learningContent';
import { localizeScenarioContent } from './scenarioContent';

describe('localized learning content', () => {
  it.each(['zh-Hans', 'zh-Hant'] as const)('covers every lesson in %s without changing examples', (language) => {
    for (const lesson of lessons) {
      const localized = localizeLessonContent(lesson, language, '本地化标题', '本地化说明');
      expect(localized.title).toBe('本地化标题');
      expect(localized.sections).toHaveLength(lesson.sections.length);
      expect(localized.sections[0]?.heading).not.toBe(lesson.sections[0]?.heading);
      expect(localized.sections.map((section) => section.example?.heroCards)).toEqual(
        lesson.sections.map((section) => section.example?.heroCards),
      );
      expect(localized.sections.map((section) => section.example?.board)).toEqual(
        lesson.sections.map((section) => section.example?.board),
      );
    }
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)('covers every quiz in %s while preserving scoring ids', (language) => {
    for (const trainer of trainers) {
      const localized = localizeTrainerContent(trainer, language, '本地化标题', '本地化说明');
      expect(localized.questions).toHaveLength(trainer.questions.length);
      for (const [index, question] of trainer.questions.entries()) {
        const translated = localized.questions[index]!;
        expect(translated.prompt).not.toBe(question.prompt);
        expect(translated.correctChoiceId).toBe(question.correctChoiceId);
        expect(translated.choices.map((choice) => choice.id)).toEqual(question.choices.map((choice) => choice.id));
        expect(translated.heroCards).toEqual(question.heroCards);
        expect(translated.board).toEqual(question.board);
      }
    }
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)('covers every reference sheet in %s without changing examples or odds', (language) => {
    for (const sheet of cheatSheets) {
      const localized = localizeCheatSheetContent(sheet, language, '本地化标题', '本地化说明');
      expect(localized.groups).toHaveLength(sheet.groups.length);
      expect(localized.groups[0]?.title).not.toBe(sheet.groups[0]?.title);
      expect(localized.groups.map((group) => group.rows.map((row) => row.example))).toEqual(
        sheet.groups.map((group) => group.rows.map((row) => row.example)),
      );
      expect(localized.groups.map((group) => group.rows.map((row) => row.probability))).toEqual(
        sheet.groups.map((group) => group.rows.map((row) => row.probability)),
      );
    }
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)('localizes all randomized scenario templates in %s without changing poker facts', (language) => {
    const scenarios = generateScenarioSession(45_045, scenarioTemplateCount);
    expect(scenarios).toHaveLength(scenarioTemplateCount);
    for (const scenario of scenarios) {
      const localized = localizeScenarioContent(scenario, language);
      expect(localized.focus).not.toBe(scenario.focus);
      expect(localized.prompt).not.toBe(scenario.prompt);
      expect(localized.id).toBe(scenario.id);
      expect(localized.heroCards).toEqual(scenario.heroCards);
      expect(localized.board).toEqual(scenario.board);
      expect(localized.calculation).toEqual(scenario.calculation);
      expect(localized.bestChoiceId).toBe(scenario.bestChoiceId);
      expect(localized.choices.map(({ grade, id }) => ({ grade, id }))).toEqual(
        scenario.choices.map(({ grade, id }) => ({ grade, id })),
      );
    }
  });

  it('uses Traditional Chinese characters in the Traditional catalog', () => {
    const lesson = localizeLessonContent(lessons[0]!, 'zh-Hant', '繁體標題', '繁體說明');
    expect(lesson.sections[0]?.heading).toContain('張');
    expect(lesson.sections[0]?.body).toContain('撲克');
    expect(lesson.sections[0]?.body).not.toContain('扑克');
  });
});
