import { describe, expect, it } from 'vitest';

import { migrateChampionshipForEliteNemesisRelease } from './championshipProgressMigration';

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
