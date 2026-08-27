import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('./supabase', () => ({ supabase: null }));
vi.mock('./betaFeedback', () => ({
  clearAppDiagnostics: () => globalThis.localStorage?.removeItem('rivermind.diagnostics.v1'),
}));

import {
  clearLocalAccountData,
  deleteCurrentAccount,
  type AccountDeletionClient,
} from './accountDeletion';
import { loadCachedDailyChallengeProgress } from './dailyChallengeProgress';
import { pendingHandWriteCount } from './handHistory';
import { loadCachedLearningHistory } from './learningHistory';
import { loadLearningProfile } from './learningProfile';
import { loadCachedLearningProgress } from './learningProgress';
import { loadCachedLearningReviewQueue } from './learningReviewQueue';
import { loadActiveMultiplayerRoom } from './multiplayerRecovery';
import { shouldShowOnboarding } from './onboarding';
import { loadOpponentMemory } from './opponentMemory';
import { loadPlayerDisplayName } from './playerProfile';

const accountKeys = [
  'rivermind.ai-coach-consent.v1',
  'rivermind.championship.checkpoint.v1',
  'rivermind.championship.progress.v1',
  'rivermind.daily-challenge.checkpoint.v1',
  'rivermind.daily-challenge.results.v1',
  'rivermind.diagnostics.v1',
  'rivermind.learning-history.v1',
  'rivermind.learning-profile.v1',
  'rivermind.learning-progress.v1',
  'rivermind.learning-review-queue.v1',
  'rivermind.multiplayer-active-room.v1',
  'rivermind.onboarding.v1',
  'rivermind.opponent-memory.v1',
  'rivermind.persistence.hand-writes.v1',
  'rivermind.player-profile.v1',
  'rivermind.recommended-session.v1',
  'rivermind.recommended-session-evidence.v1',
  'rivermind.sit-and-go.checkpoint.6-player.v1',
  'rivermind.sit-and-go.checkpoint.v1',
] as const;

const preferenceEntries = {
  'rivermind.game-feedback-preferences.v1': '{"hapticsEnabled":true}',
  'rivermind.languagePreference': 'zh-Hant',
  'rivermind.themePreference': 'dark',
};

function memoryStorage(initial: Record<string, string> = {}): Storage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
    values,
  };
}

function clientWith(input?: {
  invokeData?: unknown;
  invokeError?: unknown;
  getUserError?: unknown;
  getUserResult?: { id: string } | null;
  session?: { user: { id: string } } | null;
  sessionError?: unknown;
  signOutThrows?: boolean;
}) {
  const getSession = vi.fn(async () => ({
    data: {
      session: input?.session === undefined
        ? { access_token: 'test-access-token', user: { id: 'user-1' } }
        : input.session
          ? { access_token: 'test-access-token', ...input.session }
          : null,
    },
    error: input?.sessionError ?? null,
  }));
  const getUser = vi.fn(async () => ({
    data: {
      user: input?.getUserResult === undefined ? { id: 'user-1' } : input.getUserResult,
    },
    error: input?.getUserError ?? null,
  }));
  const invoke = vi.fn(async () => ({
    data: input?.invokeData === undefined ? { deleted: true } : input.invokeData,
    error: input?.invokeError ?? null,
  }));
  const signOut = vi.fn(async () => {
    if (input?.signOutThrows) throw new Error('offline after deletion');
    return { error: null };
  });
  return {
    client: { auth: { getSession, getUser, signOut }, functions: { invoke } } as AccountDeletionClient,
    getSession,
    getUser,
    invoke,
    signOut,
  };
}

let originalLocalStorage: Storage | undefined;

beforeEach(() => {
  originalLocalStorage = globalThis.localStorage;
});

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
    writable: true,
  });
  vi.restoreAllMocks();
});

function installSeededStorage(): ReturnType<typeof memoryStorage> {
  const storage = memoryStorage({
    ...Object.fromEntries(accountKeys.map((key) => [key, '{"saved":true}'])),
    ...preferenceEntries,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
    writable: true,
  });
  return storage;
}

