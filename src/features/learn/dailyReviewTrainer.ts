import type { MessageKey } from '../../localization';
import { generateFocusedScenarioSessionFromRandom } from '../../domain/learning/scenarios';
import { findLearningActivity } from '../../domain/learning/content';
import { secureRandom } from '../../services/secureRandom';
import type { ScenarioSpot, TrainerDefinition, TrainerQuestion } from '../../domain/learning/types';
import type { LearningReviewItem } from '../../domain/learning/reviewQueue';

/**
 * The daily learning review is a hand-quiz trainer built from the learner's
 * due review items: trainer items map to their authored question; scenario items
 * map to the authored spot (or a focused random spot) so the question stays
 * coherent with the learner's plan.
 *
 * This builder is intentionally self-contained (it does not read the review
 * queue) so the recommended-session journey can launch the same review the
 * Learn screen offers. The Learn screen keeps its own inline copy because it
 * owns that launch path separately.
 */

interface DailyReviewTrainerLoc {
  scenarioContent: (spot: ScenarioSpot) => ScenarioSpot;
  trainerContent: (trainer: TrainerDefinition) => TrainerDefinition;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}

function scenarioReviewQuestion(
  item: Exclude<LearningReviewItem, { source: 'trainer' }>,
  scenario: ScenarioSpot,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): TrainerQuestion {
  return {
    id: item.id,
    prompt: scenario.prompt,
    context: t('learn.reviewScenarioContext', {
      action: scenario.opponentAction,
      position: scenario.position,
      pot: scenario.potBb,
    }),
    heroCards: scenario.heroCards,
    board: scenario.board,
    choices: scenario.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      feedback: choice.feedback,
      // Preserve each choice's grade so a frozen review can tell a `mistake`
      // apart from a `reasonable` alternative (binary authored questions keep
      // omitting it, so their miss stays a costly mistake).
      grade: choice.grade,
    })),
    correctChoiceId: scenario.bestChoiceId,
    explanation: `${scenario.reasoning}\n\n${scenario.takeaway}`,
  };
}

/**
 * Builds the daily review trainer from the due review items. Returns null when
 * nothing matches, mirroring the Learn screen's own builder.
 */
export function buildDailyLearningReviewTrainer(
  items: readonly LearningReviewItem[],
  loc: DailyReviewTrainerLoc,
): TrainerDefinition | null {
  const selected = items.slice(0, 3);
  const questions: TrainerQuestion[] = selected.flatMap((item) => {
    if (item.source === 'trainer') {
      const activity = findLearningActivity(item.activityId);
      if (!activity || activity.type === 'lesson' || activity.type === 'scenario_drill') return [];
      const question = loc.trainerContent(activity).questions.find((candidate) => candidate.id === item.questionId);
      return question ? [{ ...question, id: item.id }] : [];
    }

    const sourceScenario = item.source === 'scenario'
      ? item.scenario
      : generateFocusedScenarioSessionFromRandom(item.focusArea, secureRandom)[0];
    if (!sourceScenario) return [];
    return [scenarioReviewQuestion(item, loc.scenarioContent(sourceScenario), loc.t)];
  });
  if (questions.length === 0) return null;
  return {
    id: 'daily-learning-review',
    type: 'hand_quiz',
    title: loc.t('learn.reviewToday'),
    description: loc.t('learn.reviewTodayDescription'),
    estimatedMinutes: 3,
    questions,
  };
}
