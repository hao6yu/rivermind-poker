import { describe, expect, it } from 'vitest';
import {
  parseMultiplayerBroadcastEnvelope,
  parseMultiplayerRoomEnvelope,
} from './multiplayerContract';

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

  it('keeps the authoritative action batch from command responses', () => {
    const envelope = parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: {
        config: { seatCount: 3 },
        legalActions: null,
        roomId,
        seats: [],
        status: 'playing',
        version: 4,
        viewerPlayerId: 'player:host',
      },
      transition: {
        acceptedAtMs: 1_000,
        actionBatch: [{
          amount: 20,
          playerId: 'player:ai',
          potAfter: 50,
          street: 'preflop',
          type: 'call',
        }],
        commandId: 'command:4',
        kind: 'action',
        timeout: null,
        version: 4,
      },
    });

    expect(envelope?.transition?.actionBatch).toEqual([expect.objectContaining({
      playerId: 'player:ai',
      type: 'call',
    })]);
  });

  it('unwraps database Broadcast payloads and rejects version drift', () => {
    const payload = {
      payload: {
        snapshot: {
          config: { seatCount: 6 },
          roomId,
          seats: [],
          status: 'playing',
          version: 7,
        },
        transition: {
          acceptedAtMs: 2_000,
          actionBatch: [],
          commandId: 'command:7',
          kind: 'action',
          timeout: null,
          version: 7,
        },
      },
    };
    expect(parseMultiplayerBroadcastEnvelope(payload)).toMatchObject({ roomId });
    payload.payload.transition.version = 6;
    expect(parseMultiplayerBroadcastEnvelope(payload)).toBeNull();
  });

  it('accepts an older idempotent transition with a newer duplicate snapshot', () => {
    expect(parseMultiplayerRoomEnvelope({
      duplicate: true,
      roomId,
      snapshot: {
        config: { seatCount: 3 },
        legalActions: null,
        roomId,
        seats: [],
        status: 'playing',
        version: 9,
        viewerPlayerId: 'player:host',
      },
      transition: {
        acceptedAtMs: 1_000,
        actionBatch: [],
        commandId: 'retried-command',
        kind: 'action',
        timeout: null,
        version: 7,
      },
    })).toMatchObject({ duplicate: true, roomId });
  });

  it('accepts an intentional non-personalized snapshot after the viewer leaves', () => {
    expect(parseMultiplayerRoomEnvelope({
      left: true,
      roomId,
      snapshot: {
        config: { seatCount: 3 },
        roomId,
        seats: [],
        status: 'lobby',
        version: 3,
      },
      transition: {
        acceptedAtMs: 1_000,
        actionBatch: [],
        commandId: 'leave-command',
        kind: 'leave',
        timeout: null,
        version: 3,
      },
    })).toMatchObject({ left: true, roomId });
  });

  it('rejects left responses that still expose a personalized viewer snapshot', () => {
    expect(parseMultiplayerRoomEnvelope({
      left: true,
      roomId,
      snapshot: {
        config: { seatCount: 3 },
        legalActions: null,
        roomId,
        seats: [],
        status: 'lobby',
        version: 3,
        viewerPlayerId: 'departed-player',
      },
    })).toBeNull();
  });
});
