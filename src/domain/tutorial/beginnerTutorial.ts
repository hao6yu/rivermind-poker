import { compareHandValues, evaluateBest, type HandValue } from '../poker/evaluator';
import type { Card, Rank, Suit } from '../poker/types';

/**
 * The scripted beginner tutorial ("Your first poker hand") — a deterministic,
 * fully authored three-player teaching hand per
 * docs/BEGINNER_TUTORIAL_IMPLEMENTATION_PLAN.md.
 *
 * This module is the single source of truth for the tutorial's stable step
 * ids, authored cards, chip script, allowed/recommended actions, the pure
 * reducer, and the table-state selectors the UI renders from. It is pure
 * data and functions: no randomness, no timers, no storage, no network, and
 * no imports from the real game loop, AI policy, or any service. The UI
 * derives the entire table from the current step; progress persistence stores
 * only a step id (see src/services/beginnerTutorial.ts).
 */

export type BeginnerTutorialSeatId = 'hero' | 'small-blind' | 'big-blind';

export type BeginnerTutorialStepId =
  | 'welcome'
  | 'seats-and-blinds'
  | 'hole-cards'
  | 'preflop-raise'
  | 'flop-reveal'
  | 'flop-decision'
  | 'turn-check'
  | 'river-value-bet'
  | 'showdown'
  | 'recap';

export type TutorialActionId = 'fold' | 'check' | 'call' | 'bet' | 'raise';

/** Ordered steps; the index is also the Back-navigation order. */
export const BEGINNER_TUTORIAL_STEP_IDS = [
  'welcome',
  'seats-and-blinds',
  'hole-cards',
  'preflop-raise',
  'flop-reveal',
  'flop-decision',
  'turn-check',
  'river-value-bet',
  'showdown',
  'recap',
] as const satisfies readonly BeginnerTutorialStepId[];

export const BEGINNER_TUTORIAL_STEP_COUNT = BEGINNER_TUTORIAL_STEP_IDS.length;

const STEP_INDEX: Record<BeginnerTutorialStepId, number> = Object.fromEntries(
  BEGINNER_TUTORIAL_STEP_IDS.map((stepId, index) => [stepId, index]),
) as Record<BeginnerTutorialStepId, number>;

// ---------------------------------------------------------------------------
// Authored hand (docs plan §4 chip script)
// ---------------------------------------------------------------------------

export const BEGINNER_TUTORIAL_STARTING_STACK = 100;
export const BEGINNER_TUTORIAL_SMALL_BLIND = 1;
export const BEGINNER_TUTORIAL_BIG_BLIND = 2;

/** The hero's authored hole cards: A♥ Q♥ (suited high cards — a sensible raise). */
export const BEGINNER_TUTORIAL_HERO_CARDS: readonly Card[] = [
  { rank: 14, suit: 'hearts' },
  { rank: 12, suit: 'hearts' },
];

/**
 * The small blind folds preflop and is never revealed; the two authored cards
 * simply keep the deck unique. Face-down during the whole hand.
 */
export const BEGINNER_TUTORIAL_SMALL_BLIND_CARDS: readonly Card[] = [
  { rank: 9, suit: 'diamonds' },
  { rank: 6, suit: 'spades' },
];

/** The big blind's authored hole cards, revealed at showdown: K♣ J♣ (two pair). */
export const BEGINNER_TUTORIAL_BIG_BLIND_CARDS: readonly Card[] = [
  { rank: 13, suit: 'clubs' },
  { rank: 11, suit: 'clubs' },
];

/** Community cards in reveal order; each street accumulates from the flop. */
export const BEGINNER_TUTORIAL_BOARD: readonly Card[] = [
  { rank: 11, suit: 'hearts' },
  { rank: 7, suit: 'hearts' },
  { rank: 2, suit: 'clubs' },
  { rank: 4, suit: 'spades' },
  { rank: 13, suit: 'hearts' },
];

