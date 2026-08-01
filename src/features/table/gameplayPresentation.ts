import type { ActionRecord, GameState, LegalActions } from '../../domain/poker/types';

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

export function formatLatestAction(action: ActionRecord, bigBlind: number): string {
  const actor = action.player === 'hero' ? 'You' : 'Mara';
  if (action.type === 'raise') {
    return action.decisionContext.currentBet === 0
      ? `${actor} bet ${formatBb(action.amount, bigBlind)}`
      : `${actor} raised to ${formatBb(action.amount, bigBlind)}`;
  }
  if (action.type === 'call') return `${actor} called ${formatBb(action.amount, bigBlind)}`;
  return `${actor} ${action.type === 'check' ? 'checked' : 'folded'}`;
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
