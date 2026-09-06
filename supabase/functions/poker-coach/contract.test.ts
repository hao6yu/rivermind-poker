import { describe, expect, it } from 'vitest';

import { parseHandReview } from './contract';
import { isCoachLanguage, isRequestableCoachLanguage } from './language.ts';
import * as languageModule from './language.ts';

describe('coach request fairness contract', () => {
  it('drops undeclared hidden-card and outcome fields before OpenAI can receive them', () => {
    const parsed = parseHandReview({
      heroCards: ['A♠', 'K♠'],
      board: ['Q♠', 'J♠', '2♦'],
      street: 'flop',
      actionHistory: ['You raised to 60'],
      language: 'zh-Hant',
      opponentCards: ['Q♥', 'Q♦'],
      deck: ['10♠'],
      result: 'Opponent showed Q♥ Q♦',
      potWon: 400,
    });

    expect(parsed).toEqual({
      heroCards: ['A♠', 'K♠'],
      board: ['Q♠', 'J♠', '2♦'],
      street: 'flop',
      actionHistory: ['You raised to 60'],
      language: 'zh-Hant',
    });
    expect(JSON.stringify(parsed)).not.toMatch(/opponentCards|deck|result|potWon|Q♥|Q♦/);
  });

  it('accepts only the released output languages at the boundary', () => {
    const base = {
      heroCards: ['A♠', 'K♠'],
      board: [],
      street: 'preflop',
      actionHistory: [],
    };
    expect(parseHandReview({ ...base, language: 'en' })?.language).toBe('en');
    expect(parseHandReview({ ...base, language: 'zh-Hans' })?.language).toBe('zh-Hans');
    expect(parseHandReview({ ...base, language: 'zh-Hant' })?.language).toBe('zh-Hant');
    expect(parseHandReview({ ...base, language: 'fr' })).toBeNull();
    expect(parseHandReview({ ...base, language: 'es-ES' })).toBeNull();
    expect(parseHandReview({ ...base, language: 'pt-PT' })).toBeNull();
    expect(parseHandReview({ ...base, language: 'ko' })).toBeNull();
    expect(parseHandReview(base)?.language).toBe('en');
  });

  it('keeps the typed language union identical to the registry while drafts stay gated', () => {
    // Type-level support remains six languages (registry parity, asserted in
    // language.test.ts); the request boundary gates drafts separately.
    const base = {
      heroCards: ['A♠', 'K♠'],
      board: [],
      street: 'preflop',
      actionHistory: [],
    };
    for (const language of ['es-419', 'pt-BR', 'ja'] as const) {
      expect(isCoachLanguage(language), `typed union keeps ${language}`).toBe(true);
      expect(parseHandReview({ ...base, language }), `${language} stays draft-gated`).toBeNull();
    }
  });

  it('rejects unreleased draft languages at the deployed request boundary by default', () => {
    // Review remediation #2: the typed contract knows Japanese (and the
    // es-419/pt-BR drafts), but a normal deployment serves only released
    // languages — a Japanese request never reaches the prompt.
    const base = {
      heroCards: ['A♠', 'K♠'],
      board: [],
      street: 'preflop',
      actionHistory: [],
    };
    expect(parseHandReview({ ...base, language: 'ja' })).toBeNull();
    expect(parseHandReview({ ...base, language: 'es-419' })).toBeNull();
    expect(parseHandReview({ ...base, language: 'pt-BR' })).toBeNull();
  });

  it('serves draft languages only through the explicit per-language release allowlist', () => {
    // Review remediation round 2 (finding #3): the allowlist is per-language —
    // releasing Japanese must not expose es-419 or pt-BR.
    const denoGlobal = globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } };
    const originalDeno = denoGlobal.Deno;
    const setReleased = (value: string | undefined) => {
      denoGlobal.Deno = { env: { get: (key: string) => (key === 'RM_RELEASED_COACH_LANGUAGES' ? value : undefined) } };
    };
    try {
      // Default: no drafts released.
      setReleased(undefined);
      expect(isRequestableCoachLanguage('ja')).toBe(false);
      expect(isRequestableCoachLanguage('es-419')).toBe(false);
      expect(isRequestableCoachLanguage('pt-BR')).toBe(false);
      // Releasing Japanese exposes ONLY Japanese.
      setReleased('ja');
      expect(isRequestableCoachLanguage('ja')).toBe(true);
      expect(isRequestableCoachLanguage('es-419')).toBe(false);
      expect(isRequestableCoachLanguage('pt-BR')).toBe(false);
      // Releasing two drafts works, non-draft ids in the list are ignored.
      setReleased('ja,es-419');
      expect(isRequestableCoachLanguage('ja')).toBe(true);
      expect(isRequestableCoachLanguage('es-419')).toBe(true);
      expect(isRequestableCoachLanguage('pt-BR')).toBe(false);
      // Released languages always remain requestable.
      expect(isRequestableCoachLanguage('en')).toBe(true);
      expect(isRequestableCoachLanguage('zh-Hans')).toBe(true);
      // Unknown languages stay rejected regardless.
      expect(isRequestableCoachLanguage('fr' as never)).toBe(false);
    } finally {
      denoGlobal.Deno = originalDeno;
    }
  });

  it('rejects an analysis contract that attempts to include opponent cards', () => {
    expect(parseHandReview({
      heroCards: ['A♠', 'K♠'],
      board: [],
      street: 'preflop',
      actionHistory: [],
      language: 'en',
      analysisInput: {
        version: 1,
        bigBlind: 20,
        heroCards: [{ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }],
        board: [],
        opponentCards: [{ rank: 2, suit: 'clubs' }, { rank: 2, suit: 'diamonds' }],
        decisions: [],
      },
    })).toBeNull();
  });
});
