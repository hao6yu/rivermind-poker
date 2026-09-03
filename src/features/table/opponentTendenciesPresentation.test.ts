import { describe, expect, it } from 'vitest';

import { translate } from '../../localization/core';
import {
  OPPONENT_TENDENCY_SAMPLE_FLOOR,
  emptyOpponentTableTendencies,
} from './opponentTableTendencies';
import { localizeOpponentTableTendencies, opponentTendencyRows } from './opponentTendenciesPresentation';
import type { MessageKey } from '../../localization/messages';

type Translator = (key: MessageKey, values?: Record<string, string | number>) => string;

const t: Translator = (key, values) => translate('en', key, values as never);

function tendencies(overrides: Partial<ReturnType<typeof emptyOpponentTableTendencies>>) {
  return { ...emptyOpponentTableTendencies(), ...overrides };
}

describe('opponent tendency presentation (P18-038)', () => {
  it('hides the section below the sample floor and names the missing sample', () => {
    const under = localizeOpponentTableTendencies(
      tendencies({ handsObserved: OPPONENT_TENDENCY_SAMPLE_FLOOR - 1 }),
      t,
    );
    expect(under.sectionVisible).toBe(false);
    expect(under.sampleNoteLabel).toContain('more hands');
    const at = localizeOpponentTableTendencies(
      tendencies({ handsObserved: OPPONENT_TENDENCY_SAMPLE_FLOOR }),
      t,
    );
    expect(at.sectionVisible).toBe(true);
    expect(at.sampleNoteLabel).toBeNull();
  });

  it('renders each rate only past its own opportunity floor', () => {
    const localized = localizeOpponentTableTendencies(
      tendencies({
        handsObserved: OPPONENT_TENDENCY_SAMPLE_FLOOR,
        facedThreeBets: 1,
        foldsFacingThreeBet: 1,
        handsSeenFlop: 2,
        showdowns: 2,
      }),
      t,
    );
    expect(localized.foldToThreeBetLabel).toBeNull();
    expect(localized.showdownFrequencyLabel).toBeNull();
    const rows = opponentTendencyRows(localized, t);
    expect(rows.every((row) => !row.ready)).toBe(true);
    // The remaining counts are per-rate: one faced 3-bet needs two more;
    // two flops seen need one more (review finding 3).
    expect(rows[0]!.value).toContain('Needs 2 more');
    expect(rows[1]!.value).toContain('Needs 1 more');
  });

  it('names the exact remaining chances at one and two opportunities', () => {
    const one = opponentTendencyRows(localizeOpponentTableTendencies(
      tendencies({ handsObserved: OPPONENT_TENDENCY_SAMPLE_FLOOR, facedThreeBets: 0, foldsFacingThreeBet: 0, handsSeenFlop: 1, showdowns: 0 }),
      t,
    ), t);
    expect(one[0]!.value).toContain('Needs 3 more');
    expect(one[1]!.value).toContain('Needs 2 more');
    const two = opponentTendencyRows(localizeOpponentTableTendencies(
      tendencies({ handsObserved: OPPONENT_TENDENCY_SAMPLE_FLOOR, facedThreeBets: 2, foldsFacingThreeBet: 1, handsSeenFlop: 2, showdowns: 1 }),
      t,
    ), t);
    expect(two[0]!.value).toContain('Needs 1 more');
    expect(two[1]!.value).toContain('Needs 1 more');
    const atFloor = opponentTendencyRows(localizeOpponentTableTendencies(
      tendencies({ handsObserved: OPPONENT_TENDENCY_SAMPLE_FLOOR, facedThreeBets: 3, foldsFacingThreeBet: 0, handsSeenFlop: 3, showdowns: 0 }),
      t,
    ), t);
    // At the floor the rows show rates, never a remaining count.
    expect(atFloor[0]!.ready).toBe(true);
    expect(atFloor[1]!.ready).toBe(true);
  });

  it('formats ready rates as percents with this-table scope', () => {
    const localized = localizeOpponentTableTendencies(
      tendencies({
        handsObserved: OPPONENT_TENDENCY_SAMPLE_FLOOR,
        facedThreeBets: 4,
        foldsFacingThreeBet: 2,
        handsSeenFlop: 4,
        showdowns: 1,
      }),
      t,
    );
    expect(localized.foldToThreeBetLabel).toBe('50%');
    expect(localized.showdownFrequencyLabel).toBe('25%');
    expect(localized.scopeLabel).toContain('this table');
    const rows = opponentTendencyRows(localized, t);
    expect(rows.every((row) => row.ready)).toBe(true);
  });

  it('never shows a rate above 100 or a negative sample', () => {
    const localized = localizeOpponentTableTendencies(
      tendencies({ handsObserved: OPPONENT_TENDENCY_SAMPLE_FLOOR, facedThreeBets: 3, foldsFacingThreeBet: 3, handsSeenFlop: 3, showdowns: 3 }),
      t,
    );
    expect(localized.foldToThreeBetLabel).toBe('100%');
    expect(localized.showdownFrequencyLabel).toBe('100%');
  });
});
