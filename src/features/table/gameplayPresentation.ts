import type {
  ActionRecord,
  GameState,
  HandOutcome,
  LegalActions,
  PlayerAction,
  Street,
} from '../../domain/poker/types';
import type { TablePace } from '../../domain/poker/multiwaySession';
import { formatChips, formatChipsSigned } from '../../domain/poker/moneyFormat';

export interface BetSizeOption {
  id: string;
  label: string;
  target: number;
}

export interface BetSizingContext {
  bigBlind: number;
  currentBet: number;
  playerStreetBet: number;
  pot: number;
  legal: LegalActions;
}

export interface HandResultSummary {
  detail: string;
  heroDelta: string;
  heroStack: string;
  pot: string;
  title: string;
  tone: 'win' | 'loss' | 'tie';
  villainStack: string;
}

export interface AiTurnPacingContext {
  action: PlayerAction;
  baseDelayMs: number;
  handNumber: number;
  historyLength: number;
  legal: LegalActions;
  pace?: TablePace;
  pot: number;
  street: Street;
}

export type GameplayHapticCue = 'light' | 'medium' | 'success' | 'warning' | 'selection';
export type CoachReviewState = 'idle' | 'loading' | 'ready' | 'error';
export type HeadsUpSeatRole = 'D' | 'BB';

const AI_DELAY_BOUNDS: Record<TablePace, { min: number; max: number }> = {
  brisk: { min: 760, max: 2_050 },
  normal: { min: 900, max: 2_450 },
  relaxed: { min: 1_200, max: 3_100 },
};

const AI_DELAY_SCALE: Record<TablePace, number> = {
  brisk: 0.82,
  normal: 1,
  relaxed: 1.28,
};

export function headsUpActionBubbleDurationMs(pace: TablePace): number {
  if (pace === 'brisk') return 1_200;
  if (pace === 'relaxed') return 1_900;
  return 1_450;
}

export function coachReviewState({
  hasError,
  hasResult,
  loading,
}: {
  hasError: boolean;
  hasResult: boolean;
  loading: boolean;
}): CoachReviewState {
  if (hasResult) return 'ready';
  if (loading) return 'loading';
  if (hasError) return 'error';
  return 'idle';
}

export function coachReviewButtonLabel(state: CoachReviewState): string {
  if (state === 'idle') return 'AI review';
  if (state === 'loading') return 'Reviewing…';
  return 'View review';
}

export function shouldRequestCoachReview(state: CoachReviewState): boolean {
  return state === 'idle';
}

export function clampRaiseTarget(target: number, legal: { minRaiseTo: number; maxRaiseTo: number }): number {
  if (legal.maxRaiseTo <= legal.minRaiseTo) return legal.maxRaiseTo;
  return Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(target)));
}

export function buildBetSizeOptions(context: BetSizingContext): BetSizeOption[] {
  const { currentBet, legal, playerStreetBet, pot } = context;
  if (!legal.canRaise) return [];

  const options: BetSizeOption[] = [];
  const targets = new Set<number>();
  const addOption = (id: string, label: string, rawTarget: number) => {
    if (rawTarget >= legal.maxRaiseTo) return;
    const target = clampRaiseTarget(rawTarget, legal);
    if (targets.has(target)) return;
    targets.add(target);
    options.push({ id, label: rawTarget < legal.minRaiseTo ? 'Minimum' : label, target });
  };

  if (currentBet === 0) {
    addOption('third-pot', '⅓ pot', playerStreetBet + pot / 3);
    addOption('half-pot', '½ pot', playerStreetBet + pot / 2);
    addOption('three-quarter-pot', '¾ pot', playerStreetBet + pot * 0.75);
    addOption('pot', 'Pot', playerStreetBet + pot);
  } else {
    addOption('minimum', 'Minimum', legal.minRaiseTo);
    addOption('two-and-half-x', '2.5×', currentBet * 2.5);
    addOption('three-x', '3×', currentBet * 3);
  }

  options.push({ id: 'all-in', label: 'All-in', target: legal.maxRaiseTo });
  return options;
}

export function formatLatestAction(action: ActionRecord, _bigBlind: number): string {
  const actor = action.player === 'hero' ? 'You' : 'Mara';
  if (action.type === 'raise') {
    return action.decisionContext.currentBet === 0
      ? `${actor} bet ${formatChips(action.amount)}`
      : `${actor} raised to ${formatChips(action.amount)}`;
  }
  if (action.type === 'call') return `${actor} called ${formatChips(action.amount)}`;
  return `${actor} ${action.type === 'check' ? 'checked' : 'folded'}`;
}

