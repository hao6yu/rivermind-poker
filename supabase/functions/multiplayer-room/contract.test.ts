import { describe, expect, it } from 'vitest';
import { defaultMultiplayerRoomConfig } from '../../../src/domain/multiplayer/coordinator';
import { parseMultiplayerRoomRequest } from './contract';
import { buildPublicPlayerRecordSnapshot } from '../../../src/domain/multiplayer/playerRecordSnapshot';

const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('multiplayer room Edge Function contract', () => {
  it('accepts and normalizes room creation', () => {
    expect(parseMultiplayerRoomRequest({
      operation: 'create',
      config: defaultMultiplayerRoomConfig,
      displayName: '  Kai  ',
      protocol: 3,
    })).toMatchObject({ displayName: 'Kai', hostSeat: 0, operation: 'create' });
  });

  it('accepts six-digit joins and optional automatic seating', () => {
    // A legacy build sends no seat capabilities: it is assumed to support only
    // what shipped builds of that era could seat (2/3/6, never 9).
    expect(parseMultiplayerRoomRequest({
      operation: 'join',
      displayName: 'Mina',
      protocol: 3,
      roomCode: ' 042106 ',
    })).toEqual({
      displayName: 'Mina',
      operation: 'join',
      roomCode: '042106',
      seat: null,
      supportedSeatCounts: [2, 3, 6],
    });
  });

  it('carries the joiner seat-count capabilities through the contract', () => {
    expect(parseMultiplayerRoomRequest({
      operation: 'join',
      displayName: 'Mina',
      protocol: 3,
      roomCode: '042106',
      supportedSeatCounts: [9, 2, 6, 3],
    })).toMatchObject({
      operation: 'join',
      supportedSeatCounts: [2, 3, 6, 9],
    });
  });

  it('keeps the declared subset of known seat sizes on a malformed capability list', () => {
    // Valid entries stand; unknown entries are dropped. A list that narrows to
    // nothing, or never was a list, is treated as a pre-negotiation client.
    expect(parseMultiplayerRoomRequest({
      operation: 'join',
      displayName: 'Mina',
      protocol: 3,
      roomCode: '042106',
      supportedSeatCounts: [9, 2, 12],
    })).toMatchObject({ operation: 'join', supportedSeatCounts: [2, 9] });
    for (const [malformed, expected] of [
      ['2,3,6', [2, 3, 6]],
      [[], [2, 3, 6]],
      [[2, 4], [2]],
      [{ seatCounts: [2, 3, 6] }, [2, 3, 6]],
    ] as const) {
      expect(parseMultiplayerRoomRequest({
        operation: 'join',
        displayName: 'Mina',
        protocol: 3,
        roomCode: '042106',
        supportedSeatCounts: malformed,
      })).toMatchObject({
        operation: 'join',
        supportedSeatCounts: expected,
      });
    }
  });

  it('accepts free-form custom names on the multiplayer Edge', () => {
    for (const name of ['Custom Name', 'river', 'River Kai']) {
      expect(
        parseMultiplayerRoomRequest({
          operation: 'create',
          config: defaultMultiplayerRoomConfig,
          displayName: name,
          protocol: 3,
        }),
      ).toMatchObject({ displayName: name, operation: 'create' });
      expect(
        parseMultiplayerRoomRequest({
          operation: 'join',
          displayName: name,
          protocol: 3,
          roomCode: '042106',
        }),
      ).toMatchObject({ displayName: name, operation: 'join' });
    }
  });

  it('rejects contact and non-name content on the multiplayer Edge', () => {
    [
      'name@example.com',
      'https://example.com',
      '🔥🔥',
    ].forEach((unsafeName) => {
      expect(parseMultiplayerRoomRequest({
        operation: 'create',
        config: defaultMultiplayerRoomConfig,
        displayName: unsafeName,
      })).toBeNull();
      expect(parseMultiplayerRoomRequest({
        operation: 'join',
        displayName: unsafeName,
        roomCode: '042106',
      })).toBeNull();
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

  it('accepts recovery, bounded history, deletion, and rematch operations', () => {
    expect(parseMultiplayerRoomRequest({ operation: 'resume' })).toEqual({ operation: 'resume' });
    expect(parseMultiplayerRoomRequest({
      limit: 25,
      operation: 'history',
      roomId,
      sessionNumber: 2,
    })).toEqual({ limit: 25, operation: 'history', roomId, sessionNumber: 2 });
    expect(parseMultiplayerRoomRequest({ operation: 'delete-history' }))
      .toEqual({ operation: 'delete-history' });
    expect(parseMultiplayerRoomRequest({
      command: {
        commandId: 'rematch-1',
        expectedVersion: 12,
        type: 'rematch',
      },
      operation: 'command',
      roomId,
    })).toMatchObject({ command: { type: 'rematch' }, operation: 'command' });
  });

  it('accepts the between-hands countdown commands and refuses the legacy deal', () => {
    for (const type of ['deal-now', 'pause', 'resume', 'tick'] as const) {
      expect(parseMultiplayerRoomRequest({
        command: {
          commandId: `command-${type}`,
          expectedVersion: 12,
          type,
        },
        operation: 'command',
        roomId,
      })).toMatchObject({ command: { type }, operation: 'command' });
    }
    // The pre-3.8C deal command no longer parses: clients must use deal-now.
    expect(parseMultiplayerRoomRequest({
      command: {
        commandId: 'command-old',
        expectedVersion: 12,
        type: 'next-hand',
      },
      operation: 'command',
      roomId,
    })).toBeNull();
  });

  it('rejects unbounded or malformed history filters', () => {
    expect(parseMultiplayerRoomRequest({ limit: 101, operation: 'history' })).toBeNull();
    expect(parseMultiplayerRoomRequest({ limit: 0, operation: 'history' })).toBeNull();
    expect(parseMultiplayerRoomRequest({ operation: 'history', roomId: 'not-a-room' })).toBeNull();
    expect(parseMultiplayerRoomRequest({ operation: 'history', sessionNumber: 0 })).toBeNull();
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

describe('3.11F lifecycle/ledger request contracts (H02/H08 regressions)', () => {
  const random = () => 0.5;
  const playRecord = buildPublicPlayerRecordSnapshot({
    displayName: 'Hao',
    publishedAtMs: 1_710_000_000_000,
    revision: 2,
    statistics: {
      bySource: {
        local: { hands: 4, tables: 1, wins: 2 },
        private: { hands: 6, tables: 2, wins: 3 },
        solo: { hands: 0, tables: 0, wins: 0 },
      },
      coverage: { local: 'complete', private: 'capped', solo: 'skipped' },
      hands: 10,
      splits: 0,
      tables: 3,
      version: 1,
      wins: 5,
    } as PlayStatistics,
  });

  const joinBase = {
    displayName: 'Mina',
    operation: 'join' as const,
    protocol: 3,
    roomCode: '042106',
  };

  function commandRequest(command: Record<string, unknown>) {
    return parseMultiplayerRoomRequest({
      command,
      operation: 'command',
      roomId,
    })?.command ?? null;
  }

  it('parses the new lifecycle commands at the HTTP request boundary', () => {
    expect(commandRequest({ type: 'rebuy', commandId: 'r1', expectedVersion: 4 }))
      .toMatchObject({ type: 'rebuy' });
    expect(commandRequest({ type: 'sit-out', commandId: 'r2', expectedVersion: 4 }))
      .toMatchObject({ type: 'sit-out' });
    expect(commandRequest({ type: 'end-stalled-session', commandId: 'r3', expectedVersion: 4 }))
      .toMatchObject({ type: 'end-stalled-session' });
    expect(commandRequest({
      record: playRecord,
      type: 'update-play-record',
      commandId: 'r4',
      expectedVersion: 4,
    })).toMatchObject({ type: 'update-play-record' });
  });

  it('refuses malformed lifecycle commands and spoofed record fields at the boundary', () => {
    // A spoofed actor identity can never ride a command request.
    expect(commandRequest({ actorUserId: 'user-1', type: 'rebuy', commandId: 'x', expectedVersion: 1 })).toBeNull();
    // A client-supplied amount/net result field is not part of the contract.
    expect(commandRequest({ amount: 4_000, type: 'rebuy', commandId: 'x', expectedVersion: 1 })).toBeNull();
    // The record payload must pass its own validator.
    expect(commandRequest({ record: { version: 99 }, type: 'update-play-record', commandId: 'x', expectedVersion: 1 })).toBeNull();
    expect(commandRequest({ record: { ...playRecord, userEmail: 'x@y.z' } as unknown as Record<string, unknown>, type: 'update-play-record', commandId: 'x', expectedVersion: 1 })).toBeNull();
    // The retired reclaim command is refused at the boundary.
    expect(commandRequest({ type: 'reclaim', commandId: 'x', expectedVersion: 1 })).toBeNull();
  });

  it('retains the Play record through create and join parsing', () => {
    const created = parseMultiplayerRoomRequest({
      config: defaultMultiplayerRoomConfig,
      displayName: 'Kai',
      hostPlayRecord: playRecord,
      operation: 'create',
      protocol: 3,
    });
    expect(created?.operation).toBe('create');
    expect((created as { hostPlayRecord?: unknown }).hostPlayRecord).toEqual(playRecord);
    const joined = parseMultiplayerRoomRequest({
      ...joinBase,
      playRecord,
    });
    expect(joined?.operation).toBe('join');
    expect((joined as { playRecord?: unknown }).playRecord).toEqual(playRecord);
    // A malformed record is dropped, not published.
    const malformed = parseMultiplayerRoomRequest({
      ...joinBase,
      playRecord: { version: 99 },
    });
    expect((malformed as { playRecord?: unknown }).playRecord).toBeUndefined();
  });

  it('refuses clients that omit or under-declare the lifecycle protocol before any mutation', () => {
    for (const protocol of [undefined, 1, 2]) {
      expect(parseMultiplayerRoomRequest({
        ...joinBase,
        protocol,
      })).toBeNull();
      expect(parseMultiplayerRoomRequest({
        config: defaultMultiplayerRoomConfig,
        displayName: 'Kai',
        operation: 'create',
        protocol,
      })).toBeNull();
    }
    // A future protocol is also refused rather than guessed at.
    expect(parseMultiplayerRoomRequest({
      ...joinBase,
      protocol: 99,
    })).toBeNull();
    // The exact current protocol parses.
    expect(parseMultiplayerRoomRequest(joinBase)?.operation).toBe('join');
  });
});
