import { describe, expect, it } from 'vitest';

import type { BeginnerTutorialProgress } from './beginnerTutorial';
import {
  beginnerTutorialEntryStatus,
  beginnerTutorialStorageContract,
  clearBeginnerTutorialProgress,
  loadBeginnerTutorialProgress,
  saveBeginnerTutorialCheckpoint,
  saveBeginnerTutorialCompletion,
  saveBeginnerTutorialProgress,
  shouldOfferTutorialResume,
} from './beginnerTutorial';

/** Deterministic in-memory storage double with a programmable failure mode. */
function createStorage(options: { failWrites?: boolean } = {}) {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => {
      if (options.failWrites) throw new Error('storage unavailable');
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      if (options.failWrites) throw new Error('storage unavailable');
      store.set(key, value);
    },
  };
}

describe('beginner tutorial persistence', () => {
  it('reads missing data as never started', () => {
    expect(loadBeginnerTutorialProgress(createStorage())).toBeNull();
    expect(loadBeginnerTutorialProgress(null)).toBeNull();
    expect(beginnerTutorialEntryStatus(null)).toBe('not-started');
    expect(shouldOfferTutorialResume(null)).toBe(false);
  });

  it('round-trips an in-progress checkpoint, completion, and dismissal', () => {
    const storage = createStorage();
    saveBeginnerTutorialCheckpoint('flop-decision', storage);
    const inProgress = loadBeginnerTutorialProgress(storage);
    expect(inProgress).toEqual({ version: 1, status: 'in-progress', stepId: 'flop-decision' });
    expect(beginnerTutorialEntryStatus(inProgress)).toBe('in-progress');
    expect(shouldOfferTutorialResume(inProgress)).toBe(true);

    saveBeginnerTutorialCompletion('2026-09-04T00:00:00.000Z', storage);
    const completed: BeginnerTutorialProgress | null = loadBeginnerTutorialProgress(storage);
    expect(completed).toEqual({
      version: 1,
      status: 'completed',
      completedAt: '2026-09-04T00:00:00.000Z',
    });
    expect(beginnerTutorialEntryStatus(completed)).toBe('completed');
    expect(shouldOfferTutorialResume(completed)).toBe(false);

    saveBeginnerTutorialProgress({ version: 1, status: 'dismissed' }, storage);
    const dismissed = loadBeginnerTutorialProgress(storage);
    expect(dismissed).toEqual({ version: 1, status: 'dismissed' });
    // A dismissed prompt reads like a fresh start at the entry points.
    expect(beginnerTutorialEntryStatus(dismissed)).toBe('not-started');
    expect(shouldOfferTutorialResume(dismissed)).toBe(false);
  });

  it('does not offer resume when the saved checkpoint is the welcome step', () => {
    const storage = createStorage();
    saveBeginnerTutorialCheckpoint('welcome', storage);
    expect(shouldOfferTutorialResume(loadBeginnerTutorialProgress(storage))).toBe(false);
  });

  it('fails safely on corrupt, partial, and future-version data', () => {
    const cases = [
      'not json at all',
      '{"version":2,"status":"in-progress","stepId":"welcome"}',
      '{"version":1}',
      '{"version":1,"status":"in-progress"}',
      '{"version":1,"status":"in-progress","stepId":"not-a-step"}',
      '{"version":1,"status":"completed"}',
      '{"version":1,"status":"completed","completedAt":""}',
      '{"version":1,"status":"unknown"}',
      'null',
      '[]',
      '42',
      '{"version":1,"status":"dismissed","extra":"field"}',
    ];
    for (const raw of cases) {
      const storage = createStorage();
      storage.setItem(beginnerTutorialStorageContract.key, raw);
      expect(loadBeginnerTutorialProgress(storage), raw).toBeNull();
    }
    // The unknown-status case above has a valid version but an invalid status:
    // it must fail closed even though JSON.parse succeeds.
    const storage = createStorage();
    storage.setItem(beginnerTutorialStorageContract.key, '{"version":1,"status":"in-progress","stepId":"recap"}');
    expect(loadBeginnerTutorialProgress(storage)).toEqual({ version: 1, status: 'in-progress', stepId: 'recap' });
  });

  it('never throws when storage reads or writes fail', () => {
    const failing = createStorage({ failWrites: true });
    expect(() => saveBeginnerTutorialCheckpoint('welcome', failing)).not.toThrow();
    expect(() => saveBeginnerTutorialCompletion('2026-09-04T00:00:00.000Z', failing)).not.toThrow();
    expect(() => clearBeginnerTutorialProgress(failing)).not.toThrow();
    expect(loadBeginnerTutorialProgress(failing)).toBeNull();
  });

  it('clears state so the next device user starts fresh', () => {
    const storage = createStorage();
    saveBeginnerTutorialCompletion('2026-09-04T00:00:00.000Z', storage);
    clearBeginnerTutorialProgress(storage);
    expect(loadBeginnerTutorialProgress(storage)).toBeNull();
    expect(() => clearBeginnerTutorialProgress(null)).not.toThrow();
  });

  it('accepts every authored step id in an in-progress checkpoint', () => {
    const storage = createStorage();
    const steps = [
      'welcome',
      'seats-and-blinds',
      'hole-cards',
      'preflop-raise',
      'flop-reveal',
      'flop-decision',
      'turn-check',
      'river-value-bet',
      'showdown',
      'recap',
    ] as const;
    for (const stepId of steps) {
      saveBeginnerTutorialCheckpoint(stepId, storage);
      expect(loadBeginnerTutorialProgress(storage)).toEqual({
        version: 1,
        status: 'in-progress',
        stepId,
      });
    }
  });
});
