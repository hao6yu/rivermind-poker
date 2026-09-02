import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P18-041 — the Learn screen stays at two visible card-nesting levels.
 *
 * The screen composes three composite cards (the personal plan card, the
 * learning summary card, and the catalog chapter cards). Inside them, list
 * rows are hairline-separated list entries — NOT nested cards — so no third
 * card level can appear. These style invariants pin that structure:
 *
 *  - the row style carries no card chrome (no radius/background/border box);
 *  - the only card-styled descendants of a composite card are the plan row
 *    and the insight tile, both exactly one level deep;
 *  - chapter rows and catalog rows reuse the same list-row style.
 */

const source = readFileSync(join(__dirname, 'LearnScreen.tsx'), 'utf8');

function styleBody(name: string): string {
  const match = new RegExp(`\\n\\s*${name}: \\{([^}]*)\\}`, 'm').exec(source);
  if (!match) throw new Error(`Style ${name} not found in LearnScreen`);
  return match[1]!;
}

const hasCardChrome = (body: string): boolean =>
  /borderRadius/.test(body) && /backgroundColor/.test(body)
  && (/borderWidth/.test(body) || /shadowColor/.test(body));

describe('Learn card nesting stays at two levels (P18-041)', () => {
  it('keeps list rows free of card chrome so chapters never grow a third level', () => {
    // The chapter/catalog list row: hairline-separated, no card box.
    const row = styleBody('row');
    expect(/borderRadius/.test(row)).toBe(false);
    expect(/backgroundColor/.test(row)).toBe(false);
    expect(/hairlineWidth/.test(row)).toBe(true);
  });

  it('keeps the nested card-chrome descendants exactly one level deep', () => {
    // Inside the plan card, only the plan row is card-styled; inside the
    // summary card, only the insight tile is. Both are one nesting level.
    expect(hasCardChrome(styleBody('planRow'))).toBe(true);
    // The plan step/arrow and meta chips are chips, not cards, and the
    // summary insight tiles are flat fills — neither raises the depth.
    expect(hasCardChrome(styleBody('planStep'))).toBe(false);
    expect(hasCardChrome(styleBody('planArrow'))).toBe(false);
    expect(hasCardChrome(styleBody('insightCard'))).toBe(false);
  });

  it('keeps the three composite cards themselves single (no card wrapping a card wrapping a card)', () => {
    for (const card of ['planCard', 'summaryCard', 'chapterCard', 'toolCard']) {
      expect(hasCardChrome(styleBody(card)), card).toBe(true);
    }
    // The complete card-styled set: the four composite cards, the plan row
    // (one level inside the plan card), and the screen-level chrome that is
    // never nested inside another card. A new entry here is exactly where a
    // reviewer checks nesting depth.
    const cardStyled = [...source.matchAll(/\n\s*(\w+): \{([^}]*)\}/g)]
      .filter((match) => hasCardChrome(match[2]!))
      .map((match) => match[1]!);
const probe = [...source.matchAll(/\n\s*(\w+): \{([^}]*)\}/g)].find((m) => m[1] === 'planCard');
        expect(new Set(cardStyled)).toEqual(new Set([
      'planCard', 'planRow', 'summaryCard', 'chapterCard', 'toolCard',
      // Screen-level chrome (top level only).
      'browseCard', 'catalogBackRow', 'catalogTabs', 'continueCard', 'iconButton', 'list', 'secondaryAction',
    ]));
  });
});
