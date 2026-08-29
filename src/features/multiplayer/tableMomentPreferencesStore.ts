import {
  DEFAULT_TABLE_MOMENT_PREFERENCES,
  type TableMomentPreferences,
} from './tableMomentPreferences';

/**
 * Device-local persistence for table-moment preferences, following the same
 * localStorage-backed pattern as game feedback preferences. Values are
 * normalized on load so a corrupted or legacy payload falls back to the
 * defaults instead of crashing the table.
 */

export interface TableMomentPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const tableMomentPreferencesStorageKey = 'rivermind.table-moment-preferences.v1';

function deviceStorage(): TableMomentPreferencesStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function normalizeStoredPreferences(value: unknown): TableMomentPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const preferences = value as Record<string, unknown>;
  if (typeof preferences.muteAll !== 'boolean'
    || typeof preferences.motion !== 'boolean'
    || !Array.isArray(preferences.muteSeats)
    || preferences.muteSeats.some((seat) => typeof seat !== 'number')) {
    return null;
  }
  return {
    motion: preferences.motion,
    muteAll: preferences.muteAll,
    muteSeats: [...(preferences.muteSeats as number[])],
  };
}

export function loadTableMomentPreferences(
  storage: TableMomentPreferencesStorage | null = deviceStorage(),
): TableMomentPreferences {
  if (!storage) return DEFAULT_TABLE_MOMENT_PREFERENCES;
  try {
    const raw = storage.getItem(tableMomentPreferencesStorageKey);
    if (!raw) return DEFAULT_TABLE_MOMENT_PREFERENCES;
    return normalizeStoredPreferences(JSON.parse(raw)) ?? DEFAULT_TABLE_MOMENT_PREFERENCES;
  } catch {
    return DEFAULT_TABLE_MOMENT_PREFERENCES;
  }
}

export function saveTableMomentPreferences(
  preferences: TableMomentPreferences,
  storage: TableMomentPreferencesStorage | null = deviceStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(tableMomentPreferencesStorageKey, JSON.stringify(preferences));
  } catch {
    // Preference persistence must never interrupt a poker table.
  }
}
