import { findLearningActivity } from '../../domain/learning/content';
import { curriculumSteps } from '../../domain/learning/curriculum';
import { practicePacks } from '../../domain/learning/practicePacks';
import { tableMissionById } from '../../domain/learning/tableMissions';
import { learningConceptForFocusArea } from '../../domain/learning/adaptiveRecommendation';
import type {
  ClosingSummary,
  GradedHandEvidence,
} from '../../domain/learning/sessionClosing';
import {
  sessionHandDecisionReports,
  type SessionHandRecord,
} from '../table/sessionModels';
import {
  learningConceptLabel,
  type SessionLoc,
} from './recommendedSessionPresentation';

/**
 * Presentation-only rendering of the closing-outcome summary. The domain model
 * (`sessionClosing`) stays locale-free; this module turns its structured values
 * into localized copy and an ordered VoiceOver summary.
 */

export interface ClosingOutcomeCopy {
  /** The view title, reflecting whether the session completed or was paused. */
  title: string;
  /** "What did I practice?" header. */
  practicedHeader: string;
  /** The localized concept that was practiced. */
  practicedConcept: string;
  /** Completed vs. skipped steps. */
  practicedSteps: string;
  /** Decisions reviewed or scored. */
  practicedDecisions: string;
  /** "What changed?" header. */
  changedHeader: string;
  /** The single evidence-bounded statement (strength / improvement / building evidence). */
  changedStatement: string;
  /** A recurring-focus line when its evidence is met, otherwise null. */
  changedFocus: string | null;
  /** "What is next?" header. */
  nextHeader: string;
  /** The next-action line. */
  nextAction: string;
  /** The quiet secondary route to detailed progress. */
  progressRoute: string;
  /** The single primary action. */
  finish: string;
  /**
   * The ordered accessibility summary: practiced concept, the evidence
   * statement, the focus, the next action, and the detailed-progress route.
   * The primary Finish button carries its own label after this.
   */
  accessibilityLabel: string;
}

/**
 * Resolves a stable activity/lesson/mission/pack id (the next continue-path
 * activity) to a localized title, falling back to the session's concept label
 * when the id no longer resolves.
 */
function activityTitleForId(
  activityId: string | null,
  loc: SessionLoc,
  conceptFallback: string,
): string {
  if (!activityId) return conceptFallback;
  const activity = findLearningActivity(activityId);
  if (activity) return loc.activityText(activity, 'title');
  const pack = practicePacks.find((candidate) => candidate.progressActivityId === activityId);
  if (pack) return loc.practicePackText(pack, 'title');
  const step = curriculumSteps.find((candidate) => candidate.id === activityId);
  if (step) {
    if (step.kind === 'lesson') return loc.activityText(step.lesson, 'title');
    if (step.kind === 'practice') return loc.practicePackText(step.pack, 'title');
    if (step.kind === 'mission') return tableMissionById(step.mission.id).title;
    return loc.activityText(step.trainer, 'title');
  }
  return conceptFallback;
}

/**
 * Projects graded table-session hand records into presentation-level evidence
 * for the closing outcome: each completed hand becomes a distinct record keyed
 * by its client id and mapped to the concept of its worst-graded focus area.
 * Chip profit is not carried — only the hand's own presentation classification
 * — so a big winner who made a costly mistake reads as "review", not "strong".
 */
export function gradedHandEvidence(hands: readonly SessionHandRecord[]): GradedHandEvidence[] {
  return sessionHandDecisionReports(hands)
    .filter(({ report }) => report.classification !== null)
    .map(({ hand, report }) => ({
      handId: hand.clientId,
      concept: learningConceptForFocusArea(report.focusArea),
      classification: report.classification,
    }));
}

/**
 * Builds the localized copy and the ordered VoiceOver summary for a closing
 * summary. The `t` accessor interpolates the concept, counts, and next-action
 * id into the authored templates.
 */
export function closingOutcomeCopy(
  summary: ClosingSummary,
  status: 'completed' | 'abandoned',
  loc: SessionLoc,
): ClosingOutcomeCopy {
  const { t } = loc;
  const concept = learningConceptLabel(summary.concept, t);

  const title = t(status === 'completed' ? 'learn.sessionComplete' : 'learn.sessionEnded');
  const practicedHeader = t('learn.closingPracticed');
  const practicedSteps = t('learn.closingSteps', {
    completed: summary.completedSteps,
    skipped: summary.skippedSteps,
  });
  // Count-aware plural form: the plural catalog carries the singular and
  // plural phrasings (zero reads as plural), so no caller-side conditional.
  const practicedDecisions = loc.tCount('learn.closingDecisions', summary.decisionsReviewed);

  const changedHeader = t('learn.closingChanged');
  let changedStatement: string;
  if (summary.statement === 'strength' && summary.strength) {
    changedStatement = summary.strength.basis === 'history'
      ? t('learn.closingStrengthHistory', { concept, hands: summary.strength.supportingHands })
      : t('learn.closingStrengthSession', {
        concept,
        count: summary.strength.decisionsScored,
      });
  } else if (summary.statement === 'improvement' && summary.improvement) {
    changedStatement = t('learn.closingImprovement', {
      concept,
      points: summary.improvement.change,
    });
  } else {
    changedStatement = t('learn.closingBuildingEvidence', { concept });
  }

  const changedFocus = summary.focus
    ? t('learn.closingFocus', { concept, spots: summary.focus.spots })
    : null;

  const nextHeader = t('learn.closingNext');
  let nextAction: string;
  if (summary.next.kind === 'review' && summary.next.daysUntilReview !== null) {
    nextAction = summary.next.daysUntilReview === 0
      ? t('learn.closingNextReviewDue', { concept })
      : summary.next.daysUntilReview === 1
        ? t('learn.closingNextReviewInOneDay', { concept })
        : t('learn.closingNextReviewIn', {
          concept,
          days: summary.next.daysUntilReview,
        });
  } else if (summary.next.kind === 'continue-path' && summary.next.activityId) {
    nextAction = t('learn.closingNextContinuePath', {
      activity: activityTitleForId(summary.next.activityId, loc, concept),
    });
  } else {
    nextAction = t('learn.closingNextMoreEvidence', { concept });
  }

  const progressRoute = t('learn.closingViewProgress');
  const finish = t('learn.finish');

  // Ordered VoiceOver summary for the informational card: practiced concept,
  // the evidence statement, the focus, and the next action. The title is its
  // own announced header and the quiet detailed-progress route plus the
  // primary Finish button each announce themselves as separate controls after
  // this, so none of those are repeated here.
  const accessibilityLabel = [
    practicedHeader,
    concept,
    practicedSteps,
    practicedDecisions,
    changedHeader,
    changedStatement,
    changedFocus ?? '',
    nextHeader,
    nextAction,
  ].filter((line) => line.length > 0).join('. ');

  return {
    title,
    practicedHeader,
    practicedConcept: concept,
    practicedSteps,
    practicedDecisions,
    changedHeader,
    changedStatement,
    changedFocus,
    nextHeader,
    nextAction,
    progressRoute,
    finish,
    accessibilityLabel,
  };
}
