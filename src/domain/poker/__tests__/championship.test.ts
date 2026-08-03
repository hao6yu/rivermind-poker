import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../multiway';
import { createSitAndGo, createSitAndGoCheckpoint } from '../tournament';
import type { PlayerAction } from '../types';
import { simulateChampionshipTournament } from '../championshipSimulation';
import {
  applyChampionshipResult,
  CHAMPIONSHIP_INVITATIONAL_EVENT,
  CHAMPIONSHIP_EVENTS,
  championshipAchievements,
  championshipCurrentEvent,
  championshipEventIsUnlocked,
  championshipIsComplete,
  championshipInvitationIsComplete,
  championshipInvitationIsUnlocked,
  championshipLineupCounts,
  championshipOpponentDifficulty,
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
    expect(CHAMPIONSHIP_EVENTS.map((event) => event.opponentDifficulties)).toEqual([
      ['friendly', 'club'],
      ['club', 'sharp'],
      ['club', 'club', 'sharp', 'sharp', 'sharp'],
      ['sharp', 'sharp', 'elite', 'elite', 'elite'],
      ['elite', 'elite', 'elite', 'elite', 'elite'],
    ]);
    expect(CHAMPIONSHIP_EVENTS.map((event) => event.structureId)).toEqual([
      'standard', 'standard', 'standard', 'masters', 'final',
    ]);
    expect(CHAMPIONSHIP_INVITATIONAL_EVENT.opponentDifficulties).toEqual([
      'elite', 'elite', 'elite', 'elite', 'nemesis',
    ]);
    expect(CHAMPIONSHIP_INVITATIONAL_EVENT.structureId).toBe('invitation');
    for (const event of [...CHAMPIONSHIP_EVENTS, CHAMPIONSHIP_INVITATIONAL_EVENT]) {
      expect(event.opponentDifficulties).toHaveLength(event.playerCount - 1);
    }
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
    expect(championshipInvitationIsUnlocked(progress)).toBe(true);
    expect(championshipInvitationIsComplete(progress)).toBe(false);
    expect(championshipCurrentEvent(progress).id).toBe('river_below');
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

  it('keeps the invitation hidden until a Final win and outside the five-event count', () => {
    let progress = createEmptyChampionshipProgress();
    expect(championshipInvitationIsUnlocked(progress)).toBe(false);
    expect(() => applyChampionshipResult(progress, {
      eventId: 'river_below',
      place: 1,
      handsPlayed: 20,
      completedAt: '2026-08-01T12:00:00.000Z',
    })).toThrow('locked');

    for (const event of CHAMPIONSHIP_EVENTS) {
      progress = applyChampionshipResult(progress, {
        eventId: event.id,
        place: event.qualifyingPlace,
        handsPlayed: 12,
        completedAt: `2026-08-${String(progress.events.length + 1).padStart(2, '0')}T12:00:00.000Z`,
      });
    }
    progress = applyChampionshipResult(progress, {
      eventId: 'river_below',
      place: 1,
      handsPlayed: 42,
      completedAt: '2026-08-06T12:00:00.000Z',
    });

    expect(championshipQualifiedCount(progress)).toBe(5);
    expect(championshipIsComplete(progress)).toBe(true);
    expect(championshipInvitationIsComplete(progress)).toBe(true);
    expect(isChampionshipProgress(progress)).toBe(true);
    expect(championshipAchievements(progress).at(-1)).toMatchObject({
      id: 'below_conqueror',
      unlocked: true,
    });
  });

  it('maps stable opponent seats to the advertised mixed lineup', () => {
    const masters = CHAMPIONSHIP_EVENTS[3]!;
    expect(['ai-1', 'ai-2', 'ai-3', 'ai-4', 'ai-5'].map((playerId) => (
      championshipOpponentDifficulty(masters, playerId)
    ))).toEqual(['sharp', 'sharp', 'elite', 'elite', 'elite']);
    expect(championshipLineupCounts(masters)).toEqual([
      { difficulty: 'sharp', count: 2 },
      { difficulty: 'elite', count: 3 },
    ]);
    expect(() => championshipOpponentDifficulty(masters, 'hero')).toThrow('invalid');
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
    expect(championshipAchievements(progress).at(-1)).toMatchObject({
      id: 'below_conqueror',
      unlocked: false,
    });
  });

  it('stores only an event id and its matching public tournament checkpoint', () => {
    const hand = finishByFolding(createSitAndGo(seededRandom(31_001), 6));
    const tournament = createSitAndGoCheckpoint(hand, 'club');
    const checkpoint = createChampionshipCheckpoint('national_tour', tournament);

    expect(isChampionshipCheckpoint(checkpoint)).toBe(true);
    expect(JSON.stringify(checkpoint)).not.toMatch(/holeCards|deck|board|history|outcome/);
    expect(isChampionshipCheckpoint({ ...checkpoint, eventId: 'local_tables' })).toBe(false);

    const finalHand = finishByFolding(createSitAndGo(seededRandom(31_002), 6, 'final'));
    const finalTournament = createSitAndGoCheckpoint(finalHand, 'sharp', 'final');
    expect(isChampionshipCheckpoint(createChampionshipCheckpoint('championship_final', finalTournament))).toBe(true);
    expect(isChampionshipCheckpoint({
      version: 1,
      eventId: 'championship_final',
      tournament: { ...finalTournament, structureId: 'masters' },
    })).toBe(false);
  });

  it('finishes deterministic mixed Final and invitation tournaments through production decisions', () => {
    const finalEvent = CHAMPIONSHIP_EVENTS[4]!;
    const final = simulateChampionshipTournament(finalEvent, {
      samplesPerDecision: 8,
      seed: 810_001,
    });
    const replay = simulateChampionshipTournament(finalEvent, {
      samplesPerDecision: 8,
      seed: 810_001,
    });
    const invitation = simulateChampionshipTournament(CHAMPIONSHIP_INVITATIONAL_EVENT, {
      samplesPerDecision: 8,
      seed: 820_001,
    });

    expect(replay).toEqual(final);
    expect(final.place).toBeGreaterThanOrEqual(1);
    expect(final.place).toBeLessThanOrEqual(6);
    expect(final.decisionsByDifficulty.elite).toBeGreaterThan(0);
    expect(final.decisionsByDifficulty.nemesis).toBe(0);
    expect(invitation.place).toBeGreaterThanOrEqual(1);
    expect(invitation.place).toBeLessThanOrEqual(6);
    expect(invitation.decisionsByDifficulty.elite).toBeGreaterThan(0);
    expect(invitation.decisionsByDifficulty.nemesis).toBeGreaterThan(0);
  }, 20_000);
});
