import type { AiDifficulty } from './aiProfiles';
import {
  isSitAndGoCheckpoint,
  type SitAndGoCheckpoint,
  type SitAndGoPlayerCount,
  type SitAndGoStructureId,
} from './tournament';

/** Slice 3.11D: the expanded ten-event, five-stage tour. Version 2 replaces
 * the five-event course; the one-time v1 → v2 reset lives in
 * `championshipProgress` and intentionally discards legacy progression. */
export const CHAMPIONSHIP_VERSION = 2;

export type ChampionshipStageId =
  | 'local_tables'
  | 'city_circuit'
  | 'national_tour'
  | 'masters_division'
  | 'final';

export type ChampionshipEventId =
  | 'local_3'
  | 'local_6'
  | 'local_9'
  | 'city_6'
  | 'city_9'
  | 'national_6'
  | 'national_9'
  | 'masters_6'
  | 'masters_9'
  | 'championship_final'
  | 'river_below'
  | 'the_undertow';

export interface ChampionshipEvent {
  id: ChampionshipEventId;
  /** The branded stage this table belongs to. */
  stage: ChampionshipStageId;
  playerCount: SitAndGoPlayerCount;
  /** Legacy checkpoint marker. Actual opponents use opponentDifficulties. */
  aiDifficulty: AiDifficulty;
  opponentDifficulties: readonly AiDifficulty[];
  qualifyingPlace: number;
  structureId: SitAndGoStructureId;
  /** Hidden invitation tables seat nine and run an explicit turn clock. */
  invitational?: boolean;
  turnClockSeconds?: number;
}

export interface ChampionshipStage {
  id: ChampionshipStageId;
  /** The main events of the stage, in unlock order. */
  events: readonly ChampionshipEventId[];
}

/** The single difficulty the event's roster is seated from: the highest tier
 * in its lineup, which is also what makes nine-seat rosters distinct. */
function rosterTier(difficulties: readonly AiDifficulty[]): AiDifficulty {
  const order: readonly AiDifficulty[] = ['friendly', 'club', 'sharp', 'elite', 'nemesis'];
  return difficulties.reduce((best, current) => (order.indexOf(current) > order.indexOf(best) ? current : best), 'friendly');
}

function event(
  id: ChampionshipEventId,
  stage: ChampionshipStageId,
  playerCount: SitAndGoPlayerCount,
  opponentDifficulties: readonly AiDifficulty[],
  qualifyingPlace: number,
  structureId: SitAndGoStructureId,
  extra?: { invitational?: boolean; turnClockSeconds?: number },
): ChampionshipEvent {
  return {
    id,
    stage,
    aiDifficulty: rosterTier(opponentDifficulties),
    opponentDifficulties,
    playerCount,
    qualifyingPlace,
    structureId,
    ...(extra?.invitational ? { invitational: true } : {}),
    ...(extra?.turnClockSeconds ? { turnClockSeconds: extra.turnClockSeconds } : {}),
  };
}

/** The five branded stages, in unlock order (scope 3.11D: stage order and
 * seat progression are fixed; lineup tiers are simulation-tunable targets). */
export const CHAMPIONSHIP_STAGES: readonly ChampionshipStage[] = [
  { id: 'local_tables', events: ['local_3', 'local_6', 'local_9'] },
  { id: 'city_circuit', events: ['city_6', 'city_9'] },
  { id: 'national_tour', events: ['national_6', 'national_9'] },
  { id: 'masters_division', events: ['masters_6', 'masters_9'] },
  { id: 'final', events: ['championship_final'] },
];

