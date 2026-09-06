import { describe, expect, it } from 'vitest';

import {
  BEGINNER_TUTORIAL_BIG_BLIND,
  BEGINNER_TUTORIAL_BIG_BLIND_CARDS,
  BEGINNER_TUTORIAL_BOARD,
  BEGINNER_TUTORIAL_DECK,
  BEGINNER_TUTORIAL_DEALER_SEAT,
  BEGINNER_TUTORIAL_HERO_CARDS,
  BEGINNER_TUTORIAL_POT_BY_STEP,
  BEGINNER_TUTORIAL_SMALL_BLIND,
  BEGINNER_TUTORIAL_SMALL_BLIND_CARDS,
  BEGINNER_TUTORIAL_STARTING_STACK,
  BEGINNER_TUTORIAL_STEP_IDS,
  FLOP_CALL_AMOUNT,
  FLOP_CALL_PRICE_PERCENT,
  FLOP_FINAL_POT,
  FLOP_FLUSH_DRAW_ONE_IN,
  FLOP_FLUSH_DRAW_PERCENT,
  FLOP_UNSEEN_CARDS,
  FLOP_UNSEEN_HEARTS,
  assertAuthoredCardsAreUnique,
  assertPotIsConserved,
  beginnerTutorialReducer,
  bestFiveForSeat,
  bestHandForSeat,
  initialBeginnerTutorialState,
  isInteractiveStep,
  isTutorialComplete,
  previousStepId,
  recommendedActionId,
  showdownRanking,
  stepOptions,
  tutorialHighlightTarget,
  tutorialTableView,
} from '../beginnerTutorial';
import { compareHandValues } from '../../poker/evaluator';

const cardKey = (card: { rank: number; suit: string }) => `${card.rank}:${card.suit}`;

/** Walks the entire authored hand through the reducer, tap by tap. */
function playThrough(): ReturnType<typeof initialBeginnerTutorialState>[] {
  const states: ReturnType<typeof initialBeginnerTutorialState>[] = [];
  let state = initialBeginnerTutorialState();
  for (let guard = 0; guard < 64 && state.stepId !== 'recap'; guard += 1) {
    const recommended = recommendedActionId(state.stepId);
    state = recommended
      ? beginnerTutorialReducer(state, { type: 'choose', actionId: recommended })
      : beginnerTutorialReducer(state, { type: 'advance' });
    states.push(state);
  }
  return states;
}

