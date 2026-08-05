/**
 * Chips are this app's money unit. Every amount a player reads — stacks, pots,
 * bets, calls, payouts, results — is chips, so the same wager is never quoted
 * two ways on one screen.
 *
 * Big blinds survive in exactly one place: teaching content whose subject is the
 * ratio itself — pot-odds drills, the range explorer's depth axis, push/fold
 * thresholds. "Push-or-fold at 8 big blinds" is a fact about the ratio and "160
 * chips" cannot say it. Those always spell the unit out; the bare "BB"
 * abbreviation is not used for an amount anywhere a player can read it, and
 * src/localization/moneyUnits.test.ts holds that line.
 *
 * Configuration figures are NOT an exception. A "60 big blind start" is 1,200
 * chips at 10/20, so the setup screen, the home tiles and the championship
 * invitation resolve them through the owning blind constant and quote chips.
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
