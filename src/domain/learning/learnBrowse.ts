import {
  cheatSheets,
  handQuiz,
  percentageTrainer,
} from './content';
import { scenarioTrainer } from './scenarios';
import { curriculumSteps, type CurriculumChapterId } from './curriculum';

/**
 * The Learn screen's browse model.
 *
 * The initial Learn view shows exactly one dominant next-session action, one
 * compact direction/progress summary, and one Browse entry. Everything else —
 * the guided curriculum, the repeatable practice tools, and the quick-reference
 * collection — lives behind that single Browse entry, split into three
 * understandable categories instead of one long wall of cards. Keeping the
 * transition rules and the destination inventory here makes both provable
 * without rendering anything.
 */

/** The three categories behind the Learn Browse entry. */
export type LearnBrowseTab = 'curriculum' | 'practice' | 'reference';

export const LEARN_BROWSE_TABS: readonly LearnBrowseTab[] = ['curriculum', 'practice', 'reference'];

/** Landing tab for a plain Browse tap: the guided path is the default category. */
export const LEARN_BROWSE_DEFAULT_TAB: LearnBrowseTab = 'curriculum';

/** The tab the Home cheat-sheet shortcut lands on. */
export const LEARN_REFERENCE_TAB: LearnBrowseTab = 'reference';

/** Stable id of the AI-roster entry inside the reference collection. */
export const LEARN_ROSTER_DESTINATION_ID = 'ai-roster';

export interface LearnBrowseState {
  /** Whether the progressive-disclosure catalog is revealed. */
  catalogOpen: boolean;
  /** The visible catalog category. */
  tab: LearnBrowseTab;
  /** The single expanded curriculum chapter, if any. */
  chapter: CurriculumChapterId | null;
}

export const INITIAL_LEARN_BROWSE_STATE: LearnBrowseState = {
  catalogOpen: false,
  chapter: null,
  tab: LEARN_BROWSE_DEFAULT_TAB,
};

/** Collapse or reveal the catalog without moving the learner off their category. */
export function toggleLearnCatalog(state: LearnBrowseState): LearnBrowseState {
  return { ...state, catalogOpen: !state.catalogOpen };
}

/** Pick a category; picking one always reveals the catalog it belongs to. */
export function selectLearnBrowseTab(state: LearnBrowseState, tab: LearnBrowseTab): LearnBrowseState {
  return { ...state, catalogOpen: true, tab };
}

/** Jump to a curriculum chapter from the progress summary. */
export function openLearnChapter(state: LearnBrowseState, chapter: CurriculumChapterId): LearnBrowseState {
  return {
    ...state,
    catalogOpen: true,
    chapter: state.chapter === chapter ? null : chapter,
    tab: 'curriculum',
  };
}

/**
 * Apply the Home "cheat sheets" route: reveal the catalog on the Quick Reference
 * category so the whole reference collection is browsable — never a single sheet
 * with no way back — while the category tabs stay on screen as the route back to
 * the rest of the Learn catalog.
 */
export function launchReferenceCollection(state: LearnBrowseState): LearnBrowseState {
  return { ...state, catalogOpen: true, tab: LEARN_REFERENCE_TAB };
}

/**
 * True exactly when the Home collection route may reveal the reference
 * collection as the visible destination: the route was requested and the catalog
 * is open on that category. A normal tap that opens Browse must not auto-scroll,
 * and the reveal must not fire while the catalog is still collapsed.
 */
export function shouldRevealReferenceCollection(
  state: LearnBrowseState,
  launchRequested: boolean,
): boolean {
  return launchRequested && state.catalogOpen && state.tab === LEARN_REFERENCE_TAB;
}

/**
 * A learner with no skill baseline yet should land on the summary already open:
 * choosing a goal and taking the first check is the whole point of the first
 * session, and it must not be hidden behind a disclosure. Everyone else gets the
 * compact one-line summary.
 */
export function shouldExpandLearningSummary(hasBaseline: boolean): boolean {
  return !hasBaseline;
}

/** Which category owns a browse destination, so no entry is listed twice. */
export type LearnBrowseDestination =
  | { kind: 'curriculum-step'; tab: 'curriculum'; stepId: string }
  | { kind: 'practice-tool'; tab: 'practice'; stepId: string }
  | { kind: 'reference-sheet'; tab: 'reference'; stepId: string }
  | { kind: 'roster'; tab: 'reference'; stepId: string };

/**
 * The full Learn destination inventory for the catalog. Curriculum chapters own
 * every lesson, practice pack, table mission, and mastery check; the Practice
 * category owns the repeatable drills; Quick Reference owns every cheat sheet
 * plus the AI roster. The companion test asserts that nothing shipped is left
 * outside this inventory and that no destination is listed in two categories.
 */
export function learnBrowseDestinations(options: { rosterAvailable?: boolean } = {}): LearnBrowseDestination[] {
  const destinations: LearnBrowseDestination[] = [
    ...curriculumSteps.map((step) => ({
      kind: 'curriculum-step' as const,
      tab: 'curriculum' as const,
      stepId: step.id,
    })),
    ...[percentageTrainer, handQuiz, scenarioTrainer].map((tool) => ({
      kind: 'practice-tool' as const,
      tab: 'practice' as const,
      stepId: tool.id,
    })),
    ...cheatSheets.map((sheet) => ({
      // `cheatSheets` already carries every authored sheet, including the
      // advanced-math reference, so the collection is listed exactly once.
      kind: 'reference-sheet' as const,
      tab: 'reference' as const,
      stepId: sheet.id,
    })),
  ];
  if (options.rosterAvailable) {
    destinations.push({ kind: 'roster', stepId: LEARN_ROSTER_DESTINATION_ID, tab: 'reference' });
  }
  return destinations;
}

/** Destinations owned by one category, in catalog order. */
export function learnBrowseDestinationsForTab(
  tab: LearnBrowseTab,
  options: { rosterAvailable?: boolean } = {},
): string[] {
  return learnBrowseDestinations(options)
    .filter((destination) => destination.tab === tab)
    .map((destination) => destination.stepId);
}
