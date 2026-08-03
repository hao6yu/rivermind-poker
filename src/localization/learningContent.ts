import type {
  CheatSheetDefinition,
  LessonDefinition,
  TrainerDefinition,
} from '../domain/learning/types';
import type { AppLanguage } from './core';
import {
  simplifiedLearningContent,
  traditionalLearningContent,
  type LearningContentCatalog,
} from './learningContentChinese';

const catalogs: Partial<Record<AppLanguage, LearningContentCatalog>> = {
  'zh-Hans': simplifiedLearningContent,
  'zh-Hant': traditionalLearningContent,
};

export function localizeLessonContent(
  lesson: LessonDefinition,
  language: AppLanguage,
  title: string,
  description: string,
): LessonDefinition {
  const copy = catalogs[language]?.lessons[lesson.id];
  if (!copy) return { ...lesson, description, title };
  return {
    ...lesson,
    description,
    title,
    sections: lesson.sections.map((section, index) => {
      const translated = copy.sections[index];
      if (!translated) return section;
      return {
        ...section,
        ...translated,
        bullets: translated.bullets ?? section.bullets,
        example: section.example && translated.example
          ? { ...section.example, ...translated.example }
          : section.example,
      };
    }),
  };
}

export function localizeTrainerContent(
  trainer: TrainerDefinition,
  language: AppLanguage,
  title: string,
  description: string,
): TrainerDefinition {
  const copy = catalogs[language]?.trainers[trainer.id];
  if (!copy) return { ...trainer, description, title };
  return {
    ...trainer,
    description,
    title,
    questions: trainer.questions.map((question) => {
      const translated = copy.questions[question.id];
      if (!translated) return question;
      return {
        ...question,
        context: translated.context,
        explanation: translated.explanation,
        prompt: translated.prompt,
        choices: question.choices.map((choice) => ({
          ...choice,
          ...(translated.choices[choice.id] ?? {}),
        })),
      };
    }),
  };
}

export function localizeCheatSheetContent(
  sheet: CheatSheetDefinition,
  language: AppLanguage,
  title: string,
  description: string,
): CheatSheetDefinition {
  const copy = catalogs[language]?.cheatSheets[sheet.id];
  if (!copy) return { ...sheet, description, title };
  return {
    ...sheet,
    description,
    title,
    note: copy.note ?? sheet.note,
    groups: sheet.groups.map((group, groupIndex) => {
      const translated = copy.groups[groupIndex];
      if (!translated) return group;
      return {
        ...group,
        title: translated.title,
        rows: group.rows.map((row, rowIndex) => ({
          ...row,
          ...(translated.rows[rowIndex] ?? {}),
        })),
      };
    }),
  };
}