export const CHAMPIONSHIP_EVENTS: readonly ChampionshipEvent[] = [
  event('local_3', 'local_tables', 3, ['friendly', 'club'], 2, 'standard'),
  event('local_6', 'local_tables', 6, ['club', 'club', 'club', 'sharp', 'sharp'], 3, 'standard'),
  event('local_9', 'local_tables', 9, ['club', 'club', 'club', 'club', 'sharp', 'sharp', 'sharp', 'sharp'], 4, 'standard'),
  event('city_6', 'city_circuit', 6, ['club', 'club', 'sharp', 'sharp', 'sharp'], 3, 'standard'),
  event('city_9', 'city_circuit', 9, ['club', 'club', 'sharp', 'sharp', 'sharp', 'sharp', 'sharp', 'sharp'], 4, 'standard'),
  event('national_6', 'national_tour', 6, ['sharp', 'sharp', 'elite', 'elite', 'elite'], 2, 'standard'),
  event('national_9', 'national_tour', 9, ['sharp', 'sharp', 'sharp', 'sharp', 'elite', 'elite', 'elite', 'elite'], 3, 'standard'),
  event('masters_6', 'masters_division', 6, ['elite', 'elite', 'elite', 'elite', 'elite'], 2, 'masters'),
  event('masters_9', 'masters_division', 9, ['elite', 'elite', 'elite', 'elite', 'elite', 'elite', 'nemesis', 'nemesis'], 2, 'masters'),
  event('championship_final', 'final', 9, ['elite', 'elite', 'elite', 'elite', 'elite', 'elite', 'elite', 'elite'], 1, 'final'),
];

/** The hidden invitation chain: winning the Final reveals The River Below;
 * winning The River Below reveals The Undertow. Nothing else does, and The
 * Undertow is never named before it unlocks. */
export const CHAMPIONSHIP_INVITATION_EVENTS: readonly ChampionshipEvent[] = [
  event('river_below', 'final', 9, ['elite', 'elite', 'elite', 'elite', 'nemesis', 'nemesis', 'nemesis', 'nemesis'], 1, 'invitation', { invitational: true, turnClockSeconds: 45 }),
  event('the_undertow', 'final', 9, ['nemesis', 'nemesis', 'nemesis', 'nemesis', 'nemesis', 'nemesis', 'nemesis', 'nemesis'], 1, 'undertow', { invitational: true, turnClockSeconds: 30 }),
];

/** The first (and, for this slice, only) invitation most players will see. */
export const CHAMPIONSHIP_INVITATIONAL_EVENT: ChampionshipEvent = CHAMPIONSHIP_INVITATION_EVENTS[0]!;

export const CHAMPIONSHIP_ALL_EVENTS: readonly ChampionshipEvent[] = [
  ...CHAMPIONSHIP_EVENTS,
  ...CHAMPIONSHIP_INVITATION_EVENTS,
];

export interface ChampionshipEventProgress {
  eventId: ChampionshipEventId;
  bestPlace: number;
  attempts: number;
  lastPlayedAt: string;
  qualifiedAt: string | null;
}

export interface ChampionshipProgress {
  version: 2;
  events: ChampionshipEventProgress[];
}

export type ChampionshipAchievementId =
  | 'first_run'
  | 'first_qualification'
  | 'full_table'
  | 'five_runs'
  | 'masters_qualifier'
  | 'rivermind_champion'
  | 'below_conqueror'
  | 'undertow_conqueror';

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
  threePlayerRuns: number;
  sixPlayerRuns: number;
  ninePlayerRuns: number;
  totalRuns: number;
}

export interface ChampionshipResult {
  eventId: ChampionshipEventId;
  place: number;
  handsPlayed: number;
  completedAt: string;
}

export interface ChampionshipCheckpoint {
  version: 2;
  eventId: ChampionshipEventId;
  tournament: SitAndGoCheckpoint;
}

export function createEmptyChampionshipProgress(): ChampionshipProgress {
  return { version: CHAMPIONSHIP_VERSION, events: [] };
}

export function championshipEvent(eventId: ChampionshipEventId): ChampionshipEvent {
  const event = CHAMPIONSHIP_ALL_EVENTS.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error(`Unknown Championship event ${eventId}.`);
  return event;
}

export function championshipEventProgress(
  progress: ChampionshipProgress,
  eventId: ChampionshipEventId,
): ChampionshipEventProgress | null {
  return progress.events.find((result) => result.eventId === eventId) ?? null;
}

/** Unlock order inside the main tour is the flat event order above; the
 * invitation chain hangs off the Final. */
