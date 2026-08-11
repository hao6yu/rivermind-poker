import 'expo-sqlite/localStorage/install';

import {
  CALIBRATION_SKILL_IDS,
  LEARNING_GOAL_IDS,
  createDefaultLearningProfile,
  type CalibrationKind,
  type CalibrationSkillId,
  type LearningGoalId,
  type LearningProfile,
  type LearningSkillSnapshot,
} from '../domain/learning/guidedProgress';

const learningProfileStorageKey = 'rivermind.learning-profile.v1';
let memoryProfile = createDefaultLearningProfile();

interface LearningProfileStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function deviceStorage(): LearningProfileStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function normalizedPercent(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : null;
}

function normalizedKind(value: unknown): CalibrationKind | null {
  return value === 'baseline' || value === 'checkpoint' ? value : null;
}

function normalizedGoal(value: unknown): LearningGoalId | null {
  return LEARNING_GOAL_IDS.includes(value as LearningGoalId) ? value as LearningGoalId : null;
}

function normalizedSnapshot(value: unknown): LearningSkillSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const kind = normalizedKind(item.kind);
  const overallScore = normalizedPercent(item.overallScore);
  const sessionCount = typeof item.sessionCount === 'number' && Number.isFinite(item.sessionCount)
    ? Math.max(0, Math.floor(item.sessionCount))
    : null;
  if (typeof item.id !== 'string'
    || typeof item.completedAt !== 'string'
    || Number.isNaN(new Date(item.completedAt).getTime())
    || !kind
    || overallScore === null
    || sessionCount === null
    || !item.scores
    || typeof item.scores !== 'object'
    || Array.isArray(item.scores)) return null;
  const sourceScores = item.scores as Record<string, unknown>;
  const scores = {} as Record<CalibrationSkillId, number>;
  for (const skill of CALIBRATION_SKILL_IDS) {
    const score = normalizedPercent(sourceScores[skill]);
    if (score === null) return null;
    scores[skill] = score;
  }
  return {
    completedAt: new Date(item.completedAt).toISOString(),
    id: item.id,
    kind,
    overallScore,
    scores,
    sessionCount,
  };
}

export function normalizeLearningProfile(value: unknown): LearningProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createDefaultLearningProfile();
  const item = value as Record<string, unknown>;
  const goal = normalizedGoal(item.goal) ?? 'balanced';
  const setupStatus = item.setupStatus === 'complete' || item.setupStatus === 'skipped'
    ? item.setupStatus
    : 'not-started';
  const snapshots = Array.isArray(item.snapshots)
    ? item.snapshots.flatMap((snapshot) => {
      const normalized = normalizedSnapshot(snapshot);
      return normalized ? [normalized] : [];
    }).sort((left, right) => right.completedAt.localeCompare(left.completedAt)).slice(0, 8)
    : [];
  return { goal, setupStatus, snapshots, version: 1 };
}

export function loadLearningProfile(
  storage: LearningProfileStorage | null = deviceStorage(),
): LearningProfile {
  if (!storage) return memoryProfile;
  try {
    const raw = storage.getItem(learningProfileStorageKey);
    memoryProfile = raw ? normalizeLearningProfile(JSON.parse(raw) as unknown) : createDefaultLearningProfile();
  } catch {
    memoryProfile = createDefaultLearningProfile();
  }
  return memoryProfile;
}

export function saveLearningProfile(
  profile: LearningProfile,
  storage: LearningProfileStorage | null = deviceStorage(),
): LearningProfile {
  memoryProfile = normalizeLearningProfile(profile);
  if (!storage) return memoryProfile;
  try {
    storage.setItem(learningProfileStorageKey, JSON.stringify(memoryProfile));
  } catch {
    // The in-memory profile still supports the current app session.
  }
  return memoryProfile;
}

export function clearLearningProfile(
  storage: LearningProfileStorage | null = deviceStorage(),
): LearningProfile {
  memoryProfile = createDefaultLearningProfile();
  try {
    storage?.removeItem(learningProfileStorageKey);
  } catch {
    // The in-memory reset still applies to the current app session.
  }
  return memoryProfile;
}

export const learningProfileStorageContract = {
  key: learningProfileStorageKey,
};
