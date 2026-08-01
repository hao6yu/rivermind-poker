import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyAction, createHand } from '../engine';
import { createPersistenceClientId, handClientId, redactGameForPersistence } from '../persistence';

describe('hand persistence privacy', () => {
  it('removes the deck and unrevealed opponent cards from folded hands', () => {
    const completed = applyAction(
      createHand({ button: 'hero', random: seededRandom(9) }),
      'hero',
      { type: 'fold' },
    );

    const stored = redactGameForPersistence(completed);

    expect(stored.deck).toEqual([]);
    expect(stored.players.hero.holeCards).toHaveLength(2);
    expect(stored.players.villain.holeCards).toEqual([]);
    expect(stored.outcome?.showdown).toBe(false);
    expect(completed.players.villain.holeCards).toHaveLength(2);
  });

  it('keeps opponent cards only when showdown legitimately reveals them', () => {
    let completed = createHand({ button: 'hero', random: seededRandom(10) });
    completed = applyAction(completed, 'hero', { type: 'call' });
    completed = applyAction(completed, 'villain', { type: 'check' });
    for (let street = 0; street < 3; street += 1) {
      completed = applyAction(completed, 'villain', { type: 'check' });
      completed = applyAction(completed, 'hero', { type: 'check' });
    }

    const stored = redactGameForPersistence(completed);

    expect(stored.deck).toEqual([]);
    expect(stored.players.villain.holeCards).toEqual(completed.players.villain.holeCards);
    expect(stored.outcome?.showdown).toBe(true);
  });

  it('rejects an in-progress hand and produces bounded client identifiers', () => {
    expect(() => redactGameForPersistence(createHand())).toThrow('Only completed hands');
    const sessionId = createPersistenceClientId('session');
    expect(sessionId).toMatch(/^session_[a-z0-9]+_[a-z0-9]+$/);
    expect(handClientId(sessionId, 12)).toBe(`${sessionId}:hand:12`);
    expect(handClientId(sessionId, 12).length).toBeLessThanOrEqual(180);
  });
});