/** Every card the authored hand uses, in one place for the uniqueness gate. */
export const BEGINNER_TUTORIAL_DECK: readonly Card[] = [
  ...BEGINNER_TUTORIAL_HERO_CARDS,
  ...BEGINNER_TUTORIAL_SMALL_BLIND_CARDS,
  ...BEGINNER_TUTORIAL_BIG_BLIND_CARDS,
  ...BEGINNER_TUTORIAL_BOARD,
];

/** Authored pot totals after each step's completed action sequence. */
export const BEGINNER_TUTORIAL_POT_BY_STEP: Record<BeginnerTutorialStepId, number> = {
  welcome: 0,
  // The blinds are posted during the seats step and stay in the pot.
  'seats-and-blinds': 3,
  'hole-cards': 3,
  // Hero is still to act; the pot holds only the blinds.
  'preflop-raise': 3,
  // Hero raised to 5, small blind folded (dead 1), big blind called to 5.
  'flop-reveal': 11,
  // The big blind's 2 flop bet is pending; the pot still shows 11.
  'flop-decision': 11,
  // Hero called 2; bets collected before the turn.
  'turn-check': 15,
  // Turn checks add nothing; the river bet is still pending.
  'river-value-bet': 15,
  // Hero bet 5, big blind called 5.
  showdown: 25,
  recap: 25,
};

/**
 * Street contribution shown at each seat for the current step (chips in front
 * of a player that are not yet collected into the pot). The blinds go straight
 * into the pot ("the pot receiving the blind chips"); only the big blind's
 * flop bet sits out in front while the hero decides.
 */
const STREET_BETS_BY_STEP: Record<BeginnerTutorialStepId, Record<BeginnerTutorialSeatId, number>> = {
  welcome: { hero: 0, 'small-blind': 0, 'big-blind': 0 },
  'seats-and-blinds': { hero: 0, 'small-blind': 0, 'big-blind': 0 },
  'hole-cards': { hero: 0, 'small-blind': 0, 'big-blind': 0 },
  'preflop-raise': { hero: 0, 'small-blind': 0, 'big-blind': 0 },
  'flop-reveal': { hero: 0, 'small-blind': 0, 'big-blind': 2 },
  'flop-decision': { hero: 0, 'small-blind': 0, 'big-blind': 2 },
  'turn-check': { hero: 0, 'small-blind': 0, 'big-blind': 0 },
  'river-value-bet': { hero: 0, 'small-blind': 0, 'big-blind': 0 },
  showdown: { hero: 0, 'small-blind': 0, 'big-blind': 0 },
  recap: { hero: 0, 'small-blind': 0, 'big-blind': 0 },
};

/**
 * Total committed chips per seat for the current step (including dead blind
 * money), the value the UI's per-seat committed copy derives from.
 */
const TOTAL_COMMITTED_BY_STEP: Record<BeginnerTutorialStepId, Record<BeginnerTutorialSeatId, number>> = {
  welcome: { hero: 0, 'small-blind': 0, 'big-blind': 0 },
  'seats-and-blinds': { hero: 0, 'small-blind': 1, 'big-blind': 2 },
  'hole-cards': { hero: 0, 'small-blind': 1, 'big-blind': 2 },
  'preflop-raise': { hero: 0, 'small-blind': 1, 'big-blind': 2 },
  // Hero 5, small blind's dead 1, big blind called to 5 — plus the big
  // blind's 2 flop bet waiting in front of the seat (7 committed).
  'flop-reveal': { hero: 5, 'small-blind': 1, 'big-blind': 7 },
  'flop-decision': { hero: 5, 'small-blind': 1, 'big-blind': 7 },
  // Flop bets collected: hero 7, big blind 7, small blind's dead 1.
  'turn-check': { hero: 7, 'small-blind': 1, 'big-blind': 7 },
  'river-value-bet': { hero: 7, 'small-blind': 1, 'big-blind': 7 },
  // River: hero 12, big blind 12, small blind's dead 1 → pot 25.
  showdown: { hero: 12, 'small-blind': 1, 'big-blind': 12 },
  recap: { hero: 12, 'small-blind': 1, 'big-blind': 12 },
};

