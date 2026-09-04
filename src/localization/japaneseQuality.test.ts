import { describe, expect, it } from 'vitest';

import { accountDeletionMessage } from './accountDeletionMessages';
import { aiCoachConsentCopy } from './aiCoachConsentMessages';
import { localizedOrdinalPlace } from './format';
import { japaneseMessages } from './ja';
import type { MessageKey } from './messages';
import { LOCALES, SHIPPED_LOCALES } from './registry';

/**
 * Japanese-specific product gates (Phase 19.5, style guide §7/§10/§12):
 * typography hygiene, no Simplified-Chinese leakage, complete consent and
 * deletion copy, and the draft-gating invariants that keep Japanese out of the
 * production surfaces until the native review records its approval.
 *
 * Native Japanese review remains an owner gate; these checks cover only what
 * automation can prove.
 */

// Simplified-Chinese-only forms that never appear in Japanese text. The poker
// vocabulary list comes from the ja style guide §10; the character list is the
// set of simplified-only glyphs whose Japanese shinjitai differ.
const BANNED_SUBSTRINGS = [
  '弃牌', '过牌', '下注', '加注', '全下', '底池', '盲注', '翻牌', '转牌', '河牌',
  '听牌', '补牌', '范围', '价值', '诈唬', '筹码', '对手', '玩家', '牌局', '牌面',
  '牌型', '牌桌', '学习', '进度', '删除', '账户', '记录', '训练', '奖金', '赢家',
];
const BANNED_CHARS = /[价弃筹听记设应单张觉备术钱劝净误满对门东车见贝长马鸟龙为头实质气风飞书们个]/;
const HALF_WIDTH_KATAKANA = /[\uFF66-\uFF9D]/;
// Full-width alphanumerics only (ＡＢＣ１２３). Full-width punctuation (？！（）) is
// REQUIRED Japanese typography (style guide §7) and must stay allowed.
const FULL_WIDTH_ALNUM = /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/;

/** Values allowed to stay ASCII-only (self-names, protocol-stable labels). */
const ASCII_ALLOWLIST = new Set<string>([
  'language.en',
  'language.zhHans',
  'language.zhHant',
  'multiway.practiceLevel',
  'championship.lineupTier',
  'multiplayer.option.chips',
  'multiplayer.join.placeholder',
  'multiplayer.lobby.ai',
  'guided.calibration.calibration-pot-odds.choice.20-percent',
  'guided.calibration.calibration-pot-odds.choice.25-percent',
  'guided.calibration.calibration-pot-odds.choice.33-percent',
  'guided.calibration.calibration-bluff-threshold.choice.25-percent',
  'guided.calibration.calibration-bluff-threshold.choice.50-percent',
]);

describe('japanese catalog quality', () => {
  it('keeps every catalog value free of Simplified-Chinese forms and banned typography', () => {
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(japaneseMessages) as Array<[MessageKey, string]>) {
      const stripped = value.replace(/\{\{\w+\}\}/g, '');
      if (HALF_WIDTH_KATAKANA.test(stripped)) offenders.push(`${key}: half-width katakana`);
      if (FULL_WIDTH_ALNUM.test(stripped)) offenders.push(`${key}: full-width alphanumerics`);
      for (const term of BANNED_SUBSTRINGS) {
        if (stripped.includes(term)) offenders.push(`${key}: Chinese leakage "${term}"`);
      }
      const leak = stripped.match(BANNED_CHARS);
      if (leak) offenders.push(`${key}: simplified-only character "${leak[0]}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('renders Japanese text in every value outside the protocol-stable allowlist', () => {
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(japaneseMessages) as Array<[MessageKey, string]>) {
      if (ASCII_ALLOWLIST.has(key)) continue;
      const stripped = value.replace(/\{\{\w+\}\}/g, '');
      // Kana/kanji or full-width Japanese punctuation (「{{label}}。」 counts —
      // its full-width 。 is the Japanese rendering of the English period).
      if (!/[\u3040-\u30ff\u4e00-\u9fff\u3001\u3002\uFF01\uFF1F\u300C\u300D\u30FB]/.test(stripped)) {
        offenders.push(`${key}: "${value}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the full consent copy complete and grounded in the glossary', () => {
    const copy = aiCoachConsentCopy('ja');
    expect(copy.eyebrow).toBe('サードパーティAI');
    expect(copy.title).toContain('Supabase');
    expect(copy.title).toContain('OpenAI');
    expect(copy.introduction).toContain('RiverMind');
    expect(copy.introduction).toContain('「許可」を選ぶまで');
    expect(copy.sentItems).toHaveLength(4);
    for (const item of copy.sentItems) {
      expect(item.length).toBeGreaterThan(10);
      expect(item.endsWith('。')).toBe(true);
    }
    expect(copy.sentItems[3]).toContain('ポットオッズ');
    expect(copy.sentItems[3]).toContain('必要エクイティ');
    expect(copy.sentItems[3]).toContain('SPR');
    expect(copy.providers).toContain('Supabase');
    expect(copy.providers).toContain('OpenAI');
    expect(copy.providers).toContain('一方向ハッシュ');
    expect(copy.notSent).toContain('store: false');
    expect(copy.notSent).toContain('ニックネーム');
    expect(copy.notSent).toContain('ルームコード');
    expect(copy.localReview).toContain('決定論的レビュー');
    expect(copy.cancel).toBe('キャンセル');
    expect(copy.decline).toBe('許可しない');
    expect(copy.allow).toBe('許可してAIに相談');
  });

  it('keeps the account-deletion copy explicit about irreversibility', () => {
    const keys = [
      'settings.deleteAccount',
      'settings.deleteAccountDescription',
      'settings.deleteAccountTitle',
      'settings.deleteAccountMessage',
      'settings.deleteAccountConfirm',
      'settings.deleteAccountDeleting',
      'settings.deleteAccountFailedTitle',
      'settings.deleteAccountFailedMessage',
    ] as const;
    for (const key of keys) {
      const value = accountDeletionMessage('ja', key);
      expect(value.length, `${key} is unexpectedly short`).toBeGreaterThan(3);
    }
    expect(accountDeletionMessage('ja', 'settings.deleteAccountTitle')).toBe('アカウントを削除しますか？');
    expect(accountDeletionMessage('ja', 'settings.deleteAccountMessage'))
      .toContain('元に戻せません');
    expect(accountDeletionMessage('ja', 'settings.deleteAccountMessage'))
      .toContain('プライベートテーブル');
    expect(accountDeletionMessage('ja', 'settings.deleteAccountFailedMessage'))
      .toContain('データはまだ削除されていません');
  });

  it('renders Japanese place ordinals with the ranking counter', () => {
    expect(localizedOrdinalPlace(1, 'ja')).toBe('1位');
    expect(localizedOrdinalPlace(3, 'ja')).toBe('3位');
    expect(localizedOrdinalPlace(13, 'ja')).toBe('13位');
  });

  it('keeps Japanese out of the production surfaces while the native review is pending', () => {
    expect(LOCALES.ja.releaseEnabled).toBe(false);
    expect(SHIPPED_LOCALES).not.toContain('ja');
    // The self-name row still resolves through the catalog for preview builds.
    expect(japaneseMessages['language.ja']).toBe('日本語');
  });
});
