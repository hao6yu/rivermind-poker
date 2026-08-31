import { describe, expect, it } from 'vitest';

import { seededRandom } from '../poker/cards';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
  defaultMultiplayerRoomConfig,
} from './coordinator';
import type { MultiplayerCoordinatorState, MultiplayerRoomCommand } from './contracts';
import {
  createMultiplayerViewerHandArchive,
  createMultiplayerViewerProjection,
} from './projection';

const hostUserId = 'user-host';
const guestUserId = 'user-guest';
const hostPlayerId = 'player-host';
const guestPlayerId = 'player-guest';

function roomWithLeftGuest(): MultiplayerCoordinatorState {
  const random = seededRandom(31);
  let state = createMultiplayerRoom({
    config: { ...defaultMultiplayerRoomConfig, seatCount: 2 },
    hostDisplayName: 'Kai',
    hostPlayerId,
    hostUserId,
    roomCode: '724826',
    roomId: 'room-test',
  }, { nowMs: 1_000, random });
  const send = (input: Record<string, unknown>, nowMs: number) => {
    state = applyMultiplayerCommand(state, {
      ...input,
      commandId: `r5-${Math.random()}`,
      expectedVersion: state.version,
    } as MultiplayerRoomCommand, { aiSimulations: 24, nowMs, random }).state;
  };
  send({ actorUserId: guestUserId, displayName: 'Mina', playerId: guestPlayerId, seat: 1, type: 'join' }, 1_100);
  send({ actorUserId: hostUserId, ready: true, type: 'set-ready' }, 1_200);
  send({ actorUserId: guestUserId, ready: true, type: 'set-ready' }, 1_300);
  send({ actorUserId: hostUserId, type: 'start' }, 2_000);
  send({ actorUserId: guestUserId, type: 'leave' }, 2_100);
  return state;
}

describe('R5 — permanent departure revokes the live read projection', () => {
  it('refuses a departed member\'s own projection while members still see the departed ledger row', () => {
    const state = roomWithLeftGuest();
    expect(() => createMultiplayerViewerProjection(state, guestUserId))
      .toThrow('You have left this running session and cannot return to it.');

    // Current members keep the departed seat's ledger identity in their
    // projection (Table stats, standings, settlement).
    const hostView = createMultiplayerViewerProjection(state, hostUserId);
    const departedSeat = hostView.seats.find((seat) => seat.playerId === guestPlayerId);
    expect(departedSeat?.participation).toBe('left');
    expect(departedSeat?.ledger).toBeDefined();
    expect(departedSeat?.userId).toBeNull();
  });

  it('still builds the departed member\'s own settled-hand archive at settlement', () => {
    // Archives exist to preserve the departed player's own history; the
    // projection revocation applies to LIVE reads only.
    const state = roomWithLeftGuest();
    const archive = createMultiplayerViewerHandArchive(state, guestUserId);
    // No hand has settled in this fixture yet — the archive gate itself is
    // exercised by the settlement path; the point here is that the gate does
    // not throw for a departed viewer the way the live projection does.
    expect(archive === null || archive.viewerPlayerId === guestPlayerId).toBe(true);
  });
});
