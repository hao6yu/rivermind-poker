import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { japaneseScenarioTemplates } from './ja/scenarioContent';
import { portugueseScenarioTemplates } from './ptbr/scenarioContent';
import { spanishScenarioTemplates } from './es419/scenarioContent';
import '../test/draftCatalogFixture';

/**
 * Exact scenario placeholder parity (review remediation #8; hardened rounds
 * 4-5, tightened round 6).
 *
 * For every frozen English scenario template, every text field, and every
 * conditional feedback branch, every draft locale must match an EXACT expected
 * placeholder multiset — extras, missing tokens, duplicated tokens, and
 * renamed tokens all fail. The expected multiset is:
 *
 *   expected = English placeholders (preserved with identical counts)
 *            + {{heroHand}} exactly where the reviewed es-419 policy put it
 *            + calculation tokens exactly as enumerated by the explicit
 *              per-template/surface contract below.
 *
 * The calculation policy is EXPLICIT, not inferred:
 *
 *   1. Contract whitelist — every contract token must be a field of that
 *      template's own `calculation` object, so a token the calculation kind
 *      cannot produce fails.
 *   2. Contract ↔ policy equality — the contract must equal the reviewed
 *      es-419 translation memory's calculation tokens surface by surface
 *      (translation-memory/es-419/scenario-*.json, the authoritative source).
 *      Neither artifact can drift from the other silently.
 *   3. English floor — whenever the English source embeds a calculation value
 *      as DIGITS (word-boundary match, after stripping concrete hand names
 *      such as "8-3 offsuit" whose digits are notation, not amounts), the
 *      contract must cover it. Removing a required calculation placeholder
 *      fails, so the locales cannot agree on frozen sample numbers that the
 *      runtime must calculate per spot.
 *   4. Worded values — the digit floor cannot see values expressed as words
 *      ("half the range" = requiredFoldPercent 50). Every such case is an
 *      EXPLICIT fixed-literal entry pinned to the English phrase with a
 *      reason: if the English rewrite drops the phrase, or a locale
 *      tokenizes the field anyway, the test fails and forces re-review.
 *
 * es-419, pt-BR, and ja must all equal the resulting multiset exactly, so
 * pt-BR/ja cannot drift from the reviewed policy. Full placement review
 * remains the native-reviewer owner gate.
 *
 * Conditional feedback variants are matched by their `if` EXPRESSION, never by
 * array position. A template, choice, or branch missing from any locale is a
 * FAILURE, never a silent skip.
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PLACEHOLDER = /\{\{(\w+)\}\}/g;
/** Concrete two-card hand names whose digits are poker notation, not amounts. */
const HAND_NAME = /\b(?:[AKQJT2-9]|10)-(?:[AKQJT2-9]|10)\s+(?:suited|offsuit)\b/gi;

function placeholderMultiset(value: unknown): Record<string, number> {
  const multiset: Record<string, number> = {};
  for (const match of String(value ?? '').matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (!name) continue;
    multiset[name] = (multiset[name] ?? 0) + 1;
  }
  return multiset;
}

function multisetEquals(expected: Record<string, number>, actual: Record<string, number>): boolean {
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...names].every((name) => (expected[name] ?? 0) === (actual[name] ?? 0));
}

function multisetDiff(expected: Record<string, number>, actual: Record<string, number>): string {
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...names].filter((name) => (expected[name] ?? 0) !== (actual[name] ?? 0))
    .map((name) => `{{${name}}} expected×${expected[name] ?? 0} got×${actual[name] ?? 0}`)
    .join(', ');
}

/** Extracts the text compared for placeholders (math fields may be wrappers). */
function placeholderText(value: unknown): string {
  if (typeof value === 'string') return value;
  return (value as { mathFallback?: string } | undefined)?.mathFallback ?? '';
}

interface EnglishChoice {
  id: string;
  label: string;
  feedback: string | ReadonlyArray<{ if?: string; text: string }>;
}

interface EnglishTemplate {
  templateId: string;
  calculation: Record<string, unknown> | null;
  focus: string;
  opponentAction: string;
  prompt: string;
  reasoning: string;
  takeaway: string;
  choices: ReadonlyArray<EnglishChoice>;
}

function loadEnglishTemplates(): Map<string, EnglishTemplate> {
  const templates = new Map<string, EnglishTemplate>();
  for (const name of ['source-scenario-1.json', 'source-scenario-2.json', 'source-scenario-3.json']) {
    const source = JSON.parse(readFileSync(resolve(projectRoot, 'translation-memory', name), 'utf8'));
    for (const template of source) templates.set(template.templateId, template);
  }
  return templates;
}

