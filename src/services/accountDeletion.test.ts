import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('./supabase', () => ({ supabase: null }));
vi.mock('./betaFeedback', () => ({
  clearAppDiagnostics: () => globalThis.localStorage?.removeItem('rivermind.diagnostics.v1'),
}));

// Let the account-deletion path use injected deleters, so the queue drain
// during purgeLocalAccountData is testable without expo-file-system.
const avatarCleanupMocks = vi.hoisted(() => ({
  deleters: null as {
    files?: { deleteAvatarFile: (uri: string) => Promise<boolean> };
    objects?: { deleteAvatarObject: (path: string) => Promise<boolean> };
  } | null,
}));
vi.mock('./avatarCleanup', async (importOriginal) => {
  const original = await importOriginal<typeof import('./avatarCleanup')>();
  return {
    ...original,
    resolveAvatarCleanupDeleters: async () => avatarCleanupMocks.deleters,
  };
});

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
  'rivermind.avatar-registry.v1',
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
  avatarCleanupMocks.deleters = null;
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

  it('drains the persisted cleanup queue during account deletion when deletions are confirmed', async () => {
    const storage = installSeededStorage();
    storage.setItem('rivermind.avatar-cleanup-queue.v1', JSON.stringify([
      { avatarId: 'avatarid01', uri: 'file://cache/stale-1.png', ownerId: 'user-1', enqueuedAtMs: 1710000000000 },
      { avatarId: 'avatarid02', uri: 'file://cache/stale-2.png', enqueuedAtMs: 1710000000000 },
    ]));
    const deletedFiles: string[] = [];
    avatarCleanupMocks.deleters = {
      files: { deleteAvatarFile: async (uri) => { deletedFiles.push(uri); return true; } },
      objects: { deleteAvatarObject: async () => true },
    };

    await expect(deleteCurrentAccount(null)).resolves.toEqual({ deletedRemoteAccount: false });

    // The owner-scoped record removed its cached file AND hosted object; the
    // foreign cache removed its file. Both are drained from the queue.
    expect(deletedFiles).toEqual(['file://cache/stale-1.png', 'file://cache/stale-2.png']);
    expect(storage.values.has('rivermind.avatar-cleanup-queue.v1')).toBe(false);
  });

  it('keeps an unconfirmed cleanup record after account deletion for a later sweep', async () => {
    const storage = installSeededStorage();
    storage.setItem('rivermind.avatar-cleanup-queue.v1', JSON.stringify([
      { avatarId: 'avatarid01', uri: 'file://cache/stale-1.png', ownerId: 'user-1', enqueuedAtMs: 1710000000000 },
    ]));
    avatarCleanupMocks.deleters = {
      files: { deleteAvatarFile: async () => false }, // deletion cannot be confirmed
      objects: { deleteAvatarObject: async () => true },
    };

    await expect(deleteCurrentAccount(null)).resolves.toEqual({ deletedRemoteAccount: false });

    // The registry is gone, but the unconfirmed record survives so the bytes
    // stay tracked and a later startup sweep can still remove them.
    const queue = JSON.parse(storage.values.get('rivermind.avatar-cleanup-queue.v1') ?? '[]') as unknown[];
    expect(queue).toHaveLength(1);
  });

  it('queues the CURRENT avatar when its deletion fails during account deletion', async () => {
    const storage = installSeededStorage();
    // A valid, CURRENT registered avatar — its file deletion fails during the
    // purge, and the registry (its only URI) is about to be cleared.
    storage.setItem('rivermind.avatar-registry.v1', JSON.stringify([{
      avatarId: 'avatarid01',
      version: 1,
      ownerId: 'user-1',
      objectPath: 'avatars/user-1/avatarid01@1.png',
      uri: 'file://cache/avatarid01-1.png',
      descriptor: { avatarId: 'avatarid01', version: 1, mime: 'image/png', bytes: 1024, width: 256, height: 256 },
      savedAtMs: 1710000000000,
    }]));
    avatarCleanupMocks.deleters = {
      files: { deleteAvatarFile: async () => false }, // current avatar file cannot be deleted
      objects: { deleteAvatarObject: async () => true }, // the hosted object IS deleted
    };

    await expect(deleteCurrentAccount(null)).resolves.toEqual({ deletedRemoteAccount: false });

    // The registry is cleared, but the failed CURRENT avatar's URI survives in
    // the cleanup queue instead of being lost with the registry. The record is
    // FILE-ONLY: the object was confirmed gone, and retrying it would never
    // drain (the known missing-object response).
    expect(storage.values.has('rivermind.avatar-registry.v1')).toBe(false);
    const queue = JSON.parse(storage.values.get('rivermind.avatar-cleanup-queue.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(queue).toEqual([
      expect.objectContaining({
        avatarId: 'avatarid01',
        uri: 'file://cache/avatarid01-1.png',
      }),
    ]);
    expect('ownerId' in queue[0]!).toBe(false);
  });

  it('tombstones the current avatar when the queue is full during account deletion', async () => {
    const storage = installSeededStorage();
    storage.setItem('rivermind.avatar-registry.v1', JSON.stringify([{
      avatarId: 'avatarid01',
      version: 1,
      ownerId: 'user-1',
      objectPath: 'avatars/user-1/avatarid01@1.png',
      uri: 'file://cache/avatarid01-1.png',
      descriptor: { avatarId: 'avatarid01', version: 1, mime: 'image/png', bytes: 1024, width: 256, height: 256 },
      savedAtMs: 1710000000000,
    }]));
    // The queue is already at capacity; the sweep cannot drain it (the mocked
    // deleters fail), so the current avatar's enqueue must be rejected.
    storage.setItem('rivermind.avatar-cleanup-queue.v1', JSON.stringify(
      Array.from({ length: 500 }, (_, index) => ({
        avatarId: 'avatarid01',
        uri: `file://cache/old-${index}.png`,
        enqueuedAtMs: 1710000000000,
      })),
    ));
    avatarCleanupMocks.deleters = {
      files: { deleteAvatarFile: async () => false },
      objects: { deleteAvatarObject: async () => true }, // the hosted object IS deleted
    };

    await expect(deleteCurrentAccount(null)).resolves.toEqual({ deletedRemoteAccount: false });

    // Fail closed: the current avatar's URI survives account deletion as a
    // CLEANUP TOMBSTONE — a dedicated store the app-startup sweep retries —
    // while the account registry itself is fully cleared. The tombstone is
    // FILE-ONLY because the object was confirmed gone.
    expect(storage.values.has('rivermind.avatar-registry.v1')).toBe(false);
    const tombstones = JSON.parse(storage.values.get('rivermind.avatar-cleanup-tombstones.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(tombstones).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png' }),
    ]);
    expect('ownerId' in tombstones[0]!).toBe(false);
    expect(storage.values.has('rivermind.learning-profile.v1')).toBe(false);
    expect(storage.values.has('rivermind.onboarding.v1')).toBe(false);
    // The queue itself is untouched — no silent eviction.
    expect(JSON.parse(storage.values.get('rivermind.avatar-cleanup-queue.v1') ?? '[]')).toHaveLength(500);
  });

  it('keeps an owner-scoped tombstone when the object deletion is ALSO unconfirmed', async () => {
    const storage = installSeededStorage();
    storage.setItem('rivermind.avatar-registry.v1', JSON.stringify([{
      avatarId: 'avatarid01',
      version: 1,
      ownerId: 'user-1',
      objectPath: 'avatars/user-1/avatarid01@1.png',
      uri: 'file://cache/avatarid01-1.png',
      descriptor: { avatarId: 'avatarid01', version: 1, mime: 'image/png', bytes: 1024, width: 256, height: 256 },
      savedAtMs: 1710000000000,
    }]));
    storage.setItem('rivermind.avatar-cleanup-queue.v1', JSON.stringify(
      Array.from({ length: 500 }, (_, index) => ({
        avatarId: 'avatarid01',
        uri: `file://cache/old-${index}.png`,
        enqueuedAtMs: 1710000000000,
      })),
    ));
    avatarCleanupMocks.deleters = {
      files: { deleteAvatarFile: async () => false },
      objects: { deleteAvatarObject: async () => false }, // the object MAY still exist
    };

    await expect(deleteCurrentAccount(null)).resolves.toEqual({ deletedRemoteAccount: false });

    const tombstones = JSON.parse(storage.values.get('rivermind.avatar-cleanup-tombstones.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(tombstones).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png', ownerId: 'user-1' }),
    ]);
  });

  it('merges with pre-existing tombstones instead of overwriting them', async () => {
    const storage = installSeededStorage();
    storage.setItem('rivermind.avatar-registry.v1', JSON.stringify([{
      avatarId: 'avatarid01',
      version: 1,
      ownerId: 'user-1',
      objectPath: 'avatars/user-1/avatarid01@1.png',
      uri: 'file://cache/avatarid01-1.png',
      descriptor: { avatarId: 'avatarid01', version: 1, mime: 'image/png', bytes: 1024, width: 256, height: 256 },
      savedAtMs: 1710000000000,
    }]));
    storage.setItem('rivermind.avatar-cleanup-queue.v1', JSON.stringify(
      Array.from({ length: 500 }, (_, index) => ({
        avatarId: 'avatarid01',
        uri: `file://cache/old-${index}.png`,
        enqueuedAtMs: 1710000000000,
      })),
    ));
    // A tombstone from an EARLIER failure (before this account deletion).
    storage.setItem('rivermind.avatar-cleanup-tombstones.v1', JSON.stringify([
      { avatarId: 'avatarid09', uri: 'file://cache/earlier-9.png', enqueuedAtMs: 0 },
    ]));
    avatarCleanupMocks.deleters = {
      files: { deleteAvatarFile: async () => false },
      objects: { deleteAvatarObject: async () => false },
    };

    await expect(deleteCurrentAccount(null)).resolves.toEqual({ deletedRemoteAccount: false });

    const tombstones = JSON.parse(storage.values.get('rivermind.avatar-cleanup-tombstones.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(tombstones).toEqual([
      // The earlier tombstone survived the account deletion's write.
      expect.objectContaining({ avatarId: 'avatarid09', uri: 'file://cache/earlier-9.png' }),
      // The current batch was appended alongside it.
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png', ownerId: 'user-1' }),
    ]);
  });

  it('preserves the registry THROUGH the clear when storage rejects every write', async () => {
    const storage = memoryStorage({
      ...Object.fromEntries(accountKeys.map((key) => [key, '{"saved":true}'])),
      ...preferenceEntries,
    });
    const registryValue = JSON.stringify([{
      avatarId: 'avatarid01',
      version: 1,
      ownerId: 'user-1',
      objectPath: 'avatars/user-1/avatarid01@1.png',
      uri: 'file://cache/avatarid01-1.png',
      descriptor: { avatarId: 'avatarid01', version: 1, mime: 'image/png', bytes: 1024, width: 256, height: 256 },
      savedAtMs: 1710000000000,
    }]);
    storage.setItem('rivermind.avatar-registry.v1', registryValue);
    storage.setItem('rivermind.avatar-cleanup-queue.v1', JSON.stringify(
      Array.from({ length: 500 }, (_, index) => ({
        avatarId: 'avatarid01',
        uri: `file://cache/old-${index}.png`,
        enqueuedAtMs: 1710000000000,
      })),
    ));
    // EVERY write fails (quota/general storage outage), so the queue, the
    // re-attempt, AND the tombstone store all reject the current avatar's URI.
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      void key;
      void value;
      throw new Error('quota exceeded');
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
      writable: true,
    });
    avatarCleanupMocks.deleters = {
      files: { deleteAvatarFile: async () => false },
      objects: { deleteAvatarObject: async () => false },
    };

    await expect(deleteCurrentAccount(null)).resolves.toEqual({ deletedRemoteAccount: false });

    // Fail closed: the registry KEY is preserved in place — never removed and
    // never rewritten — because no storage write could be confirmed. A
    // delete-then-rewrite would lose the references again on this general
    // setItem failure. Every other account-bound key was cleared.
    expect(storage.values.get('rivermind.avatar-registry.v1')).toBe(registryValue);
    const registry = JSON.parse(storage.values.get('rivermind.avatar-registry.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(registry).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png', ownerId: 'user-1' }),
    ]);
    expect(storage.values.has('rivermind.learning-profile.v1')).toBe(false);
    expect(storage.values.has('rivermind.onboarding.v1')).toBe(false);
    expect(storage.values.has('rivermind.avatar-cleanup-tombstones.v1')).toBe(false);
  });

  it('treats hosted objects as server-confirmed after a confirmed remote deletion', async () => {
    const storage = installSeededStorage();
    storage.setItem('rivermind.avatar-registry.v1', JSON.stringify([{
      avatarId: 'avatarid01',
      version: 1,
      ownerId: 'user-1',
      objectPath: 'avatars/user-1/avatarid01@1.png',
      uri: 'file://cache/avatarid01-1.png',
      descriptor: { avatarId: 'avatarid01', version: 1, mime: 'image/png', bytes: 1024, width: 256, height: 256 },
      savedAtMs: 1710000000000,
    }]));
    // After the remote deletion the deleted account can no longer authenticate,
    // so the object deleter would fail forever — it must not even be called.
    const deleteAvatarObject = vi.fn(async () => false);
    avatarCleanupMocks.deleters = {
      files: { deleteAvatarFile: async () => false },
      objects: { deleteAvatarObject },
    };
    const { client } = clientWith(); // default: invoke resolves { deleted: true }

    await expect(deleteCurrentAccount(client)).resolves.toEqual({ deletedRemoteAccount: true });

    expect(deleteAvatarObject).not.toHaveBeenCalled();
    // The queue record is FILE-ONLY: an owner-scoped record could never drain
    // once the server-confirmed object can no longer be verified.
    const queue = JSON.parse(storage.values.get('rivermind.avatar-cleanup-queue.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(queue).toEqual([
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/avatarid01-1.png' }),
    ]);
    expect(queue[0]).not.toHaveProperty('ownerId');
  });

  it('converts the DELETED user\'s pre-existing cleanup records to file-only', async () => {
    const storage = installSeededStorage();
    // Records queued/tombstoned BEFORE this deletion: the deleted user's
    // objects are server-confirmed gone, so owner-scoped retries could never
    // drain; another owner's record must be untouched.
    storage.setItem('rivermind.avatar-cleanup-queue.v1', JSON.stringify([
      {
        avatarId: 'avatarid01',
        uri: 'file://cache/old-1.png',
        ownerId: 'user-1',
        enqueuedAtMs: 1710000000000,
      },
      {
        avatarId: 'avatarid02',
        uri: 'file://cache/old-2.png',
        ownerId: 'user-2',
        enqueuedAtMs: 1710000000000,
      },
    ]));
    storage.setItem('rivermind.avatar-cleanup-tombstones.v1', JSON.stringify([
      { avatarId: 'avatarid03', uri: 'file://cache/old-3.png', ownerId: 'user-1' },
    ]));
    avatarCleanupMocks.deleters = {
      files: { deleteAvatarFile: async () => false },
      objects: { deleteAvatarObject: async () => false },
    };
    const { client } = clientWith(); // session user id 'user-1'

    await expect(deleteCurrentAccount(client)).resolves.toEqual({ deletedRemoteAccount: true });

    const queue = JSON.parse(storage.values.get('rivermind.avatar-cleanup-queue.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(queue[0]).toEqual(
      expect.objectContaining({ avatarId: 'avatarid01', uri: 'file://cache/old-1.png' }),
    );
    expect('ownerId' in queue[0]!).toBe(false);
    // A different owner's record keeps its scope: their objects still exist.
    expect(queue[1]).toEqual(
      expect.objectContaining({ avatarId: 'avatarid02', uri: 'file://cache/old-2.png', ownerId: 'user-2' }),
    );
    const tombstones = JSON.parse(storage.values.get('rivermind.avatar-cleanup-tombstones.v1') ?? '[]') as Array<Record<string, unknown>>;
    expect(tombstones[0]).toEqual(
      expect.objectContaining({ avatarId: 'avatarid03', uri: 'file://cache/old-3.png' }),
    );
    expect('ownerId' in tombstones[0]!).toBe(false);
  });
});
