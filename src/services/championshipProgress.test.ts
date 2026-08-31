import { afterEach, describe, expect, it, vi } from 'vitest';

import { migrateChampionshipForEliteNemesisRelease } from './championshipProgressMigration';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

describe('Championship Elite/Nemesis release migration', () => {
  it('clears only Championship progress and its saved run', () => {
    const target = memoryStorage({
      'rivermind.championship.checkpoint.v1': '{"saved":true}',
      'rivermind.championship.progress.v1': '{"events":[]}',
      'rivermind.daily.progress.v1': 'keep daily',
      'rivermind.opponent-memory.v1': 'keep opponent read',
    });

    expect(migrateChampionshipForEliteNemesisRelease(target)).toBe(true);
    expect(target.values.has('rivermind.championship.progress.v1')).toBe(false);
    expect(target.values.has('rivermind.championship.checkpoint.v1')).toBe(false);
    expect(target.values.get('rivermind.daily.progress.v1')).toBe('keep daily');
    expect(target.values.get('rivermind.opponent-memory.v1')).toBe('keep opponent read');
  });

  it('writes a receipt and never clears progress created after the migration', () => {
    const target = memoryStorage({
      'rivermind.championship.progress.v1': 'old progress',
    });

    expect(migrateChampionshipForEliteNemesisRelease(target)).toBe(true);
    target.values.set('rivermind.championship.progress.v1', 'new progress');

    expect(migrateChampionshipForEliteNemesisRelease(target)).toBe(false);
    expect(target.values.get('rivermind.championship.progress.v1')).toBe('new progress');
  });

  it('marks a fresh install complete without reporting a reset', () => {
    const target = memoryStorage();

    expect(migrateChampionshipForEliteNemesisRelease(target)).toBe(false);
    expect(migrateChampionshipForEliteNemesisRelease(target)).toBe(false);
  });
});

/**
 * The service module caches reset receipts at module scope, so every v2-reset
 * test loads a fresh module instance against its own storage.
 */
async function loadProgressService(storage: ReturnType<typeof memoryStorage>) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
    writable: true,
  });
  vi.resetModules();
  return await import('./championshipProgress');
}

const MIGRATION_RECEIPT_KEY = 'rivermind.championship.migration.elite-nemesis-v1';

describe('Championship v1 → v2 one-time reset (3.11D)', () => {
  afterEach(() => {
    vi.resetModules();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: undefined,
      writable: true,
    });
  });

  it('discards stored version 1 progress and persists one empty version 2 state', async () => {
    const storage = memoryStorage({
      [MIGRATION_RECEIPT_KEY]: 'complete',
      'rivermind.championship.progress.v1': '{"version":1,"events":[{"eventId":"local_final","bestPlace":1,"attempts":9,"lastPlayedAt":"2026-01-01T00:00:00.000Z","qualifiedAt":"2026-01-01T00:00:00.000Z"}]}',
      'rivermind.daily.progress.v1': 'keep daily',
      'rivermind.languagePreference': 'zh-Hant',
    });

    const service = await loadProgressService(storage);
    const progress = service.loadChampionshipProgress();

    expect(progress).toEqual({ version: 2, events: [] });
    // The empty v2 state is persisted immediately, so the reset happens once
    // — not on every launch.
    const persisted = JSON.parse(storage.values.get('rivermind.championship.progress.v1')!);
    expect(persisted).toEqual({ version: 2, events: [] });
    // Unrelated account data is untouched by the Championship reset.
    expect(storage.values.get('rivermind.daily.progress.v1')).toBe('keep daily');
    expect(storage.values.get('rivermind.languagePreference')).toBe('zh-Hant');
  });

  it('discards an active Championship checkpoint that cannot represent a v2 event', async () => {
    const storage = memoryStorage({
      [MIGRATION_RECEIPT_KEY]: 'complete',
      'rivermind.championship.progress.v1': '{"version":1,"events":[]}',
      'rivermind.championship.checkpoint.v1': '{"version":1,"eventId":"local_final"}',
      'rivermind.onboarding.v1': '{"completed":true}',
    });

    const service = await loadProgressService(storage);
    expect(service.loadChampionshipCheckpoint()).toBeNull();
    expect(storage.values.has('rivermind.championship.checkpoint.v1')).toBe(false);
    expect(storage.values.get('rivermind.onboarding.v1')).toBe('{"completed":true}');
  });

  it('keeps valid version 2 progress and a valid version 2 checkpoint', async () => {
    const validCheckpoint = {
      version: 2,
      eventId: 'local_3',
      tournament: {
        version: 1,
        savedAt: '2026-08-03T00:00:00.000Z',
        nextHandNumber: 4,
        lastButtonSeat: 0,
        aiDifficulty: 'club',
        players: [
          { id: 'hero', name: 'You', seat: 0, stack: 1200, isHero: true },
          { id: 'ai-1', name: 'Kai', seat: 1, stack: 1200 },
          { id: 'ai-2', name: 'Iris', seat: 2, stack: 600 },
        ],
      },
    };
    const storage = memoryStorage({
      [MIGRATION_RECEIPT_KEY]: 'complete',
      'rivermind.championship.progress.v1': '{"version":2,"events":[{"eventId":"local_3","bestPlace":2,"attempts":1,"lastPlayedAt":"2026-08-03T00:00:00.000Z","qualifiedAt":"2026-08-03T00:00:00.000Z"}]}',
      'rivermind.championship.checkpoint.v1': JSON.stringify(validCheckpoint),
    });

    const service = await loadProgressService(storage);
    const progress = service.loadChampionshipProgress();
    const checkpoint = service.loadChampionshipCheckpoint();

    expect(progress.version).toBe(2);
    expect(progress.events).toHaveLength(1);
    expect(progress.events[0]?.eventId).toBe('local_3');
    expect(checkpoint?.eventId).toBe('local_3');
    expect(checkpoint?.tournament.players).toHaveLength(3);
    // Valid v2 data is not rewritten by the reset.
    expect(storage.values.get('rivermind.championship.progress.v1')).toBe(
      '{"version":2,"events":[{"eventId":"local_3","bestPlace":2,"attempts":1,"lastPlayedAt":"2026-08-03T00:00:00.000Z","qualifiedAt":"2026-08-03T00:00:00.000Z"}]}',
    );
  });

  it('starts every fresh install on an empty version 2 state without writing unrelated keys', async () => {
    const storage = memoryStorage({
      [MIGRATION_RECEIPT_KEY]: 'complete',
    });

    const service = await loadProgressService(storage);
    expect(service.loadChampionshipProgress()).toEqual({ version: 2, events: [] });
    expect(service.loadChampionshipCheckpoint()).toBeNull();
    expect(storage.values.get('rivermind.championship.progress.v1')).toBe('{"version":2,"events":[]}');
    expect(storage.values.size).toBe(2); // receipt + persisted empty v2 progress
  });
});
