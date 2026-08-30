import type { AiDifficulty } from '../../domain/poker/aiProfiles';
import type { ChampionshipProgress } from '../../domain/poker/championship';
import type { TablePace, TablePlayerCount } from '../../domain/poker/multiwaySession';
import type { MessageKey } from '../../localization/messages';
import type { useLocalization } from '../../localization';

/** The translator bound to the active app language, as the localization
 * context provides it. */
export type Translator = ReturnType<typeof useLocalization>['t'];

/** The table-pace options the configurator and the Custom AI setup share. */
export const TABLE_PACE_OPTIONS: readonly TablePace[] = ['brisk', 'normal', 'relaxed'];

/** The localized difficulty name, typed against the message catalog. */
export function difficultyLabel(difficulty: AiDifficulty, t: Translator): string {
  return t(`difficulty.${difficulty}` as MessageKey);
}

/** The localized table-pace name, typed against the message catalog. */
export function paceLabel(pace: TablePace, t: Translator): string {
  return t(`pace.${pace}` as MessageKey);
}

/**
 * The practice seat the configurator effectively starts when the selected
 * count exceeds what the difficulty's roster can seat with distinct names:
 * the largest offered count the roster supports, else the smallest offer.
 */
export function effectivePracticePlayerCount(
  options: readonly TablePlayerCount[],
  selected: TablePlayerCount,
): TablePlayerCount {
  if (options.includes(selected)) return selected;
  const sorted = [...options].sort((a, b) => a - b);
  const largestSupported = [...sorted].reverse().find((count) => count <= selected);
  return largestSupported ?? sorted[0] ?? 2;
}

/** A stack preset's chip amount: both chips and big blinds are shown, so the
 * player never translates between the two (scope 3.11C). */
export function stackChipsLabel(bb: number, bigBlind: number, formatChips: (chips: number) => string): string {
  return formatChips(bb * bigBlind);
}


/**
 * Whether the Championship entry presents a Start action: only a player with
 * no qualified events and no saved mid-event run starts fresh; everyone else
 * continues the journey (the entry card's checkpoint-aware label).
 */
export function championshipEntryFresh(progress: ChampionshipProgress, activeEvent: boolean): boolean {
  const qualified = progress.events.some((event) => event.qualifiedAt);
  return !qualified && !activeEvent;
}
