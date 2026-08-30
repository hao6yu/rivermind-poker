import { describe, expect, it } from 'vitest';

import {
  TABLE_MOMENT_ROOM_BURST_CAPACITY,
  TABLE_MOMENT_SENDER_BURST_CAPACITY,
  createTableMomentBurstState,
  evaluateTableMomentBurst,
} from './tableMomentBurst';

describe('table moment rolling burst authority', () => {
  it('allows exactly eight immediate sender moments and refills at four per second', () => {
    let state = createTableMomentBurstState(1_000);
    for (let index = 0; index < TABLE_MOMENT_SENDER_BURST_CAPACITY; index += 1) {
      const decision = evaluateTableMomentBurst(state, 1_000);
      expect(decision.accepted).toBe(true);
      state = decision.state;
    }
    const full = evaluateTableMomentBurst(state, 1_000);
    expect(full).toMatchObject({ accepted: false, retryAfterMs: 250 });
    expect(evaluateTableMomentBurst(full.state, 1_249)).toMatchObject({ accepted: false, retryAfterMs: 1 });
    expect(evaluateTableMomentBurst(full.state, 1_250).accepted).toBe(true);
  });

  it('allows exactly 24 immediate room moments and refills at eight per second', () => {
    let state = createTableMomentBurstState(2_000);
    for (let index = 0; index < TABLE_MOMENT_ROOM_BURST_CAPACITY; index += 1) {
      state = { ...state, sender: { atMs: 2_000, tokens: 99 } };
      const decision = evaluateTableMomentBurst(state, 2_000);
      expect(decision.accepted).toBe(true);
      state = decision.state;
    }
    const full = evaluateTableMomentBurst({ ...state, sender: { atMs: 2_000, tokens: 99 } }, 2_000);
    expect(full).toMatchObject({ accepted: false, retryAfterMs: 125 });
    expect(evaluateTableMomentBurst(full.state, 2_125).accepted).toBe(true);
  });

  it('does not grant tokens when an injected clock moves backwards', () => {
    const state = {
      room: { atMs: 2_000, tokens: 0 },
      sender: { atMs: 2_000, tokens: 0 },
    };
    expect(evaluateTableMomentBurst(state, 1_000)).toMatchObject({
      accepted: false,
      retryAfterMs: 250,
    });
  });
});