/** The reviewed es-419 policy: authoritative translation memory, not the generated module. */
function loadReviewedPolicy(): Map<string, Record<string, unknown>> {
  const policy = new Map<string, Record<string, unknown>>();
  for (const name of ['scenario-1.json', 'scenario-2.json', 'scenario-3.json']) {
    const source = JSON.parse(readFileSync(resolve(projectRoot, 'translation-memory', 'es-419', name), 'utf8'));
    for (const [templateId, template] of Object.entries(source)) {
      policy.set(templateId, template as Record<string, unknown>);
    }
  }
  return policy;
}

type VariantList = ReadonlyArray<{ if: string; text: string }>;

function normalizeFeedback(feedback: string | ReadonlyArray<{ if?: string; text: string }>): VariantList {
  return typeof feedback === 'string'
    ? [{ if: '', text: feedback }]
    : feedback.map((variant) => ({ if: variant.if ?? '', text: variant.text }));
}

/**
 * Word-boundary occurrences of a numeric calculation value, used by the
 * English digit floor. Lookarounds keep "3" from matching inside "13%" and
 * "8" inside "84". Worded values ("half") are intentionally NOT covered here —
 * they are handled by the explicit fixed-literal contract entries below.
 */
function occurrencesOfValue(haystack: string, value: string): number {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return 0;
  return [...haystack.matchAll(new RegExp(`(?<![0-9.])${value}(?![0-9])`, 'g'))].length;
}

/** One explicit disposition of the calculation placeholder policy per surface. */
interface CalcTokenContractEntry {
  templateId: string;
  /** Text field name, or `choice:<id>` for the choice feedback surface. */
  surface: string;
  /** Exact expected count per calculation field (calculation fields only). */
  tokens: Readonly<Record<string, number>>;
  /**
   * Calculation values the English source expresses as WORDS (invisible to
   * the digit floor), deliberately kept as frozen literals by the reviewed
   * policy. Pinned to the English phrase AND to the calculation value, so a
   * rewritten phrase or a changed calculation forces re-review.
   */
  fixedLiterals?: ReadonlyArray<{ field: string; expectedValue: number; englishPhrase: string; reason: string }>;
}

