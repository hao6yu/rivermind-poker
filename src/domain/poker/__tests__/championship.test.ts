import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../multiway';
import { createSitAndGo, createSitAndGoCheckpoint } from '../tournament';
import type { PlayerAction } from '../types';
import {
  applyChampionshipResult,
  CHAMPIONSHIP_EVENTS,
  championshipAchievements,
  championshipCurrentEvent,
  championshipEventIsUnlocked,
  championshipIsComplete,
  championshipQualifiedCount,
  championshipStats,
  championshipUnlockedAchievementCount,
  createChampionshipCheckpoint,
  createEmptyChampionshipProgress,
  isChampionshipCheckpoint,
  isChampionshipProgress,
} from '../championship';

function finishByFolding(state: MultiwayHandState): MultiwayHandState {
  let current = state;
  for (let guard = 0; !current.outcome && guard < 12; guard += 1) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('Championship hand has no player to act.');
    const legal = getMultiwayLegalActions(current, playerId);
    const action: PlayerAction = legal.canFold
      ? { type: 'fold' }
      : legal.canCheck
        ? { type: 'check' }
        : { type: 'call' };
    current = applyMultiwayAction(current, playerId, action);
  }
  if (!current.outcome) throw new Error('Championship test hand did not finish.');
  return current;
}

describe('RiverMind Championship', () => {
  it('defines a five-event journey that grows from three to six players', () => {
    expect(CHAMPIONSHIP_EVENTS.map((event) => event.title)).toEqual([
      'Local Tables',
      'City Circuit',
      'National Tour',
      'Masters Division',
      'RiverMind Final',
    ]);
    expect(CHAMPIONSHIP_EVENTS.map((event) => event.playerCount)).toEqual([3, 3, 6, 6, 6]);
    expect(CHAMPIONSHIP_EVENTS.map((event) => event.aiDifficulty)).toEqual([
      'friendly',
      'club',
      'club',
      'sharp',
      'sharp',
    ]);
  });

  it('unlocks one event at a time and keeps a failed attempt replayable', () => {
    let progress = createEmptyChampionshipProgress();
    expect(championshipCurrentEvent(progress).id).toBe('local_tables');
    expect(championshipEventIsUnlocked(progress, 'city_circuit')).toBe(false);

    progress = applyChampionshipResult(progress, {
      eventId: 'local_tables',
      place: 3,
      handsPlayed: 4,
      completedAt: '2026-08-01T10:00:00.000Z',
    });
    expect(progress.events[0]).toMatchObject({ bestPlace: 3, attempts: 1, qualifiedAt: null });
    expect(championshipCurrentEvent(progress).id).toBe('local_tables');

    progress = applyChampionshipResult(progress, {
      eventId: 'local_tables',
      place: 2,
      handsPlayed: 7,
      completedAt: '2026-08-01T11:00:00.000Z',
    });
    expect(progress.events[0]).toMatchObject({ bestPlace: 2, attempts: 2 });
    expect(progress.events[0]?.qualifiedAt).toBe('2026-08-01T11:00:00.000Z');
    expect(championshipCurrentEvent(progress).id).toBe('city_circuit');
    expect(championshipEventIsUnlocked(progress, 'city_circuit')).toBe(true);
  });

  it('completes only after qualifying through the final', () => {
    let progress = createEmptyChampionshipProgress();
    for (const event of CHAMPIONSHIP_EVENTS) {
      progress = applyChampionshipResult(progress, {
        eventId: event.id,
        place: event.qualifyingPlace,
        handsPlayed: 5,
        completedAt: `2026-08-0${championshipQualifiedCount(progress) + 1}T12:00:00.000Z`,
      });
    }
    expect(championshipQualifiedCount(progress)).toBe(5);
    expect(championshipIsComplete(progress)).toBe(true);
    expect(isChampionshipProgress(progress)).toBe(true);
    expect(isChampionshipProgress({
      version: 1,
      events: [{
        eventId: 'city_circuit',
        bestPlace: 2,
        attempts: 1,
        lastPlayedAt: '2026-08-01T12:00:00.000Z',
        qualifiedAt: '2026-08-01T12:00:00.000Z',
      }],
    })).toBe(false);
  });

  it('derives an honest run record without storing duplicate statistics', () => {
    let progress = createEmptyChampionshipProgress();
    progress = applyChampionshipResult(progress, {
      eventId: 'local_tables',
      place: 3,
      handsPlayed: 3,
      completedAt: '2026-08-01T10:00:00.000Z',
    });
    progress = applyChampionshipResult(progress, {
      eventId: 'local_tables',
      place: 2,
      handsPlayed: 5,
      completedAt: '2026-08-01T11:00:00.000Z',
    });
    progress = applyChampionshipResult(progress, {
      eventId: 'city_circuit',
      place: 2,
      handsPlayed: 6,
      completedAt: '2026-08-01T12:00:00.000Z',
    });
    progress = applyChampionshipResult(progress, {
      eventId: 'national_tour',
      place: 5,
      handsPlayed: 4,
      completedAt: '2026-08-01T13:00:00.000Z',
    });

    expect(championshipStats(progress)).toEqual({
      attemptedEvents: 3,
      bestPlace: 2,
      qualifiedEvents: 2,
      sixPlayerRuns: 1,
      threePlayerRuns: 3,
      totalRuns: 4,
    });
    expect(championshipAchievements(progress).filter((achievement) => achievement.unlocked).map((achievement) => achievement.id)).toEqual([
      'first_run',
      'first_qualification',
      'full_table',
    ]);
  });

  it('unlocks persistence and completion achievements at their exact milestones', () => {
    let progress = createEmptyChampionshipProgress();
    progress = applyChampionshipResult(progress, {
      eventId: 'local_tables',
      place: 3,
      handsPlayed: 2,
      completedAt: '2026-08-01T09:00:00.000Z',
    });
    for (const [index, event] of CHAMPIONSHIP_EVENTS.entries()) {
      progress = applyChampionshipResult(progress, {
        eventId: event.id,
        place: event.qualifyingPlace,
        handsPlayed: 4,
        completedAt: `2026-08-0${index + 1}T14:00:00.000Z`,
      });
    }

    expect(championshipStats(progress).totalRuns).toBe(6);
    expect(championshipUnlockedAchievementCount(progress)).toBe(6);
    expect(championshipAchievements(progress).every((achievement) => achievement.unlocked)).toBe(true);
  });

  it('stores only an event id and its matching public tournament checkpoint', () => {
    const hand = finishByFolding(createSitAndGo(seededRandom(31_001), 6));
    const tournament = createSitAndGoCheckpoint(hand, 'club');
    const checkpoint = createChampionshipCheckpoint('national_tour', tournament);

    expect(isChampionshipCheckpoint(checkpoint)).toBe(true);
    expect(JSON.stringify(checkpoint)).not.toMatch(/holeCards|deck|board|history|outcome/);
    expect(isChampionshipCheckpoint({ ...checkpoint, eventId: 'local_tables' })).toBe(false);
  });
});
