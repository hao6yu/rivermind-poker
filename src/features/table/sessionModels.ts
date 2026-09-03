import {
  gradeHeadsUpHand,
  gradeMultiwayHand,
  type HandDecisionReport,
} from '../../domain/poker/decisionGrading';
import {
  summarizeDecisionReports,
  type SessionLearningSummary,
} from '../../domain/poker/sessionLearning';
import type { GameState } from '../../domain/poker/types';
import type { MultiwayHandState } from '../../domain/poker/multiway';
import type { CoachResult } from '../../services/coach';

export interface HeadsUpSessionHandRecord {
  clientId: string;
  completedAt: string;
  game: GameState;
  coachResult: CoachResult | null;
  mode?: 'heads_up';
}

export interface MultiwaySessionHandRecord {
  clientId: string;
  completedAt: string;
  game: MultiwayHandState;
  coachResult: null;
  mode: 'multiway';
}

export type SessionHandRecord = HeadsUpSessionHandRecord | MultiwaySessionHandRecord;

export interface SessionLearningVerdict {
  detail: string;
  title: string;
  tone: 'empty' | 'review' | 'solid' | 'strong';
}

export function isMultiwaySessionHandRecord(
  hand: SessionHandRecord,
): hand is MultiwaySessionHandRecord {
  return hand.mode === 'multiway';
}

export function headsUpSessionHands(
  hands: readonly SessionHandRecord[],
): HeadsUpSessionHandRecord[] {
  return hands.filter((hand): hand is HeadsUpSessionHandRecord => !isMultiwaySessionHandRecord(hand));
}

export interface SessionHandDecisionReport {
  hand: SessionHandRecord;
  report: HandDecisionReport;
}

export function sessionHandDecisionReports(
  hands: readonly SessionHandRecord[],
): SessionHandDecisionReport[] {
  return hands.map((hand) => ({
    hand,
    report: isMultiwaySessionHandRecord(hand)
      ? gradeMultiwayHand(hand.game)
      : gradeHeadsUpHand(hand.game),
  }));
}

export function summarizeSessionHandLearning(
  hands: readonly SessionHandRecord[],
): SessionLearningSummary {
  return summarizeDecisionReports(sessionHandDecisionReports(hands).map(({ hand, report }) => ({
    handId: hand.clientId,
    report,
  })));
}

/**
 * How many decisions a player can review across these hands. Every recorded
 * hero decision appears in review rows and replay (an ungraded diagnostic is
 * still reviewable — it shows what happened and why no grade is claimed), so
 * the count is the sum of report decisions, not only the graded ones.
 */
export function sessionReviewableDecisionCount(
  hands: readonly SessionHandRecord[],
): number {
  return sessionHandDecisionReports(hands).reduce(
    (total, { report }) => total + report.decisions.length,
    0,
  );
}

/** A whole-session verdict, intentionally separate from any single coach spot. */
export function sessionLearningVerdict(
  summary: SessionLearningSummary,
): SessionLearningVerdict {
  if (summary.decisionsGraded === 0) {
    return {
      detail: 'No completed decisions were available to grade in this run.',
      title: 'No decision score yet',
      tone: 'empty',
    };
  }

  const detail = `${summary.grades.strong} strong · ${summary.grades.close} close · ${summary.grades.mistake} mistake${summary.grades.mistake === 1 ? '' : 's'} across ${summary.handsGraded} hand${summary.handsGraded === 1 ? '' : 's'}.`;
  // The tone comes from the hand/classification presentation, never from the
  // raw grade count, so a run with authored alternatives or a mistake is never
  // called a clean "strong" run by its own summary.
  if (summary.classification === 'recommended' && summary.grades.mistake === 0 && (summary.strongRate ?? 0) >= 75) {
    return { detail, title: 'Strong decisions overall', tone: 'strong' };
  }
  if ((summary.strongRate ?? 0) >= 55 && summary.grades.mistake <= summary.grades.close + 1) {
    return { detail, title: 'Solid run with a few review spots', tone: 'solid' };
  }
  return { detail, title: 'Important decisions to revisit', tone: 'review' };
}
