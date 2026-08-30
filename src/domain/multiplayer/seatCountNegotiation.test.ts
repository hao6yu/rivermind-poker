import { describe, expect, it } from 'vitest';

import {
  MULTIPLAYER_CLIENT_SEAT_COUNTS,
  MULTIPLAYER_LEGACY_SEAT_COUNTS,
  multiplayerJoinSeatCountSupported,
  type MultiplayerSeatCount,
} from './contracts';

/**
 * Seat-count negotiation for private-table joins (the mixed-version guard):
 * the table must refuse a client that cannot handle the room's size BEFORE it
 * commits a seat, because the joiner's own snapshot contract would reject the
 * room afterwards and strand the lobby.
 */
describe('multiplayer join seat-count negotiation', () => {
  it('lets a current build join every supported table size', () => {
    for (const seatCount of [2, 3, 6, 9] as MultiplayerSeatCount[]) {
      expect(
        multiplayerJoinSeatCountSupported(MULTIPLAYER_CLIENT_SEAT_COUNTS, seatCount),
        String(seatCount),
      ).toBe(true);
    }
  });

  it('refuses nine-seat rooms for a client that predates negotiation', () => {
    expect(multiplayerJoinSeatCountSupported(MULTIPLAYER_LEGACY_SEAT_COUNTS, 2)).toBe(true);
    expect(multiplayerJoinSeatCountSupported(MULTIPLAYER_LEGACY_SEAT_COUNTS, 3)).toBe(true);
    expect(multiplayerJoinSeatCountSupported(MULTIPLAYER_LEGACY_SEAT_COUNTS, 6)).toBe(true);
    expect(multiplayerJoinSeatCountSupported(MULTIPLAYER_LEGACY_SEAT_COUNTS, 9)).toBe(false);
  });

  it('refuses any size the joiner did not declare', () => {
    expect(multiplayerJoinSeatCountSupported([2, 3, 6], 9)).toBe(false);
    expect(multiplayerJoinSeatCountSupported([9], 2)).toBe(false);
  });
});
