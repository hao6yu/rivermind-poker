import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyAction, createHand } from '../engine';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../multiway';
import { createMultiwaySessionHand, decideSessionAiAction, seededMultiwayDecisionRandom } from '../multiwaySession';
import {
  createPersistenceClientId,
  handClientId,
  redactGameForPersistence,
  redactMultiwayGameForPersistence,
} from '../persistence';

function finishMultiway(state: MultiwayHandState): MultiwayHandState {
  let current = state;
  for (let actionCount = 0; !current.outcome && actionCount < 160; actionCount += 1) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('Multiway persistence fixture is missing a turn.');
    if (playerId === 'hero') {
      const legal = getMultiwayLegalActions(current, playerId);
      current = applyMultiwayAction(current, playerId, legal.canCheck ? { type: 'check' } : { type: 'call' });
    } else {
      const decision = decideSessionAiAction(current, playerId, 'club', seededMultiwayDecisionRandom(current, playerId));
      current = applyMultiwayAction(current, playerId, decision.action);
    }
  }
  return current;
}

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

  it('redacts the deck and every unrevealed multiway opponent card', () => {
    const completed = finishMultiway(createMultiwaySessionHand(
      { startingStackBb: 40, handTarget: 1 },
      6,
      seededRandom(606),
    ));
    const stored = redactMultiwayGameForPersistence(completed);

    expect(stored.deck).toEqual([]);
    expect(stored.players.hero?.holeCards).toHaveLength(2);
    stored.tablePlayerIds.filter((playerId) => playerId !== 'hero').forEach((playerId) => {
      const original = completed.players[playerId];
      const redacted = stored.players[playerId];
      expect(redacted?.holeCards).toHaveLength(completed.outcome?.showdown && !original?.folded ? 2 : 0);
    });
    expect(completed.deck.length).toBeGreaterThan(0);
  });
});
