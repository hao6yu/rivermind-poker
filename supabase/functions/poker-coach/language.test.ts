import { describe, expect, it } from 'vitest';

import { coachLanguageInstruction } from './language';
import { AI_COACH_LANGUAGES } from '../../../src/localization/registry';

describe('coach output language', () => {
  it('gives each allowlisted locale an explicit prose instruction', () => {
    expect(coachLanguageInstruction('en')).toContain('English');
    expect(coachLanguageInstruction('zh-Hans')).toContain('Simplified Chinese');
    expect(coachLanguageInstruction('zh-Hant')).toContain('Traditional Chinese');
    expect(coachLanguageInstruction('es-419')).toContain('Latin American Spanish');
    expect(coachLanguageInstruction('pt-BR')).toContain('Brazilian Portuguese');
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

  it('stays aligned with the registry AI-coach locale list', () => {
    // The Edge Function keeps an explicit typed allowlist (no full-catalog
    // import in the Deno bundle); this test pins the two lists together so a
    // registry change cannot silently desync the deployed contract.
    const contractLanguages = ['en', 'zh-Hans', 'zh-Hant', 'es-419', 'pt-BR'] as const;
    expect([...contractLanguages].sort()).toEqual([...AI_COACH_LANGUAGES].sort());
  });
});
