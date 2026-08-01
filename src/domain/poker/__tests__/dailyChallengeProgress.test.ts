import { describe, expect, it } from 'vitest';

import {
  applyDailyChallengeResult,
  mergeDailyChallengeProgress,
  type DailyChallengeProgress,
} from '../dailyChallengeProgress';

function progress(overrides: Partial<DailyChallengeProgress> = {}): DailyChallengeProgress {
  return {
    challengeDate: '2026-08-01',
    bestScore: 70,
    bestPlace: 2,
    bestHands: 12,
    attempts: 1,
    completedAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('daily challenge progress', () => {
  it('keeps the better placement and the largest known attempt count', () => {
    const merged = mergeDailyChallengeProgress(
      [progress({ bestScore: 100, bestPlace: 1, bestHands: 15, attempts: 2 })],
      [progress({ bestScore: 70, bestPlace: 2, bestHands: 8, attempts: 4 })],
    );
    expect(merged[0]).toMatchObject({ bestPlace: 1, bestScore: 100, bestHands: 15, attempts: 4 });
  });

  it('uses fewer hands to break an equal-placement tie', () => {
    const merged = mergeDailyChallengeProgress(
      [progress({ bestHands: 14 })],
      [progress({ bestHands: 9, updatedAt: '2026-08-01T13:00:00.000Z' })],
    );
    expect(merged[0]?.bestHands).toBe(9);
  });

  it('counts a replay without replacing a better prior finish', () => {
    const next = applyDailyChallengeResult(progress({ bestScore: 100, bestPlace: 1 }), {
      challengeDate: '2026-08-01',
      completedAt: '2026-08-01T13:00:00.000Z',
      handsPlayed: 7,
      place: 2,
      score: 70,
    }, '2026-08-01T13:00:00.000Z');
    expect(next).toMatchObject({ bestPlace: 1, attempts: 2 });
  });
});
