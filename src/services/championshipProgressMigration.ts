export const championshipProgressStorageKey = 'rivermind.championship.progress.v1';
export const championshipCheckpointStorageKey = 'rivermind.championship.checkpoint.v1';

const engineUpgradeMigrationKey = 'rivermind.championship.migration.elite-nemesis-v1';

interface ChampionshipMigrationStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

/**
 * One-time beta migration for the mixed-lineup Elite/Nemesis engine release.
 * The receipt prevents later launches and builds from clearing new progress.
 */
export function migrateChampionshipForEliteNemesisRelease(
  target: ChampionshipMigrationStorage,
): boolean {
  if (target.getItem(engineUpgradeMigrationKey) === 'complete') return false;
  const removedExistingProgress = target.getItem(championshipProgressStorageKey) !== null
    || target.getItem(championshipCheckpointStorageKey) !== null;
  target.removeItem(championshipProgressStorageKey);
  target.removeItem(championshipCheckpointStorageKey);
  target.setItem(engineUpgradeMigrationKey, 'complete');
  return removedExistingProgress;
}