/** Seats that have folded by the current step (only the small blind ever folds). */
const FOLDED_BY_STEP = Object.fromEntries(
  BEGINNER_TUTORIAL_STEP_IDS.map((stepId) => [
    stepId,
    new Set<BeginnerTutorialSeatId>(
      STEP_INDEX[stepId] >= STEP_INDEX['flop-reveal'] ? ['small-blind' as const] : [],
    ),
  ]),
) as unknown as Record<BeginnerTutorialStepId, ReadonlySet<BeginnerTutorialSeatId>>;

/** Authored last action badge per seat per step, shown after the action lands. */
const LAST_ACTION_BY_STEP: Record<BeginnerTutorialStepId, Partial<Record<BeginnerTutorialSeatId, TutorialActionId>>> = {
  welcome: {},
  'seats-and-blinds': {},
  'hole-cards': {},
  'preflop-raise': {},
  'flop-reveal': { hero: 'raise', 'small-blind': 'fold', 'big-blind': 'call' },
  'flop-decision': { hero: 'raise', 'small-blind': 'fold', 'big-blind': 'bet' },
  'turn-check': { hero: 'call', 'small-blind': 'fold', 'big-blind': 'bet' },
  'river-value-bet': { hero: 'check', 'small-blind': 'fold', 'big-blind': 'check' },
  showdown: { hero: 'bet', 'small-blind': 'fold', 'big-blind': 'call' },
  recap: { hero: 'bet', 'small-blind': 'fold', 'big-blind': 'call' },
};

/** The dealer button sits in front of the hero (the plan's three visible roles). */
export const BEGINNER_TUTORIAL_DEALER_SEAT: BeginnerTutorialSeatId = 'hero';

// ---------------------------------------------------------------------------
// Steps, actions, and the interactive surface
// ---------------------------------------------------------------------------

export interface TutorialActionOption {
  id: TutorialActionId;
  /** Whether this is the authored story's recommended action. */
  recommended: boolean;
  /**
   * Chip amount shown on the action (raise-to or bet amount). Call amounts
   * come from the pending bet the table already shows.
   */
  amount?: number;
}

/**
 * Interactive steps and their authored options, in display order. Every other
 * step is guided (single Continue tap). The authored story never branches:
 * a non-recommended choice opens supportive copy and the recommended action.
 */
const OPTIONS_BY_STEP: Partial<Record<BeginnerTutorialStepId, readonly TutorialActionOption[]>> = {
  'preflop-raise': [
    { id: 'raise', recommended: true, amount: 5 },
    { id: 'call', recommended: false },
    { id: 'fold', recommended: false },
  ],
  'flop-decision': [
    { id: 'call', recommended: true },
    { id: 'fold', recommended: false },
    { id: 'raise', recommended: false, amount: 8 },
  ],
  'turn-check': [
    { id: 'check', recommended: true },
    { id: 'bet', recommended: false, amount: 3 },
  ],
  'river-value-bet': [
    { id: 'bet', recommended: true, amount: 5 },
    { id: 'check', recommended: false },
  ],
};

export function isInteractiveStep(stepId: BeginnerTutorialStepId): boolean {
  return OPTIONS_BY_STEP[stepId] !== undefined;
}

export function stepOptions(stepId: BeginnerTutorialStepId): readonly TutorialActionOption[] {
  return OPTIONS_BY_STEP[stepId] ?? [];
}

export function recommendedActionId(stepId: BeginnerTutorialStepId): TutorialActionId | null {
  return stepOptions(stepId).find((option) => option.recommended)?.id ?? null;
}

/** The step that follows, or null at the recap (the tutorial is complete). */
export function nextStepId(stepId: BeginnerTutorialStepId): BeginnerTutorialStepId | null {
  const index = STEP_INDEX[stepId];
  return BEGINNER_TUTORIAL_STEP_IDS[index + 1] ?? null;
}