describe('beginner tutorial domain', () => {
  it('advances the full authored hand in order without UI, randomness, timers, or network', () => {
    const states = playThrough();
    expect(states.at(-1)?.stepId).toBe('recap');
    expect(states.map((state) => state.stepId)).toEqual([
      'seats-and-blinds',
      'seats-and-blinds',
      'seats-and-blinds',
      'hole-cards',
      'preflop-raise',
      'flop-reveal',
      'flop-decision',
      'turn-check',
      'river-value-bet',
      'showdown',
      'recap',
    ]);
    expect(isTutorialComplete(states.at(-1)!)).toBe(true);
  });

  it('cycles the seats-and-blinds focus through dealer, small blind, and big blind', () => {
    let state = initialBeginnerTutorialState('seats-and-blinds');
    expect(tutorialHighlightTarget(state)).toEqual({ kind: 'seat', seatId: BEGINNER_TUTORIAL_DEALER_SEAT });
    state = beginnerTutorialReducer(state, { type: 'advance' });
    expect(tutorialHighlightTarget(state)).toEqual({ kind: 'seat', seatId: 'small-blind' });
    state = beginnerTutorialReducer(state, { type: 'advance' });
    expect(tutorialHighlightTarget(state)).toEqual({ kind: 'seat', seatId: 'big-blind' });
    state = beginnerTutorialReducer(state, { type: 'advance' });
    expect(state.stepId).toBe('hole-cards');
  });

  it('keeps non-recommended choices failure-free with a retry hint and no branching', () => {
    let state = initialBeginnerTutorialState('preflop-raise');
    state = beginnerTutorialReducer(state, { type: 'choose', actionId: 'fold' });
    expect(state.stepId).toBe('preflop-raise');
    expect(state.declinedActionId).toBe('fold');
    // The retry hint clears and the recommended action advances.
    state = beginnerTutorialReducer(state, { type: 'retry' });
    expect(state.declinedActionId).toBeNull();
    state = beginnerTutorialReducer(state, { type: 'choose', actionId: 'raise' });
    expect(state.stepId).toBe('flop-reveal');
    // A non-recommended choice at the flop decision works the same way.
    state = initialBeginnerTutorialState('flop-decision');
    state = beginnerTutorialReducer(state, { type: 'choose', actionId: 'raise' });
    expect(state.declinedActionId).toBe('raise');
    expect(state.stepId).toBe('flop-decision');
    state = beginnerTutorialReducer(state, { type: 'choose', actionId: 'call' });
    expect(state.stepId).toBe('turn-check');
    expect(state.declinedActionId).toBeNull();
  });

  it('ignores unknown actions, advances on interactive steps, and extra taps at the recap', () => {
    const interactive = initialBeginnerTutorialState('preflop-raise');
    expect(beginnerTutorialReducer(interactive, { type: 'advance' })).toBe(interactive);
    expect(beginnerTutorialReducer(interactive, { type: 'choose', actionId: 'check' })).toBe(interactive);
    const recap = initialBeginnerTutorialState('recap');
    expect(beginnerTutorialReducer(recap, { type: 'advance' })).toBe(recap);
    expect(beginnerTutorialReducer(recap, { type: 'choose', actionId: 'bet' })).toBe(recap);
  });

  it('supports Back at every step and a full restart', () => {
    expect(previousStepId('welcome')).toBeNull();
    let state = initialBeginnerTutorialState('flop-decision');
    state = beginnerTutorialReducer(state, { type: 'back' });
    expect(state.stepId).toBe('flop-reveal');
    state = beginnerTutorialReducer(state, { type: 'back' });
    expect(state.stepId).toBe('preflop-raise');
    // Back into an interactive step resets its pending hint.
    state = beginnerTutorialReducer(state, { type: 'choose', actionId: 'fold' });
    state = beginnerTutorialReducer(state, { type: 'back' });
    expect(state.stepId).toBe('hole-cards');
    expect(state.declinedActionId).toBeNull();
    state = beginnerTutorialReducer(state, { type: 'back' });
    expect(state.stepId).toBe('seats-and-blinds');
    state = beginnerTutorialReducer(state, { type: 'back' });
    expect(state.stepId).toBe('welcome');
    // Restart from anywhere lands back on the welcome step.
    const midTutorial = initialBeginnerTutorialState('river-value-bet');
    expect(beginnerTutorialReducer(midTutorial, { type: 'restart' })).toEqual(initialBeginnerTutorialState());
  });

  it('authored cards are unique across both hole-card pairs and the board', () => {
    expect(BEGINNER_TUTORIAL_DECK).toHaveLength(11);
    expect(assertAuthoredCardsAreUnique()).toBe(true);
    expect(BEGINNER_TUTORIAL_HERO_CARDS).toEqual([
      { rank: 14, suit: 'hearts' },
      { rank: 12, suit: 'hearts' },
    ]);
    expect(BEGINNER_TUTORIAL_BIG_BLIND_CARDS).toEqual([
      { rank: 13, suit: 'clubs' },
      { rank: 11, suit: 'clubs' },
    ]);
  });

  it('follows the authored chip script with balanced pots at every step', () => {
    expect(BEGINNER_TUTORIAL_STARTING_STACK).toBe(100);
    expect(BEGINNER_TUTORIAL_SMALL_BLIND).toBe(1);
    expect(BEGINNER_TUTORIAL_BIG_BLIND).toBe(2);
    expect(BEGINNER_TUTORIAL_POT_BY_STEP['seats-and-blinds']).toBe(3);
    expect(BEGINNER_TUTORIAL_POT_BY_STEP['flop-reveal']).toBe(11);
    expect(BEGINNER_TUTORIAL_POT_BY_STEP['turn-check']).toBe(15);
    expect(BEGINNER_TUTORIAL_POT_BY_STEP.showdown).toBe(25);
    expect(BEGINNER_TUTORIAL_POT_BY_STEP.recap).toBe(25);
    expect(assertPotIsConserved()).toBe(true);
  });

  it('shows no cards before the Deal step and correct visibility at every step (finding #17)', () => {
    for (const stepId of BEGINNER_TUTORIAL_STEP_IDS) {
      const view = tutorialTableView(stepId);
      const beforeDeal = stepId === 'welcome' || stepId === 'seats-and-blinds';
      if (beforeDeal) {
        // Empty card slots everywhere before the Deal step.
        for (const seat of view.seats) {
          expect(seat.cards, `${stepId}/${seat.seatId} cards before deal`).toEqual([]);
          expect(seat.cardsRevealed, `${stepId}/${seat.seatId} revealed before deal`).toBe(false);
        }
      } else {
        const hero = view.seats.find((seat) => seat.seatId === 'hero');
        expect(hero?.cards.length, `${stepId}/hero dealt`).toBe(2);
        expect(hero?.cardsRevealed, `${stepId}/hero sees own cards`).toBe(true);
        const smallBlind = view.seats.find((seat) => seat.seatId === 'small-blind');
        expect(smallBlind?.cards.length, `${stepId}/small blind dealt face-down`).toBe(2);
        expect(smallBlind?.cardsRevealed).toBe(false);
        const bigBlind = view.seats.find((seat) => seat.seatId === 'big-blind');
        expect(bigBlind?.cardsRevealed, `${stepId}/big blind reveals at showdown`).toBe(stepId === 'showdown' || stepId === 'recap');
      }
    }
  });

  it('reveals the board across the flop, turn, and river in authored order', () => {
    expect(tutorialTableView('preflop-raise').board).toHaveLength(0);
    expect(tutorialTableView('flop-decision').board.map((card) => `${card.rank}${card.suit}`)).toEqual([
      '11hearts',
      '7hearts',
      '2clubs',
    ]);
    expect(tutorialTableView('turn-check').board).toHaveLength(4);
    expect(tutorialTableView('turn-check').board.at(-1)).toEqual({ rank: 4, suit: 'spades' });
    expect(tutorialTableView('showdown').board).toEqual(BEGINNER_TUTORIAL_BOARD);
    expect(tutorialTableView('showdown').board.at(-1)).toEqual({ rank: 13, suit: 'hearts' });
  });

  it('keeps street order monotonic and seat states consistent with the script', () => {
    const streetOrder = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    let lastIndex = -1;
    for (const stepId of BEGINNER_TUTORIAL_STEP_IDS) {
      const view = tutorialTableView(stepId);
      const streetIndex = streetOrderIndex(streetOrder, view.street);
      expect(streetIndex).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = streetIndex;
    }
    // Hole cards: only the hero is revealed until the showdown.
    expect(tutorialTableView('hole-cards').seats.map((seat) => seat.cardsRevealed)).toEqual([true, false, false]);
    expect(tutorialTableView('river-value-bet').seats.map((seat) => seat.cardsRevealed)).toEqual([true, false, false]);
    expect(tutorialTableView('showdown').seats.map((seat) => seat.cardsRevealed)).toEqual([true, false, true]);
    // The small blind's fold is visible from the flop on; nobody else folds.
    for (const stepId of BEGINNER_TUTORIAL_STEP_IDS) {
      const folded = tutorialTableView(stepId).seats.map((seat) => seat.folded);
      if (stepId === 'welcome' || stepId === 'seats-and-blinds' || stepId === 'hole-cards' || stepId === 'preflop-raise') {
        expect(folded, stepId).toEqual([false, false, false]);
      } else {
        expect(folded, stepId).toEqual([false, true, false]);
      }
    }
    // Dealer button and blind badges.
    const seats = tutorialTableView('seats-and-blinds').seats;
    expect(seats.find((seat) => seat.hasDealerButton)?.seatId).toBe('hero');
    expect(seats.find((seat) => seat.blind === 'small')?.seatId).toBe('small-blind');
    expect(seats.find((seat) => seat.blind === 'big')?.seatId).toBe('big-blind');
    // The big blind's flop bet waits in front of the seat while the hero decides.
    expect(tutorialTableView('flop-decision').seats.find((seat) => seat.seatId === 'big-blind')?.streetBet).toBe(2);
    expect(tutorialTableView('flop-decision').pot).toBe(11);
    expect(tutorialTableView('turn-check').pot).toBe(15);
    expect(tutorialTableView('turn-check').seats.every((seat) => seat.streetBet === 0)).toBe(true);
  });

  it('evaluates the authored showdown as ace-high flush over two pair, kings and jacks', () => {
    const hero = bestHandForSeat('hero');
    const bigBlind = bestHandForSeat('big-blind');
    expect(hero.category).toBe(5);
    expect(hero.name).toBe('Flush');
    expect(bigBlind.category).toBe(2);
    expect(bigBlind.name).toBe('Two pair');
    expect(compareHandValues(hero, bigBlind)).toBeGreaterThan(0);
    const ranking = showdownRanking();
    expect(ranking.map((entry) => entry.seatId)).toEqual(['hero', 'big-blind']);
    // The small blind folded and is excluded from the showdown ranking.
    expect(ranking).toHaveLength(2);
  });

  it('highlights each winner best-five set at the showdown', () => {
    // Membership is what the showdown highlight needs; order is visit order.
    const sorted = (cards: readonly { rank: number; suit: string }[]) =>
      cards.map((card) => `${card.rank}${card.suit}`).sort();
    expect(sorted(bestFiveForSeat('hero'))).toEqual(
      ['14hearts', '12hearts', '13hearts', '11hearts', '7hearts'].sort(),
    );
    expect(sorted(bestFiveForSeat('big-blind'))).toEqual(
      ['13clubs', '13hearts', '11clubs', '11hearts', '7hearts'].sort(),
    );
  });

  it('pins the flop probability explanation: nine hearts in 47 unseen cards ≈ 19% ≈ 1 in 5', () => {
    const visibleHearts = [
      ...BEGINNER_TUTORIAL_HERO_CARDS,
      ...BEGINNER_TUTORIAL_BOARD.slice(0, 3),
    ].filter((card) => card.suit === 'hearts').length;
    expect(visibleHearts).toBe(4);
    expect(13 - visibleHearts).toBe(FLOP_UNSEEN_HEARTS);
    expect(52 - 2 - 3).toBe(FLOP_UNSEEN_CARDS);
    expect(Math.round((FLOP_UNSEEN_HEARTS / FLOP_UNSEEN_CARDS) * 100)).toBe(FLOP_FLUSH_DRAW_PERCENT);
    expect(Math.round(FLOP_UNSEEN_CARDS / FLOP_UNSEEN_HEARTS)).toBe(FLOP_FLUSH_DRAW_ONE_IN);
    // The optional math detail's price comparison: 2 into 15 ≈ 13%.
    expect(FLOP_CALL_AMOUNT).toBe(2);
    expect(FLOP_FINAL_POT).toBe(15);
    expect(Math.round((FLOP_CALL_AMOUNT / FLOP_FINAL_POT) * 100)).toBe(FLOP_CALL_PRICE_PERCENT);
  });

  it('exposes exactly the authored interactive steps and their recommended actions', () => {
    const interactive = BEGINNER_TUTORIAL_STEP_IDS.filter(isInteractiveStep);
    expect(interactive).toEqual(['preflop-raise', 'flop-decision', 'turn-check', 'river-value-bet']);
    expect(recommendedActionId('preflop-raise')).toBe('raise');
    expect(recommendedActionId('flop-decision')).toBe('call');
    expect(recommendedActionId('turn-check')).toBe('check');
    expect(recommendedActionId('river-value-bet')).toBe('bet');
    expect(stepOptions('preflop-raise').map((option) => option.id)).toEqual(['raise', 'call', 'fold']);
    expect(stepOptions('flop-decision').map((option) => option.id)).toEqual(['call', 'fold', 'raise']);
    expect(stepOptions('river-value-bet').map((option) => option.id)).toEqual(['bet', 'check']);
    // Only the recommended action carries the authored raise-to/bet amounts.
    expect(stepOptions('preflop-raise').find((option) => option.id === 'raise')?.amount).toBe(5);
    expect(stepOptions('river-value-bet').find((option) => option.id === 'bet')?.amount).toBe(5);
  });

  it('derives every highlight target from the step without storing UI state', () => {
    expect(tutorialHighlightTarget(initialBeginnerTutorialState('welcome'))).toBeNull();
    expect(tutorialHighlightTarget(initialBeginnerTutorialState('hole-cards'))).toEqual({ kind: 'hole-cards', seatId: 'hero' });
    expect(tutorialHighlightTarget(initialBeginnerTutorialState('flop-reveal'))).toEqual({ kind: 'board' });
    expect(tutorialHighlightTarget(initialBeginnerTutorialState('flop-decision'))).toEqual({ kind: 'action', seatId: 'hero' });
    expect(tutorialHighlightTarget(initialBeginnerTutorialState('showdown'))).toEqual({ kind: 'hole-cards', seatId: 'big-blind' });
    expect(tutorialHighlightTarget(initialBeginnerTutorialState('recap'))).toBeNull();
  });

  it('uses the small blind only to keep the deck unique and hidden', () => {
    // The small blind never reveals cards and never reaches a showdown.
    const view = tutorialTableView('showdown');
    const smallBlind = view.seats.find((seat) => seat.seatId === 'small-blind');
    expect(smallBlind?.cardsRevealed).toBe(false);
    expect(smallBlind?.folded).toBe(true);
    // The authored small-blind cards must not collide with any revealed card.
    const revealedKeys = new Set([
      ...BEGINNER_TUTORIAL_HERO_CARDS,
      ...BEGINNER_TUTORIAL_BIG_BLIND_CARDS,
      ...BEGINNER_TUTORIAL_BOARD,
    ].map((card) => `${card.rank}:${card.suit}`));
    for (const card of BEGINNER_TUTORIAL_SMALL_BLIND_CARDS) {
      expect(revealedKeys.has(`${card.rank}:${card.suit}`)).toBe(false);
    }
  });
});

function streetOrderIndex(order: readonly string[], street: string): number {
  const index = order.indexOf(street);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}
