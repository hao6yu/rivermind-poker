import { describe, expect, it } from 'vitest';

import {
  buildAdaptiveLearningRecommendation,
  buildLearningConceptMastery,
  learningConceptForReview,
} from '../adaptiveRecommendation';
import { curriculumSteps } from '../curriculum';
import { applyLearningResult } from '../progress';
import { applyLearningReviewUpdate } from '../reviewQueue';

function progressBefore(activityId: string): ReturnType<typeof applyLearningResult> {
  const targetIndex = curriculumSteps.findIndex((step) => step.id === activityId);
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  let progress: ReturnType<typeof applyLearningResult> = [];
  for (const step of curriculumSteps.slice(0, targetIndex)) {
    progress = applyLearningResult(progress, {
      activityId: step.id,
      activityType: step.kind === 'lesson' ? 'lesson' : step.kind === 'mastery' ? step.trainer.type : 'scenario_drill',
      completed: true,
    });
  }
  return progress;
}

describe('adaptive learning recommendations', () => {
  it('prioritizes a due concept review over reinforcement', () => {
    const progress = applyLearningResult([], {
      activityId: 'scenario-pack-betting',
      activityType: 'scenario_drill',
      completed: true,
      score: 45,
    }, '2026-08-09T12:00:00.000Z');
    const queue = applyLearningReviewUpdate([], [{
      activityId: 'scenario-pack-odds',
      focusArea: 'draws',
      source: 'table',
    }], [], '2026-08-10T12:00:00.000Z');

    const recommendation = buildAdaptiveLearningRecommendation(
      progress,
      queue,
      true,
      '2026-08-10T13:00:00.000Z',
    );
    expect(recommendation).toMatchObject({
      concept: 'postflop-odds',
      dueCount: 1,
      kind: 'review',
    });
    expect(learningConceptForReview(queue[0]!)).toBe('postflop-odds');
  });

  it('reinforces the weakest attempted concept below the confidence threshold', () => {
    let progress = applyLearningResult([], {
      activityId: 'scenario-pack-preflop-enter',
      activityType: 'scenario_drill',
      completed: true,
      score: 65,
    }, '2026-08-09T12:00:00.000Z');
    progress = applyLearningResult(progress, {
      activityId: 'scenario-pack-betting',
      activityType: 'scenario_drill',
      completed: true,
      score: 40,
    }, '2026-08-10T12:00:00.000Z');

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept: 'postflop-betting',
      kind: 'reinforce-practice',
      pack: { id: 'betting' },
      score: 40,
    });
  });

  it('continues the curriculum when attempted concepts are on track', () => {
    const progress = applyLearningResult([], {
      activityId: 'scenario-pack-betting',
      activityType: 'scenario_drill',
      completed: true,
      score: 72,
    }, '2026-08-10T12:00:00.000Z');

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept: 'poker-basics',
      kind: 'curriculum',
      step: { id: curriculumSteps[0]!.id },
    });
  });

  it('moves a learner who finished the beginner path into intermediate three-bet work', () => {
    const firstIntermediateIndex = curriculumSteps.findIndex(
      (step) => step.id === 'lesson-preflop-three-bet-plan',
    );
    let progress: ReturnType<typeof applyLearningResult> = [];
    for (const step of curriculumSteps.slice(0, firstIntermediateIndex)) {
      progress = applyLearningResult(progress, {
        activityId: step.id,
        activityType: step.kind === 'lesson' ? 'lesson' : step.kind === 'mastery' ? step.trainer.type : 'scenario_drill',
        completed: true,
      });
    }

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept: 'preflop-three-bet',
      kind: 'curriculum',
      step: { id: 'lesson-preflop-three-bet-plan' },
    });
  });

  it('reinforces weak three-bet practice as its own concept', () => {
    const progress = applyLearningResult([], {
      activityId: 'scenario-pack-preflop-three-bet',
      activityType: 'scenario_drill',
      completed: true,
      score: 55,
    }, '2026-08-11T12:00:00.000Z');

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept: 'preflop-three-bet',
      kind: 'reinforce-practice',
      pack: { id: 'preflop-three-bet' },
      score: 55,
    });
  });

  it('continues from the completed foundation into intermediate postflop range work', () => {
    const firstIntermediateIndex = curriculumSteps.findIndex(
      (step) => step.id === 'lesson-postflop-range-advantage',
    );
    let progress: ReturnType<typeof applyLearningResult> = [];
    for (const step of curriculumSteps.slice(0, firstIntermediateIndex)) {
      progress = applyLearningResult(progress, {
        activityId: step.id,
        activityType: step.kind === 'lesson' ? 'lesson' : step.kind === 'mastery' ? step.trainer.type : 'scenario_drill',
        completed: true,
      });
    }

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept: 'postflop-range',
      kind: 'curriculum',
      step: { id: 'lesson-postflop-range-advantage' },
    });
  });

  it('reinforces weak range-and-turn practice as its own concept', () => {
    const progress = applyLearningResult([], {
      activityId: 'scenario-pack-postflop-range',
      activityType: 'scenario_drill',
      completed: true,
      score: 60,
    }, '2026-08-12T12:00:00.000Z');

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept: 'postflop-range',
      kind: 'reinforce-practice',
      pack: { id: 'postflop-range' },
      score: 60,
    });
  });

  it('continues from range work into intermediate river decisions', () => {
    const firstRiverIndex = curriculumSteps.findIndex(
      (step) => step.id === 'lesson-postflop-river-polarization',
    );
    let progress: ReturnType<typeof applyLearningResult> = [];
    for (const step of curriculumSteps.slice(0, firstRiverIndex)) {
      progress = applyLearningResult(progress, {
        activityId: step.id,
        activityType: step.kind === 'lesson' ? 'lesson' : step.kind === 'mastery' ? step.trainer.type : 'scenario_drill',
        completed: true,
      });
    }

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept: 'postflop-river',
      kind: 'curriculum',
      step: { id: 'lesson-postflop-river-polarization' },
    });
  });

  it('reinforces weak river practice as its own concept', () => {
    const progress = applyLearningResult([], {
      activityId: 'scenario-pack-postflop-river',
      activityType: 'scenario_drill',
      completed: true,
      score: 55,
    }, '2026-08-13T12:00:00.000Z');

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept: 'postflop-river',
      kind: 'reinforce-practice',
      pack: { id: 'postflop-river' },
      score: 55,
    });
  });

  it('continues from postflop study into tournament short-stack foundations', () => {
    const firstTournamentIndex = curriculumSteps.findIndex(
      (step) => step.id === 'lesson-tournament-stack-zones',
    );
    let progress: ReturnType<typeof applyLearningResult> = [];
    for (const step of curriculumSteps.slice(0, firstTournamentIndex)) {
      progress = applyLearningResult(progress, {
        activityId: step.id,
        activityType: step.kind === 'lesson' ? 'lesson' : step.kind === 'mastery' ? step.trainer.type : 'scenario_drill',
        completed: true,
      });
    }

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept: 'tournament-short-stack',
      kind: 'curriculum',
      step: { id: 'lesson-tournament-stack-zones' },
    });
  });

  it('reinforces weak tournament practice as its own concept', () => {
    const progress = applyLearningResult([], {
      activityId: 'scenario-pack-tournament-short-stack',
      activityType: 'scenario_drill',
      completed: true,
      score: 55,
    }, '2026-08-14T12:00:00.000Z');

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept: 'tournament-short-stack',
      kind: 'reinforce-practice',
      pack: { id: 'tournament-short-stack' },
      score: 55,
    });
  });

  it.each([
    ['lesson-tournament-risk-premium', 'tournament-bubble'],
    ['lesson-opponents-evidence', 'opponent-adjustments'],
    ['lesson-math-implied-odds', 'advanced-math'],
  ] as const)('continues into %s as the matching Phase 7 concept', (activityId, concept) => {
    expect(buildAdaptiveLearningRecommendation(progressBefore(activityId), [])).toMatchObject({
      concept,
      kind: 'curriculum',
      step: { id: activityId },
    });
  });

  it.each([
    ['tournament-bubble', 'tournament-bubble'],
    ['opponent-adjustments', 'opponent-adjustments'],
    ['advanced-math', 'advanced-math'],
  ] as const)('reinforces weak %s practice inside its own concept', (packId, concept) => {
    const progress = applyLearningResult([], {
      activityId: `scenario-pack-${packId}`,
      activityType: 'scenario_drill',
      completed: true,
      score: 58,
    }, '2026-08-15T12:00:00.000Z');

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept,
      kind: 'reinforce-practice',
      pack: { id: packId },
      score: 58,
    });
  });

  it.each([
    ['mission-tournament-bubble', 'tournament-bubble', 'tournament-bubble'],
    ['mission-opponent-adjustments', 'opponent-adjustments', 'opponent-adjustments'],
  ] as const)('routes a weak %s result back to its exact practice family', (missionId, concept, packId) => {
    const progress = applyLearningResult([], {
      activityId: missionId,
      activityType: 'scenario_drill',
      completed: false,
      score: 52,
      countAttempt: true,
    }, '2026-08-16T12:00:00.000Z');

    expect(buildAdaptiveLearningRecommendation(progress, [])).toMatchObject({
      concept,
      kind: 'reinforce-practice',
      pack: { id: packId },
      score: 52,
    });
  });

  it('uses observed results and due spots for explainable concept mastery', () => {
    const progress = applyLearningResult([], {
      activityId: 'scenario-pack-betting',
      activityType: 'scenario_drill',
      completed: true,
      score: 70,
    }, '2026-08-10T12:00:00.000Z');
    const queue = applyLearningReviewUpdate([], [{
      activityId: 'scenario-pack-betting',
      focusArea: 'bluffing',
      source: 'table',
    }], [], '2026-08-10T12:30:00.000Z');
    const concept = buildLearningConceptMastery(progress, queue, '2026-08-10T13:00:00.000Z')
      .find((item) => item.concept === 'postflop-betting');

    expect(concept).toEqual({
      concept: 'postflop-betting',
      dueReviews: 1,
      evidenceCount: 1,
      masteryPercent: 65,
    });
  });
});