/**
 * Gives the decision room to read without pretending that a longer timeout
 * makes the strategy smarter. The action is selected first by the poker AI;
 * this helper only gives folds/checks a brisk beat and consequential raises,
 * later streets, and larger pots a little more visual consideration.
 *
 * Variation is derived from public hand state, so re-renders cannot restart a
 * visibly different delay for the same decision.
 */
export function aiTurnDelayMs(context: AiTurnPacingContext): number {
  const { action, baseDelayMs, handNumber, historyLength, legal, pot, street } = context;
  const pace = context.pace ?? 'normal';
  const streetWeight: Record<Street, number> = {
    preflop: 0,
    flop: 90,
    turn: 180,
    river: 300,
    complete: 0,
  };
  const actionWeight: Record<PlayerAction['type'], number> = {
    fold: -90,
    check: -25,
    call: 120,
    raise: 360,
  };
  const pricePressure = legal.toCall > 0
    ? Math.min(220, Math.round((legal.toCall / Math.max(1, pot + legal.toCall)) * 440))
    : 0;
  const optionWeight = legal.canRaise ? 70 : 0;
  const potWeight = Math.min(
    240,
    Math.max(0, Math.round(Math.log2(Math.max(1, pot) / 80) * 80)),
  );
  const deterministicVariation = (
    (handNumber * 53 + historyLength * 97) % 241
  ) - 80;
  const delay = baseDelayMs
    + streetWeight[street]
    + actionWeight[action.type]
    + pricePressure
    + optionWeight
    + potWeight
    + deterministicVariation;
  // Once a hand has an action to show, do not replace that bubble before the
  // selected visual pace's reading window. The first actor has none to protect.
  const bounds = AI_DELAY_BOUNDS[pace];
  const readabilityFloor = historyLength > 0
    ? headsUpActionBubbleDurationMs(pace)
    : bounds.min;
  return Math.max(
    readabilityFloor,
    Math.min(bounds.max, Math.round(delay * AI_DELAY_SCALE[pace])),
  );
}

export function aiThinkingLabel(street: Street, toCall: number): string {
  if (toCall > 0) return 'Mara is weighing the price…';
  if (street === 'river') return 'Mara is reading the river…';
  if (street === 'turn') return 'Mara is studying the turn…';
  return 'Mara is thinking…';
}

export function motionDuration(durationMs: number, reduceMotionEnabled: boolean): number {
  return reduceMotionEnabled ? 0 : durationMs;
}

/**
 * The button is also the small blind in heads-up poker. Showing both labels
 * competes with the stack, so the dealer badge takes precedence and the
 * other seat carries the big-blind badge.
 */
export function headsUpSeatRole(button: 'hero' | 'villain', player: 'hero' | 'villain'): HeadsUpSeatRole {
  return button === player ? 'D' : 'BB';
}

export function hapticCueForPlayerAction(action: PlayerAction): GameplayHapticCue {
  return action.type === 'raise' ? 'medium' : action.type === 'fold' ? 'selection' : 'light';
}

export function hapticCueForOutcome(winner: HandOutcome['winner']): GameplayHapticCue {
  if (winner === 'hero') return 'success';
  if (winner === 'villain') return 'warning';
  return 'selection';
}

export function buildHandResultSummary(
  game: GameState,
  startingHeroStack: number,
): HandResultSummary | null {
  const outcome = game.outcome;
  if (!outcome) return null;

  const heroDelta = game.players.hero.stack - startingHeroStack;
  const winningHand = outcome.winner === 'hero'
    ? outcome.heroHand
    : outcome.winner === 'villain'
      ? outcome.villainHand
      : outcome.heroHand;
  const tone = outcome.winner === 'hero' ? 'win' : outcome.winner === 'villain' ? 'loss' : 'tie';
  const title = outcome.winner === 'hero'
    ? 'You win the hand'
    : outcome.winner === 'villain'
      ? 'Mara wins the hand'
      : 'The pot is split';
  const detail = winningHand
    ? `${outcome.winner === 'tie' ? 'Both players' : 'Winning hand'} · ${capitalize(winningHand)}`
    : outcome.winner === 'hero'
      ? 'Mara folded'
      : outcome.winner === 'villain'
        ? 'You folded'
        : outcome.message;

  return {
    detail,
    heroDelta: formatChipsSigned(heroDelta),
    heroStack: formatChips(game.players.hero.stack),
    pot: formatChips(outcome.potWon),
    title,
    tone,
    villainStack: formatChips(game.players.villain.stack),
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
