import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import {
  aiCoachConsentStorageContract,
  aiCoachRequestRequiresDisclosure,
  assertAiCoachConsentGranted,
  clearAiCoachConsent,
  loadAiCoachConsent,
  saveAiCoachConsent,
} from './aiCoachConsent';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(aiCoachConsentStorageContract.key, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

describe('third-party AI coach consent', () => {
  it('requires the disclosure until explicit consent is granted', () => {
    expect(aiCoachRequestRequiresDisclosure('unknown')).toBe(true);
    expect(aiCoachRequestRequiresDisclosure('declined')).toBe(true);
    expect(aiCoachRequestRequiresDisclosure('granted')).toBe(false);
    expect(() => assertAiCoachConsentGranted('unknown')).toThrow(/Explicit third-party AI consent/);
    expect(() => assertAiCoachConsentGranted('declined')).toThrow(/Explicit third-party AI consent/);
    expect(() => assertAiCoachConsentGranted('granted')).not.toThrow();
  });

  it.each(['granted', 'declined'] as const)('persists and reloads an explicit %s decision', (decision) => {
    const storage = memoryStorage();
    expect(saveAiCoachConsent(decision, storage)).toBe(decision);
    expect(loadAiCoachConsent(storage)).toBe(decision);
    expect(JSON.parse(storage.values.get(aiCoachConsentStorageContract.key) ?? '')).toEqual({
      version: 1,
      decision,
    });
  });

  it.each([
    '{bad json',
    'null',
    '[]',
    JSON.stringify({ version: 2, decision: 'granted' }),
    JSON.stringify({ version: 1, decision: 'unknown' }),
    JSON.stringify({ version: 1, decision: true }),
  ])('fails closed for corrupt or unsupported persisted data: %s', (raw) => {
    expect(loadAiCoachConsent(memoryStorage(raw))).toBe('unknown');
  });

  it('clears consent when the local anonymous account is removed', () => {
    const storage = memoryStorage();
    saveAiCoachConsent('granted', storage);
    clearAiCoachConsent(storage);
    expect(loadAiCoachConsent(storage)).toBe('unknown');
    expect(storage.values.has(aiCoachConsentStorageContract.key)).toBe(false);
  });

  it('fails closed on reads and keeps cleanup and explicit choices non-throwing on storage errors', () => {
    const unavailable = {
      getItem: () => { throw new Error('unavailable'); },
      removeItem: () => { throw new Error('unavailable'); },
      setItem: () => { throw new Error('full'); },
    };
    expect(loadAiCoachConsent(unavailable)).toBe('unknown');
    expect(saveAiCoachConsent('granted', unavailable)).toBe('granted');
    expect(() => clearAiCoachConsent(unavailable)).not.toThrow();
  });
});
