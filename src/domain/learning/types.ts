import type { Card, Street } from '../poker/types';

export type LearningActivityType = 'lesson' | 'percentage_drill' | 'hand_quiz' | 'scenario_drill';
export type LearningStatus = 'started' | 'completed';
export type LearningDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type PracticePackId =
  | 'preflop'
  | 'preflop-enter'
  | 'preflop-pressure'
  | 'preflop-three-bet'
  | 'betting'
  | 'odds'
  | 'postflop-range'
  | 'postflop-river'
  | 'tournament-short-stack'
  | 'tournament-bubble'
  | 'opponent-adjustments'
  | 'advanced-math';

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
  difficulty?: LearningDifficulty;
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
  /**
   * The chosen-choice grade, set only for scenario-derived quiz questions.
   * (Binary, authored trainer questions omit it.) The closing outcome reads it to
   * count a costly mistake only for a `mistake` grade, not a `reasonable` one.
   */
  grade?: ScenarioChoiceGrade;
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
  /**
   * The chosen grade for each answered scenario-derived question, keyed by
   * question id. Binary (authored) trainer questions are omitted, so a miss is a
   * costly mistake unless its chosen grade was a `reasonable` alternative.
   */
  gradedQuestionIds: Record<string, ScenarioChoiceGrade>;
}

export type ScenarioChoiceGrade = 'best' | 'reasonable' | 'mistake';
export type ScenarioMistakeCategory = 'range' | 'position' | 'sizing' | 'stack-depth' | 'commitment';

export interface ScenarioChoice {
  id: string;
  label: string;
  grade: ScenarioChoiceGrade;
  feedback: string;
  mistakeCategory?: ScenarioMistakeCategory;
}

export interface ScenarioSpot {
  difficulty?: LearningDifficulty;
  id: string;
  lessonId?: string;
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
    kind?: 'call';
    callAmountBb: number;
    estimatedEquityPercent?: number;
    finalPotBb: number;
    requiredEquityPercent: number;
  } | {
    kind: 'bluff';
    requiredFoldPercent: number;
    rewardBb: number;
    riskBb: number;
  } | {
    kind: 'implied-odds';
    callAmountBb: number;
    directRequiredEquityPercent: number;
    estimatedCleanEquityPercent: number;
    finalPotBb: number;
    minimumFutureWinBb: number;
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

/**
 * The chosen choice's grade for one answered scenario spot. Preserved in the
 * attempt result so consumers (e.g. the closing outcome) can distinguish a
 * costly mistake from an acceptable-but-not-best alternative — Slice 0's
 * correction, which `missedScenarios` alone would blur back together.
 */
export interface ScenarioAttemptDecision {
  focus: string;
  grade: ScenarioChoiceGrade;
  lessonId?: string;
}

export interface ScenarioAttemptReview {
  correctScenarioIds: string[];
  missedScenarios: ScenarioSpot[];
  /** The chosen grade for every answered spot, including best-choice answers. */
  gradedDecisions: readonly ScenarioAttemptDecision[];
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
