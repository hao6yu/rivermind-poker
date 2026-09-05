import { describe, expect, it } from 'vitest';

import { coachLanguageInstruction, DRAFT_COACH_LANGUAGES, RELEASED_COACH_LANGUAGES, isRequestableCoachLanguage, releasedDraftCoachLanguages } from './language';
import { AI_COACH_LANGUAGES } from '../../../src/localization/registry';

describe('coach output language', () => {
  it('gives each allowlisted locale an explicit prose instruction', () => {
    expect(coachLanguageInstruction('en')).toContain('English');
    expect(coachLanguageInstruction('zh-Hans')).toContain('Simplified Chinese');
    expect(coachLanguageInstruction('zh-Hant')).toContain('Traditional Chinese');
    expect(coachLanguageInstruction('es-419')).toContain('Latin American Spanish');
    expect(coachLanguageInstruction('pt-BR')).toContain('Brazilian Portuguese');
    expect(coachLanguageInstruction('ja')).toContain('Japanese');
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

  it('requires glossary-conformant Spanish terminology and formality', () => {
    const spanish = coachLanguageInstruction('es-419');

    expect(spanish).toContain('igualar');
    expect(spanish).toContain('probabilidades del bote');
    expect(spanish).toContain('ciegas grandes');
    expect(spanish).toContain('farol');
    expect(spanish).toContain('tú form');
    expect(spanish).toContain('no vosotros');
    expect(spanish).toContain('no calle for a betting street');
    expect(spanish).toContain('SPR, EV, ICM, 3-bet, and 4-bet');
  });

  it('requires glossary-conformant Brazilian terminology and formality', () => {
    const portuguese = coachLanguageInstruction('pt-BR');

    expect(portuguese).toContain('pagar');
    expect(portuguese).toContain('odds do pote');
    expect(portuguese).toContain('blefe');
    expect(portuguese).toContain('você form');
    expect(portuguese).toContain('no escala for a straight');
    expect(portuguese).toContain('no farol for a bluff');
    expect(portuguese).toContain('Keep big blind and big blinds in English');
    expect(portuguese).toContain('SPR, EV, ICM, 3-bet, and 4-bet');
  });

  it('requires glossary-conformant Japanese terminology and formality', () => {
    const japanese = coachLanguageInstruction('ja');

    expect(japanese).toContain('フォールド、チェック、コール、ベット、レイズ、オールイン');
    expect(japanese).toContain('プリフロップ、フロップ、ターン、リバー');
    expect(japanese).toContain('ポットオッズ');
    expect(japanese).toContain('必要エクイティ');
    expect(japanese).toContain('です・ます体');
    expect(japanese).toContain('BB, SPR, EV, ICM, 3-bet, and 4-bet');
    expect(japanese).toContain('三ベット is banned');
  });

  it('stays aligned with the registry AI-coach locale list', () => {
    // The Edge Function keeps an explicit typed allowlist (no full-catalog
    // import in the Deno bundle); this test pins the two lists together so a
    // registry change cannot silently desync the deployed contract.
    const contractLanguages = ['en', 'zh-Hans', 'zh-Hant', 'es-419', 'pt-BR', 'ja'] as const;
    expect([...contractLanguages].sort()).toEqual([...AI_COACH_LANGUAGES].sort());
  });

  it('serves only released languages at the request boundary (review remediation #2)', () => {
    // The registry's releaseEnabled flag is the authority; the deployed
    // default mirrors it exactly: released locales on, drafts off.
    expect(RELEASED_COACH_LANGUAGES).toEqual(['en', 'zh-Hans', 'zh-Hant']);
    expect(DRAFT_COACH_LANGUAGES.sort()).toEqual(['es-419', 'pt-BR', 'ja'].sort());
    for (const language of RELEASED_COACH_LANGUAGES) {
      expect(isRequestableCoachLanguage(language), `${language} is released`).toBe(true);
    }
    for (const language of DRAFT_COACH_LANGUAGES) {
      expect(isRequestableCoachLanguage(language), `${language} stays draft-gated by default`).toBe(false);
    }
    // Per-language allowlist (round 2, finding #3): enabling ja leaves the
    // other drafts rejected.
    const denoGlobal = globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } };
    const originalDeno = denoGlobal.Deno;
    denoGlobal.Deno = { env: { get: (key: string) => (key === 'RM_RELEASED_COACH_LANGUAGES' ? 'ja' : undefined) } };
    try {
      expect(releasedDraftCoachLanguages()).toEqual(['ja']);
      expect(isRequestableCoachLanguage('ja')).toBe(true);
      expect(isRequestableCoachLanguage('es-419')).toBe(false);
      expect(isRequestableCoachLanguage('pt-BR')).toBe(false);
    } finally {
      denoGlobal.Deno = originalDeno;
    }
  });
});
