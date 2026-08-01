import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../multiway';
import { createSitAndGo, createSitAndGoCheckpoint } from '../tournament';
import type { PlayerAction } from '../types';
import {
  applyChampionshipResult,
  CHAMPIONSHIP_EVENTS,
  championshipCurrentEvent,
  championshipEventIsUnlocked,
  championshipIsComplete,
  championshipQualifiedCount,
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

  it('stores only an event id and its matching public tournament checkpoint', () => {
    const hand = finishByFolding(createSitAndGo(seededRandom(31_001), 6));
    const tournament = createSitAndGoCheckpoint(hand, 'club');
    const checkpoint = createChampionshipCheckpoint('national_tour', tournament);

    expect(isChampionshipCheckpoint(checkpoint)).toBe(true);
    expect(JSON.stringify(checkpoint)).not.toMatch(/holeCards|deck|board|history|outcome/);
    expect(isChampionshipCheckpoint({ ...checkpoint, eventId: 'local_tables' })).toBe(false);
  });
});
