import { describe, expect, it } from 'vitest';

import { TABLE_MOMENT_COOLDOWN_MS } from '../../domain/multiplayer/tableMoments';
import {
  createTableMomentTrayState,
  recordTableMomentAccepted,
  recordTableMomentCooldown,
  resetTableMomentTrayHand,
  tableMomentTrayCanSend,
  tableMomentTrayCooldownRemainingMs,
} from './tableMomentTray';

describe('table moment tray state', () => {
  it('starts ready', () => {
    const state = createTableMomentTrayState();
    expect(tableMomentTrayCanSend(state, 1_000)).toBe(true);
    expect(tableMomentTrayCooldownRemainingMs(state, 1_000)).toBe(0);
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

  it('allows unlimited moments across a hand while retaining the cooldown', () => {
    let state = createTableMomentTrayState();
    for (let index = 0; index < 12; index += 1) {
      state = recordTableMomentAccepted(state, 1_000 + index * TABLE_MOMENT_COOLDOWN_MS);
    }
    expect(tableMomentTrayCanSend(state, 1_000 + 12 * TABLE_MOMENT_COOLDOWN_MS)).toBe(true);
    state = resetTableMomentTrayHand(state);
    expect(tableMomentTrayCanSend(state, 1_000 + 12 * TABLE_MOMENT_COOLDOWN_MS)).toBe(true);
  });

  it('keeps the cooldown window after a hand rollover', () => {
    const state = recordTableMomentAccepted(createTableMomentTrayState(), 1_000);
    const rolled = resetTableMomentTrayHand(state);
    expect(tableMomentTrayCooldownRemainingMs(rolled, 2_000)).toBe(TABLE_MOMENT_COOLDOWN_MS - 1_000);
    expect(tableMomentTrayCanSend(rolled, 2_000)).toBe(false);
  });

  it('mirrors a server cooldown refusal', () => {
    let state = createTableMomentTrayState();
    state = recordTableMomentCooldown(state, 1_000);
    expect(tableMomentTrayCanSend(state, 1_000)).toBe(false);
    expect(tableMomentTrayCanSend(state, 1_000 + TABLE_MOMENT_COOLDOWN_MS)).toBe(true);
    expect(tableMomentTrayCooldownRemainingMs(state, 1_000 + TABLE_MOMENT_COOLDOWN_MS)).toBe(0);
  });

  it('never shortens an active cooldown when mirroring a refusal', () => {
    let state = recordTableMomentAccepted(createTableMomentTrayState(), 1_000);
    state = recordTableMomentCooldown(state, 500);
    expect(tableMomentTrayCooldownRemainingMs(state, 2_000)).toBe(TABLE_MOMENT_COOLDOWN_MS - 1_000);
  });
});
