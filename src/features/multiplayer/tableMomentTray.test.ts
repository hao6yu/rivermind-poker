import { describe, expect, it } from 'vitest';

import {
  TABLE_MOMENT_COOLDOWN_MS,
  TABLE_MOMENT_HUMAN_HAND_BUDGET,
} from '../../domain/multiplayer/tableMoments';
import {
  createTableMomentTrayState,
  recordTableMomentAccepted,
  recordTableMomentCooldown,
  resetTableMomentTrayHand,
  tableMomentTrayCanSend,
  tableMomentTrayCooldownRemainingMs,
  tableMomentTrayHandBudgetRemaining,
} from './tableMomentTray';

describe('table moment tray state', () => {
  it('starts ready with the full per-hand budget', () => {
    const state = createTableMomentTrayState();
    expect(tableMomentTrayCanSend(state, 1_000)).toBe(true);
    expect(tableMomentTrayCooldownRemainingMs(state, 1_000)).toBe(0);
    expect(tableMomentTrayHandBudgetRemaining(state)).toBe(TABLE_MOMENT_HUMAN_HAND_BUDGET);
  });

  it('enforces the three-second cooldown locally after an acceptance', () => {
    let state = createTableMomentTrayState();
    state = recordTableMomentAccepted(state, 1_000);
    expect(tableMomentTrayCanSend(state, 1_000)).toBe(false);
    expect(tableMomentTrayCooldownRemainingMs(state, 2_000)).toBe(
      TABLE_MOMENT_COOLDOWN_MS - 1_000,
    );
    expect(tableMomentTrayCanSend(state, 1_000 + TABLE_MOMENT_COOLDOWN_MS - 1)).toBe(false);
    expect(tableMomentTrayCanSend(state, 1_000 + TABLE_MOMENT_COOLDOWN_MS)).toBe(true);
  });

  it('decrements the budget per accepted moment and rolls over per hand', () => {
    let state = createTableMomentTrayState();
    for (let index = 0; index < TABLE_MOMENT_HUMAN_HAND_BUDGET; index += 1) {
      state = recordTableMomentAccepted(state, 1_000 + index * TABLE_MOMENT_COOLDOWN_MS);
    }
    expect(tableMomentTrayHandBudgetRemaining(state)).toBe(0);
    expect(tableMomentTrayCanSend(state, 1_000 + TABLE_MOMENT_HUMAN_HAND_BUDGET * TABLE_MOMENT_COOLDOWN_MS))
      .toBe(false);
    state = resetTableMomentTrayHand(state);
    expect(tableMomentTrayHandBudgetRemaining(state)).toBe(TABLE_MOMENT_HUMAN_HAND_BUDGET);
    expect(tableMomentTrayCanSend(state, 1_000 + TABLE_MOMENT_HUMAN_HAND_BUDGET * TABLE_MOMENT_COOLDOWN_MS))
      .toBe(true);
  });

  it('keeps the cooldown window after a hand rollover', () => {
    const state = recordTableMomentAccepted(createTableMomentTrayState(), 1_000);
    const rolled = resetTableMomentTrayHand(state);
    expect(tableMomentTrayCooldownRemainingMs(rolled, 2_000)).toBe(TABLE_MOMENT_COOLDOWN_MS - 1_000);
    expect(tableMomentTrayCanSend(rolled, 2_000)).toBe(false);
  });

  it('mirrors a server cooldown refusal without spending budget', () => {
    let state = createTableMomentTrayState();
    state = recordTableMomentCooldown(state, 1_000);
    expect(tableMomentTrayCanSend(state, 1_000)).toBe(false);
    expect(tableMomentTrayHandBudgetRemaining(state)).toBe(TABLE_MOMENT_HUMAN_HAND_BUDGET);
    expect(tableMomentTrayCanSend(state, 1_000 + TABLE_MOMENT_COOLDOWN_MS)).toBe(true);
    expect(tableMomentTrayCooldownRemainingMs(state, 1_000 + TABLE_MOMENT_COOLDOWN_MS)).toBe(0);
  });

  it('never shortens an active cooldown when mirroring a refusal', () => {
    let state = recordTableMomentAccepted(createTableMomentTrayState(), 1_000);
    state = recordTableMomentCooldown(state, 500);
    expect(tableMomentTrayCooldownRemainingMs(state, 2_000)).toBe(TABLE_MOMENT_COOLDOWN_MS - 1_000);
  });
});
