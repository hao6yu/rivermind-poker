import type { CurriculumChapterId } from './curriculum';

/** The Learn chapter that owns the cheat-sheet reference collection. */
export type LearnCheatsheetChapter = 'tools';

/** The Learn screen's chapter union: the curriculum chapters plus the cheat-sheet collection. */
export type LearnChapterId = CurriculumChapterId | LearnCheatsheetChapter;

/** The Learn chapter the "cheat sheets" route on Home expands. */
export const LEARN_CHEAT_SHEETS_CHAPTER: LearnCheatsheetChapter = 'tools';

/**
 * Resolve which Learn chapter should be expanded from the Home launch state.
 * The "cheat sheets" action expands the collection chapter so the whole
 * reference set is browsable, instead of opening a single sheet with no way
 * back to the collection. Keeping this a pure reducer makes the launch
 * transition testable without rendering anything.
 */
export function expandCheatsheetCollection(
  current: LearnChapterId | null,
  openCollection: boolean,
): LearnChapterId | null {
  return openCollection ? LEARN_CHEAT_SHEETS_CHAPTER : current;
}

/**
 * True exactly when the Home collection route should reveal the Quick Reference
 * cheat-sheet collection as the visible destination: the launch has been
 * requested and the Tools chapter is expanded. This is the controller a
 * presentation test asserts against — the requested collection, not merely the
 * expanded chapter.
 */
export function shouldFocusCollection(
  launchCheatSheets: boolean,
  expandedChapter: LearnChapterId | null,
): boolean {
  return launchCheatSheets && expandedChapter === LEARN_CHEAT_SHEETS_CHAPTER;
}