/** The step that Back returns to, or null at the welcome step. */
export function previousStepId(stepId: BeginnerTutorialStepId): BeginnerTutorialStepId | null {
  if (stepId === 'welcome') return null;
  return BEGINNER_TUTORIAL_STEP_IDS[STEP_INDEX[stepId] - 1] ?? 'welcome';
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * The seats-and-blinds step highlights Dealer → Small blind → Big blind in
 * sequence (plan §4 step 2); the third Continue moves on. The focus index is
 * presentation pacing, not persisted progress: resume lands at the dealer.
 */
export const SEATS_FOCUS_SEQUENCE = ['dealer', 'small-blind', 'big-blind'] as const;
export type SeatsFocusTarget = 'dealer' | 'small-blind' | 'big-blind';

export interface BeginnerTutorialState {
  readonly stepId: BeginnerTutorialStepId;
  readonly seatsFocusIndex: number;
  /** The non-recommended action the player just tried, for the retry hint. */
  readonly declinedActionId: TutorialActionId | null;
}

export type BeginnerTutorialEvent =
  | { type: 'advance' }
  | { type: 'choose'; actionId: TutorialActionId }
  | { type: 'retry' }
  | { type: 'back' }
  | { type: 'restart' };

export function initialBeginnerTutorialState(
  stepId: BeginnerTutorialStepId = 'welcome',
): BeginnerTutorialState {
  return { stepId, seatsFocusIndex: 0, declinedActionId: null };
}

/**
 * Pure tutorial reducer. Advancing past an interactive step requires the
 * recommended action (a non-recommended choice is never a failure — it opens
 * the retry hint and the step stays put). Taps are idempotent: an unknown
 * action or an advance on an interactive step returns the state unchanged.
 */
export function beginnerTutorialReducer(
  state: BeginnerTutorialState,
  event: BeginnerTutorialEvent,
): BeginnerTutorialState {
  switch (event.type) {
    case 'restart':
      return initialBeginnerTutorialState();
    case 'back': {
      const previous = previousStepId(state.stepId);
      if (!previous) return state;
      return { ...state, stepId: previous, seatsFocusIndex: 0, declinedActionId: null };
    }
    case 'retry':
      return state.declinedActionId === null ? state : { ...state, declinedActionId: null };
    case 'advance': {
      if (isInteractiveStep(state.stepId)) return state;
      if (state.stepId === 'seats-and-blinds') {
        const nextIndex = state.seatsFocusIndex + 1;
        if (nextIndex < SEATS_FOCUS_SEQUENCE.length) {
          return { ...state, seatsFocusIndex: nextIndex };
        }
        return { ...state, stepId: 'hole-cards', seatsFocusIndex: 0 };
      }
      const next = nextStepId(state.stepId);
      return next ? { ...state, stepId: next, declinedActionId: null } : state;
    }
    case 'choose': {
      const options = stepOptions(state.stepId);
      const chosen = options.find((option) => option.id === event.actionId);
      if (!chosen) return state;
      if (!chosen.recommended) {
        // Supportive retry, never a failure state: same step, hint recorded.
        return { ...state, declinedActionId: chosen.id };
      }
      const next = nextStepId(state.stepId);
      return next
        ? { ...state, stepId: next, declinedActionId: null }
        : state;
    }
    default:
      return state;
  }
}

/** True once the reducer has reached the recap (the completion point). */
export function isTutorialComplete(state: BeginnerTutorialState): boolean {
  return state.stepId === 'recap';
}

// ---------------------------------------------------------------------------
// Table-state selectors (the UI derives everything from the step)
// ---------------------------------------------------------------------------

export interface BeginnerTutorialSeatView {
  readonly seatId: BeginnerTutorialSeatId;
  readonly cards: readonly Card[];
  /** Hole cards shown face up to the player (hero always; big blind at showdown). */
  readonly cardsRevealed: boolean;
  readonly folded: boolean;
  /** Chips in front of the seat that are not yet collected. */
  readonly streetBet: number;
  /** Total chips the seat has put in this hand (includes dead blind money). */
  readonly totalCommitted: number;
  readonly hasDealerButton: boolean;
  readonly blind: 'small' | 'big' | null;
  readonly lastAction: TutorialActionId | null;
  readonly stack: number;
}

export type TutorialStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface BeginnerTutorialTableView {
  readonly stepId: BeginnerTutorialStepId;
  readonly board: readonly Card[];
  readonly pot: number;
  readonly street: TutorialStreet;
  readonly seats: readonly BeginnerTutorialSeatView[];
}

const STREET_BY_STEP: Record<BeginnerTutorialStepId, TutorialStreet> = {
  welcome: 'preflop',
  'seats-and-blinds': 'preflop',
  'hole-cards': 'preflop',
  'preflop-raise': 'preflop',
  'flop-reveal': 'flop',
  'flop-decision': 'flop',
  'turn-check': 'turn',
  'river-value-bet': 'river',
  showdown: 'showdown',
  recap: 'showdown',
};

const BOARD_COUNT_BY_STEP: Record<BeginnerTutorialStepId, number> = {
  welcome: 0,
  'seats-and-blinds': 0,
  'hole-cards': 0,
  'preflop-raise': 0,
  'flop-reveal': 3,
  'flop-decision': 3,
  'turn-check': 4,
  'river-value-bet': 5,
  showdown: 5,
  recap: 5,
};

function revealedSeats(stepId: BeginnerTutorialStepId): ReadonlySet<BeginnerTutorialSeatId> {
  // Review finding #17: no card exists before the Deal step. The hero's two
  // cards appear only from the hole-cards step on; the big blind reveals at
  // showdown; the small blind is never revealed.
  const seats = new Set<BeginnerTutorialSeatId>();
  if (STEP_INDEX[stepId] >= STEP_INDEX['hole-cards']) seats.add('hero');
  if (STEP_INDEX[stepId] >= STEP_INDEX.showdown) seats.add('big-blind');
  return seats;
}

const SEAT_ORDER: readonly BeginnerTutorialSeatId[] = ['hero', 'small-blind', 'big-blind'];

const SEAT_CARDS: Record<BeginnerTutorialSeatId, readonly Card[]> = {
  hero: BEGINNER_TUTORIAL_HERO_CARDS,
  'small-blind': BEGINNER_TUTORIAL_SMALL_BLIND_CARDS,
  'big-blind': BEGINNER_TUTORIAL_BIG_BLIND_CARDS,
};

/** Remaining stack per seat per step, derived from the authored chip script. */
const STACK_BY_STEP: Record<BeginnerTutorialStepId, Record<BeginnerTutorialSeatId, number>> = {
  welcome: { hero: 100, 'small-blind': 100, 'big-blind': 100 },
  'seats-and-blinds': { hero: 100, 'small-blind': 99, 'big-blind': 98 },
  'hole-cards': { hero: 100, 'small-blind': 99, 'big-blind': 98 },
  'preflop-raise': { hero: 100, 'small-blind': 99, 'big-blind': 98 },
  'flop-reveal': { hero: 95, 'small-blind': 99, 'big-blind': 93 },
  'flop-decision': { hero: 95, 'small-blind': 99, 'big-blind': 93 },
  'turn-check': { hero: 93, 'small-blind': 99, 'big-blind': 93 },
  'river-value-bet': { hero: 93, 'small-blind': 99, 'big-blind': 93 },
  showdown: { hero: 88, 'small-blind': 99, 'big-blind': 88 },
  recap: { hero: 88, 'small-blind': 99, 'big-blind': 88 },
};

/** Derives the whole visible table from the step. No stored table state exists. */
export function tutorialTableView(stepId: BeginnerTutorialStepId): BeginnerTutorialTableView {
  const revealed = revealedSeats(stepId);
  const folded = FOLDED_BY_STEP[stepId];
  const streetBets = STREET_BETS_BY_STEP[stepId];
  const committed = TOTAL_COMMITTED_BY_STEP[stepId];
  const lastActions = LAST_ACTION_BY_STEP[stepId];
  const stacks = STACK_BY_STEP[stepId];
  return {
    stepId,
    board: BEGINNER_TUTORIAL_BOARD.slice(0, BOARD_COUNT_BY_STEP[stepId]),
    pot: BEGINNER_TUTORIAL_POT_BY_STEP[stepId],
    street: STREET_BY_STEP[stepId],
    seats: SEAT_ORDER.map((seatId) => ({
      seatId,
      // No cards exist before the Deal step (finding #17): the welcome and
      // seats steps render empty card slots, and face-down backs appear from
      // the Deal step on.
      cards: STEP_INDEX[stepId] >= STEP_INDEX['hole-cards'] ? SEAT_CARDS[seatId] : [],
      cardsRevealed: revealed.has(seatId),
      folded: folded.has(seatId),
      streetBet: streetBets[seatId],
      totalCommitted: committed[seatId],
      hasDealerButton: seatId === BEGINNER_TUTORIAL_DEALER_SEAT,
      blind: seatId === 'small-blind' ? 'small' : seatId === 'big-blind' ? 'big' : null,
      lastAction: lastActions[seatId] ?? null,
      stack: stacks[seatId],
    })),
  };
}

export type TutorialHighlightTarget =
  | { kind: 'seat'; seatId: BeginnerTutorialSeatId }
  | { kind: 'pot' }
  | { kind: 'hole-cards'; seatId: BeginnerTutorialSeatId }
  | { kind: 'board' }
  | { kind: 'action'; seatId: BeginnerTutorialSeatId }
  | null;

/**
 * The teaching target the current step (and, within the seats step, the
 * current focus) highlights. Never color alone: the UI renders the highlight
 * together with the coach copy naming the target.
 */
export function tutorialHighlightTarget(state: BeginnerTutorialState): TutorialHighlightTarget {
  switch (state.stepId) {
    case 'welcome':
      return null;
    case 'seats-and-blinds': {
      const target = SEATS_FOCUS_SEQUENCE[state.seatsFocusIndex] ?? 'dealer';
      return { kind: 'seat', seatId: target === 'dealer' ? BEGINNER_TUTORIAL_DEALER_SEAT : target };
    }
    case 'hole-cards':
      return { kind: 'hole-cards', seatId: 'hero' };
    case 'preflop-raise':
      return { kind: 'action', seatId: 'hero' };
    case 'flop-reveal':
      return { kind: 'board' };
    case 'flop-decision':
      return { kind: 'action', seatId: 'hero' };
    case 'turn-check':
      return { kind: 'board' };
    case 'river-value-bet':
      return { kind: 'action', seatId: 'hero' };
    case 'showdown':
      return { kind: 'hole-cards', seatId: 'big-blind' };
    case 'recap':
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Authored facts the copy and tests rely on
// ---------------------------------------------------------------------------

/** Hearts still unseen when the flop decision is made (4 hearts are visible). */
export const FLOP_UNSEEN_HEARTS = 9;
/** Unseen cards after the hero's two plus the three flop cards. */
export const FLOP_UNSEEN_CARDS = 47;
/** Rounded percentage pinned by the plan: 9 / 47 ≈ 19%. */
export const FLOP_FLUSH_DRAW_PERCENT = 19;
/** Plain-language rounding of the same chance: about 1 in 5. */
export const FLOP_FLUSH_DRAW_ONE_IN = 5;
/** Calling 2 to contest the 15-chip final pot: 2 / 15 ≈ 13%. */
export const FLOP_CALL_PRICE_PERCENT = 13;
/** Chip amounts the optional math explanation quotes. */
export const FLOP_CALL_AMOUNT = 2;
export const FLOP_FINAL_POT = 15;

/** Best five-card value for a seat from its hole cards plus the full board. */
export function bestHandForSeat(seatId: BeginnerTutorialSeatId): HandValue {
  const cards: readonly Card[] = seatId === 'hero'
    ? BEGINNER_TUTORIAL_HERO_CARDS
    : seatId === 'big-blind'
      ? BEGINNER_TUTORIAL_BIG_BLIND_CARDS
      : BEGINNER_TUTORIAL_SMALL_BLIND_CARDS;
  return evaluateBest([...cards, ...BEGINNER_TUTORIAL_BOARD]);
}

/** The showdown's ranked seat order (hero's flush beats the big blind's two pair). */
export function showdownRanking(): readonly { seatId: BeginnerTutorialSeatId; hand: HandValue }[] {
  const ranked = SEAT_ORDER
    .filter((seatId) => !FOLDED_BY_STEP.showdown.has(seatId))
    .map((seatId) => ({ seatId, hand: bestHandForSeat(seatId) }));
  ranked.sort((a, b) => compareHandValues(b.hand, a.hand));
  return ranked;
}

/** Best-five cards for a seat (the showdown highlight derives from this). */
export function bestFiveForSeat(seatId: BeginnerTutorialSeatId): readonly Card[] {
  const cards: readonly Card[] = seatId === 'hero'
    ? BEGINNER_TUTORIAL_HERO_CARDS
    : seatId === 'big-blind'
      ? BEGINNER_TUTORIAL_BIG_BLIND_CARDS
      : BEGINNER_TUTORIAL_SMALL_BLIND_CARDS;
  const all = [...cards, ...BEGINNER_TUTORIAL_BOARD];
  let best: readonly Card[] = all.slice(0, 5);
  let bestValue: HandValue | null = null;
  for (const group of combinationsOfFive(all)) {
    const value = evaluateBest(group);
    if (bestValue === null || compareHandValues(value, bestValue) > 0) {
      bestValue = value;
      best = group;
    }
  }
  return best;
}

function combinationsOfFive(cards: readonly Card[]): readonly (readonly Card[])[] {
  const results: Card[][] = [];
  const visit = (start: number, current: Card[]) => {
    if (current.length === 5) {
      results.push([...current]);
      return;
    }
    for (let index = start; index < cards.length; index += 1) {
      current.push(cards[index] as Card);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return results;
}

/** Invariant helpers used by the Slice 1 tests; not used by the UI. */

export function assertAuthoredCardsAreUnique(): boolean {
  const keys = new Set(BEGINNER_TUTORIAL_DECK.map((card) => `${card.rank}:${card.suit}`));
  return keys.size === BEGINNER_TUTORIAL_DECK.length;
}

export function assertPotIsConserved(): boolean {
  return BEGINNER_TUTORIAL_STEP_IDS.every((stepId) => {
    const committed = TOTAL_COMMITTED_BY_STEP[stepId];
    const stacks = STACK_BY_STEP[stepId];
    const streetBets = STREET_BETS_BY_STEP[stepId];
    const pot = BEGINNER_TUTORIAL_POT_BY_STEP[stepId];
    const totalCommitted = SEAT_ORDER.reduce((sum, seatId) => sum + committed[seatId], 0);
    const outstanding = SEAT_ORDER.reduce((sum, seatId) => sum + streetBets[seatId], 0);
    const totalChips = pot
      + outstanding
      + SEAT_ORDER.reduce((sum, seatId) => sum + stacks[seatId], 0);
    // Chips are conserved: pot + outstanding bets + stacks is always 300, and
    // the pot plus outstanding bets equals everything committed so far.
    return totalChips === 3 * BEGINNER_TUTORIAL_STARTING_STACK
      && pot + outstanding === totalCommitted;
  });
}

/** Type re-exports kept local so the feature never imports the real engine. */
export type { Card, Rank, Suit, HandValue };
