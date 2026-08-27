import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import {
  clearSessionEvidence,
  loadSessionEvidence,
  saveSessionEvidence,
} from './recommendedSessionEvidence';
import type { RecommendedSessionEvidenceStorage } from './recommendedSessionEvidence';

const storageKey = 'rivermind.recommended-session-evidence.v1';

function memoryStorage(initial?: string): RecommendedSessionEvidenceStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(storageKey, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

describe('recommended session evidence', () => {
  it('returns nothing when nothing is stored', () => {
    expect(loadSessionEvidence('plan-a', memoryStorage())).toBeNull();
  });

  it('round-trips a saved tally for the owning plan', () => {
    const storage = memoryStorage();
    saveSessionEvidence('plan-a', { decisionsScored: 4, costlyMistakes: 1 }, storage);
    expect(loadSessionEvidence('plan-a', storage)).toEqual({ decisionsScored: 4, costlyMistakes: 1 });
  });

  it('ignores a stored tally that belongs to a different plan', () => {
    // A newly composed plan must start from zero, not inherit the previous
    // session's evidence (the resume/relaunch hydration contract).
    const storage = memoryStorage();
    saveSessionEvidence('plan-1', { decisionsScored: 6, costlyMistakes: 2 }, storage);
    expect(loadSessionEvidence('plan-2', storage)).toBeNull();
    expect(loadSessionEvidence(undefined, storage)).toBeNull();
    expect(loadSessionEvidence(null, storage)).toBeNull();
  });

  it('clamps a malformed stored tally to non-negative values', () => {
    const storage = memoryStorage();
    saveSessionEvidence('plan-a', { decisionsScored: 3, costlyMistakes: 0 }, storage);
    storage.values.set(storageKey, JSON.stringify({ planId: 'plan-a', decisions: { decisionsScored: -2, costlyMistakes: -1 } }));
    expect(loadSessionEvidence('plan-a', storage)).toEqual({ decisionsScored: 0, costlyMistakes: 0 });
  });

  it('drops the evidence when cleared', () => {
    const storage = memoryStorage();
    saveSessionEvidence('plan-a', { decisionsScored: 5, costlyMistakes: 0 }, storage);
    clearSessionEvidence(storage);
    expect(loadSessionEvidence('plan-a', storage)).toBeNull();
  });

  it('does not throw on malformed stored data', () => {
    const storage = memoryStorage('{ this is not json');
    expect(() => loadSessionEvidence('plan-a', storage)).not.toThrow();
    expect(loadSessionEvidence('plan-a', storage)).toBeNull();
  });
});
