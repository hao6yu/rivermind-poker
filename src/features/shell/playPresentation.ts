import type { AiDifficulty } from '../../domain/poker/aiProfiles';
import type { ChampionshipProgress } from '../../domain/poker/championship';
import type { TablePace, TablePlayerCount } from '../../domain/poker/multiwaySession';
import type { SitAndGoCheckpoint, SitAndGoPlayerCount } from '../../domain/poker/tournament';
import type { MessageKey } from '../../localization/messages';
import type { useLocalization } from '../../localization';

/** The translator bound to the active app language, as the localization
 * context provides it. */
export type Translator = ReturnType<typeof useLocalization>['t'];

/** The table-pace options the configurator and the Custom AI setup share. */
export const TABLE_PACE_OPTIONS: readonly TablePace[] = ['brisk', 'normal', 'relaxed'];

/** One compact stack menu shared by Practice and Sit & Go. The middle option
 * is the default in both formats, so switching formats never silently changes
 * the selected chip depth. */
export const AI_PLAY_STACK_PRESETS = [
  { bb: 40, default: false },
  { bb: 100, default: true },
  { bb: 200, default: false },
] as const;

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

/** A stack preset's chip amount, formatted for the compact selector. DT-09:
 * the selector shows only 800/2,000/4,000 in both formats, so the extra
 * big-blind label is never rendered next to it; internal stack math is
 * unchanged. */
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

/**
 * The Sit & Go checkpoint that applies to the active table. Every tournament
 * seat count (3/6/9) resumes its own saved run — a nine-seat checkpoint must
 * reach the table exactly like a three- or six-seat one — while practice,
 * missions, and Daily Challenge never inherit a tournament run.
 */
export function sitAndGoCheckpointForCount(
  playerCount: TablePlayerCount,
  checkpoints: Partial<Record<SitAndGoPlayerCount, SitAndGoCheckpoint | null>>,
): SitAndGoCheckpoint | null {
  return playerCount === 3 || playerCount === 6 || playerCount === 9
    ? checkpoints[playerCount] ?? null
    : null;
}
