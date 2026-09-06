import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { accountDeletionMessage } from './accountDeletionMessages';
import { aiCoachConsentCopy } from './aiCoachConsentMessages';
import { localizedOrdinalPlace } from './format';
import { japaneseMessages } from './ja';
import { japaneseLearningContent } from './ja';
import { japaneseScenarioTemplates, japaneseScenarioVocab } from './ja/scenarioContent';
import type { MessageKey } from './messages';
import { LOCALES, SHIPPED_LOCALES } from './registry';
import '../test/draftCatalogFixture';

/**
 * Japanese quality gate over the COMPLETE runtime surface (review
 * remediation #7): base + phase messages, lessons, trainers, cheat sheets,
 * scenario templates with conditional feedback, scenario vocabulary, AI
 * consent, account deletion, and accessibility strings.
 *
 * Checks per string: banned Simplified-Chinese forms, half-width katakana,
 * full-width alphanumerics, glossary-banned variants (style guide §10),
 * Japanese punctuation rules, unresolved placeholders against the documented
 * runtime set, and embedded Latin tokens outside the documented retained-term
 * allowlist (style guide §4 + protocol/product terms).
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const guidePath = resolve(projectRoot, 'docs', 'LOCALIZATION_JA_STYLE_GUIDE.md');

// ---------------------------------------------------------------------------
// Surface collection
// ---------------------------------------------------------------------------

interface JapaneseString {
  surface?: string;
  path: string;
  value: string;
}

function* walkStrings(value: unknown, path: string): Generator<{ path: string; value: string }> {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      yield* walkStrings(value[index], `${path}[${index}]`);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      yield* walkStrings(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string') {
    yield { path, value };
  }
}

function collectRuntimeStrings(): JapaneseString[] {
  const strings: JapaneseString[] = [];
  // Messages (base + phases; includes accessibility strings).
  for (const [key, value] of Object.entries(japaneseMessages) as Array<[MessageKey, string]>) {
    strings.push({ surface: 'messages', path: key, value });
  }
  // Lessons: headings, bodies, bullets, takeaways, examples.
  for (const [lessonId, lesson] of Object.entries(japaneseLearningContent.lessons ?? {})) {
    for (const [sectionIndex, section] of (lesson.sections ?? []).entries()) {
      for (const s of walkStrings(section, `lessons.${lessonId}.sections.${sectionIndex}`)) {
        strings.push({ ...s, surface: 'lessons' });
      }
    }
  }
  // Trainers (prompts, contexts, explanations, choice labels + feedback).
  for (const [trainerId, trainer] of Object.entries(japaneseLearningContent.trainers ?? {})) {
    for (const s of walkStrings(trainer, `trainers.${trainerId}`)) {
      strings.push({ ...s, surface: 'trainers' });
    }
  }
  // Cheat sheets (notes, group titles, row labels + details).
  for (const [sheetId, sheet] of Object.entries(japaneseLearningContent.cheatSheets ?? {})) {
    for (const s of walkStrings(sheet, `cheatSheets.${sheetId}`)) {
      strings.push({ ...s, surface: 'cheatSheets' });
    }
  }
  // Scenario templates: every field incl. conditional feedback variants. The
  // vocab `actions[].pattern` sources match ENGLISH labels by contract (they
  // are regex sources, not rendered copy) and are excluded; `terms`,
  // `handLabels`, and `mathSummaries` are rendered copy and included.
  for (const [templateId, template] of Object.entries(japaneseScenarioTemplates)) {
    for (const s of walkStrings(template, `scenarios.${templateId}`)) {
      strings.push({ ...s, surface: 'scenarios' });
    }
  }
  for (const s of walkStrings(japaneseScenarioVocab, 'scenarioVocab')) {
    // patterns/templates match ENGLISH labels by contract; handJoiner is the
    // intentional empty join contract (ja joins 9-9のペア directly).
    if (/\.actions\[\d+\]\.(pattern|template)$/.test(s.path)) continue;
    if (/\.handJoiner$/.test(s.path)) continue;
    strings.push({ ...s, surface: 'scenarioVocab' });
  }
  // AI consent + account deletion (critical copy).
  const consent = aiCoachConsentCopy('ja');
  for (const [field, value] of Object.entries(consent)) {
    for (const s of walkStrings(value, `consent.${field}`)) {
      strings.push({ ...s, surface: 'consent' });
    }
  }
  for (const key of [
    'settings.deleteAccount',
    'settings.deleteAccountDescription',
    'settings.deleteAccountTitle',
    'settings.deleteAccountMessage',
    'settings.deleteAccountConfirm',
    'settings.deleteAccountDeleting',
    'settings.deleteAccountFailedTitle',
    'settings.deleteAccountFailedMessage',
  ] as const) {
    strings.push({ surface: 'accountDeletion', path: key, value: accountDeletionMessage('ja', key) });
  }
  return strings;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const BANNED_SUBSTRINGS = [
  '弃牌', '过牌', '下注', '加注', '全下', '底池', '盲注', '翻牌', '转牌', '河牌',
  '听牌', '补牌', '范围', '价值', '诈唬', '筹码', '对手', '玩家', '牌局', '牌面',
  '牌型', '牌桌', '学习', '进度', '删除', '账户', '记录', '训练', '奖金', '赢家',
];
const BANNED_CHARS = /[价弃筹听记设应单张觉备术钱劝净误满对门东车见贝长马鸟龙为头实质气风飞书们个]/;
const HALF_WIDTH_KATAKANA = /[\uFF66-\uFF9D]/;
const FULL_WIDTH_ALNUM = /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/;
/** Glossary-banned variants (style guide §10) with the approved form. */
const BANNED_GLOSSARY_VARIANTS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /プレフロップ/, label: 'プレフロップ — use プリフロップ' },
  { pattern: /スリーベット/, label: 'スリーベット — use 3-bet' },
  { pattern: /三ベット/, label: '三ベット — use 3-bet' },
  { pattern: /四ベット/, label: '四ベット — use 4-bet' },
  { pattern: /ハンドヒストリー/, label: 'ハンドヒストリー — use ハンド履歴' },
  { pattern: /オンボーディング/, label: 'オンボーディング — use 初期設定' },
  { pattern: /現在価格/, label: '現在価格 — use plain price wording' },
];

