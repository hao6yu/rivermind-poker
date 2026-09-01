import { describe, expect, it } from 'vitest';

import { cheatSheets } from '../../domain/learning/content';
import {
  HOME_POKER_TOOLS_COLLAPSED_IDS,
  HOME_POKER_TOOLS_EXPANDED_IDS,
  homePokerToolIds,
  homePokerToolSheet,
} from './homePokerTools';

describe('Home Poker tools (DT-10)', () => {
  it('shows only the two primary tools while collapsed', () => {
    expect(homePokerToolIds(false)).toEqual(['sheet-hand-rankings', 'sheet-preflop']);
  });

  it('reveals the two secondary tools when expanded', () => {
    expect(homePokerToolIds(true)).toEqual([
      'sheet-hand-rankings',
      'sheet-preflop',
      'sheet-percentages',
      'sheet-advanced-math',
    ]);
  });

  it('expanded is exactly collapsed plus the supplementary tools', () => {
    expect(HOME_POKER_TOOLS_COLLAPSED_IDS).toEqual(['sheet-hand-rankings', 'sheet-preflop']);
    expect(HOME_POKER_TOOLS_EXPANDED_IDS).toEqual(['sheet-percentages', 'sheet-advanced-math']);
    expect([...HOME_POKER_TOOLS_COLLAPSED_IDS, ...HOME_POKER_TOOLS_EXPANDED_IDS]).toEqual(homePokerToolIds(true));
    // No tool is ever listed twice.
    expect(new Set(homePokerToolIds(true)).size).toBe(homePokerToolIds(true).length);
  });

  it('resolves every advertised tool to an authored Learn reference sheet', () => {
    for (const id of homePokerToolIds(true)) {
      const sheet = homePokerToolSheet(id);
      expect(sheet.id).toBe(id);
      // It must be the real authored content, not a Home-local copy.
      expect(cheatSheets).toContain(sheet);
    }
  });

  it('isolates the four tools Home exposes from the full authored reference set', () => {
    // Heads-up positions is authored upstream but deliberately NOT a Home tool.
    const ids = new Set<string>(homePokerToolIds(true));
    expect(cheatSheets.map((sheet) => sheet.id)).toContain('sheet-position');
    expect(ids.has('sheet-position')).toBe(false);
  });
});
