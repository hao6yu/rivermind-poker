import { stackDepthBb } from './moneyFormat';
import type { MultiwayHandState } from './multiway';

export type TournamentStackBand = 'critical' | 'short' | 'normal';

export interface TournamentDecisionContext {
  enabled: boolean;
  /** The finishing place that advances. One means winner-take-all. */
  qualifyingPlace: number;
}

export interface TournamentPressure {
  bubble: boolean;
  livePlayers: number;
  pressureLabel: string | null;
  qualifyingPlace: number;
  /** Conservative ICM-lite premium expressed as additional equity required. */
  riskPremium: number;
  stackBand: TournamentStackBand;
  stackBb: number;
  stackRank: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Derives tournament pressure from public stacks and the qualification target.
 * This is deliberately ICM-lite: it changes marginal decisions near a real
 * qualification bubble without presenting heuristic chip values as solver ICM.
 */
export function buildTournamentPressure(
  state: MultiwayHandState,
  playerId: string,
  context?: TournamentDecisionContext,
): TournamentPressure {
  const player = state.players[playerId];
  if (!player) throw new Error(`Player ${playerId} is missing from the tournament.`);

  const livePlayers = state.activePlayerIds
    .map((id) => state.players[id])
    .filter((candidate) => Boolean(candidate));
  const qualifyingPlace = context?.enabled
    ? clamp(Math.round(context.qualifyingPlace), 1, livePlayers.length)
    : 1;
  const stack = player.stack + player.streetBet;
  const orderedStacks = livePlayers
    .map((candidate) => (candidate?.stack ?? 0) + (candidate?.streetBet ?? 0))
    .sort((left, right) => right - left);
  const stackRank = Math.max(1, orderedStacks.findIndex((candidate) => candidate <= stack) + 1);
  const stackBb = stack / Math.max(1, state.bigBlind);
  const stackBand: TournamentStackBand = stackBb <= 10
    ? 'critical'
    : stackBb <= 15 ? 'short' : 'normal';
  const bubble = Boolean(
    context?.enabled
      && qualifyingPlace > 1
      && livePlayers.length === qualifyingPlace + 1,
  );

  let riskPremium = 0;
  if (bubble) {
    const isLeader = stackRank === 1;
    const isShortest = stackRank === livePlayers.length;
    riskPremium = isLeader ? 0.008 : isShortest ? 0.014 : 0.035;
  }

  const pressureLabel = bubble
    ? `Qualification bubble · top ${qualifyingPlace} advance`
    : stackBand === 'critical'
      // Stack depth, not an amount: this label sits directly under a coach
      // headline quoting chips, so it names the unit in words rather than
      // offering "8 BB" as a rival reading of the same wager.
      ? `Push-or-fold zone · ${stackDepthBb(stack, state.bigBlind)} big blinds deep`
      : stackBand === 'short'
        ? `Short stack · ${stackDepthBb(stack, state.bigBlind)} big blinds deep`
        : null;

  return {
    bubble,
    livePlayers: livePlayers.length,
    pressureLabel,
    qualifyingPlace,
    riskPremium,
    stackBand,
    stackBb,
    stackRank,
  };
}
