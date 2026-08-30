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

import { deleteAllMultiplayerHandHistory, joinMultiplayerTable } from './multiplayer';

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
