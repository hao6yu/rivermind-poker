import { describe, expect, it } from 'vitest';
import { defaultMultiplayerRoomConfig } from '../../../src/domain/multiplayer/coordinator';
import { parseMultiplayerRoomRequest } from './contract';

const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('multiplayer room Edge Function contract', () => {
  it('accepts and normalizes room creation', () => {
    expect(parseMultiplayerRoomRequest({
      operation: 'create',
      config: defaultMultiplayerRoomConfig,
      displayName: '  Kai  ',
    })).toMatchObject({ displayName: 'Kai', hostSeat: 0, operation: 'create' });
  });

  it('accepts six-digit joins and optional automatic seating', () => {
    expect(parseMultiplayerRoomRequest({
      operation: 'join',
      displayName: 'Mina',
      roomCode: ' 042106 ',
    })).toEqual({
      displayName: 'Mina',
      operation: 'join',
      roomCode: '042106',
      seat: null,
    });
  });

  it('rejects legacy and malformed room codes', () => {
    expect(parseMultiplayerRoomRequest({
      operation: 'join', displayName: 'Mina', roomCode: 'RMK724',
    })).toBeNull();
    expect(parseMultiplayerRoomRequest({
      operation: 'join', displayName: 'Mina', roomCode: '12345',
    })).toBeNull();
  });

  it('accepts a safe raise command', () => {
    expect(parseMultiplayerRoomRequest({
      operation: 'command',
      roomId,
      command: {
        action: { amount: 84, type: 'raise' },
        commandId: 'command-1',
        expectedVersion: 4,
        type: 'action',
      },
    })).toMatchObject({
      command: { action: { amount: 84, type: 'raise' }, expectedVersion: 4 },
      operation: 'command',
    });
  });

  it('rejects identity injection and client-side join commands', () => {
    expect(parseMultiplayerRoomRequest({
      operation: 'command',
      roomId,
      command: {
        actorUserId: 'attacker',
        commandId: 'command-1',
        expectedVersion: 0,
        type: 'start',
      },
    })).toBeNull();
    expect(parseMultiplayerRoomRequest({
      operation: 'command',
      roomId,
      command: {
        commandId: 'command-2',
        displayName: 'Attacker',
        expectedVersion: 0,
        playerId: 'forged',
        seat: 1,
        type: 'join',
      },
    })).toBeNull();
  });

  it('rejects invalid table configuration and malformed room ids', () => {
    expect(parseMultiplayerRoomRequest({
      operation: 'create',
      config: { ...defaultMultiplayerRoomConfig, aiDifficulty: 'impossible' },
      displayName: 'Kai',
    })).toBeNull();
    expect(parseMultiplayerRoomRequest({ operation: 'sync', roomId: 'not-a-room' })).toBeNull();
  });
});
