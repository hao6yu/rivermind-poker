import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyAction, createHand } from '../engine';

describe('heads-up betting engine', () => {
  it('posts blinds and gives the button first action preflop', () => {
    const state = createHand({ button: 'hero', random: seededRandom(7) });
    expect(state.pot).toBe(30);
    expect(state.players.hero.streetBet).toBe(10);
    expect(state.players.villain.streetBet).toBe(20);
    expect(state.toAct).toBe('hero');
  });

  it('advances after a preflop call and big-blind check', () => {
    let state = createHand({ button: 'hero', random: seededRandom(8) });
    state = applyAction(state, 'hero', { type: 'call' });
    expect(state.toAct).toBe('villain');
    state = applyAction(state, 'villain', { type: 'check' });
    expect(state.street).toBe('flop');
    expect(state.board).toHaveLength(3);
    expect(state.pot).toBe(40);
    expect(state.toAct).toBe('villain');
  });

  it('records the exact decision state before chips move', () => {
    const state = createHand({ button: 'hero', random: seededRandom(11) });
    const next = applyAction(state, 'hero', { type: 'call' });
    const record = next.history[0];
    expect(record?.decisionContext.potBefore).toBe(30);
    expect(record?.decisionContext.toCall).toBe(10);
    expect(record?.decisionContext.playerStackBefore).toBe(990);
    expect(record?.decisionContext.opponentStackBefore).toBe(980);
    expect(record?.decisionContext.board).toEqual([]);
    expect(record?.decisionContext.legalActions.canCall).toBe(true);
  });

  it('awards the pot immediately when a player folds', () => {
    const initial = createHand({ button: 'hero', random: seededRandom(9) });
    const final = applyAction(initial, 'hero', { type: 'fold' });
    expect(final.street).toBe('complete');
    expect(final.outcome?.winner).toBe('villain');
    expect(final.outcome?.potWon).toBe(30);
    expect(final.players.villain.stack).toBe(1_010);
  });

  it('runs a checked hand through showdown without losing chips', () => {
    let state = createHand({ button: 'hero', random: seededRandom(10) });
    state = applyAction(state, 'hero', { type: 'call' });
    state = applyAction(state, 'villain', { type: 'check' });
    for (let street = 0; street < 3; street += 1) {
      state = applyAction(state, 'villain', { type: 'check' });
      state = applyAction(state, 'hero', { type: 'check' });
    }
    expect(state.street).toBe('complete');
    expect(state.board).toHaveLength(5);
    expect(state.players.hero.stack + state.players.villain.stack).toBe(2_000);
    expect(state.outcome?.showdown).toBe(true);
  });
});