describe('account deletion service', () => {
  it('clears every account-bound cache but preserves device preferences', () => {
    const storage = installSeededStorage();

    clearLocalAccountData();

    for (const key of accountKeys) expect(storage.values.has(key), key).toBe(false);
    expect(Object.fromEntries(storage.values)).toEqual(preferenceEntries);
    expect(pendingHandWriteCount()).toBe(0);
    expect(loadCachedLearningProgress()).toEqual([]);
    expect(loadCachedLearningHistory()).toEqual([]);
    expect(loadCachedLearningReviewQueue()).toEqual([]);
    expect(loadLearningProfile().setupStatus).toBe('not-started');
    expect(loadCachedDailyChallengeProgress()).toEqual([]);
    expect(loadOpponentMemory().handsObserved).toBe(0);
    expect(loadActiveMultiplayerRoom()).toBeNull();
    expect(loadPlayerDisplayName()).toBe('');
    expect(shouldShowOnboarding()).toBe(true);
  });

  it('confirms remote deletion, signs out locally, then clears device data', async () => {
    const storage = installSeededStorage();
    const { client, invoke, signOut } = clientWith();

    await expect(deleteCurrentAccount(client)).resolves.toEqual({ deletedRemoteAccount: true });

    expect(invoke).toHaveBeenCalledWith('delete-account', {
      body: { confirmation: 'delete-account' },
    });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    for (const key of accountKeys) expect(storage.values.has(key), key).toBe(false);
  });

  it('clears local data without creating a replacement when no remote session exists', async () => {
    const storage = installSeededStorage();
    const { client, invoke, signOut } = clientWith({ session: null });

    await expect(deleteCurrentAccount(client)).resolves.toEqual({ deletedRemoteAccount: false });

    expect(invoke).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    for (const key of accountKeys) expect(storage.values.has(key), key).toBe(false);
  });

  it('clears local-only installs when Supabase is not configured', async () => {
    const storage = installSeededStorage();

    await expect(deleteCurrentAccount(null)).resolves.toEqual({ deletedRemoteAccount: false });

    for (const key of accountKeys) expect(storage.values.has(key), key).toBe(false);
    expect(Object.fromEntries(storage.values)).toEqual(preferenceEntries);
  });

  it.each([
    ['session lookup failure', { sessionError: new Error('storage unavailable') }],
    ['Edge Function failure', { invokeError: new Error('network unavailable') }],
    ['unverified Edge response', { invokeData: { deleted: false } }],
  ])('keeps retryable local data after %s', async (_label, input) => {
    const storage = installSeededStorage();
    const { client, signOut } = clientWith(input);

    await expect(deleteCurrentAccount(client)).rejects.toBeTruthy();

    expect(signOut).not.toHaveBeenCalled();
    for (const key of accountKeys) expect(storage.values.has(key), key).toBe(true);
  });

  it('still clears the device after a post-deletion sign-out transport error', async () => {
    const storage = installSeededStorage();
    const { client } = clientWith({ signOutThrows: true });

    await expect(deleteCurrentAccount(client)).resolves.toEqual({ deletedRemoteAccount: true });
    for (const key of accountKeys) expect(storage.values.has(key), key).toBe(false);
  });

  it('recovers when hard deletion committed but the Edge response was lost', async () => {
    const storage = installSeededStorage();
    const { client, getUser, signOut } = clientWith({
      getUserError: { code: 'user_not_found', status: 403 },
      getUserResult: null,
      invokeError: new Error('response connection closed'),
    });

    await expect(deleteCurrentAccount(client)).resolves.toEqual({ deletedRemoteAccount: true });

    expect(getUser).toHaveBeenCalledWith('test-access-token');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    for (const key of accountKeys) expect(storage.values.has(key), key).toBe(false);
  });

  it('does not mistake an auth/network failure for a completed deletion', async () => {
    const storage = installSeededStorage();
    const { client } = clientWith({
      getUserError: { code: 'request_timeout', status: 503 },
      getUserResult: null,
      invokeError: new Error('network unavailable'),
    });

    await expect(deleteCurrentAccount(client)).rejects.toBeTruthy();
    for (const key of accountKeys) expect(storage.values.has(key), key).toBe(true);
  });
});
