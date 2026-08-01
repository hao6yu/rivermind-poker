import { shuffle, type RandomSource } from '../poker/cards';
import type { Card, Suit } from '../poker/types';
import type { TrainerDefinition } from './types';

const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

/**
 * Creates a fresh quiz session without changing the poker fact being taught.
 * One suit permutation per question preserves flush relationships and answer validity.
 */
export function randomizeTrainerSession(
  trainer: TrainerDefinition,
  random: RandomSource,
): TrainerDefinition {
  return {
    ...trainer,
    questions: shuffle(trainer.questions, random).map((question) => {
      const randomizedSuits = shuffle(suits, random);
      const suitMap = Object.fromEntries(suits.map((suit, index) => [suit, randomizedSuits[index]])) as Record<Suit, Suit>;
      const mapCard = (card: Card): Card => ({ ...card, suit: suitMap[card.suit] });
      return {
        ...question,
        heroCards: question.heroCards?.map(mapCard),
        board: question.board?.map(mapCard),
        choices: shuffle(question.choices, random),
      };
    }),
  };
}
