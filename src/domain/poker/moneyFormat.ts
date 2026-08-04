/**
 * Chips are this app's money unit. Every amount a player reads — stacks, pots,
 * bets, calls, payouts, results — is chips, so the same wager is never quoted
 * two ways on one screen.
 *
 * Big blinds still appear, but only where stack *depth* is the subject rather
 * than an amount: "push-or-fold at 8 big blinds" is a fact about the ratio, and
 * "160 chips" cannot say it. Those read as prose, never as a competing number
 * next to a chip figure.
 *
 * Everything routes through this module. The scattered copies it replaces are
 * how the units drifted apart in the first place.
 */

/** Exact chips, grouped: "1,250". Use wherever a player is choosing an amount. */
export function formatChips(chips: number): string {
  return Math.round(chips).toLocaleString('en-US');
}

/** Abbreviated chips: "1.2K". Use only where width is tight, like seat plaques. */
export function formatChipsCompact(chips: number): string {
  const absolute = Math.abs(chips);
  if (absolute < 1_000) return String(Math.round(chips));
  return `${Math.round((chips / 1_000) * 10) / 10}K`;
}

/** Exact chips with an explicit sign: "+250", "-120", "0". */
export function formatChipsSigned(chips: number): string {
  const rounded = Math.round(chips);
  return `${rounded > 0 ? '+' : ''}${formatChips(rounded)}`;
}

/**
 * Stack depth in big blinds, as a bare number for prose interpolation. Callers
 * put it in a sentence that names the unit; it is never rendered beside a chip
 * amount as an alternative reading of the same quantity.
 */
export function stackDepthBb(chips: number, bigBlind: number): number {
  if (bigBlind <= 0) return 0;
  return Math.round((chips / bigBlind) * 10) / 10;
}
