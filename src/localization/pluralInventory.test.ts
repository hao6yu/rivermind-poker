import { describe, expect, it } from 'vitest';

import { spanishMessages } from './es419';
import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
  type MessageKey,
} from './messages';
import {
  englishPlurals,
  portuguesePlurals,
  simplifiedChinesePlurals,
  spanishPlurals,
  traditionalChinesePlurals,
} from './plurals';
import { portugueseMessages } from './ptbr';
import { translate, translateCount } from './core';

/**
 * Plural inventory gate (review follow-up): every catalog key that renders a
 * count must be explicitly covered by the plural system — no surface can fall
 * back to a bare `{{count}}` template with fixed plural grammar ("1
 * jugadores"), and parenthetical "(s)" plurals are banned outright.
 *
 * A key leaves the invariant list by gaining Spanish and Portuguese plural
 * entries; a new `{{count}}` key fails this suite until it is covered or
 * classified. English needs an entry only where its own copy inflects (the
 * base template already carries the English "other" form).
 */

const COUNT_TOKEN = /\{\{count\}\}/;
const PARENTHETICAL_PLURAL = /\(\s*s\s*\)/;

const countKeys = [...new Set(
  (Object.keys(englishMessages) as MessageKey[])
    .filter((key) => (
      COUNT_TOKEN.test(englishMessages[key])
      || COUNT_TOKEN.test(spanishMessages[key] ?? '')
      || COUNT_TOKEN.test(portugueseMessages[key] ?? '')
    )),
)].sort();

/**
 * Keys whose copy renders count-invariantly by construction, reviewed one by
 * one. A key belongs here only when no noun follows the count and no verb
 * agrees with it in any shipped locale.
 */
const COUNT_INVARIANT_KEYS: Partial<Record<MessageKey, string>> = {
  'championship.lineupTier': 'multiplicative label "{{difficulty}} ×{{count}}" with no noun',
  'learn.closingDecision': 'legacy singular companion key; production renders learn.closingDecisions through tCount',
  'learn.reviewNow': 'bare numeric count before an adverb ("Repasar {{count}} ahora")',
  'learn.weeklyTrendDown': 'numeric delta label ("{{count}} menos que la semana anterior")',
  'learn.weeklyTrendUp': 'numeric delta label ("+{{count}} vs. semana anterior")',
  'multiplayer.game.hand': 'noun precedes the count ("Mano {{count}}")',
  'multiplayer.game.seconds': 'unit symbol "{{count}} s"',
  'multiplayer.option.seconds': 'unit symbol "{{count}} sec" / "{{count}} seg"',
  'multiplayer.stats.rebuys': 'label-colon form ("Recompras: {{count}}")',
  'opponentTendencies.sampleNote': 'bare numeric count in a parenthetical ("({{count}} hasta ahora)")',
};

