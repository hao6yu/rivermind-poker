import { describe, expect, it } from 'vitest';

import { percentageTrainer } from '../content';
import { randomizeTrainerSession } from '../randomizeTrainer';
import { cardKey, seededRandom } from '../../poker/cards';

describe('randomized trainer sessions', () => {
  it('changes question, choice, and suit presentation while preserving correct answers', () => {
    const first = randomizeTrainerSession(percentageTrainer, seededRandom(71));
    const second = randomizeTrainerSession(percentageTrainer, seededRandom(72));
    expect(first.questions.map((question) => question.id)).not.toEqual(second.questions.map((question) => question.id));
    expect(first.questions.map((question) => question.correctChoiceId).sort()).toEqual(
      second.questions.map((question) => question.correctChoiceId).sort(),
    );
    const firstCards = first.questions.flatMap((question) => [...(question.heroCards ?? []), ...(question.board ?? [])]).map(cardKey);
    const secondCards = second.questions.flatMap((question) => [...(question.heroCards ?? []), ...(question.board ?? [])]).map(cardKey);
    expect(firstCards).not.toEqual(secondCards);
  });
});
