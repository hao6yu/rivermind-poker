import type { Card, Street } from '../poker/types';

export type LearningActivityType = 'lesson' | 'percentage_drill' | 'hand_quiz' | 'scenario_drill';
export type LearningStatus = 'started' | 'completed';
export type PracticePackId = 'preflop' | 'preflop-enter' | 'preflop-pressure' | 'betting' | 'odds';

export interface LessonSection {
  heading: string;
  body: string;
  bullets?: string[];
  takeaway?: string;
  example?: {
    title: string;
    detail: string;
    heroCards: Card[];
    board?: Card[];
  };
}

export interface LessonDefinition {
  id: string;
  type: 'lesson';
  title: string;
  description: string;
  estimatedMinutes: number;
  sections: LessonSection[];
}

export interface TrainerChoice {
  feedback: string;
  id: string;
  label: string;
}

export interface TrainerQuestion {
  id: string;
  prompt: string;
  context: string;
  heroCards?: Card[];
  board?: Card[];
  choices: TrainerChoice[];
  correctChoiceId: string;
  explanation: string;
}

export interface TrainerDefinition {
  id: string;
  type: 'percentage_drill' | 'hand_quiz';
  title: string;
  description: string;
  estimatedMinutes: number;
  masteryThreshold?: number;
  questions: TrainerQuestion[];
}

export interface TrainerAttemptReview {
  correctQuestionIds: string[];
  missedQuestionIds: string[];
}

export type ScenarioChoiceGrade = 'best' | 'reasonable' | 'mistake';

export interface ScenarioChoice {
  id: string;
  label: string;
  grade: ScenarioChoiceGrade;
  feedback: string;
}

export interface ScenarioSpot {
  id: string;
  focus: string;
  street: Exclude<Street, 'complete'>;
  position: string;
  opponentPosition: string;
  effectiveStackBb: number;
  potBb: number;
  heroCards: Card[];
  board: Card[];
  opponentAction: string;
  practicePacks: PracticePackId[];
  prompt: string;
  choices: ScenarioChoice[];
  bestChoiceId: string;
  reasoning: string;
  takeaway: string;
  calculation?: {
    callAmountBb: number;
    estimatedEquityPercent?: number;
    finalPotBb: number;
    requiredEquityPercent: number;
  };
}

export interface ScenarioTrainerDefinition {
  id: string;
  type: 'scenario_drill';
  title: string;
  description: string;
  estimatedMinutes: number;
  scenarios: ScenarioSpot[];
}

export interface ScenarioAttemptReview {
  correctScenarioIds: string[];
  missedScenarios: ScenarioSpot[];
}

export interface CheatSheetGroup {
  title: string;
  rows: Array<{
    label: string;
    detail: string;
    example?: string;
    probability?: string;
  }>;
}

export interface CheatSheetDefinition {
  id: string;
  title: string;
  description: string;
  groups: CheatSheetGroup[];
  note?: string;
}

export interface LearningProgressEntry {
  activityId: string;
  activityType: LearningActivityType;
  status: LearningStatus;
  bestScore: number | null;
  attempts: number;
  completedAt: string | null;
  updatedAt: string;
}

export interface LearningResultInput {
  activityId: string;
  activityType: LearningActivityType;
  completed?: boolean;
  score?: number;
  countAttempt?: boolean;
}

export type LearningActivityDefinition = LessonDefinition | TrainerDefinition | ScenarioTrainerDefinition;
