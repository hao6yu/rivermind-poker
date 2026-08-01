import type { AiDifficulty } from './aiProfiles';
import {
  isSitAndGoCheckpoint,
  type SitAndGoCheckpoint,
  type SitAndGoPlayerCount,
} from './tournament';

export const CHAMPIONSHIP_VERSION = 1;

export type ChampionshipEventId =
  | 'local_tables'
  | 'city_circuit'
  | 'national_tour'
  | 'masters_division'
  | 'championship_final';

export interface ChampionshipEvent {
  id: ChampionshipEventId;
  title: string;
  shortDescription: string;
  playerCount: SitAndGoPlayerCount;
  aiDifficulty: AiDifficulty;
  qualifyingPlace: number;
}

export const CHAMPIONSHIP_EVENTS: readonly ChampionshipEvent[] = [
  {
    id: 'local_tables',
    title: 'Local Tables',
    shortDescription: 'Find your footing in a quick opening event.',
    playerCount: 3,
    aiDifficulty: 'friendly',
    qualifyingPlace: 2,
  },
  {
    id: 'city_circuit',
    title: 'City Circuit',
    shortDescription: 'Stay composed as the decisions get sharper.',
    playerCount: 3,
    aiDifficulty: 'club',
    qualifyingPlace: 2,
  },
  {
    id: 'national_tour',
    title: 'National Tour',
    shortDescription: 'Navigate your first full six-player field.',
    playerCount: 6,
    aiDifficulty: 'club',
    qualifyingPlace: 3,
  },
  {
    id: 'masters_division',
    title: 'Masters Division',
    shortDescription: 'Reach heads-up territory against Sharp AI.',
    playerCount: 6,
    aiDifficulty: 'sharp',
    qualifyingPlace: 2,
  },
  {
    id: 'championship_final',
    title: 'RiverMind Final',
    shortDescription: 'Win the final table to complete the tour.',
    playerCount: 6,
    aiDifficulty: 'sharp',
    qualifyingPlace: 1,
  },
];

export interface ChampionshipEventProgress {
  eventId: ChampionshipEventId;
  bestPlace: number;
  attempts: number;
  lastPlayedAt: string;
  qualifiedAt: string | null;
}

export interface ChampionshipProgress {
  version: 1;
  events: ChampionshipEventProgress[];
}

export type ChampionshipAchievementId =
  | 'first_run'
  | 'first_qualification'
  | 'full_table'
  | 'five_runs'
  | 'masters_qualifier'
  | 'rivermind_champion';

export interface ChampionshipAchievement {
  id: ChampionshipAchievementId;
  title: string;
  description: string;
  unlocked: boolean;
}

export interface ChampionshipStats {
  attemptedEvents: number;
  bestPlace: number | null;
  qualifiedEvents: number;
  sixPlayerRuns: number;
  threePlayerRuns: number;
  totalRuns: number;
}

export interface ChampionshipResult {
  eventId: ChampionshipEventId;
  place: number;
  handsPlayed: number;
  completedAt: string;
}

export interface ChampionshipCheckpoint {
  version: 1;
  eventId: ChampionshipEventId;
  tournament: SitAndGoCheckpoint;
}

export function createEmptyChampionshipProgress(): ChampionshipProgress {
  return { version: CHAMPIONSHIP_VERSION, events: [] };
}

export function championshipEvent(eventId: ChampionshipEventId): ChampionshipEvent {
  const event = CHAMPIONSHIP_EVENTS.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error(`Unknown Championship event ${eventId}.`);
  return event;
}

export function championshipEventProgress(
  progress: ChampionshipProgress,
  eventId: ChampionshipEventId,
): ChampionshipEventProgress | null {
  return progress.events.find((result) => result.eventId === eventId) ?? null;
}

