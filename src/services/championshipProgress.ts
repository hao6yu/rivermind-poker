import 'expo-sqlite/localStorage/install';

import {
  applyChampionshipResult,
  CHAMPIONSHIP_ALL_EVENTS,
  CHAMPIONSHIP_EVENTS,
  CHAMPIONSHIP_INVITATION_EVENTS,
  championshipEvent,
  championshipEventIsUnlocked,
  createEmptyChampionshipProgress,
  isChampionshipCheckpoint,
  isChampionshipProgress,
  type ChampionshipCheckpoint,
  type ChampionshipEventId,
  type ChampionshipEventProgress,
  type ChampionshipProgress,
  type ChampionshipResult,
} from '../domain/poker/championship';
import {
  championshipCheckpointStorageKey as checkpointKey,
  championshipProgressBackupStorageKey as progressBackupKey,
  championshipProgressStorageKey as progressKey,
  migrateChampionshipForEliteNemesisRelease,
  migrateLegacyChampionshipProgress,
} from './championshipProgressMigration';

let memoryProgress = createEmptyChampionshipProgress();
let memoryCheckpoint: ChampionshipCheckpoint | null = null;
let storageMigrationChecked = false;

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function decodeProgress(raw: string | null): ChampionshipProgress | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isChampionshipProgress(parsed)) return parsed;
    const migrated = migrateLegacyChampionshipProgress(parsed);
    return migrated && isChampionshipProgress(migrated) ? migrated : null;
  } catch {
    return null;
  }
}

function progressEvidenceScore(progress: ChampionshipProgress): readonly [number, number, number] {
  return [
    progress.events.reduce((total, entry) => total + entry.attempts, 0),
    progress.events.filter((entry) => entry.qualifiedAt !== null).length,
    progress.events.length,
  ];
}

/** Championship progress is monotonic: attempts and qualifications only
 * accumulate. If one independent localStorage write failed, choose the copy
 * carrying more gameplay evidence instead of assuming either key is newer. */
function mostAdvancedProgress(
  primary: ChampionshipProgress | null,
  backup: ChampionshipProgress | null,
): ChampionshipProgress | null {
  if (!primary) return backup;
  if (!backup) return primary;
  const primaryScore = progressEvidenceScore(primary);
  const backupScore = progressEvidenceScore(backup);
  for (let index = 0; index < primaryScore.length; index += 1) {
    if (primaryScore[index]! > backupScore[index]!) return primary;
    if (backupScore[index]! > primaryScore[index]!) return backup;
  }
  return primary;
}

function persistProgress(progress: ChampionshipProgress): void {
  memoryProgress = progress;
  const target = storage();
  if (!target) return;
  const serialized = JSON.stringify(progress);
  // Write the recovery copy first. Each write is independent so a storage
  // quota failure cannot turn a valid in-memory update into an app crash.
  try {
    target.setItem(progressBackupKey, serialized);
  } catch {
    // Memory still preserves progress for this app session.
  }
  try {
    target.setItem(progressKey, serialized);
  } catch {
    // The backup or memory still preserves the latest valid progress.
  }
}

function ensureStorageMigration(): void {
  if (storageMigrationChecked) return;
  storageMigrationChecked = true;
  const target = storage();
  if (!target) return;
  try {
    migrateChampionshipForEliteNemesisRelease(target);
    const progress = mostAdvancedProgress(
      decodeProgress(target.getItem(progressKey)),
      decodeProgress(target.getItem(progressBackupKey)),
    )
      ?? createEmptyChampionshipProgress();
    persistProgress(progress);

    const rawCheckpoint = target.getItem(checkpointKey);
    if (rawCheckpoint) {
      try {
        const parsedCheckpoint: unknown = JSON.parse(rawCheckpoint);
        if (isChampionshipCheckpoint(parsedCheckpoint)) memoryCheckpoint = parsedCheckpoint;
        else target.removeItem(checkpointKey);
      } catch {
        target.removeItem(checkpointKey);
      }
    }
  } catch {
    // Continue from the latest valid in-memory data if storage is unavailable.
  }
}

function championshipPrerequisiteIds(eventId: ChampionshipEventId): ChampionshipEventId[] {
  const mainIndex = CHAMPIONSHIP_EVENTS.findIndex((event) => event.id === eventId);
  if (mainIndex >= 0) return CHAMPIONSHIP_EVENTS.slice(0, mainIndex).map((event) => event.id);
  const invitationIndex = CHAMPIONSHIP_INVITATION_EVENTS.findIndex((event) => event.id === eventId);
  if (invitationIndex < 0) return [];
  return [
    ...CHAMPIONSHIP_EVENTS.map((event) => event.id),
    ...CHAMPIONSHIP_INVITATION_EVENTS.slice(0, invitationIndex).map((event) => event.id),
  ];
}

