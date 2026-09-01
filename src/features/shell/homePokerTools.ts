import { cheatSheets } from '../../domain/learning/content';
import type { CheatSheetDefinition } from '../../domain/learning/types';

/**
 * The Poker tools surfaced by the compact Home card (DT-10). Upstream the
 * reference collection has five authored sheets; Home deliberately offers the
 * four that answer an in-hand or planning question directly: hand rankings,
 * the preflop range explorer, common percentages, and advanced decision math.
 * Heads-up positions is intentionally absent because it duplicates the
 * canonical Day-1/SB/BB ring that the table itself already narrates.
 */

/** The tools shown while the Home card is collapsed. */
export const HOME_POKER_TOOLS_COLLAPSED_IDS = [
  'sheet-hand-rankings',
  'sheet-preflop',
] as const;

/** The additional tools revealed when the Home card is expanded. */
export const HOME_POKER_TOOLS_EXPANDED_IDS = [
  'sheet-percentages',
  'sheet-advanced-math',
] as const;

export type HomePokerToolId =
  | (typeof HOME_POKER_TOOLS_COLLAPSED_IDS)[number]
  | (typeof HOME_POKER_TOOLS_EXPANDED_IDS)[number];

/** The ordered tool ids the Home card shows for the given reveal state. */
export function homePokerToolIds(expanded: boolean): HomePokerToolId[] {
  return expanded
    ? [...HOME_POKER_TOOLS_COLLAPSED_IDS, ...HOME_POKER_TOOLS_EXPANDED_IDS]
    : [...HOME_POKER_TOOLS_COLLAPSED_IDS];
}

/**
 * Resolve a Home Poker tool to the authored reference sheet it opens. The Home
 * card reuses the exact Learn reference content, so a mismatch (a deleted or
 * renamed sheet) fails loudly at render/launch rather than shipping a dead row.
 */
export function homePokerToolSheet(id: HomePokerToolId): CheatSheetDefinition {
  const sheet = cheatSheets.find((candidate) => candidate.id === id);
  if (!sheet) {
    // `cheatSheets` owns every authored sheet; a missing tool is a catalog bug.
    throw new Error(`Home Poker tool ${id} references an unknown cheat sheet.`);
  }
  return sheet;
}