/**
 * Retained Latin tokens (style guide §4 plus protocol/product terms). Card
 * notation (A-K, QQ, 10 …), self-names, and file paths are notation, not
 * untranslated English. `vs` was removed from the catalog (review finding
 * #10); `OFF` was replaced with オフ.
 */
const ALLOWED_LATIN = new Set([
  'All-in', 'all-in', '3-bet', '4-bet', 'C-bet', 'SPR', 'EV', 'ICM', 'MTT',
  'Sit & Go', 'UTG', 'MP', 'CO', 'BTN', 'SB', 'BB', 'HJ', 'D',
  'RiverMind', 'RiverMind AI', 'AI', 'Lv',
  'Supabase', 'OpenAI', 'store: false',
  'English', 'iOS', 'iPhone & iPad', 'UI', 'API', 'QR', 'MB', 'PRIVACY.md', 'docs', 'UTC',
  // Card notation and rank letters inside examples.
  'A', 'K', 'Q', 'J', '10', 'A-K', 'A-K-Q-J-10', 'A-2-3-4-5', 'K-A-2', 'K-Q',
  'A-J', 'A-Q', 'A-5', 'A-8', 'A-A', 'AK', 'AQ', 'QQ', 'AA', 'KQs',
  'A-K-Q-J', 'K-A', 'ID',
  // Numbered product/notation runs: fixed quota reset clock, avatar size cap,
  // and the 5-bet sizing reference in the advanced-math sheet.
  'UTC 0:00', '25 MB', '5-bet',
]);

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