/** A valid saved run proves the event was unlocked when play began. Repairing
 * only its prerequisite chain prevents a stale/corrupt primary progress item
 * from crashing result recording while leaving the current event untouched. */
function recoverUnlockPrerequisites(
  progress: ChampionshipProgress,
  eventId: ChampionshipEventId,
  evidenceAt: string,
): ChampionshipProgress {
  championshipEvent(eventId);
  if (championshipEventIsUnlocked(progress, eventId)) return progress;
  const entries = new Map<ChampionshipEventId, ChampionshipEventProgress>(
    progress.events.map((entry) => [entry.eventId, entry]),
  );
  for (const prerequisiteId of championshipPrerequisiteIds(eventId)) {
    const event = championshipEvent(prerequisiteId);
    const previous = entries.get(prerequisiteId);
    if (previous?.qualifiedAt) continue;
    entries.set(prerequisiteId, {
      eventId: prerequisiteId,
      bestPlace: Math.min(previous?.bestPlace ?? event.qualifyingPlace, event.qualifyingPlace),
      attempts: previous?.attempts ?? 1,
      lastPlayedAt: previous?.lastPlayedAt ?? evidenceAt,
      qualifiedAt: evidenceAt,
    });
  }
  const order = CHAMPIONSHIP_ALL_EVENTS.map((event) => event.id);
  return {
    version: 2,
    events: [...entries.values()].sort((left, right) => order.indexOf(left.eventId) - order.indexOf(right.eventId)),
  };
}

export function loadChampionshipProgress(): ChampionshipProgress {
  ensureStorageMigration();
  const target = storage();
  if (!target) return memoryProgress;
  try {
    const primaryRaw = target.getItem(progressKey);
    const backupRaw = target.getItem(progressBackupKey);
    const selected = mostAdvancedProgress(decodeProgress(primaryRaw), decodeProgress(backupRaw));
    if (selected) {
      const serialized = JSON.stringify(selected);
      memoryProgress = selected;
      if (primaryRaw !== serialized || backupRaw !== serialized) persistProgress(selected);
    }
  } catch {
    // Keep the latest valid in-memory progress.
  }
  return memoryProgress;
}

export function recordChampionshipResult(result: ChampionshipResult): ChampionshipProgress {
  const recovered = recoverUnlockPrerequisites(
    loadChampionshipProgress(),
    result.eventId,
    result.completedAt,
  );
  if (recovered !== memoryProgress) persistProgress(recovered);
  const next = applyChampionshipResult(recovered, result);
  persistProgress(next);
  return next;
}

export function loadChampionshipCheckpoint(): ChampionshipCheckpoint | null {
  ensureStorageMigration();
  try {
    const raw = storage()?.getItem(checkpointKey);
    if (!raw) return memoryCheckpoint;
    const parsed: unknown = JSON.parse(raw);
    if (isChampionshipCheckpoint(parsed)) {
      memoryCheckpoint = parsed;
      const current = loadChampionshipProgress();
      const recovered = recoverUnlockPrerequisites(current, parsed.eventId, parsed.tournament.savedAt);
      if (recovered !== current) persistProgress(recovered);
    }
  } catch {
    // Keep the latest valid in-memory checkpoint.
  }
  return memoryCheckpoint;
}

export function saveChampionshipCheckpoint(checkpoint: ChampionshipCheckpoint): void {
  ensureStorageMigration();
  if (!isChampionshipCheckpoint(checkpoint)) {
    throw new Error('Refusing to save an invalid Championship checkpoint.');
  }
  const current = loadChampionshipProgress();
  const recovered = recoverUnlockPrerequisites(current, checkpoint.eventId, checkpoint.tournament.savedAt);
  if (recovered !== current) persistProgress(recovered);
  memoryCheckpoint = checkpoint;
  try {
    storage()?.setItem(checkpointKey, JSON.stringify(checkpoint));
  } catch {
    // Memory preserves the current run for this app session.
  }
}

export function clearChampionshipCheckpoint(): void {
  memoryCheckpoint = null;
  try {
    storage()?.removeItem(checkpointKey);
  } catch {
    // The in-memory checkpoint has still been cleared.
  }
}

export function clearChampionshipProgress(): void {
  memoryProgress = createEmptyChampionshipProgress();
  clearChampionshipCheckpoint();
  for (const key of [progressKey, progressBackupKey]) {
    try {
      storage()?.removeItem(key);
    } catch {
      // Keep attempting the remaining account-bound keys.
    }
  }
}
