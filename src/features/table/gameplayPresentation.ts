import type {
  ActionRecord,
  GameState,
  HandOutcome,
  LegalActions,
  PlayerAction,
  Street,
} from '../../domain/poker/types';

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
  baseDelayMs: number;
  handNumber: number;
  historyLength: number;
  legal: LegalActions;
  pot: number;
  street: Street;
}

export type GameplayHapticCue = 'light' | 'medium' | 'success' | 'warning' | 'selection';
export type CoachReviewState = 'idle' | 'loading' | 'ready' | 'error';

const aiDelayBounds = { min: 420, max: 1_450 } as const;

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

export function formatBb(chips: number, bigBlind: number): string {
  const amount = Math.round((chips / bigBlind) * 10) / 10;
  return `${amount} BB`;
}

export function clampRaiseTarget(target: number, legal: LegalActions): number {
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
      ? `${actor} bet ${formatChipAmount(action.amount)}`
      : `${actor} raised to ${formatChipAmount(action.amount)}`;
  }
  if (action.type === 'call') return `${actor} called ${formatChipAmount(action.amount)}`;
  return `${actor} ${action.type === 'check' ? 'checked' : 'folded'}`;
}

function formatChipAmount(chips: number): string {
  if (Math.abs(chips) < 1_000) return String(Math.round(chips));
  return `${Math.round((chips / 1_000) * 10) / 10}K`;
}

/**
 * Keeps AI turns varied enough to feel considered without making practice drag.
 * The jitter is derived from the hand state so tests and re-renders stay stable.
 */
export function aiTurnDelayMs(context: AiTurnPacingContext): number {
  const { baseDelayMs, handNumber, historyLength, legal, pot, street } = context;
  const streetWeight: Record<Street, number> = {
    preflop: 0,
    flop: 70,
    turn: 125,
    river: 180,
    complete: 0,
  };
  const pricePressure = legal.toCall > 0
    ? Math.min(180, Math.round((legal.toCall / Math.max(1, pot + legal.toCall)) * 360))
    : 0;
  const optionWeight = legal.canRaise ? 65 : 0;
  const deterministicJitter = ((handNumber * 53 + historyLength * 97 + streetWeight[street]) % 181) - 90;
  const delay = baseDelayMs + streetWeight[street] + pricePressure + optionWeight + deterministicJitter;
  return Math.max(aiDelayBounds.min, Math.min(aiDelayBounds.max, Math.round(delay)));
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
    heroDelta: `${heroDelta > 0 ? '+' : ''}${formatBb(heroDelta, game.bigBlind)}`,
    heroStack: formatBb(game.players.hero.stack, game.bigBlind),
    pot: formatBb(outcome.potWon, game.bigBlind),
    title,
    tone,
    villainStack: formatBb(game.players.villain.stack, game.bigBlind),
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