export function championshipEventIsUnlocked(
  progress: ChampionshipProgress,
  eventId: ChampionshipEventId,
): boolean {
  const index = CHAMPIONSHIP_EVENTS.findIndex((event) => event.id === eventId);
  if (index < 0) return false;
  if (index === 0) return true;
  const previous = CHAMPIONSHIP_EVENTS[index - 1];
  return previous ? Boolean(championshipEventProgress(progress, previous.id)?.qualifiedAt) : false;
}

export function championshipQualifiedCount(progress: ChampionshipProgress): number {
  return CHAMPIONSHIP_EVENTS.filter((event) => (
    championshipEventProgress(progress, event.id)?.qualifiedAt
  )).length;
}

export function championshipStats(progress: ChampionshipProgress): ChampionshipStats {
  let bestPlace: number | null = null;
  let sixPlayerRuns = 0;
  let threePlayerRuns = 0;

  for (const eventProgress of progress.events) {
    const event = championshipEvent(eventProgress.eventId);
    bestPlace = bestPlace === null
      ? eventProgress.bestPlace
      : Math.min(bestPlace, eventProgress.bestPlace);
    if (event.playerCount === 3) threePlayerRuns += eventProgress.attempts;
    else sixPlayerRuns += eventProgress.attempts;
  }

  return {
    attemptedEvents: progress.events.length,
    bestPlace,
    qualifiedEvents: championshipQualifiedCount(progress),
    sixPlayerRuns,
    threePlayerRuns,
    totalRuns: threePlayerRuns + sixPlayerRuns,
  };
}

export function championshipAchievements(
  progress: ChampionshipProgress,
): ChampionshipAchievement[] {
  const stats = championshipStats(progress);
  const qualified = (eventId: ChampionshipEventId) => Boolean(
    championshipEventProgress(progress, eventId)?.qualifiedAt,
  );

  return [
    {
      id: 'first_run',
      title: 'First Shuffle',
      description: 'Finish your first Championship run.',
      unlocked: stats.totalRuns >= 1,
    },
    {
      id: 'first_qualification',
      title: 'On the Road',
      description: 'Qualify at your first Championship stop.',
      unlocked: stats.qualifiedEvents >= 1,
    },
    {
      id: 'full_table',
      title: 'Full Table',
      description: 'Finish a six-player Championship run.',
      unlocked: stats.sixPlayerRuns >= 1,
    },
    {
      id: 'five_runs',
      title: 'Back for More',
      description: 'Complete five Championship runs.',
      unlocked: stats.totalRuns >= 5,
    },
    {
      id: 'masters_qualifier',
      title: 'Final Table Bound',
      description: 'Qualify through the Masters Division.',
      unlocked: qualified('masters_division'),
    },
    {
      id: 'rivermind_champion',
      title: 'RiverMind Champion',
      description: 'Win the RiverMind Final.',
      unlocked: qualified('championship_final'),
    },
  ];
}

export function championshipUnlockedAchievementCount(progress: ChampionshipProgress): number {
  return championshipAchievements(progress).filter((achievement) => achievement.unlocked).length;
}

export function championshipCurrentEvent(progress: ChampionshipProgress): ChampionshipEvent {
  return CHAMPIONSHIP_EVENTS.find((event) => (
    championshipEventIsUnlocked(progress, event.id)
    && !championshipEventProgress(progress, event.id)?.qualifiedAt
  )) ?? CHAMPIONSHIP_EVENTS[CHAMPIONSHIP_EVENTS.length - 1]!;
}

export function championshipIsComplete(progress: ChampionshipProgress): boolean {
  return championshipQualifiedCount(progress) === CHAMPIONSHIP_EVENTS.length;
}

export function championshipQualifies(event: ChampionshipEvent, place: number): boolean {
  return Number.isInteger(place) && place >= 1 && place <= event.qualifyingPlace;
}

