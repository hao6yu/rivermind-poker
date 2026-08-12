import { describe, expect, it } from 'vitest';
import { parseMultiplayerRoomEnvelope } from './multiplayerContract';

const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('multiplayer service contract', () => {
  it('accepts a personalized room envelope', () => {
    expect(parseMultiplayerRoomEnvelope({
      roomCode: '724826',
      roomId,
      snapshot: {
        config: { seatCount: 3 },
        legalActions: null,
        roomId,
        seats: [],
        status: 'lobby',
        version: 0,
        viewerPlayerId: 'player:host',
      },
    })).toMatchObject({ roomCode: '724826', roomId });
  });

  it('rejects mismatched rooms and malformed snapshots', () => {
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: {
        config: { seatCount: 3 },
        roomId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        seats: [],
        status: 'lobby',
        version: 0,
      },
    })).toBeNull();
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot: { roomId } })).toBeNull();
  });
});
