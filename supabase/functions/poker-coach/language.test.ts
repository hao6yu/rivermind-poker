import { describe, expect, it } from 'vitest';

import { coachLanguageInstruction } from './language';

describe('coach output language', () => {
  it('gives each allowlisted locale an explicit prose instruction', () => {
    expect(coachLanguageInstruction('en')).toContain('English');
    expect(coachLanguageInstruction('zh-Hans')).toContain('Simplified Chinese');
    expect(coachLanguageInstruction('zh-Hant')).toContain('Traditional Chinese');
  });

  it('keeps established poker abbreviations stable in Chinese output', () => {
    expect(coachLanguageInstruction('zh-Hans')).toContain('BB, SPR, EV, ICM, 3-bet, and 4-bet');
    expect(coachLanguageInstruction('zh-Hant')).toContain('BB, SPR, EV, ICM, 3-bet, and 4-bet');
  });

  it('requires natural regional poker terminology instead of literal calques', () => {
    const simplified = coachLanguageInstruction('zh-Hans');
    const traditional = coachLanguageInstruction('zh-Hant');

    expect(simplified).toContain('底池赔率');
    expect(simplified).toContain('底牌、公共牌');
    expect(simplified).toContain('备选打法');
    expect(simplified).toContain('庄家位（BTN）');
    expect(traditional).toContain('底池賠率');
    expect(traditional).toContain('底牌、公共牌');
    expect(traditional).toContain('備選打法');
    expect(traditional).toContain('莊家位（BTN）');
    expect(simplified).toContain('do not translate 3-bet or 4-bet as 三下注 or 四下注');
    expect(traditional).toContain('do not translate 3-bet or 4-bet as 三下注 or 四下注');
  });
});
