import { describe, expect, it } from 'vitest';

import type { AppLanguage } from './core';
import { aiCoachConsentCopy } from './aiCoachConsentMessages';

const languages: readonly AppLanguage[] = ['en', 'zh-Hans', 'zh-Hant'];

function fullCopy(language: AppLanguage): string {
  const copy = aiCoachConsentCopy(language);
  return [
    copy.eyebrow,
    copy.title,
    copy.introduction,
    copy.sentHeading,
    ...copy.sentItems,
    copy.providers,
    copy.notSent,
    copy.localReview,
    copy.cancel,
    copy.decline,
    copy.allow,
  ].join(' ');
}

describe('AI coach consent localization', () => {
  it.each(languages)('names both third-party providers and every transmitted data category in %s', (language) => {
    const text = fullCopy(language);
    expect(text).toContain('Supabase');
    expect(text).toContain('OpenAI');
    expect(text).toContain('ID');
    expect(text).toContain('store: false');

    const copy = aiCoachConsentCopy(language);
    expect(copy.sentItems).toHaveLength(4);
    expect(copy.sentItems.every((item) => item.trim().length > 0)).toBe(true);
    expect(copy.cancel).not.toBe(copy.decline);
    expect(copy.decline).not.toBe(copy.allow);
  });

  it('spells out the exact English payload and the deterministic fallback', () => {
    const text = fullCopy('en');
    for (const expected of [
      'two hole cards',
      'community cards',
      'public action history',
      'bet sizes',
      'The big blind',
      'pot',
      'call-cost',
      'stack',
      'legal actions',
      'app language',
      'both players’ stack',
      'minimum, maximum, and suggested raise amounts',
      'required equity',
      'stack-to-pot ratio',
      'possible opponent hand categories (not cards)',
      'anonymous account ID',
      'hashed safety identifier',
      'aggregate request outcome, latency, and error details',
      'saved with your hand history',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).toContain('deterministic review');
    expect(text).toContain('does not send your nickname, room code, undealt cards, or opponents’ hidden cards');
  });

  it('uses natural script-specific poker and privacy terminology in both Chinese variants', () => {
    const hans = fullCopy('zh-Hans');
    const hant = fullCopy('zh-Hant');

    expect(hans).toContain('底池赔率');
    expect(hans).toContain('筹码底池比（SPR）');
    expect(hans).toContain('单向哈希安全标识');
    expect(hans).toContain('确定性本地复盘');

    expect(hant).toContain('公開牌');
    expect(hant).toContain('底池賠率');
    expect(hant).toContain('籌碼底池比（SPR）');
    expect(hant).toContain('單向雜湊安全識別碼');
    expect(hant).toContain('確定性本機牌局回顧');
    expect(hant).not.toMatch(/[发传账验额储应这会门隐张]/);
  });
});
