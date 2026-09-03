import type { MessageKey } from './messages';

/**
 * Count-aware message selection.
 *
 * Catalog templates carry the default (`other`) form; a plural entry adds the
 * forms a language needs on top. Selection is explicit and fixture-tested for
 * zero, one, two, and representative larger values — callers never encode
 * singular/plural grammar themselves.
 *
 * Rules (deliberately simple, documented per locale in the style guides):
 *   - count === 1        → `one` when present, else `other`;
 *   - count === 0        → `zero` when present, else `other`;
 *   - every other count  → `other`.
 *
 * Spanish and Portuguese follow CLDR: "one" applies to exactly 1, zero uses the
 * plural ("0 minutos"), so they provide no `zero` form. Chinese has no plural
 * distinction, but the graded-decision label rides a demonstrative that reads
 * best with an explicit one-form, so zh entries use identical `one`/`other`
 * word order rather than caller-side conditionals.
 */
export interface MessagePluralForms {
  /** Optional zero form. Omit when the language treats zero as `other`. */
  zero?: string;
  /** Exactly-one form when it differs from `other`. */
  one?: string;
  /** Default form for zero and every count >= 2. Matches the base catalog. */
  other: string;
}

export type MessagePluralCatalog = Partial<Record<MessageKey, MessagePluralForms>>;

/** English: singular/plural distinctions for count-bearing keys. */
export const englishPlurals: MessagePluralCatalog = {
  'common.bigBlinds': {
    one: '{{count}} big blind',
    other: '{{count}} big blinds',
  },
  'decision.handCount.ungradedSpot': {
    one: 'Not graded across 1 spot',
    other: 'Not graded across {{count}} spots',
  },
  'decision.handCount.closeSpot': {
    one: 'Close decision across 1 spot',
    other: 'Close decisions across {{count}} spots',
  },
  'decision.handCount.mistake': {
    one: 'Costly mistake across 1 decision',
    other: 'Costly mistakes across {{count}} decisions',
  },
  'decision.handCount.mixed': {
    one: 'Mixed with the baseline across 1 decision',
    other: 'Mixed with the baseline across {{count}} decisions',
  },
  'decision.handCount.match': {
    one: 'Strong baseline match across 1 decision',
    other: 'Strong baseline match across {{count}} decisions',
  },
  'learn.closingDecisions': {
    one: '1 decision reviewed',
    other: '{{count}} decisions reviewed',
  },
};

/** Simplified Chinese: no plural inflection; explicit one-form for the graded-decision label. */
export const simplifiedChinesePlurals: MessagePluralCatalog = {
  'decision.handCount.ungradedSpot': {
    one: '这 1 个决策',
    other: '这 {{count}} 个决策',
  },
  'decision.handCount.closeSpot': {
    one: '这 1 个决策',
    other: '这 {{count}} 个决策',
  },
  'decision.handCount.mistake': {
    one: '这 1 个决策',
    other: '这 {{count}} 个决策',
  },
  'decision.handCount.mixed': {
    one: '这 1 个决策',
    other: '这 {{count}} 个决策',
  },
  'decision.handCount.match': {
    one: '这 1 个决策',
    other: '这 {{count}} 个决策',
  },
};

/** Traditional Chinese: mirrors the Simplified entries in Traditional script. */
export const traditionalChinesePlurals: MessagePluralCatalog = {
  'decision.handCount.ungradedSpot': {
    one: '這 1 個決策',
    other: '這 {{count}} 個決策',
  },
  'decision.handCount.closeSpot': {
    one: '這 1 個決策',
    other: '這 {{count}} 個決策',
  },
  'decision.handCount.mistake': {
    one: '這 1 個決策',
    other: '這 {{count}} 個決策',
  },
  'decision.handCount.mixed': {
    one: '這 1 個決策',
    other: '這 {{count}} 個決策',
  },
  'decision.handCount.match': {
    one: '這 1 個決策',
    other: '這 {{count}} 個決策',
  },
};

/** Spanish (Latin America): "one" applies to exactly 1; zero uses the plural. */
export const spanishPlurals: MessagePluralCatalog = {};

/** Brazilian Portuguese: "one" applies to exactly 1; zero uses the plural. */
export const portuguesePlurals: MessagePluralCatalog = {};

/** Count-aware form selection. Exported for fixture tests. */
export function selectPluralForm(forms: MessagePluralForms, count: number): string {
  if (count === 1) return forms.one ?? forms.other;
  if (count === 0 && forms.zero !== undefined) return forms.zero;
  return forms.other;
}
