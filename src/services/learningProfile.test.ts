import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import {
  createDefaultLearningProfile,
  scoreSkillCalibration,
  selectLearningGoal,
} from '../domain/learning/guidedProgress';
import {
  clearLearningProfile,
  learningProfileStorageContract,
  loadLearningProfile,
  normalizeLearningProfile,
  saveLearningProfile,
} from './learningProfile';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(learningProfileStorageContract.key, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe('local learning profile persistence', () => {
  it('round-trips a selected goal and skill snapshot', () => {
    const storage = memoryStorage();
    const snapshot = scoreSkillCalibration([], 'baseline', 3, '2026-08-12T12:00:00.000Z');
    const profile = {
      ...selectLearningGoal(createDefaultLearningProfile(), 'tournament'),
      snapshots: [snapshot],
    };
    saveLearningProfile(profile, storage);
    expect(loadLearningProfile(storage)).toEqual(profile);
  });

  it('repairs malformed fields without losing valid goal choice', () => {
    expect(normalizeLearningProfile({
      goal: 'math',
      setupStatus: 'complete',
      snapshots: [{ id: 'broken' }],
    })).toEqual({ goal: 'math', setupStatus: 'complete', snapshots: [], version: 1 });
  });

  it('clears the persisted profile with learning data', () => {
    const storage = memoryStorage('{"goal":"opponents","setupStatus":"complete","snapshots":[],"version":1}');
    expect(clearLearningProfile(storage)).toEqual(createDefaultLearningProfile());
    expect(storage.values.has(learningProfileStorageContract.key)).toBe(false);
  });
});
