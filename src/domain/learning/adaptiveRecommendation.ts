import {
  handQuiz,
  percentageTrainer,
  postflopMasteryCheck,
  preflopMasteryCheck,
} from './content';
import { nextCurriculumStep, type CurriculumStep } from './curriculum';
import {
  practicePackById,
  practicePacks,
  type PracticePackDefinition,
} from './practicePacks';
import { selectDailyLearningReviewItems, type LearningReviewItem } from './reviewQueue';
import type { LearningActivityDefinition, LearningProgressEntry, PracticePackId } from './types';

export type LearningConceptId =
  | 'poker-basics'
  | 'table-math'
  | 'betting-purpose'
  | 'preflop-entry'
  | 'preflop-pressure'
  | 'preflop-three-bet'
  | 'postflop-betting'
  | 'postflop-odds'
  | 'postflop-range'
  | 'postflop-river';

export interface LearningConceptMastery {
  concept: LearningConceptId;
  dueReviews: number;
  evidenceCount: number;
  masteryPercent: number;
}

export type AdaptiveLearningRecommendation =
  | {
    concept: LearningConceptId;
    dueCount: number;
    kind: 'review';
  }
  | {
    concept: LearningConceptId;
    kind: 'reinforce-practice';
    pack: PracticePackDefinition;
    score: number;
  }
  | {
    activity: LearningActivityDefinition;
    concept: LearningConceptId;
    kind: 'reinforce-activity';
    score: number;
  }
  | {
    concept: LearningConceptId;
    kind: 'curriculum';
    step: CurriculumStep;
  };

interface LearningConceptDefinition {
  activityIds: string[];
  id: LearningConceptId;
}

const reinforcementScoreThreshold = 70;

const conceptDefinitions: LearningConceptDefinition[] = [
  {
    id: 'poker-basics',
    activityIds: [
      'lesson-hand-rankings',
      'lesson-position-blinds',
      'lesson-actions-order',
      'lesson-starting-hands',
      handQuiz.id,
    ],
  },
  {
    id: 'table-math',
    activityIds: ['lesson-outs-equity-odds', percentageTrainer.id],
  },
  {
    id: 'betting-purpose',
    activityIds: ['lesson-value-bluffs'],
  },
  {
    id: 'preflop-entry',
    activityIds: [
      'lesson-preflop-opening-position',
      'lesson-preflop-limpers',
      practicePackById('preflop-enter').progressActivityId,
      'mission-preflop-enter-pot',
    ],
  },
  {
    id: 'preflop-pressure',
    activityIds: [
      'lesson-preflop-facing-raise',
      'lesson-preflop-blind-defense',
      practicePackById('preflop').progressActivityId,
      practicePackById('preflop-pressure').progressActivityId,
      'mission-preflop-pressure',
      preflopMasteryCheck.id,
    ],
  },
  {
    id: 'preflop-three-bet',
    activityIds: [
      'lesson-preflop-three-bet-plan',
      'lesson-preflop-facing-three-bet',
      practicePackById('preflop-three-bet').progressActivityId,
    ],
  },
  {
    id: 'postflop-betting',
    activityIds: [
      'lesson-postflop-board-texture',
      'lesson-postflop-continuation-bets',
      'lesson-postflop-value-sizing',
      'lesson-postflop-river-decisions',
      practicePackById('betting').progressActivityId,
      'mission-postflop-cbet',
      'mission-postflop-river',
      postflopMasteryCheck.id,
    ],
  },
  {
    id: 'postflop-odds',
    activityIds: [
      'lesson-postflop-playing-draws',
      practicePackById('odds').progressActivityId,
    ],
  },
  {
    id: 'postflop-range',
    activityIds: [
      'lesson-postflop-range-advantage',
      'lesson-postflop-three-bet-pots',
      'lesson-postflop-turn-barrels',
      practicePackById('postflop-range').progressActivityId,
    ],
  },
  {
    id: 'postflop-river',
    activityIds: [
      'lesson-postflop-river-polarization',
      'lesson-postflop-river-bluff-catchers',
      practicePackById('postflop-river').progressActivityId,
    ],
  },
];

const practiceConcepts: Record<PracticePackId, LearningConceptId> = {
  preflop: 'preflop-pressure',
  'preflop-enter': 'preflop-entry',
  'preflop-pressure': 'preflop-pressure',
  'preflop-three-bet': 'preflop-three-bet',
  betting: 'postflop-betting',
  odds: 'postflop-odds',
  'postflop-range': 'postflop-range',
  'postflop-river': 'postflop-river',
};

const activityConcepts = new Map(conceptDefinitions.flatMap((concept) => (
  concept.activityIds.map((activityId) => [activityId, concept.id] as const)
)));

export function learningConceptForReview(item: LearningReviewItem): LearningConceptId {
  const exactConcept = activityConcepts.get(item.activityId);
  if (exactConcept) return exactConcept;
  if (item.source === 'trainer') return 'poker-basics';
  if (item.focusArea === 'preflop') return 'preflop-pressure';
  if (item.focusArea === 'calling' || item.focusArea === 'pot-odds' || item.focusArea === 'draws') {
    return 'postflop-odds';
  }
  return 'postflop-betting';
}