export function championshipEventIsUnlocked(
  progress: ChampionshipProgress,
  eventId: ChampionshipEventId,
): boolean {
  const invitationIndex = CHAMPIONSHIP_INVITATION_EVENTS.findIndex((candidate) => candidate.id === eventId);
  if (invitationIndex >= 0) {
    const gate = invitationIndex === 0 ? 'championship_final' : CHAMPIONSHIP_INVITATION_EVENTS[invitationIndex - 1]!.id;
    return Boolean(championshipEventProgress(progress, gate as ChampionshipEventId)?.qualifiedAt);
  }
  const index = CHAMPIONSHIP_EVENTS.findIndex((event) => event.id === eventId);
  if (index < 0) return false;
  if (index === 0) return true;
  const previous = CHAMPIONSHIP_EVENTS[index - 1];
  return previous ? Boolean(championshipEventProgress(progress, previous.id)?.qualifiedAt) : false;
}

export function championshipInvitationIsUnlocked(progress: ChampionshipProgress): boolean {
  return championshipEventIsUnlocked(progress, CHAMPIONSHIP_INVITATIONAL_EVENT.id);
}

export function championshipInvitationIsComplete(progress: ChampionshipProgress): boolean {
  return Boolean(championshipEventProgress(progress, CHAMPIONSHIP_INVITATIONAL_EVENT.id)?.qualifiedAt);
}

/** Winning The River Below reveals The Undertow — the only path. */
export function championshipUndertowIsUnlocked(progress: ChampionshipProgress): boolean {
  return championshipEventIsUnlocked(progress, 'the_undertow');
}

export function championshipOpponentDifficulty(
  event: ChampionshipEvent,
  playerId: string,
): AiDifficulty {
  const opponentNumber = Number(playerId.replace('ai-', ''));
  if (!Number.isInteger(opponentNumber) || opponentNumber < 1) {
    throw new Error(`Championship opponent ${playerId} is invalid.`);
  }
  const difficulty = event.opponentDifficulties[opponentNumber - 1];
  if (!difficulty) throw new Error(`Championship event ${event.id} has no tier for ${playerId}.`);
  return difficulty;
}

export function championshipLineupCounts(
  event: ChampionshipEvent,
): ReadonlyArray<{ difficulty: AiDifficulty; count: number }> {
  const order: readonly AiDifficulty[] = ['friendly', 'club', 'sharp', 'elite', 'nemesis'];
  return order.flatMap((difficulty) => {
    const count = event.opponentDifficulties.filter((candidate) => candidate === difficulty).length;
    return count > 0 ? [{ difficulty, count }] : [];
  });
}

export function championshipQualifiedCount(progress: ChampionshipProgress): number {
  return CHAMPIONSHIP_EVENTS.filter((event) => (
    championshipEventProgress(progress, event.id)?.qualifiedAt
  )).length;
}

export function championshipStats(progress: ChampionshipProgress): ChampionshipStats {
  let bestPlace: number | null = null;
  let threePlayerRuns = 0;
  let sixPlayerRuns = 0;
  let ninePlayerRuns = 0;

  for (const eventProgress of progress.events) {
    const event = championshipEvent(eventProgress.eventId);
    bestPlace = bestPlace === null
      ? eventProgress.bestPlace
      : Math.min(bestPlace, eventProgress.bestPlace);
    if (event.playerCount === 3) threePlayerRuns += eventProgress.attempts;
    else if (event.playerCount === 6) sixPlayerRuns += eventProgress.attempts;
    else ninePlayerRuns += eventProgress.attempts;
  }

  return {
    attemptedEvents: progress.events.length,
    bestPlace,
    qualifiedEvents: championshipQualifiedCount(progress),
    threePlayerRuns,
    sixPlayerRuns,
    ninePlayerRuns,
    totalRuns: threePlayerRuns + sixPlayerRuns + ninePlayerRuns,
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
      // "Full Table" now means the full nine-seat ring (scope 3.11D).
      id: 'full_table',
      title: 'Full Ring',
      description: 'Finish a nine-player Championship run.',
      unlocked: stats.ninePlayerRuns >= 1,
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
      unlocked: qualified('masters_6') || qualified('masters_9'),
    },
    {
      id: 'rivermind_champion',
      title: 'RiverMind Champion',
      description: 'Win the RiverMind Final.',
      unlocked: qualified('championship_final'),
    },
    {
      id: 'below_conqueror',
      title: 'Below Conqueror',
      description: 'Win the secret River Below invitation.',
      unlocked: qualified('river_below'),
    },
    {
      id: 'undertow_conqueror',
      title: 'Undertow Conqueror',
      description: 'Win The Undertow against eight Nemesis opponents.',
      unlocked: qualified('the_undertow'),
    },
  ];
}