export function applyChampionshipResult(
  progress: ChampionshipProgress,
  result: ChampionshipResult,
): ChampionshipProgress {
  const event = championshipEvent(result.eventId);
  if (!championshipEventIsUnlocked(progress, result.eventId)) {
    throw new Error('The Championship event is still locked.');
  }
  if (!Number.isInteger(result.place) || result.place < 1 || result.place > event.playerCount) {
    throw new Error('The Championship placement is invalid.');
  }
  if (!Number.isInteger(result.handsPlayed) || result.handsPlayed < 1) {
    throw new Error('The Championship hand count is invalid.');
  }

  const previous = championshipEventProgress(progress, result.eventId);
  const next: ChampionshipEventProgress = {
    eventId: result.eventId,
    bestPlace: Math.min(previous?.bestPlace ?? event.playerCount, result.place),
    attempts: (previous?.attempts ?? 0) + 1,
    lastPlayedAt: result.completedAt,
    qualifiedAt: previous?.qualifiedAt
      ?? (championshipQualifies(event, result.place) ? result.completedAt : null),
  };
  return {
    version: CHAMPIONSHIP_VERSION,
    events: [
      ...progress.events.filter((entry) => entry.eventId !== result.eventId),
      next,
    ].sort((left, right) => (
      CHAMPIONSHIP_EVENTS.findIndex((eventEntry) => eventEntry.id === left.eventId)
      - CHAMPIONSHIP_EVENTS.findIndex((eventEntry) => eventEntry.id === right.eventId)
    )),
  };
}

export function isChampionshipProgress(value: unknown): value is ChampionshipProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== CHAMPIONSHIP_VERSION || !Array.isArray(candidate.events)) return false;
  const ids = new Set<string>();
  for (const entry of candidate.events) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const result = entry as Record<string, unknown>;
    if (typeof result.eventId !== 'string' || ids.has(result.eventId)) return false;
    const event = CHAMPIONSHIP_EVENTS.find((item) => item.id === result.eventId);
    if (!event) return false;
    ids.add(result.eventId);
    if (!Number.isInteger(result.bestPlace) || Number(result.bestPlace) < 1 || Number(result.bestPlace) > event.playerCount) return false;
    if (!Number.isInteger(result.attempts) || Number(result.attempts) < 1) return false;
    if (typeof result.lastPlayedAt !== 'string') return false;
    if (result.qualifiedAt !== null && typeof result.qualifiedAt !== 'string') return false;
    if (result.qualifiedAt !== null && Number(result.bestPlace) > event.qualifyingPlace) return false;
  }
  for (let index = 1; index < CHAMPIONSHIP_EVENTS.length; index += 1) {
    const event = CHAMPIONSHIP_EVENTS[index];
    const previous = CHAMPIONSHIP_EVENTS[index - 1];
    if (!event || !previous) return false;
    const eventResult = candidate.events.find((entry) => (
      (entry as Record<string, unknown>).eventId === event.id
    )) as Record<string, unknown> | undefined;
    const previousResult = candidate.events.find((entry) => (
      (entry as Record<string, unknown>).eventId === previous.id
    )) as Record<string, unknown> | undefined;
    if (eventResult && typeof previousResult?.qualifiedAt !== 'string') return false;
  }
  return true;
}

export function createChampionshipCheckpoint(
  eventId: ChampionshipEventId,
  tournament: SitAndGoCheckpoint,
): ChampionshipCheckpoint {
  const checkpoint: ChampionshipCheckpoint = {
    version: CHAMPIONSHIP_VERSION,
    eventId,
    tournament,
  };
  if (!isChampionshipCheckpoint(checkpoint)) {
    throw new Error('The Championship checkpoint does not match its event.');
  }
  return checkpoint;
}

export function isChampionshipCheckpoint(value: unknown): value is ChampionshipCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== CHAMPIONSHIP_VERSION || typeof candidate.eventId !== 'string') return false;
  const event = CHAMPIONSHIP_EVENTS.find((item) => item.id === candidate.eventId);
  if (!event || !isSitAndGoCheckpoint(candidate.tournament)) return false;
  return candidate.tournament.players.length === event.playerCount
    && candidate.tournament.aiDifficulty === event.aiDifficulty;
}
