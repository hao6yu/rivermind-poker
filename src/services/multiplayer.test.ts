import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';

// The Supabase client is mocked through a hoisted holder, so each describe can
// decide whether the service sees a configured client and what the edge
// function answers.
const supabaseHolder = vi.hoisted(() => ({
  client: null as {
    functions: { invoke: ReturnType<typeof vi.fn> };
  } | null,
}));

vi.mock('./supabase', () => ({
  ensureAnonymousSession: vi.fn(async () => 'user-1'),
  get supabase() {
    return supabaseHolder.client;
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: vi.fn(() => 'test-command-id') }));

import { deleteAllMultiplayerHandHistory, createMultiplayerTable, joinMultiplayerTable } from './multiplayer';

describe('multiplayer service fallbacks', () => {
  it('treats history deletion as a no-op when Supabase is not configured', async () => {
    supabaseHolder.client = null;
    await expect(deleteAllMultiplayerHandHistory()).resolves.toBe(0);
  });
});

describe('multiplayer join seat-count negotiation', () => {
  const invoke = vi.fn();

  beforeEach(() => {
    invoke.mockReset();
    supabaseHolder.client = { functions: { invoke } };
  });

  afterEach(() => {
    supabaseHolder.client = null;
  });

  it('declares the build seat-count capabilities with every join request', async () => {
    // The join is refused (no valid snapshot returned), which is fine: this
    // test observes what was declared, not what the table answered.
    invoke.mockResolvedValue({ data: null, error: null });

    await expect(joinMultiplayerTable({ displayName: 'Mina', roomCode: '042106' }))
      .rejects.toMatchObject({ code: 'multiplayer_invalid_response' });

    expect(invoke).toHaveBeenCalledWith('multiplayer-room', expect.objectContaining({
      body: expect.objectContaining({
        operation: 'join',
        supportedSeatCounts: [2, 3, 6, 9],
      }),
    }));
  });

  it('surfaces the table seat-count refusal as a non-retryable error', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError({
        json: async () => ({
          error: {
            code: 'room_seat_count_unsupported',
            message: 'This version of the app cannot join tables this size. Update the app and try again.',
            retryable: false,
          },
        }),
      }),
    });

    await expect(joinMultiplayerTable({ displayName: 'Mina', roomCode: '042106' }))
      .rejects.toMatchObject({
        code: 'room_seat_count_unsupported',
        retryable: false,
      });
  });
});

describe('R1 — create/join payloads declare the lifecycle protocol and identities', () => {
  const invoke = vi.fn();
  const config = {
    aiDifficulty: 'club',
    bigBlindChips: 20,
    handTarget: 'open',
    seatCount: 2,
    smallBlindChips: 10,
    startingStackChips: 2_000,
    turnSeconds: 30,
  } as const;

  beforeEach(() => {
    invoke.mockReset();
    supabaseHolder.client = { functions: { invoke } };
  });

  afterEach(() => {
    supabaseHolder.client = null;
  });

  it('declares protocol, host avatar, and host Play record on create', async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    const playRecord = { revision: 1 } as unknown as Parameters<typeof createMultiplayerTable>[0]['playRecord'];

    await expect(createMultiplayerTable({
      avatar: null,
      config,
      displayName: 'Kai',
      playRecord,
    })).rejects.toBeTruthy();

    const body = invoke.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body.operation).toBe('create');
    expect(body.protocol).toBe(3);
    expect(body.hostPlayRecord).toEqual(playRecord);
    expect(body.hostAvatar).toBeNull();
    // The old unprefixed field names are never sent on create (R1).
    expect('playRecord' in body).toBe(false);
    expect('avatar' in body).toBe(false);
  });

  it('declares protocol, avatar, and Play record on join', async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    const playRecord = { revision: 1 } as unknown as Parameters<typeof joinMultiplayerTable>[0]['playRecord'];

    await expect(joinMultiplayerTable({
      avatar: null,
      displayName: 'Mina',
      playRecord,
      roomCode: '042106',
    })).rejects.toBeTruthy();

    const body = invoke.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body.operation).toBe('join');
    expect(body.protocol).toBe(3);
    expect(body.playRecord).toEqual(playRecord);
    expect(body.avatar).toBeNull();
    expect(body.supportedSeatCounts).toEqual([2, 3, 6, 9]);
  });

  it('surfaces the worker update-required refusal as its stable localized code', async () => {
    // R1: the worker answers 426 multiplayer_update_required for an
    // incompatible client before any membership mutation; the service must
    // classify that code (not collapse it to room_unavailable) so the UI can
    // render its localized update-required copy.
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError({
        json: async () => ({
          error: {
            code: 'multiplayer_update_required',
            message: 'This version of the app cannot join tables with the seat lifecycle and ledger. Update the app and try again.',
            retryable: false,
          },
        }),
      }),
    });

    await expect(joinMultiplayerTable({ displayName: 'Mina', roomCode: '042106' }))
      .rejects.toMatchObject({ code: 'multiplayer_update_required', retryable: false });
    await expect(createMultiplayerTable({ config, displayName: 'Kai' }))
      .rejects.toMatchObject({ code: 'multiplayer_update_required', retryable: false });
  });
});