export function championshipUnlockedAchievementCount(progress: ChampionshipProgress): number {
  return championshipAchievements(progress).filter((achievement) => achievement.unlocked).length;
}

export function championshipCurrentEvent(progress: ChampionshipProgress): ChampionshipEvent {
  if (
    championshipUndertowIsUnlocked(progress)
    && !championshipEventProgress(progress, 'the_undertow')?.qualifiedAt
  ) return championshipEvent('the_undertow');
  if (
    championshipInvitationIsUnlocked(progress)
    && !championshipInvitationIsComplete(progress)
  ) return CHAMPIONSHIP_INVITATIONAL_EVENT;
  return CHAMPIONSHIP_EVENTS.find((event) => (
    championshipEventIsUnlocked(progress, event.id)
    && !championshipEventProgress(progress, event.id)?.qualifiedAt
  )) ?? CHAMPIONSHIP_EVENTS[CHAMPIONSHIP_EVENTS.length - 1]!;
}

export function championshipIsComplete(progress: ChampionshipProgress): boolean {
  // The tour is complete when the ten main events are qualified; the hidden
  // invitations sit outside the completion count.
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
      CHAMPIONSHIP_ALL_EVENTS.findIndex((eventEntry) => eventEntry.id === left.eventId)
      - CHAMPIONSHIP_ALL_EVENTS.findIndex((eventEntry) => eventEntry.id === right.eventId)
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
    const event = CHAMPIONSHIP_ALL_EVENTS.find((item) => item.id === result.eventId);
    if (!event) return false;
    ids.add(result.eventId);
    if (!Number.isInteger(result.bestPlace) || Number(result.bestPlace) < 1 || Number(result.bestPlace) > event.playerCount) return false;
    if (!Number.isInteger(result.attempts) || Number(result.attempts) < 1) return false;
    if (typeof result.lastPlayedAt !== 'string') return false;
    if (result.qualifiedAt !== null && typeof result.qualifiedAt !== 'string') return false;
    if (result.qualifiedAt !== null && Number(result.bestPlace) > event.qualifyingPlace) return false;
  }
  // The main chain must be qualified in order, and the invitation chain must
  // never precede its gate.
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
  const undertowResult = candidate.events.find((entry) => (
    (entry as Record<string, unknown>).eventId === 'the_undertow'
  ));
  const riverBelowResult = candidate.events.find((entry) => (
    (entry as Record<string, unknown>).eventId === 'river_below'
  )) as Record<string, unknown> | undefined;
  if (undertowResult && typeof riverBelowResult?.qualifiedAt !== 'string') return false;
  const riverBelowGate = candidate.events.find((entry) => (
    (entry as Record<string, unknown>).eventId === 'championship_final'
  )) as Record<string, unknown> | undefined;
  if (riverBelowResult && typeof riverBelowGate?.qualifiedAt !== 'string') return false;
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
  const event = CHAMPIONSHIP_ALL_EVENTS.find((item) => item.id === candidate.eventId);
  if (!event || !isSitAndGoCheckpoint(candidate.tournament)) return false;
  const structureMatches = candidate.tournament.structureId === undefined
    ? !event.invitational
    : candidate.tournament.structureId === event.structureId;
  return structureMatches
    && candidate.tournament.players.length === event.playerCount
    && candidate.tournament.aiDifficulty === event.aiDifficulty;
}
