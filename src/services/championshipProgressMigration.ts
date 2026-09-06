import {
  CHAMPIONSHIP_ALL_EVENTS,
  CHAMPIONSHIP_EVENTS,
  type ChampionshipEventId,
  type ChampionshipEventProgress,
  type ChampionshipProgress,
} from '../domain/poker/championship';

export const legacyChampionshipStorageKeys = {
  progress: 'rivermind.championship.progress.v1',
  backup: 'rivermind.championship.progress.backup.v2',
  checkpoint: 'rivermind.championship.checkpoint.v1',
} as const;

/** Intentional fresh championship for the 1.2 map/AI release. This is a save
 * generation, NOT the JSON schema or the running app version. Keep these keys
 * unchanged in later patches/releases unless another reset is authorized.
 * Separate all three slots so an old backup or checkpoint cannot restore the
 * previous tour. No destructive migration or receipt write can be interrupted
 * halfway through; only this generation participates in loading/recovery. */
export const championshipProgressStorageKey = 'rivermind.championship.tour-1.2.progress.v2';
export const championshipProgressBackupStorageKey = 'rivermind.championship.tour-1.2.progress.backup.v2';
export const championshipCheckpointStorageKey = 'rivermind.championship.tour-1.2.checkpoint.v2';

const engineUpgradeMigrationKey = 'rivermind.championship.migration.elite-nemesis-v1';

interface ChampionshipMigrationStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

type LegacyChampionshipEventId =
  | 'local_tables'
  | 'city_circuit'
  | 'national_tour'
  | 'masters_division'
  | 'championship_final'
  | 'river_below';

interface LegacyChampionshipEventProgress {
  eventId: LegacyChampionshipEventId;
  bestPlace: number;
  attempts: number;
  lastPlayedAt: string;
  qualifiedAt: string | null;
}

interface LegacyChampionshipProgress {
  version: 1;
  events: LegacyChampionshipEventProgress[];
}

const legacyEvents: Readonly<Record<LegacyChampionshipEventId, {
  playerCount: number;
  qualifyingPlace: number;
  firstV2Event: ChampionshipEventId;
  qualifiedV2Event: ChampionshipEventId;
}>> = {
  local_tables: { playerCount: 3, qualifyingPlace: 2, firstV2Event: 'local_3', qualifiedV2Event: 'local_9' },
  city_circuit: { playerCount: 3, qualifyingPlace: 2, firstV2Event: 'city_6', qualifiedV2Event: 'city_9' },
  national_tour: { playerCount: 6, qualifyingPlace: 3, firstV2Event: 'national_6', qualifiedV2Event: 'national_9' },
  masters_division: { playerCount: 6, qualifyingPlace: 2, firstV2Event: 'masters_6', qualifiedV2Event: 'masters_9' },
  championship_final: { playerCount: 6, qualifyingPlace: 1, firstV2Event: 'championship_final', qualifiedV2Event: 'championship_final' },
  river_below: { playerCount: 6, qualifyingPlace: 1, firstV2Event: 'river_below', qualifiedV2Event: 'river_below' },
};

const legacyOrder: readonly LegacyChampionshipEventId[] = [
  'local_tables',
  'city_circuit',
  'national_tour',
  'masters_division',
  'championship_final',
  'river_below',
];

function isLegacyChampionshipProgress(value: unknown): value is LegacyChampionshipProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.events)) return false;
  const byId = new Map<LegacyChampionshipEventId, LegacyChampionshipEventProgress>();
  for (const item of candidate.events) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const entry = item as Record<string, unknown>;
    if (typeof entry.eventId !== 'string' || !Object.hasOwn(legacyEvents, entry.eventId)) return false;
    const eventId = entry.eventId as LegacyChampionshipEventId;
    const event = legacyEvents[eventId];
    if (byId.has(eventId)
      || !Number.isInteger(entry.bestPlace)
      || Number(entry.bestPlace) < 1
      || Number(entry.bestPlace) > event.playerCount
      || !Number.isInteger(entry.attempts)
      || Number(entry.attempts) < 1
      || typeof entry.lastPlayedAt !== 'string'
      || (entry.qualifiedAt !== null && typeof entry.qualifiedAt !== 'string')
      || (entry.qualifiedAt !== null && Number(entry.bestPlace) > event.qualifyingPlace)) return false;
    byId.set(eventId, entry as unknown as LegacyChampionshipEventProgress);
  }
  for (let index = 1; index < legacyOrder.length; index += 1) {
    const current = byId.get(legacyOrder[index]!);
    const previous = byId.get(legacyOrder[index - 1]!);
    if (current && !previous?.qualifiedAt) return false;
  }
  return true;
}

