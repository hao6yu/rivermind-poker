export type LearningActivityType = 'lesson' | 'percentage_drill' | 'hand_quiz';
export type LearningStatus = 'started' | 'completed';

export interface LessonSection {
  heading: string;
  body: string;
  bullets?: string[];
  takeaway?: string;
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
  id: string;
  label: string;
}

export interface TrainerQuestion {
  id: string;
  prompt: string;
  context: string;
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
  questions: TrainerQuestion[];
}

export interface CheatSheetGroup {
  title: string;
  rows: Array<{ label: string; detail: string }>;
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

export type LearningActivityDefinition = LessonDefinition | TrainerDefinition;