function latinTokens(value: string): string[] {
  const withoutPlaceholders = value.replace(PLACEHOLDER, ' ');
  return [...withoutPlaceholders.matchAll(/[A-Za-z0-9][A-Za-z0-9&.':\- ]*[A-Za-z0-9]|[A-Za-z]/g)]
    .map((match) => match[0].trim())
    // Pure numerals/numeric notation (2,000 · 2.5 · 40) are language-neutral.
    .filter((token) => token.length > 0 && /[A-Za-z]/.test(token) && !/^[0-9]+$/.test(token));
}

/**
 * The documented runtime-supplied placeholder names (from the typed
 * MessageKey templates and the scenario calculation contract).
 */
const KNOWN_PLACEHOLDER_NAMES = new Set([
  // Championship map: ordinal stop number and localized prerequisite text.
  'number', 'requirement',
  // App-wide render values.
  'count', 'amount', 'hand', 'level', 'smallBlind', 'bigBlind', 'difficulty',
  'stack', 'length', 'player', 'actor', 'action', 'cards', 'name', 'phrase',
  'complete', 'total', 'current', 'minutes', 'title', 'description', 'score',
  'date', 'days', 'spots', 'concept', 'decisions', 'hands', 'attempts',
  'percent', 'place', 'event', 'streak', 'season', 'target', 'step',
  'chosen', 'baseline', 'label', 'detail', 'confidence', 'lineup', 'limit',
  'remaining', 'allowance', 'sequence', 'grade', 'subject', 'names', 'winner',
  'board', 'options', 'hero', 'opponent', 'language', 'goal', 'focus',
  'change', 'overall', 'mistake', 'strong', 'close', 'activity', 'rate',
  'due', 'completed', 'skipped', 'points', 'sessions', 'chapter', 'preferred',
  'threshold', 'min', 'max', 'mode', 'seconds', 'code', 'url', 'session',
  'delta', 'grade', 'family', 'position', 'players', 'hand', 'hands', 'week',
  'decisions', 'correct', 'mastery', 'card', 'suit', 'rank', 'hearts', 'unseen',
  'price', 'value', 'pot', 'floor', 'chips', 'address', 'stage', 'version',
  'email', 'qualified', 'wins', 'seats', 'bb', 'decision', 'phrase', 'names',
  'leader', 'target', 'state', 'kind', 'mistakes', 'streak', 'season',
  // Scenario calculation placeholders (contract set).
  'callAmountBb', 'finalPotBb', 'requiredEquityPercent', 'estimatedEquityPercent',
  'directRequiredEquityPercent', 'estimatedCleanEquityPercent', 'minimumFutureWinBb',
  'riskBb', 'rewardBb', 'requiredFoldPercent',
  // Scenario template values + heroHand.
  'heroHand', 'call', 'required', 'equity', 'future', 'risk', 'reward',
  'check', 'coach', 'fold', 'ios', 'raise', 'scope', 'street',
]);

function checkString(item: JapaneseString): string[] {
  const problems: string[] = [];
  const { value } = item;
  const label = `${item.surface ?? ''}:${item.path}`;
  if (!value.trim()) problems.push(`${label}: blank value`);
  if (HALF_WIDTH_KATAKANA.test(value)) problems.push(`${label}: half-width katakana`);
  if (FULL_WIDTH_ALNUM.test(value)) problems.push(`${label}: full-width alphanumerics`);
  for (const term of BANNED_SUBSTRINGS) {
    if (value.includes(term)) problems.push(`${label}: Simplified-Chinese leakage "${term}"`);
  }
  const charLeak = value.match(BANNED_CHARS);
  if (charLeak) problems.push(`${label}: simplified-only character "${charLeak[0]}"`);
  for (const { pattern, label: variant } of BANNED_GLOSSARY_VARIANTS) {
    if (pattern.test(value)) problems.push(`${label}: banned glossary variant — ${variant}`);
  }
  // Punctuation: Japanese prose never uses half-width ? or ! (full-width ？！
  // are required by style guide §7). ASCII forms appear only inside Latin
  // protocol fragments ("store: false", file paths), which the Latin
  // allowlist already governs.
  if (/[?!](?![A-Za-z])/.test(value)) problems.push(`${label}: half-width ?/! in Japanese prose (use ？！)`);
  // Embedded Latin outside the retained allowlist.
  for (const token of latinTokens(value)) {
    if (!ALLOWED_LATIN.has(token)) {
      problems.push(`${label}: embedded Latin "${token}" is not on the retained allowlist`);
    }
  }
  // Placeholder names must belong to the documented runtime-supplied set.
  for (const match of value.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name && !KNOWN_PLACEHOLDER_NAMES.has(name)) {
      problems.push(`${label}: undocumented placeholder {{${name}}}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

describe('japanese runtime-surface quality (review remediation #7)', () => {
  it('documents the retained Latin allowlist the gate enforces', () => {
    const guide = readFileSync(guidePath, 'utf8');
    for (const token of ['3-bet', 'C-bet', 'SPR', 'EV', 'ICM', 'UTG', 'BTN', 'SB']) {
      expect(guide, `style guide must document ${token}`).toContain(token);
    }
  });

  it('collects strings from every runtime surface', () => {
    const strings = collectRuntimeStrings();
    const surfaces = new Set(strings.map((s) => s.surface));
    for (const surface of ['messages', 'lessons', 'trainers', 'cheatSheets', 'scenarios', 'scenarioVocab', 'consent', 'accountDeletion']) {
      expect(surfaces, `${surface} surface must be collected`).toContain(surface);
    }
    // Conditional feedback variants are reached through the scenario walk.
    const variants = strings.filter((s) => s.surface === 'scenarios' && /feedback/.test(s.path));
    expect(variants.length).toBeGreaterThan(200);
    // Accessibility strings ride the message catalog (A11y/a11y keys).
    expect(strings.some((s) => s.surface === 'messages' && /a11y/i.test(s.path))).toBe(true);
  });

  it('keeps every runtime string free of banned forms, variants, and off-allowlist Latin', () => {
    const strings = collectRuntimeStrings();
    const problems: string[] = [];
    for (const item of strings) {
      problems.push(...checkString(item));
    }
    expect(problems).toEqual([]);
  });

  it('resolves every placeholder in every runtime string against the documented set', () => {
    const strings = collectRuntimeStrings();
    const unknown = new Set<string>();
    for (const item of strings) {
      for (const match of item.value.matchAll(PLACEHOLDER)) {
        const name = match[1];
        if (name && !KNOWN_PLACEHOLDER_NAMES.has(name)) {
          unknown.add(`${item.surface}:${item.path} → {{${name}}}`);
        }
      }
    }
    expect([...unknown]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Retained from the original gate (draft-gating invariants + ordinals)
// ---------------------------------------------------------------------------

describe('japanese catalog quality (Phase 19.5)', () => {
  it('renders Japanese place ordinals with the ranking counter', () => {
    expect(localizedOrdinalPlace(1, 'ja')).toBe('1位');
    expect(localizedOrdinalPlace(3, 'ja')).toBe('3位');
    expect(localizedOrdinalPlace(13, 'ja')).toBe('13位');
  });

  it('keeps Japanese out of the production surfaces while the native review is pending', () => {
    expect(LOCALES.ja.releaseEnabled).toBe(false);
    expect(SHIPPED_LOCALES).not.toContain('ja');
    expect(japaneseMessages['language.ja']).toBe('日本語');
  });
});
