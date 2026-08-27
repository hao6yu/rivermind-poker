import { describe, expect, it } from 'vitest';

import { cheatSheets } from './content';
import { expandCheatsheetCollection, shouldFocusCollection, LEARN_CHEAT_SHEETS_CHAPTER } from './cheatSheetLaunch';

describe('cheat-sheet collection', () => {
  it('is a non-empty reference set the Home route can reveal', () => {
    expect(cheatSheets.length).toBeGreaterThan(0);
    expect(LEARN_CHEAT_SHEETS_CHAPTER).toBe('tools');
  });
});

describe('cheat-sheet collection launch transition', () => {
  it('expands the reference-collection chapter when the Home route opens it', () => {
    // Requesting the collection launch expands the tools chapter, so the whole
    // reference set is browsable instead of landing on a single sheet.
    expect(expandCheatsheetCollection(null, true)).toBe('tools');
  });

  it('keeps the current chapter when the collection route is not requested', () => {
    // Launching a specific activity (or nothing) leaves whatever chapter is open.
    expect(expandCheatsheetCollection('preflop', false)).toBe('preflop');
  });
});

describe('shouldFocusCollection', () => {
  it('reveals the collection only once the launch is requested and expanded', () => {
    // The requested collection is the visible destination: both the launch and
    // the Tools expansion must be true, not only the chapter reducer's output.
    expect(shouldFocusCollection(true, 'tools')).toBe(true);
  });

  it('does not reveal before the Tools chapter has expanded', () => {
    // The launch is requested but Tools is still closed; reveal waits for it.
    expect(shouldFocusCollection(true, null)).toBe(false);
  });

  it('does not reveal when the collection route was not the launcher', () => {
    // The Tools chapter is open via a normal tap, not the Home route.
    expect(shouldFocusCollection(false, 'tools')).toBe(false);
  });
});