const CALC_TOKEN_CONTRACT: ReadonlyArray<CalcTokenContractEntry> = [
  { templateId: 'blind-defense', surface: 'opponentAction', tokens: { callAmountBb: 1 } },
  { templateId: 'blind-defense', surface: 'reasoning', tokens: { callAmountBb: 1, finalPotBb: 1, requiredEquityPercent: 1 } },
  { templateId: 'blind-defense', surface: 'choice:call', tokens: { requiredEquityPercent: 1 } },
  { templateId: 'flush-draw-price', surface: 'opponentAction', tokens: { callAmountBb: 1 } },
  { templateId: 'flush-draw-price', surface: 'reasoning', tokens: { callAmountBb: 2, finalPotBb: 2, requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'flush-draw-price', surface: 'choice:call', tokens: { requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'flush-draw-price', surface: 'choice:fold', tokens: { estimatedEquityPercent: 1, requiredEquityPercent: 1 } },
  { templateId: 'math-half-pot-bluff', surface: 'opponentAction', tokens: { riskBb: 1 } },
  { templateId: 'math-half-pot-bluff', surface: 'reasoning', tokens: { riskBb: 2, rewardBb: 1, requiredFoldPercent: 1 } },
  { templateId: 'math-half-pot-bluff', surface: 'choice:bet', tokens: { riskBb: 1, rewardBb: 1, requiredFoldPercent: 1 } },
  { templateId: 'math-implied-set-call', surface: 'opponentAction', tokens: { callAmountBb: 1 } },
  { templateId: 'math-implied-set-call', surface: 'prompt', tokens: { callAmountBb: 1 } },
  {
    templateId: 'math-implied-short-fold',
    surface: 'opponentAction',
    tokens: { callAmountBb: 1 },
    fixedLiterals: [{
      field: 'estimatedCleanEquityPercent',
      expectedValue: 12,
      englishPhrase: 'about twelve big blinds remain',
      reason: 'stack-depth prose whose twelve coincides numerically with estimatedCleanEquityPercent=12 but is a stack size, not the equity figure; frozen deliberately (es "doce", pt/ja "12")',
    }],
  },
  { templateId: 'math-implied-short-fold', surface: 'choice:fold', tokens: { directRequiredEquityPercent: 1, estimatedCleanEquityPercent: 1 } },
  { templateId: 'math-implied-short-fold', surface: 'choice:call', tokens: { minimumFutureWinBb: 1 } },
  { templateId: 'math-pot-bluff-fold', surface: 'opponentAction', tokens: { riskBb: 1 } },
  { templateId: 'math-pot-bluff-fold', surface: 'reasoning', tokens: { riskBb: 2, rewardBb: 1, requiredFoldPercent: 1 } },
  {
    templateId: 'math-pot-bluff-fold',
    surface: 'choice:bet',
    tokens: { riskBb: 1, rewardBb: 1 },
    fixedLiterals: [{
      field: 'requiredFoldPercent',
      expectedValue: 50,
      englishPhrase: 'needs half the range to fold',
      reason: 'the 50% break-even is rendered as the phrase "half the range" in every locale (es "la mitad del rango", pt "metade do range", ja レンジの半分); pinned so an English rewrite or calculation change forces re-review',
    }],
  },
  { templateId: 'math-pot-bluff-fold', surface: 'choice:check', tokens: { requiredFoldPercent: 1 } },
  { templateId: 'math-reverse-flush', surface: 'opponentAction', tokens: { callAmountBb: 1 } },
  { templateId: 'math-reverse-flush', surface: 'reasoning', tokens: { requiredEquityPercent: 1 } },
  { templateId: 'overpriced-flush', surface: 'opponentAction', tokens: { callAmountBb: 2, estimatedEquityPercent: 1 } },
  { templateId: 'overpriced-flush', surface: 'reasoning', tokens: { callAmountBb: 1, finalPotBb: 1, requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'overpriced-flush', surface: 'choice:fold', tokens: { requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'read-pressure-bluff-catch', surface: 'opponentAction', tokens: { callAmountBb: 1 } },
  { templateId: 'read-pressure-bluff-catch', surface: 'reasoning', tokens: { callAmountBb: 1, finalPotBb: 1, requiredEquityPercent: 1 } },
  { templateId: 'river-bluff-catch', surface: 'opponentAction', tokens: { callAmountBb: 1, estimatedEquityPercent: 1 } },
  { templateId: 'river-bluff-catch', surface: 'reasoning', tokens: { callAmountBb: 2, finalPotBb: 2, requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'river-bluff-catch', surface: 'choice:fold', tokens: { requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'river-bluff-catch-call', surface: 'opponentAction', tokens: { callAmountBb: 1 } },
  { templateId: 'river-bluff-catch-call', surface: 'prompt', tokens: { estimatedEquityPercent: 1 } },
  { templateId: 'river-bluff-catch-call', surface: 'reasoning', tokens: { callAmountBb: 1, finalPotBb: 1, requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'river-bluff-catch-call', surface: 'choice:call', tokens: { requiredEquityPercent: 1 } },
  { templateId: 'river-bluff-catch-call', surface: 'choice:fold', tokens: { requiredEquityPercent: 1 } },
  { templateId: 'river-bluff-catch-fold', surface: 'opponentAction', tokens: { callAmountBb: 1 } },
  { templateId: 'river-bluff-catch-fold', surface: 'prompt', tokens: { estimatedEquityPercent: 1 } },
  { templateId: 'river-bluff-catch-fold', surface: 'reasoning', tokens: { callAmountBb: 1, finalPotBb: 1, requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'river-bluff-catch-fold', surface: 'choice:call', tokens: { requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'river-bluff-catch-fold', surface: 'choice:fold', tokens: { requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'turn-straight-price', surface: 'opponentAction', tokens: { callAmountBb: 1, estimatedEquityPercent: 1 } },
  { templateId: 'turn-straight-price', surface: 'reasoning', tokens: { callAmountBb: 2, finalPotBb: 2, requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'turn-straight-price', surface: 'choice:call', tokens: { requiredEquityPercent: 1, estimatedEquityPercent: 1 } },
  { templateId: 'turn-straight-price', surface: 'choice:fold', tokens: { estimatedEquityPercent: 1, requiredEquityPercent: 1 } },
];

function loadContract(): Map<string, Map<string, CalcTokenContractEntry>> {
  const contract = new Map<string, Map<string, CalcTokenContractEntry>>();
  for (const entry of CALC_TOKEN_CONTRACT) {
    let perTemplate = contract.get(entry.templateId);
    if (!perTemplate) {
      perTemplate = new Map<string, CalcTokenContractEntry>();
      contract.set(entry.templateId, perTemplate);
    }
    if (perTemplate.has(entry.surface)) {
      throw new Error(`duplicate contract entry for ${entry.templateId}.${entry.surface}`);
    }
    perTemplate.set(entry.surface, entry);
  }
  return contract;
}

describe('scenario placeholder parity', () => {
  const english = loadEnglishTemplates();
  const reviewedPolicy = loadReviewedPolicy();
  const contract = loadContract();

  it('loads the frozen English scenario source and the reviewed es-419 policy', () => {
    expect(english.size).toBe(81);
    expect(reviewedPolicy.size).toBe(81);
  });

  it('validates the explicit calculation contract against the policy and the English floor', () => {
    const failures: string[] = [];
    const surfaceIds = (source: EnglishTemplate): Set<string> => {
      const ids = new Set(['focus', 'opponentAction', 'prompt', 'reasoning', 'takeaway']);
      for (const choice of source.choices) ids.add(`choice:${choice.id}`);
      return ids;
    };

    // Orphaned contract entries: every contract reference must point at a
    // calculation-bearing English template and an existing English surface.
    for (const [templateId, perSurface] of contract) {
      const source = english.get(templateId);
      if (!source?.calculation) {
        failures.push(`contract ${templateId}: entry exists but the template is not calculation-bearing`);
        continue;
      }
      const validSurfaces = surfaceIds(source);
      for (const surface of perSurface.keys()) {
        if (!validSurfaces.has(surface)) {
          failures.push(`contract ${templateId}.${surface}: orphaned entry — no such surface in the English source`);
        }
      }
    }

    // EVERY surface of EVERY calculation-bearing English template is
    // inspected. A surface without a contract entry is treated as
    // `{ tokens: {} }`, so a new or edited surface that embeds a calculation
    // number can never bypass the floor, and a policy token that appears on
    // an uncontracted surface forces a contract entry.
    for (const [templateId, source] of english) {
      if (source.calculation == null) continue;
      const calcFields = new Set(Object.keys(source.calculation).filter((key) => key !== 'kind'));
      const policyTemplate = reviewedPolicy.get(templateId);
      if (!policyTemplate) {
        failures.push(`contract ${templateId}: reviewed es-419 policy template missing`);
        continue;
      }
      const fieldsByValue = new Map<string, string[]>();
      for (const [field, value] of Object.entries(source.calculation)) {
        if (field === 'kind') continue;
        const list = fieldsByValue.get(String(value)) ?? [];
        list.push(field);
        fieldsByValue.set(String(value), list);
      }

      const surfaces: Array<[string, string]> = [
        ['focus', source.focus], ['opponentAction', source.opponentAction], ['prompt', source.prompt],
        ['reasoning', source.reasoning], ['takeaway', source.takeaway],
      ];
      for (const choice of source.choices) {
        const variants = normalizeFeedback(choice.feedback);
        for (const variant of variants) surfaces.push([`choice:${choice.id}`, variant.text]);
      }
      const perSurface = contract.get(templateId) ?? new Map<string, CalcTokenContractEntry>();

      const policySurfaces = new Map<string, Record<string, number>>();
      for (const [surface, text] of Object.entries({
        focus: policyTemplate.focus,
        opponentAction: policyTemplate.opponentAction,
        prompt: policyTemplate.prompt,
        reasoning: policyTemplate.reasoning,
        takeaway: policyTemplate.takeaway,
        ...Object.fromEntries(
          Object.entries((policyTemplate.choices ?? {}) as Record<string, { feedback: string | ReadonlyArray<{ if?: string; text: string }> }>)
            .map(([choiceId, choice]) => [`choice:${choiceId}`, normalizeFeedback(choice.feedback).map((v) => v.text).join(' ')]),
        ),
      })) {
        const calcTokens = Object.fromEntries(
          Object.entries(placeholderMultiset(text)).filter(([name]) => name !== 'heroHand'),
        );
        policySurfaces.set(surface, calcTokens);
      }

      for (const [surface, englishText] of surfaces) {
        const entry: CalcTokenContractEntry = perSurface.get(surface) ?? { templateId, surface, tokens: {} };
        const policyTokens = policySurfaces.get(surface) ?? {};

        // Contract ↔ reviewed-policy equality on EVERY surface: contracted
        // tokens must match the policy exactly, and an uncontracted surface
        // must carry no calculation tokens in the policy at all.
        if (!multisetEquals(entry.tokens, policyTokens)) {
          failures.push(`contract ${templateId}.${surface}: tokens ${JSON.stringify(entry.tokens)} != reviewed policy ${JSON.stringify(policyTokens)}`);
        }

        // Whitelist: contracted tokens must be calculation fields of THIS
        // template's actual calculation object.
        for (const [field] of Object.entries(entry.tokens)) {
          if (!calcFields.has(field)) {
            failures.push(
              `contract ${templateId}.${surface}: {{${field}}} is not a calculation field of this template ` +
                `(fields: ${[...calcFields].sort().join(', ') || 'none'})`,
            );
          }
        }

        // Digit floor — enforced on every surface, contracted or not.
        const stripped = englishText.replace(HAND_NAME, '§hand§');
        for (const [value, fields] of fieldsByValue) {
          const required = occurrencesOfValue(stripped, value);
          const covered = fields.reduce((sum, field) => sum + (entry.tokens[field] ?? 0), 0);
          if (covered < required) {
            failures.push(
              `contract ${templateId}.${surface}: English embeds ${value} ×${required} ` +
                `but contract tokens cover only ${covered} (fields ${fields.join('/')})`,
            );
          }
        }

        // Fixed literals: field whitelist, no double disposition, the English
        // phrase pinned, and the calculation VALUE pinned — a calculation
        // change under an unchanged worded phrase must fail.
        const tokenizedFields = new Set(Object.keys(entry.tokens));
        for (const fixed of entry.fixedLiterals ?? []) {
          if (!calcFields.has(fixed.field)) {
            failures.push(`contract ${templateId}.${surface}: fixed literal field {{${fixed.field}}} is not a calculation field of this template`);
          }
          if (tokenizedFields.has(fixed.field)) {
            failures.push(`contract ${templateId}.${surface}: {{${fixed.field}}} is both tokenized and marked fixed-literal`);
          }
          if (!englishText.includes(fixed.englishPhrase)) {
            failures.push(
              `contract ${templateId}.${surface}: fixed-literal phrase "${fixed.englishPhrase}" no longer appears in the English source — re-review the disposition`,
            );
          }
          const actualValue = source.calculation[fixed.field];
          if (Number(actualValue) !== Number(fixed.expectedValue)) {
            failures.push(
              `contract ${templateId}.${surface}: fixed literal for {{${fixed.field}}} pins value ${fixed.expectedValue} ` +
                `but the calculation now carries ${String(actualValue)} — the frozen wording no longer matches the math; re-review the disposition`,
            );
          }
        }
      }
    }
    expect([...new Set(failures)]).toEqual([]);
  });

  it('validates every draft locale against the exact expected multiset, branch-by-branch', () => {
    const catalogs: ReadonlyArray<[string, unknown]> = [
      ['es-419', spanishScenarioTemplates],
      ['pt-BR', portugueseScenarioTemplates],
      ['ja', japaneseScenarioTemplates],
    ];
    const failures: string[] = [];

    for (const [templateId, source] of english) {
      const calculationFields = new Set(
        source.calculation ? Object.keys(source.calculation).filter((key) => key !== 'kind') : [],
      );
      const policyTemplate = reviewedPolicy.get(templateId);
      if (!policyTemplate) {
        failures.push(`reviewed es-419 policy: missing template ${templateId}`);
        continue;
      }
      const contractSurfaces = contract.get(templateId) ?? new Map<string, CalcTokenContractEntry>();

      for (const [locale, catalog] of catalogs) {
        const entry = (catalog as Record<string, Record<string, unknown>>)[templateId];
        // Rule: a missing template fails — it is never skipped.
        if (!entry) {
          failures.push(`${locale} ${templateId}: missing template`);
          continue;
        }

        for (const field of ['focus', 'opponentAction', 'prompt', 'reasoning', 'takeaway'] as const) {
          failures.push(...compareSurface(
            locale,
            templateId,
            field,
            (source as unknown as Record<string, unknown>)[field],
            entry[field],
            policyTemplate[field],
            contractSurfaces.get(field)?.tokens ?? {},
            calculationFields,
          ));
        }

        const localeChoices = (entry.choices ?? {}) as Record<string, { label: string; feedback: string | ReadonlyArray<{ if?: string; text: string }> }>;
        const policyChoices = (policyTemplate.choices ?? {}) as Record<string, { label: string; feedback: string | ReadonlyArray<{ if?: string; text: string }> }>;
        for (const choice of source.choices) {
          const localeChoice = localeChoices[choice.id];
          const policyChoice = policyChoices[choice.id];
          if (!localeChoice) {
            failures.push(`${locale} ${templateId}/${choice.id}: missing choice`);
            continue;
          }
          if (!policyChoice) {
            failures.push(`reviewed es-419 policy ${templateId}/${choice.id}: missing choice`);
            continue;
          }
          // Choice labels stay placeholder-exact against English everywhere.
          const labelEnglish = placeholderMultiset(choice.label);
          const labelLocale = placeholderMultiset(localeChoice.label);
          if (!multisetEquals(labelEnglish, labelLocale)) {
            failures.push(`${locale} ${templateId}/${choice.id}.label: ${multisetDiff(labelEnglish, labelLocale)}`);
          }

          const englishVariants = normalizeFeedback(choice.feedback);
          const localeVariants = normalizeFeedback(localeChoice.feedback);
          const policyVariants = normalizeFeedback(policyChoice.feedback);

          // Branches are keyed by their `if` expression, never by position.
          const localeBranches = new Map<string, string>();
          for (const variant of localeVariants) {
            if (localeBranches.has(variant.if)) {
              failures.push(`${locale} ${templateId}/${choice.id}: duplicate conditional branch "${variant.if || 'default'}"`);
              continue;
            }
            localeBranches.set(variant.if, variant.text);
          }
          const englishBranches = new Map<string, string>(
            englishVariants.map((variant) => [variant.if, variant.text]),
          );
          const policyBranches = new Map<string, string>(
            policyVariants.map((variant) => [variant.if, variant.text]),
          );
          for (const [branchIf, englishText] of englishBranches) {
            const localeText = localeBranches.get(branchIf);
            const policyText = policyBranches.get(branchIf);
            if (localeText === undefined) {
              failures.push(`${locale} ${templateId}/${choice.id}: missing conditional branch "${branchIf || 'default'}"`);
              continue;
            }
            if (!localeText.trim()) {
              failures.push(`${locale} ${templateId}/${choice.id}[${branchIf || 'default'}]: blank localized text`);
              continue;
            }
            failures.push(...compareSurface(
              locale,
              templateId,
              `${choice.id}[${branchIf || 'default'}]`,
              englishText,
              localeText,
              policyText ?? '',
              contractSurfaces.get(`choice:${choice.id}`)?.tokens ?? {},
              calculationFields,
            ));
          }
          for (const branchIf of localeBranches.keys()) {
            if (!englishBranches.has(branchIf)) {
              failures.push(`${locale} ${templateId}/${choice.id}: extra conditional branch "${branchIf || 'default'}" not present in English`);
            }
          }
        }
      }
    }

    // A locale template with no English counterpart is also a parity
    // violation, never silently ignored.
    for (const [locale, catalog] of catalogs) {
      for (const templateId of Object.keys(catalog as Record<string, unknown>)) {
        if (!english.has(templateId)) {
          failures.push(`${locale} ${templateId}: extra template not present in the English source`);
        }
      }
    }

    expect([...new Set(failures)]).toEqual([]);
  });

  /**
   * Complete-multiset comparison of one surface against the exact expected
   * multiset: English placeholders + heroHand per the reviewed policy +
   * calculation tokens per the explicit contract (whitelist pre-validated).
   */
  function compareSurface(
    locale: string,
    templateId: string,
    surface: string,
    englishText: unknown,
    localeText: unknown,
    policyText: unknown,
    contractTokens: Readonly<Record<string, number>>,
    calculationFields: Set<string>,
  ): string[] {
    const failures: string[] = [];
    const where = `${templateId}.${surface}`;
    const englishMultiset = placeholderMultiset(englishText);
    const localeMultiset = placeholderMultiset(localeText);

    const expected = { ...englishMultiset };
    const policyMultiset = placeholderMultiset(policyText);
    // heroHand placement comes from the reviewed policy; calculation tokens
    // come exclusively from the explicit contract (the contract-validation
    // test guarantees contract == reviewed policy for calc tokens, so
    // counting both would double them).
    for (const [name, count] of Object.entries(policyMultiset)) {
      if (name === 'heroHand') {
        expected[name] = (expected[name] ?? 0) + count;
      }
    }
    for (const [field, count] of Object.entries(contractTokens)) {
      expected[field] = (expected[field] ?? 0) + count;
    }
    if (!multisetEquals(expected, localeMultiset)) {
      failures.push(`${locale} ${where}: ${multisetDiff(expected, localeMultiset)}`);
    }
    return failures;
  }
});
