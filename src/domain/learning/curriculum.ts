import {
  advancedMathLessons,
  fundamentalsLessons,
  intermediatePostflopLessons,
  intermediateRiverLessons,
  intermediatePreflopLessons,
  opponentReadLessons,
  postflopFoundationsLessons,
  postflopMasteryCheck,
  preflopMasteryCheck,
  preflopStrategyLessons,
  tournamentFoundationsLessons,
  tournamentBubbleLessons,
} from './content';
import {
  advancedMathPracticePacks,
  intermediatePostflopPracticePacks,
  intermediatePreflopPracticePacks,
  intermediateRiverPracticePacks,
  opponentPracticePacks,
  postflopPracticePacks,
  preflopPracticePacks,
  tournamentPracticePacks,
  type PracticePackDefinition,
} from './practicePacks';
import {
  opponentTableMissions,
  postflopTableMissions,
  preflopTableMissions,
  tournamentTableMissions,
  type TableMissionDefinition,
} from './tableMissions';
import type { LearningProgressEntry, LessonDefinition, TrainerDefinition } from './types';

export type CurriculumChapterId =
  | 'fundamentals'
  | 'preflop'
  | 'postflop'
  | 'tournament'
  | 'opponents'
  | 'advanced-math';

export type CurriculumStep =
  | { chapter: CurriculumChapterId; id: string; kind: 'lesson'; lesson: LessonDefinition }
  | { chapter: CurriculumChapterId; id: string; kind: 'practice'; pack: PracticePackDefinition }
  | { chapter: CurriculumChapterId; id: string; kind: 'mission'; mission: TableMissionDefinition }
  | { chapter: CurriculumChapterId; id: string; kind: 'mastery'; trainer: TrainerDefinition };

function lessonStep(chapter: CurriculumChapterId, lesson: LessonDefinition): CurriculumStep {
  return { chapter, id: lesson.id, kind: 'lesson', lesson };
}

function practiceStep(chapter: CurriculumChapterId, pack: PracticePackDefinition): CurriculumStep {
  return { chapter, id: pack.progressActivityId, kind: 'practice', pack };
}

function missionStep(chapter: CurriculumChapterId, mission: TableMissionDefinition): CurriculumStep {
  return { chapter, id: mission.id, kind: 'mission', mission };
}

export const curriculumSteps: CurriculumStep[] = [
  ...fundamentalsLessons.map((lesson) => lessonStep('fundamentals', lesson)),
  ...preflopStrategyLessons.map((lesson) => lessonStep('preflop', lesson)),
  ...preflopPracticePacks.map((pack) => practiceStep('preflop', pack)),
  ...preflopTableMissions.map((mission) => missionStep('preflop', mission)),
  { chapter: 'preflop', id: preflopMasteryCheck.id, kind: 'mastery', trainer: preflopMasteryCheck },
  ...intermediatePreflopLessons.map((lesson) => lessonStep('preflop', lesson)),
  ...intermediatePreflopPracticePacks.map((pack) => practiceStep('preflop', pack)),
  ...postflopFoundationsLessons.map((lesson) => lessonStep('postflop', lesson)),
  ...postflopPracticePacks.map((pack) => practiceStep('postflop', pack)),
  ...postflopTableMissions.map((mission) => missionStep('postflop', mission)),
  { chapter: 'postflop', id: postflopMasteryCheck.id, kind: 'mastery', trainer: postflopMasteryCheck },
  ...intermediatePostflopLessons.map((lesson) => lessonStep('postflop', lesson)),
  ...intermediatePostflopPracticePacks.map((pack) => practiceStep('postflop', pack)),
  ...intermediateRiverLessons.map((lesson) => lessonStep('postflop', lesson)),
  ...intermediateRiverPracticePacks.map((pack) => practiceStep('postflop', pack)),
  ...tournamentFoundationsLessons.map((lesson) => lessonStep('tournament', lesson)),
  ...tournamentPracticePacks.filter((pack) => pack.id === 'tournament-short-stack').map((pack) => practiceStep('tournament', pack)),
  ...tournamentBubbleLessons.map((lesson) => lessonStep('tournament', lesson)),
  ...tournamentPracticePacks.filter((pack) => pack.id === 'tournament-bubble').map((pack) => practiceStep('tournament', pack)),
  ...tournamentTableMissions.map((mission) => missionStep('tournament', mission)),
  ...opponentReadLessons.map((lesson) => lessonStep('opponents', lesson)),
  ...opponentPracticePacks.map((pack) => practiceStep('opponents', pack)),
  ...opponentTableMissions.map((mission) => missionStep('opponents', mission)),
  ...advancedMathLessons.map((lesson) => lessonStep('advanced-math', lesson)),
  ...advancedMathPracticePacks.map((pack) => practiceStep('advanced-math', pack)),
];

export function curriculumStepsForChapter(chapter: CurriculumChapterId): CurriculumStep[] {
  return curriculumSteps.filter((step) => step.chapter === chapter);
}

export function completedCurriculumStepCount(
  progress: readonly LearningProgressEntry[],
  chapter?: CurriculumChapterId,
): number {
  const completedIds = new Set(progress.filter((entry) => entry.status === 'completed').map((entry) => entry.activityId));
  const steps = chapter ? curriculumStepsForChapter(chapter) : curriculumSteps;
  return steps.filter((step) => completedIds.has(step.id)).length;
}

export function nextCurriculumStep(progress: readonly LearningProgressEntry[]): CurriculumStep | null {
  const completedIds = new Set(progress.filter((entry) => entry.status === 'completed').map((entry) => entry.activityId));
  return curriculumSteps.find((step) => !completedIds.has(step.id)) ?? null;
}
