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
  it('records the upgrade without deleting Championship or unrelated data', () => {
    const target = memoryStorage({
      'rivermind.championship.checkpoint.v1': '{"saved":true}',
      'rivermind.championship.progress.v1': '{"events":[]}',
      'rivermind.daily.progress.v1': 'keep daily',
      'rivermind.opponent-memory.v1': 'keep opponent read',
    });

    expect(migrateChampionshipForEliteNemesisRelease(target)).toBe(true);
    expect(target.values.get('rivermind.championship.progress.v1')).toBe('{"events":[]}');
    expect(target.values.get('rivermind.championship.checkpoint.v1')).toBe('{"saved":true}');
    expect(target.values.get('rivermind.daily.progress.v1')).toBe('keep daily');
    expect(target.values.get('rivermind.opponent-memory.v1')).toBe('keep opponent read');
  });

  it('writes a receipt and leaves later progress untouched', () => {
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
 * The service module caches migration receipts at module scope, so every
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

describe('Championship durable migration and recovery', () => {
  afterEach(() => {
    vi.resetModules();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: undefined,
      writable: true,
    });
  });

  it('migrates legacy progress without sending a qualified player backwards', async () => {
    const storage = memoryStorage({
      [MIGRATION_RECEIPT_KEY]: 'complete',
      'rivermind.championship.progress.v1': JSON.stringify({
        version: 1,
        events: [
          { eventId: 'local_tables', bestPlace: 1, attempts: 9, lastPlayedAt: '2026-01-01T00:00:00.000Z', qualifiedAt: '2026-01-01T00:00:00.000Z' },
          { eventId: 'city_circuit', bestPlace: 2, attempts: 4, lastPlayedAt: '2026-01-02T00:00:00.000Z', qualifiedAt: '2026-01-02T00:00:00.000Z' },
          { eventId: 'national_tour', bestPlace: 5, attempts: 3, lastPlayedAt: '2026-01-03T00:00:00.000Z', qualifiedAt: null },
        ],
      }),
      'rivermind.daily.progress.v1': 'keep daily',
      'rivermind.languagePreference': 'zh-Hant',
    });

    const service = await loadProgressService(storage);
    const progress = service.loadChampionshipProgress();

    expect(progress.events.map((entry) => entry.eventId)).toEqual([
      'local_3', 'local_6', 'local_9', 'city_6', 'city_9', 'national_6',
    ]);
    expect(progress.events.find((entry) => entry.eventId === 'local_9')).toMatchObject({
      attempts: 9,
      bestPlace: 1,
      qualifiedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(progress.events.find((entry) => entry.eventId === 'city_9')).toMatchObject({ attempts: 4, bestPlace: 2 });
    expect(progress.events.find((entry) => entry.eventId === 'national_6')).toMatchObject({ attempts: 3, bestPlace: 5, qualifiedAt: null });
    const persisted = JSON.parse(storage.values.get('rivermind.championship.progress.v1')!);
    expect(persisted).toEqual(progress);
    expect(JSON.parse(storage.values.get('rivermind.championship.progress.backup.v2')!)).toEqual(progress);
    // Unrelated account data is untouched by the Championship migration.
    expect(storage.values.get('rivermind.daily.progress.v1')).toBe('keep daily');
    expect(storage.values.get('rivermind.languagePreference')).toBe('zh-Hant');
  });

  it('preserves and migrates legacy progress even when the older engine receipt is absent', async () => {
    const storage = memoryStorage({
      'rivermind.championship.progress.v1': JSON.stringify({
        version: 1,
        events: [{
          eventId: 'local_tables',
          bestPlace: 2,
          attempts: 6,
          lastPlayedAt: '2026-01-01T00:00:00.000Z',
          qualifiedAt: '2026-01-01T00:00:00.000Z',
        }],
      }),
    });

    const service = await loadProgressService(storage);
    const progress = service.loadChampionshipProgress();
    expect(progress.events.map((entry) => entry.eventId)).toEqual(['local_3', 'local_6', 'local_9']);
    expect(progress.events.at(-1)).toMatchObject({ attempts: 6, bestPlace: 2 });
    expect(storage.values.get(MIGRATION_RECEIPT_KEY)).toBe('complete');
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
    // Valid v2 data remains the primary and gains a durable recovery copy.
    expect(storage.values.get('rivermind.championship.progress.v1')).toBe(
      '{"version":2,"events":[{"eventId":"local_3","bestPlace":2,"attempts":1,"lastPlayedAt":"2026-08-03T00:00:00.000Z","qualifiedAt":"2026-08-03T00:00:00.000Z"}]}',
    );
    expect(storage.values.get('rivermind.championship.progress.backup.v2')).toBe(
      storage.values.get('rivermind.championship.progress.v1'),
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
    expect(storage.values.get('rivermind.championship.progress.backup.v2')).toBe('{"version":2,"events":[]}');
    expect(storage.values.size).toBe(3); // receipt + primary + recovery copy
  });

  it('restores a corrupt primary progress item from its valid recovery copy', async () => {
    const recovered = {
      version: 2,
      events: [{
        eventId: 'local_3',
        bestPlace: 2,
        attempts: 7,
        lastPlayedAt: '2026-08-04T00:00:00.000Z',
        qualifiedAt: '2026-08-04T00:00:00.000Z',
      }],
    };
    const storage = memoryStorage({
      [MIGRATION_RECEIPT_KEY]: 'complete',
      'rivermind.championship.progress.v1': '{truncated',
      'rivermind.championship.progress.backup.v2': JSON.stringify(recovered),
    });

    const service = await loadProgressService(storage);
    expect(service.loadChampionshipProgress()).toEqual(recovered);
    expect(JSON.parse(storage.values.get('rivermind.championship.progress.v1')!)).toEqual(recovered);
  });

  it('selects the valid copy with more gameplay evidence when one write was stale', async () => {
    const stale = {
      version: 2,
      events: [{
        eventId: 'local_3',
        bestPlace: 2,
        attempts: 2,
        lastPlayedAt: '2026-08-04T00:00:00.000Z',
        qualifiedAt: '2026-08-04T00:00:00.000Z',
      }],
    };
    const current = {
      version: 2,
      events: [{
        ...stale.events[0],
        attempts: 3,
        lastPlayedAt: '2026-08-05T00:00:00.000Z',
      }],
    };
    const storage = memoryStorage({
      [MIGRATION_RECEIPT_KEY]: 'complete',
      'rivermind.championship.progress.v1': JSON.stringify(stale),
      'rivermind.championship.progress.backup.v2': JSON.stringify(current),
    });

    const service = await loadProgressService(storage);
    expect(service.loadChampionshipProgress()).toEqual(current);
    expect(JSON.parse(storage.values.get('rivermind.championship.progress.v1')!)).toEqual(current);
  });

  it('removes both progress copies when the player explicitly clears Championship data', async () => {
    const saved = {
      version: 2,
      events: [{
        eventId: 'local_3',
        bestPlace: 2,
        attempts: 3,
        lastPlayedAt: '2026-08-05T00:00:00.000Z',
        qualifiedAt: '2026-08-05T00:00:00.000Z',
      }],
    };
    const storage = memoryStorage({
      [MIGRATION_RECEIPT_KEY]: 'complete',
      'rivermind.championship.progress.v1': JSON.stringify(saved),
      'rivermind.championship.progress.backup.v2': JSON.stringify(saved),
    });

    const service = await loadProgressService(storage);
    service.clearChampionshipProgress();
    expect(storage.values.has('rivermind.championship.progress.v1')).toBe(false);
    expect(storage.values.has('rivermind.championship.progress.backup.v2')).toBe(false);
    expect(service.loadChampionshipProgress()).toEqual({ version: 2, events: [] });
  });

  it('repairs missing prerequisites from a valid later-event checkpoint and records its result', async () => {
    const checkpoint = {
      version: 2,
      eventId: 'city_6',
      tournament: {
        version: 1,
        savedAt: '2026-08-05T00:00:00.000Z',
        nextHandNumber: 4,
        lastButtonSeat: 0,
        aiDifficulty: 'sharp',
        structureId: 'standard',
        players: [
          { id: 'hero', name: 'You', seat: 0, stack: 1200, isHero: true },
          { id: 'ai-1', name: 'Kai', seat: 1, stack: 1200 },
          { id: 'ai-2', name: 'Iris', seat: 2, stack: 1200 },
          { id: 'ai-3', name: 'Mina', seat: 3, stack: 1200 },
          { id: 'ai-4', name: 'Omar', seat: 4, stack: 1200 },
          { id: 'ai-5', name: 'Zane', seat: 5, stack: 1200 },
        ],
      },
    };
    const storage = memoryStorage({
      [MIGRATION_RECEIPT_KEY]: 'complete',
      'rivermind.championship.progress.v1': '{"version":2,"events":[]}',
      'rivermind.championship.checkpoint.v1': JSON.stringify(checkpoint),
    });

    const service = await loadProgressService(storage);
    expect(service.loadChampionshipCheckpoint()?.eventId).toBe('city_6');
    expect(service.loadChampionshipProgress().events.map((entry) => entry.eventId)).toEqual([
      'local_3', 'local_6', 'local_9',
    ]);
    expect(() => service.recordChampionshipResult({
      eventId: 'city_6',
      place: 3,
      handsPlayed: 8,
      completedAt: '2026-08-05T00:30:00.000Z',
    })).not.toThrow();
    expect(service.loadChampionshipProgress().events.at(-1)).toMatchObject({
      eventId: 'city_6',
      attempts: 1,
      qualifiedAt: '2026-08-05T00:30:00.000Z',
    });
  });
});
