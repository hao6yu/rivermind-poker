import { describe, expect, it } from 'vitest';

import type { ScenarioSpot } from '../types';
import {
  applyLearningReviewUpdate,
  learningReviewItemId,
  selectDailyLearningReviewItems,
  type LearningReviewCapture,
} from '../reviewQueue';

const scenario: ScenarioSpot = {
  id: 'river-call-1',
  focus: 'Calling decisions',
  street: 'river',
  position: 'Button',
  opponentPosition: 'Big blind',
  effectiveStackBb: 80,
  potBb: 20,
  heroCards: [{ rank: 14, suit: 'spades' }, { rank: 12, suit: 'hearts' }],
  board: [
    { rank: 14, suit: 'clubs' },
    { rank: 9, suit: 'diamonds' },
    { rank: 4, suit: 'spades' },
    { rank: 7, suit: 'hearts' },
    { rank: 2, suit: 'clubs' },
  ],
  opponentAction: 'Opponent bets half pot.',
  practicePacks: ['betting'],
  prompt: 'What is the best baseline?',
  choices: [
    { id: 'call', label: 'Call', grade: 'best', feedback: 'Top pair can call this price.' },
    { id: 'fold', label: 'Fold', grade: 'mistake', feedback: 'Folding is too tight.' },
  ],
  bestChoiceId: 'call',
  reasoning: 'The price and hand strength support a call.',
  takeaway: 'Compare price with realistic bluffs.',
};

describe('learning review queue', () => {
  it('deduplicates recurring misses while keeping the newest scenario snapshot', () => {
    const capture: LearningReviewCapture = {
      activityId: 'scenario-pack-betting',
      focusArea: 'calling',
      scenario,
      source: 'scenario',
    };
    const first = applyLearningReviewUpdate([], [capture], [], '2026-08-01T00:00:00.000Z');
    const second = applyLearningReviewUpdate(first, [{ ...capture, scenario: { ...scenario, potBb: 24 } }], [], '2026-08-02T00:00:00.000Z');

    expect(second).toHaveLength(1);
    expect(second[0]?.createdAt).toBe('2026-08-01T00:00:00.000Z');
    expect(second[0]?.source === 'scenario' ? second[0].scenario.potBb : null).toBe(24);
  });

  it('removes correct reviews and keeps misses for another session', () => {
    const firstCapture: LearningReviewCapture = {
      activityId: 'quiz-core-decisions',
      questionId: 'q1',
      source: 'trainer',
    };
    const secondCapture: LearningReviewCapture = {
      activityId: 'table-session',
      focusArea: 'draws',
      source: 'table',
    };
    const queue = applyLearningReviewUpdate([], [firstCapture, secondCapture], [], '2026-08-01T00:00:00.000Z');
    const next = applyLearningReviewUpdate(queue, [], [
      { correct: true, itemId: learningReviewItemId(firstCapture) },
      { correct: false, itemId: learningReviewItemId(secondCapture) },
    ], '2026-08-02T00:00:00.000Z');

    expect(next.map((item) => item.id)).toEqual([learningReviewItemId(secondCapture)]);
    expect(next[0]?.updatedAt).toBe('2026-08-02T00:00:00.000Z');
  });

  it('selects only the three oldest unresolved decisions', () => {
    const captures = Array.from({ length: 5 }, (_, index): LearningReviewCapture => ({
      activityId: 'quiz-core-decisions',
      questionId: `q${index}`,
      source: 'trainer',
    }));
    let queue = applyLearningReviewUpdate([], captures.slice(0, 2), [], '2026-08-01T00:00:00.000Z');
    queue = applyLearningReviewUpdate(queue, captures.slice(2), [], '2026-08-02T00:00:00.000Z');

    expect(selectDailyLearningReviewItems(queue).map((item) => item.id)).toEqual(
      captures.slice(0, 3).map(learningReviewItemId),
    );
  });
});
