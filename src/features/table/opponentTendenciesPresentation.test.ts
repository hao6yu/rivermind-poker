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
    expect(rows[0]!.value).toContain('Needs');
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
