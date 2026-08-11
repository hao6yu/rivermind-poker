import type { AiDifficulty } from '../poker/aiProfiles';
import type { DecisionComparison, HandDecisionReport } from '../poker/decisionGrading';
import type { MultiwayTablePlayerCount } from '../poker/multiwaySession';
import type { PostflopInitiative } from '../poker/postflopStrategy';
import type { PracticeSessionConfig } from '../poker/session';
import type { TournamentDecisionContext } from '../poker/tournamentIntelligence';
import type { CoachHandGrade, Street } from '../poker/types';
import type { CoachFocusArea } from '../poker/types';
import { percentageScore } from './progress';
import type { PracticePackId } from './types';

export type TableMissionId =
  | 'mission-preflop-enter-pot'
  | 'mission-preflop-pressure'
  | 'mission-postflop-cbet'
  | 'mission-postflop-river'
  | 'mission-tournament-bubble'
  | 'mission-opponent-adjustments';

export type TableMissionScoringProfile = 'preflop' | 'flop-initiative' | 'river' | 'tournament' | 'adjustment';

export interface TableMissionDefinition {
  conceptIds: string[];
  curriculumTrack: 'preflop' | 'postflop' | 'tournament' | 'opponents';
  description: string;
  difficulty: 'beginner' | 'intermediate';
  estimatedMinutes: number;
  id: TableMissionId;
  masteryThreshold: number;
  minimumDecisions: number;
  playerCount: MultiwayTablePlayerCount;
  practicePackId: PracticePackId;
  prerequisiteIds: string[];
  requiredInitiative?: PostflopInitiative;
  scoredStreets: Array<Exclude<Street, 'complete'>>;
  scoringProfile: TableMissionScoringProfile;
  scoredFocusAreas?: Array<Exclude<CoachFocusArea, 'none'>>;
  sessionConfig: PracticeSessionConfig & { handTarget: 5 | 10 };
  tableDifficulty: AiDifficulty;
  tournamentContext?: TournamentDecisionContext;
  title: string;
  type: 'scenario_drill';
}

export interface TableMissionResult {
  completed: boolean;
  decisionsGraded: number;
  grades: Record<CoachHandGrade, number>;
  handsPlayed: number;
  missionId: TableMissionId;
  minimumDecisions: number;
  passed: boolean;
  score: number;
}

