import { aggregateClassification, type DecisionPresentationClass } from './decisionReviewPresentation';
import type { HandDecisionReport } from './decisionGrading';
import type { CoachFocusArea, CoachHandGrade } from './types';

export interface SessionDecisionReportInput {
  handId: string;
  report: HandDecisionReport;
}

export interface SessionLearningStrength {
  area: Exclude<CoachFocusArea, 'none'>;
  handCount: number;
  spotCount: number;
}

export interface SessionLearningSummary {
  /** The player-facing presentation class of the whole session. */
  classification: DecisionPresentationClass | null;
  decisionsGraded: number;
  focusDecisionSequence: number | null;
  focusHandId: string | null;
  grades: Record<CoachHandGrade, number>;
  handsGraded: number;
  repeatedWeakness: boolean;
  reviewSpots: number;
  strongRate: number | null;
  strengths: SessionLearningStrength[];
  topFocusArea: Exclude<CoachFocusArea, 'none'> | null;
  topFocusHandCount: number;
  topFocusSpotCount: number;
}

interface FocusSignal {
  area: Exclude<CoachFocusArea, 'none'>;
  handIds: Set<string>;
  reviewSpots: number;
  score: number;
}

interface StrengthSignal {
  area: Exclude<CoachFocusArea, 'none'>;
  handIds: Set<string>;
  strongSpots: number;
}

const focusAreaOrder: Array<Exclude<CoachFocusArea, 'none'>> = [
  'preflop',
  'value-betting',
  'bluffing',
  'calling',
  'bet-sizing',
  'pot-odds',
  'draws',
];

const gradeScore: Record<CoachHandGrade, number> = {
  strong: 0,
  close: 1,
  mistake: 3,
};

/**
 * Combines free, public-information decision reports into one learning signal.
 * Areas seen in more completed hands rank above one-off spots, so the suggested
 * drill follows a pattern instead of overreacting to a single unusual hand.
 */
export function summarizeDecisionReports(
  inputs: readonly SessionDecisionReportInput[],
): SessionLearningSummary {
  const compatibleInputs = inputs.filter(({ report }) => report.decisions.length > 0);
  const decisions = compatibleInputs.flatMap(({ handId, report }) => (
    report.decisions.map((decision) => ({ decision, handId }))
  ));
  const grades: SessionLearningSummary['grades'] = { strong: 0, close: 0, mistake: 0 };
  const signals = new Map<Exclude<CoachFocusArea, 'none'>, FocusSignal>();
  const strengthSignals = new Map<Exclude<CoachFocusArea, 'none'>, StrengthSignal>();

  decisions.forEach(({ decision, handId }) => {
    grades[decision.grade] += 1;
    if (decision.focusArea === 'none') return;
    if (decision.grade === 'strong') {
      const signal = strengthSignals.get(decision.focusArea) ?? {
        area: decision.focusArea,
        handIds: new Set<string>(),
        strongSpots: 0,
      };
      signal.handIds.add(handId);
      signal.strongSpots += 1;
      strengthSignals.set(decision.focusArea, signal);
      return;
    }
    const area = decision.focusArea;
    const signal = signals.get(area) ?? {
      area,
      handIds: new Set<string>(),
      reviewSpots: 0,
      score: 0,
    };
    signal.handIds.add(handId);
    signal.reviewSpots += 1;
    signal.score += gradeScore[decision.grade] + decision.relativeScoreGap;
    signals.set(area, signal);
  });

  const topSignal = [...signals.values()].sort((left, right) => (
    right.handIds.size - left.handIds.size
      || right.score - left.score
      || right.reviewSpots - left.reviewSpots
      || focusAreaOrder.indexOf(left.area) - focusAreaOrder.indexOf(right.area)
  ))[0] ?? null;
  const focusDecision = topSignal
    ? decisions
      .filter(({ decision }) => decision.focusArea === topSignal.area && decision.grade !== 'strong')
      .sort((left, right) => (
        gradeScore[right.decision.grade] - gradeScore[left.decision.grade]
          || right.decision.relativeScoreGap - left.decision.relativeScoreGap
          || left.decision.sequence - right.decision.sequence
      ))[0] ?? null
    : null;
  const decisionsGraded = decisions.length;
  const strengths = [...strengthSignals.values()]
    .filter((signal) => signal.area !== topSignal?.area)
    .sort((left, right) => (
      right.handIds.size - left.handIds.size
        || right.strongSpots - left.strongSpots
        || focusAreaOrder.indexOf(left.area) - focusAreaOrder.indexOf(right.area)
    ))
    .slice(0, 2)
    .map((signal) => ({
      area: signal.area,
      handCount: signal.handIds.size,
      spotCount: signal.strongSpots,
    }));

  const classifications = aggregateClassification(decisions.map((entry) => entry.decision));

  return {
    classification: classifications,
    decisionsGraded,
    focusDecisionSequence: focusDecision?.decision.sequence ?? null,
    focusHandId: focusDecision?.handId ?? null,
    grades,
    handsGraded: compatibleInputs.length,
    repeatedWeakness: (topSignal?.handIds.size ?? 0) >= 2,
    reviewSpots: grades.close + grades.mistake,
    strongRate: decisionsGraded > 0 ? Math.round((grades.strong / decisionsGraded) * 100) : null,
    strengths,
    topFocusArea: topSignal?.area ?? null,
    topFocusHandCount: topSignal?.handIds.size ?? 0,
    topFocusSpotCount: topSignal?.reviewSpots ?? 0,
  };
}