function syntheticQualification(eventId: ChampionshipEventId, completedAt: string): ChampionshipEventProgress {
  const event = CHAMPIONSHIP_ALL_EVENTS.find((candidate) => candidate.id === eventId)!;
  return {
    eventId,
    bestPlace: event.qualifyingPlace,
    attempts: 1,
    lastPlayedAt: completedAt,
    qualifiedAt: completedAt,
  };
}

/**
 * Converts the original five-stage tour into the expanded v2 event chain.
 * A qualified legacy stage maps to the last event in its expanded stage so
 * an upgrade never sends a player backwards; any new prerequisite events are
 * represented as qualified bridge entries. Attempts and best placement stay
 * attached to the corresponding stage event.
 */
export function migrateLegacyChampionshipProgress(value: unknown): ChampionshipProgress | null {
  if (!isLegacyChampionshipProgress(value)) return null;
  const migrated = new Map<ChampionshipEventId, ChampionshipEventProgress>();
  const mainIds = CHAMPIONSHIP_EVENTS.map((event) => event.id);

  for (const eventId of legacyOrder) {
    const legacy = value.events.find((entry) => entry.eventId === eventId);
    if (!legacy) continue;
    const definition = legacyEvents[eventId];
    const mappedId = legacy.qualifiedAt ? definition.qualifiedV2Event : definition.firstV2Event;
    const mappedMainIndex = mainIds.indexOf(mappedId);
    if (mappedMainIndex >= 0) {
      for (const predecessorId of mainIds.slice(0, mappedMainIndex)) {
        if (!migrated.has(predecessorId)) {
          migrated.set(predecessorId, syntheticQualification(predecessorId, legacy.qualifiedAt ?? legacy.lastPlayedAt));
        }
      }
    } else if (mappedId === 'river_below') {
      for (const predecessorId of mainIds) {
        if (!migrated.has(predecessorId)) {
          migrated.set(predecessorId, syntheticQualification(predecessorId, legacy.qualifiedAt ?? legacy.lastPlayedAt));
        }
      }
    }
    migrated.set(mappedId, {
      eventId: mappedId,
      bestPlace: legacy.bestPlace,
      attempts: legacy.attempts,
      lastPlayedAt: legacy.lastPlayedAt,
      qualifiedAt: legacy.qualifiedAt,
    });
  }

  const order = CHAMPIONSHIP_ALL_EVENTS.map((event) => event.id);
  return {
    version: 2,
    events: [...migrated.values()].sort((left, right) => order.indexOf(left.eventId) - order.indexOf(right.eventId)),
  };
}

/**
 * Records that the Elite/Nemesis engine upgrade has been seen without
 * deleting player data. Compatibility is decided by the version-aware
 * migration in `championshipProgress`, which can preserve progress and reject
 * only an invalid active checkpoint.
 */
export function migrateChampionshipForEliteNemesisRelease(
  target: ChampionshipMigrationStorage,
): boolean {
  if (target.getItem(engineUpgradeMigrationKey) === 'complete') return false;
  const foundExistingData = target.getItem(legacyChampionshipStorageKeys.progress) !== null
    || target.getItem(legacyChampionshipStorageKeys.checkpoint) !== null;
  target.setItem(engineUpgradeMigrationKey, 'complete');
  return foundExistingData;
}
