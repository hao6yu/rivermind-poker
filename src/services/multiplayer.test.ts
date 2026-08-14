import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  ensureAnonymousSession: vi.fn(),
  supabase: null,
}));
vi.mock('expo-crypto', () => ({ randomUUID: vi.fn(() => 'test-command-id') }));

import { deleteAllMultiplayerHandHistory } from './multiplayer';

describe('multiplayer service fallbacks', () => {
  it('treats history deletion as a no-op when Supabase is not configured', async () => {
    await expect(deleteAllMultiplayerHandHistory()).resolves.toBe(0);
  });
});