describe('plural inventory', () => {
  it('carries a meaningful count inventory', () => {
    expect(countKeys.length).toBeGreaterThan(60);
  });

  it('covers every {{count}} key with Spanish and Portuguese plural entries or a reviewed invariant reason', () => {
    for (const key of countKeys) {
      const covered = spanishPlurals[key] !== undefined && portuguesePlurals[key] !== undefined;
      const reason = COUNT_INVARIANT_KEYS[key];
      expect(covered || reason !== undefined, `${key} renders {{count}} but has neither Spanish/Portuguese plural entries nor an invariant classification`).toBe(true);
    }
    // The invariant list may not shadow keys that are already plural-covered.
    for (const key of Object.keys(COUNT_INVARIANT_KEYS) as MessageKey[]) {
      expect(spanishPlurals[key], `${key} is classified invariant but also has a Spanish plural entry`).toBeUndefined();
      expect(portuguesePlurals[key], `${key} is classified invariant but also has a Portuguese plural entry`).toBeUndefined();
    }
  });

  it('keeps the plural other-forms identical to the catalog bases', () => {
    for (const [catalog, plurals, messages] of [
      ['en', englishPlurals, englishMessages],
      ['es-419', spanishPlurals, spanishMessages],
      ['pt-BR', portuguesePlurals, portugueseMessages],
    ] as const) {
      for (const [key, forms] of Object.entries(plurals) as Array<[MessageKey, { other: string; one?: string }]>) {
        expect(messages[key], `${key} has a ${catalog} plural entry but no catalog value`).toBeDefined();
        expect(forms.other, `${key} (${catalog}) plural other-form drifted from the catalog base`).toBe(messages[key]);
        expect(messages[key], `${key} (${catalog}) plural entry without a {{count}} base`).toMatch(COUNT_TOKEN);
      }
    }
    // Chinese has no plural inflection; its entries exist only for the
    // demonstrative graded-decision labels and mirror the base exactly.
    for (const [plurals, messages] of [
      [simplifiedChinesePlurals, simplifiedChineseMessages],
      [traditionalChinesePlurals, traditionalChineseMessages],
    ] as const) {
      for (const [key, forms] of Object.entries(plurals) as Array<[MessageKey, { other: string; one?: string }]>) {
        expect(messages[key], `${key} has a Chinese plural entry but no catalog value`).toBeDefined();
        expect(forms.other, `${key} Chinese plural other-form drifted from the catalog base`).toBe(messages[key]);
      }
    }
  });

  it('selects the singular form whenever a numeric count flows through plain t()', () => {
    // Rendering gate (review follow-up): the plural entries are worthless if
    // ordinary t() still renders the base "other" form. Selection is central
    // in translate(), so plain-t call sites — including dynamic-key paths like
    // the live coach — behave exactly like tCount().
    const cases: Array<[MessageKey, number, Record<string, string | number>, string, string]> = [
      // The three surfaces called out in review:
      ['learn.daySessions', 1, { date: 'Aug 3' }, 'Aug 3 · 1 sesión de aprendizaje', 'Aug 3 · 2 sesiones de aprendizaje'],
      ['trainer.correctCount', 1, {}, '1 correcta', '2 correctas'],
      ['coach.live.postflopFree', 1, { equity: 55 }, 'Equidad estimada 55% contra 1 oponente en vivo. No hace falta igualar.', 'Equidad estimada 55% contra 2 oponentes en vivo. No hace falta igualar.'],
      // Representative coverage of the other inflected families:
      ['roster.count', 1, {}, '1 jugador', '2 jugadores'],
      ['scenario.effective', 1, {}, '1 ciega grande efectiva', '2 ciegas grandes efectivas'],
      ['learn.planReviewReason', 1, {}, '1 decisión espaciada está lista para repasar.', '2 decisiones espaciadas están listas para repasar.'],
    ];
    for (const [key, count, values, expected, expectedPlural] of cases) {
      const rendered = translate('es-419', key, { ...values, count });
      expect(rendered, `${key} (es-419, count=1) did not render the singular`).toBe(expected);
      expect(rendered, `${key} (es-419) left an unresolved token`).not.toContain('{{');
      // t and tCount share one code path.
      expect(translateCount('es-419', key, count, values)).toBe(rendered);
      // count >= 2 keeps the base (other) form.
      const renderedPlural = translate('es-419', key, { ...values, count: 2 });
      expect(renderedPlural, `${key} (es-419, count=2) drifted from the base plural`).toBe(expectedPlural);
      expect(translateCount('es-419', key, 2, values)).toBe(renderedPlural);
    }
    // Portuguese spot-checks for the same central path.
    expect(translate('pt-BR', 'trainer.correctCount', { count: 1 })).toBe('1 correta');
    expect(translate('pt-BR', 'coach.live.postflopFree', { count: 1, equity: 55 })).toContain('1 oponente ao vivo');
    expect(translate('en', 'learn.daySessions', { count: 1, date: 'Aug 3' })).toBe('Aug 3 · 1 learning session');
    // Non-inflected and invariant keys keep the base rendering.
    expect(translate('es-419', 'championship.lineupTier', { count: 1, difficulty: 'Elite' })).toBe('Elite ×1');
    expect(translate('es-419', 'learn.weeklyTrendDown', { count: 1 })).toBe('1 menos que la semana anterior');
  });

  it('bans parenthetical "(s)" plurals across the shipped catalogs', () => {
    for (const [locale, messages] of [
      ['en', englishMessages],
      ['es-419', spanishMessages],
      ['pt-BR', portugueseMessages],
    ] as const) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value, `${key} (${locale}) uses a banned "(s)" plural`).not.toMatch(PARENTHETICAL_PLURAL);
      }
    }
  });
});