export const tableMissions: TableMissionDefinition[] = [
  {
    id: 'mission-preflop-enter-pot',
    type: 'scenario_drill',
    title: 'Enter the pot mission',
    description: 'Play five six-player hands and grade only your preflop entries.',
    curriculumTrack: 'preflop',
    conceptIds: ['opening-position', 'playing-over-limpers'],
    difficulty: 'beginner',
    prerequisiteIds: ['lesson-preflop-opening-position', 'lesson-preflop-limpers'],
    practicePackId: 'preflop-enter',
    playerCount: 6,
    sessionConfig: { handTarget: 5, startingStackBb: 200 },
    scoredStreets: ['preflop'],
    scoringProfile: 'preflop',
    tableDifficulty: 'friendly',
    estimatedMinutes: 7,
    masteryThreshold: 70,
    minimumDecisions: 1,
  },
  {
    id: 'mission-preflop-pressure',
    type: 'scenario_drill',
    title: 'Pressure response mission',
    description: 'Play five six-player hands and grade only your preflop responses.',
    curriculumTrack: 'preflop',
    conceptIds: ['facing-raise', 'blind-defense'],
    difficulty: 'beginner',
    prerequisiteIds: ['lesson-preflop-facing-raise', 'lesson-preflop-blind-defense'],
    practicePackId: 'preflop-pressure',
    playerCount: 6,
    sessionConfig: { handTarget: 5, startingStackBb: 200 },
    scoredStreets: ['preflop'],
    scoringProfile: 'preflop',
    tableDifficulty: 'club',
    estimatedMinutes: 7,
    masteryThreshold: 70,
    minimumDecisions: 1,
  },
  {
    id: 'mission-postflop-cbet',
    type: 'scenario_drill',
    title: 'Selective continuation-bet mission',
    description: 'Play ten six-player hands; only flop decisions made with betting initiative are graded.',
    curriculumTrack: 'postflop',
    conceptIds: ['board-texture', 'continuation-betting'],
    difficulty: 'beginner',
    prerequisiteIds: ['lesson-postflop-board-texture', 'lesson-postflop-continuation-bets'],
    practicePackId: 'betting',
    playerCount: 6,
    sessionConfig: { handTarget: 10, startingStackBb: 200 },
    scoredStreets: ['flop'],
    scoringProfile: 'flop-initiative',
    requiredInitiative: 'player',
    tableDifficulty: 'friendly',
    estimatedMinutes: 12,
    masteryThreshold: 70,
    minimumDecisions: 2,
  },
  {
    id: 'mission-postflop-river',
    type: 'scenario_drill',
    title: 'River discipline mission',
    description: 'Play ten six-player hands; only decisions you reach on the river are graded.',
    curriculumTrack: 'postflop',
    conceptIds: ['value-sizing', 'river-discipline'],
    difficulty: 'beginner',
    prerequisiteIds: ['lesson-postflop-value-sizing', 'lesson-postflop-river-decisions'],
    practicePackId: 'betting',
    playerCount: 6,
    sessionConfig: { handTarget: 10, startingStackBb: 200 },
    scoredStreets: ['river'],
    scoringProfile: 'river',
    tableDifficulty: 'club',
    estimatedMinutes: 14,
    masteryThreshold: 70,
    minimumDecisions: 2,
  },
  {
    id: 'mission-tournament-bubble',
    type: 'scenario_drill',
    title: 'Bubble pressure mission',
    description: 'Play ten three-player hands where two places advance; only preflop bubble decisions are graded.',
    curriculumTrack: 'tournament',
    conceptIds: ['risk-premium', 'stack-coverage'],
    difficulty: 'intermediate',
    prerequisiteIds: ['lesson-tournament-risk-premium', 'lesson-tournament-stack-coverage'],
    practicePackId: 'tournament-bubble',
    playerCount: 3,
    sessionConfig: { handTarget: 10, startingStackBb: 40 },
    scoredStreets: ['preflop'],
    scoringProfile: 'tournament',
    tableDifficulty: 'club',
    tournamentContext: { enabled: true, qualifyingPlace: 2 },
    estimatedMinutes: 12,
    masteryThreshold: 70,
    minimumDecisions: 3,
  },
  {
    id: 'mission-opponent-adjustments',
    type: 'scenario_drill',
    title: 'Opponent adjustment mission',
    description: 'Play ten hands against named styles; grade only value, bluff, and calling decisions.',
    curriculumTrack: 'opponents',
    conceptIds: ['sample-confidence', 'measured-exploits'],
    difficulty: 'intermediate',
    prerequisiteIds: ['lesson-opponents-evidence', 'lesson-opponents-callers-folders'],
    practicePackId: 'opponent-adjustments',
    playerCount: 6,
    sessionConfig: { handTarget: 10, startingStackBb: 100 },
    scoredStreets: ['flop', 'turn', 'river'],
    scoredFocusAreas: ['value-betting', 'bluffing', 'calling'],
    scoringProfile: 'adjustment',
    tableDifficulty: 'club',
    estimatedMinutes: 14,
    masteryThreshold: 70,
    minimumDecisions: 2,
  },
];

export const preflopTableMissions = tableMissions.filter(
  (mission) => mission.curriculumTrack === 'preflop',
);

export const postflopTableMissions = tableMissions.filter(
  (mission) => mission.curriculumTrack === 'postflop',
);

export const tournamentTableMissions = tableMissions.filter(
  (mission) => mission.curriculumTrack === 'tournament',
);

export const opponentTableMissions = tableMissions.filter(
  (mission) => mission.curriculumTrack === 'opponents',
);

export function tableMissionById(id: TableMissionId): TableMissionDefinition {
  const mission = tableMissions.find((candidate) => candidate.id === id);
  if (!mission) throw new Error(`Unknown table mission: ${id}`);
  return mission;
}

export function tableMissionDecisions(
  mission: TableMissionDefinition,
  reports: readonly HandDecisionReport[],
): DecisionComparison[] {
  return reports.flatMap((report) => report.decisions).filter((decision) => (
    mission.scoredStreets.includes(decision.street)
      && (mission.requiredInitiative === undefined || decision.initiative === mission.requiredInitiative)
      && (mission.scoredFocusAreas === undefined || (
        decision.focusArea !== 'none' && mission.scoredFocusAreas.includes(decision.focusArea)
      ))
  ));
}

/**
 * Mission scores ignore every decision outside the mission's configured spot
 * and never use chip results. Close mixed-strategy actions receive half credit.
 */
export function scoreTableMission(
  mission: TableMissionDefinition,
  reports: readonly HandDecisionReport[],
): TableMissionResult {
  const decisions = tableMissionDecisions(mission, reports);
  const grades: Record<CoachHandGrade, number> = { strong: 0, close: 0, mistake: 0 };
  for (const decision of decisions) grades[decision.grade] += 1;
  const score = percentageScore(grades.strong + grades.close * 0.5, decisions.length);
  const completed = reports.length >= mission.sessionConfig.handTarget;
  return {
    completed,
    decisionsGraded: decisions.length,
    grades,
    handsPlayed: reports.length,
    missionId: mission.id,
    minimumDecisions: mission.minimumDecisions,
    passed: completed && decisions.length >= mission.minimumDecisions && score >= mission.masteryThreshold,
    score,
  };
}