function scoreForProgress(entry: LearningProgressEntry): number {
  if (entry.bestScore !== null) return entry.bestScore;
  return entry.status === 'completed' ? 100 : 0;
}

export function buildLearningConceptMastery(
  progress: readonly LearningProgressEntry[],
  reviewQueue: readonly LearningReviewItem[],
  now = new Date().toISOString(),
): LearningConceptMastery[] {
  const progressById = new Map(progress.map((entry) => [entry.activityId, entry]));
  const dueReviews = selectDailyLearningReviewItems(reviewQueue, reviewQueue.length, now);
  return conceptDefinitions.map((definition) => {
    const evidence = definition.activityIds.flatMap((activityId) => {
      const entry = progressById.get(activityId);
      return entry ? [scoreForProgress(entry)] : [];
    });
    const conceptDueReviews = dueReviews.filter((item) => learningConceptForReview(item) === definition.id).length;
    const baseMastery = evidence.length > 0
      ? Math.round(evidence.reduce((total, score) => total + score, 0) / evidence.length)
      : 0;
    return {
      concept: definition.id,
      dueReviews: conceptDueReviews,
      evidenceCount: evidence.length,
      masteryPercent: Math.max(0, baseMastery - Math.min(15, conceptDueReviews * 5)),
    };
  });
}

function conceptForStep(step: CurriculumStep): LearningConceptId {
  return activityConcepts.get(step.id) ?? (
    step.chapter === 'fundamentals'
      ? 'poker-basics'
      : step.chapter === 'preflop'
        ? 'preflop-entry'
        : 'postflop-betting'
  );
}

interface ReinforcementTarget {
  activity?: LearningActivityDefinition;
  concept: LearningConceptId;
  pack?: PracticePackDefinition;
  score: number;
  updatedAt: string;
}

function reinforcementTargets(progress: readonly LearningProgressEntry[]): ReinforcementTarget[] {
  const progressById = new Map(progress.map((entry) => [entry.activityId, entry]));
  const trainerTargets: Array<{ activity: LearningActivityDefinition; concept: LearningConceptId }> = [
    { activity: handQuiz, concept: 'poker-basics' },
    { activity: percentageTrainer, concept: 'table-math' },
  ];
  return [
    ...practicePacks.flatMap((pack) => {
      const entry = progressById.get(pack.progressActivityId);
      return entry?.bestScore === null || entry?.bestScore === undefined ? [] : [{
        concept: practiceConcepts[pack.id],
        pack,
        score: entry.bestScore,
        updatedAt: entry.updatedAt,
      }];
    }),
    ...trainerTargets.flatMap(({ activity, concept }) => {
      const entry = progressById.get(activity.id);
      return entry?.bestScore === null || entry?.bestScore === undefined ? [] : [{
        activity,
        concept,
        score: entry.bestScore,
        updatedAt: entry.updatedAt,
      }];
    }),
  ].sort((left, right) => left.score - right.score || left.updatedAt.localeCompare(right.updatedAt));
}

export function buildAdaptiveLearningRecommendation(
  progress: readonly LearningProgressEntry[],
  reviewQueue: readonly LearningReviewItem[],
  includeReview = true,
  now = new Date().toISOString(),
): AdaptiveLearningRecommendation | null {
  const mastery = buildLearningConceptMastery(progress, reviewQueue, now);
  const dueReviews = selectDailyLearningReviewItems(reviewQueue, 3, now);
  if (includeReview && dueReviews.length > 0) {
    const recommendedConcept = [...mastery]
      .filter((concept) => concept.dueReviews > 0)
      .sort((left, right) => (
        right.dueReviews - left.dueReviews
        || left.masteryPercent - right.masteryPercent
        || conceptDefinitions.findIndex((item) => item.id === left.concept)
          - conceptDefinitions.findIndex((item) => item.id === right.concept)
      ))[0];
    if (recommendedConcept) {
      return {
        concept: recommendedConcept.concept,
        dueCount: dueReviews.length,
        kind: 'review',
      };
    }
  }

  const reinforcement = reinforcementTargets(progress)
    .find((target) => target.score < reinforcementScoreThreshold);
  if (reinforcement?.pack) {
    return {
      concept: reinforcement.concept,
      kind: 'reinforce-practice',
      pack: reinforcement.pack,
      score: reinforcement.score,
    };
  }
  if (reinforcement?.activity) {
    return {
      activity: reinforcement.activity,
      concept: reinforcement.concept,
      kind: 'reinforce-activity',
      score: reinforcement.score,
    };
  }

  const step = nextCurriculumStep(progress);
  if (step) return { concept: conceptForStep(step), kind: 'curriculum', step };

  const maintenance = reinforcementTargets(progress)[0];
  if (maintenance?.pack) {
    return {
      concept: maintenance.concept,
      kind: 'reinforce-practice',
      pack: maintenance.pack,
      score: maintenance.score,
    };
  }
  if (maintenance?.activity) {
    return {
      activity: maintenance.activity,
      concept: maintenance.concept,
      kind: 'reinforce-activity',
      score: maintenance.score,
    };
  }
  return null;
}
