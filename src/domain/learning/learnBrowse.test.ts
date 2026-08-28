import { describe, expect, it } from 'vitest';

import {
  advancedMathCheatSheet,
  cheatSheets,
  handQuiz,
  lessons,
  percentageTrainer,
  postflopMasteryCheck,
  preflopMasteryCheck,
} from './content';
import { curriculumSteps } from './curriculum';
import { practicePacks } from './practicePacks';
import { tableMissions } from './tableMissions';
import { scenarioTrainer } from './scenarios';
import {
  INITIAL_LEARN_BROWSE_STATE,
  LEARN_BROWSE_DEFAULT_TAB,
  LEARN_BROWSE_TABS,
  LEARN_REFERENCE_TAB,
  LEARN_ROSTER_DESTINATION_ID,
  learnBrowseDestinations,
  learnBrowseDestinationsForTab,
  shouldExpandLearningSummary,
  launchReferenceCollection,
  openLearnChapter,
  selectLearnBrowseTab,
  shouldRevealReferenceCollection,
  toggleLearnCatalog,
} from './learnBrowse';

describe('learn browse categories', () => {
  it('offers three understandable categories with the guided path first', () => {
    expect(LEARN_BROWSE_TABS).toEqual(['curriculum', 'practice', 'reference']);
    expect(LEARN_BROWSE_DEFAULT_TAB).toBe('curriculum');
  });

  it('starts collapsed so the initial Learn view stays a single action', () => {
    expect(INITIAL_LEARN_BROWSE_STATE.catalogOpen).toBe(false);
    expect(INITIAL_LEARN_BROWSE_STATE.tab).toBe(LEARN_BROWSE_DEFAULT_TAB);
    expect(INITIAL_LEARN_BROWSE_STATE.chapter).toBeNull();
  });

  it('opens the direction summary only until a skill baseline exists', () => {
    expect(shouldExpandLearningSummary(false)).toBe(true);
    expect(shouldExpandLearningSummary(true)).toBe(false);
  });

  it('toggles the catalog without changing the visible category', () => {
    const opened = selectLearnBrowseTab(INITIAL_LEARN_BROWSE_STATE, 'reference');
    expect(toggleLearnCatalog(opened)).toEqual({ ...opened, catalogOpen: false });
  });
});

describe('learn browse transitions', () => {
  it('opening a category always reveals the catalog', () => {
    const opened = selectLearnBrowseTab(INITIAL_LEARN_BROWSE_STATE, 'practice');
    expect(opened).toEqual({ catalogOpen: true, chapter: null, tab: 'practice' });
  });

  it('a chapter jump lands on the curriculum category and expands that chapter', () => {
    const practice = selectLearnBrowseTab(INITIAL_LEARN_BROWSE_STATE, 'reference');
    expect(openLearnChapter(practice, 'postflop')).toEqual({
      catalogOpen: true,
      chapter: 'postflop',
      tab: 'curriculum',
    });
  });

  it('tapping the expanded chapter again collapses it', () => {
    const expanded = openLearnChapter(INITIAL_LEARN_BROWSE_STATE, 'preflop');
    expect(openLearnChapter(expanded, 'preflop').chapter).toBeNull();
    // The category stays put so the learner is not thrown out of the catalog.
    expect(openLearnChapter(expanded, 'preflop').catalogOpen).toBe(true);
  });

  it('the Home cheat-sheet route opens Browse on the reference collection', () => {
    const launched = launchReferenceCollection(INITIAL_LEARN_BROWSE_STATE);
    expect(launched.catalogOpen).toBe(true);
    expect(launched.tab).toBe(LEARN_REFERENCE_TAB);
  });
});

describe('shouldRevealReferenceCollection', () => {
  it('reveals only once the route is requested and the collection is on screen', () => {
    const launched = launchReferenceCollection(INITIAL_LEARN_BROWSE_STATE);
    expect(shouldRevealReferenceCollection(launched, true)).toBe(true);
  });

  it('does not reveal while the catalog is still collapsed', () => {
    expect(shouldRevealReferenceCollection(INITIAL_LEARN_BROWSE_STATE, true)).toBe(false);
  });

  it('does not reveal while another category is the visible one', () => {
    const practice = selectLearnBrowseTab(INITIAL_LEARN_BROWSE_STATE, 'practice');
    expect(shouldRevealReferenceCollection(practice, true)).toBe(false);
  });

  it('does not reveal for a Browse tap that merely opened the catalog', () => {
    const opened = selectLearnBrowseTab(INITIAL_LEARN_BROWSE_STATE, 'reference');
    expect(shouldRevealReferenceCollection(opened, false)).toBe(false);
  });
});

describe('learn browse destination inventory', () => {
  it('keeps every shipped curriculum step behind the curriculum category', () => {
    const curriculum = new Set(learnBrowseDestinationsForTab('curriculum'));
    lessons.forEach((lesson) => expect(curriculum.has(lesson.id)).toBe(true));
    // Only the focus-pack used by the coach's practice-focus route lives outside
    // the catalog; every pack the catalog itself shelves is a curriculum step.
    curriculumSteps
      .filter((step) => step.kind === 'practice')
      .forEach((step) => {
        expect(step.kind === 'practice' ? curriculum.has(step.pack.progressActivityId) : false).toBe(true);
      });
    expect(practicePacks.length).toBeGreaterThan(curriculumSteps.filter((step) => step.kind === 'practice').length);
    tableMissions.forEach((mission) => expect(curriculum.has(mission.id)).toBe(true));
    expect(curriculum.has(preflopMasteryCheck.id)).toBe(true);
    expect(curriculum.has(postflopMasteryCheck.id)).toBe(true);
    expect(curriculum.size).toBe(new Set(curriculumSteps.map((step) => step.id)).size);
  });

  it('lists the repeatable drills once in the practice category', () => {
    expect(learnBrowseDestinationsForTab('practice')).toEqual([
      percentageTrainer.id,
      handQuiz.id,
      scenarioTrainer.id,
    ]);
  });

  it('lists the whole quick-reference collection plus the roster', () => {
    const reference = learnBrowseDestinationsForTab('reference', { rosterAvailable: true });
    cheatSheets.forEach((sheet) => expect(reference).toContain(sheet.id));
    expect(reference).toContain(advancedMathCheatSheet.id);
    expect(reference[reference.length - 1]).toBe(LEARN_ROSTER_DESTINATION_ID);
  });

  it('hides the roster entry when no roster route is available', () => {
    expect(learnBrowseDestinationsForTab('reference')).not.toContain(LEARN_ROSTER_DESTINATION_ID);
  });

  it('never lists one destination in two categories', () => {
    const ids = learnBrowseDestinations({ rosterAvailable: true }).map((destination) => destination.stepId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
