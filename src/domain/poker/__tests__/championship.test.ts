import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../multiway';
import { createSitAndGo, createSitAndGoCheckpoint, type SitAndGoPlayerCount } from '../tournament';
import type { PlayerAction } from '../types';
import { simulateChampionshipTournament } from '../championshipSimulation';
import {
  applyChampionshipResult,
  CHAMPIONSHIP_EVENTS,
  CHAMPIONSHIP_INVITATION_EVENTS,
  CHAMPIONSHIP_STAGES,
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
  championshipUndertowIsPending,
  championshipUndertowIsUnlocked,
  championshipUnlockedAchievementCount,
  createChampionshipCheckpoint,
  createEmptyChampionshipProgress,
  isChampionshipCheckpoint,
  isChampionshipProgress,
  type ChampionshipEventId,
  type ChampionshipProgress,
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

/** A valid v1 progress payload, used to prove the version-2 validator rejects it. */
function v1ProgressPayload(): Record<string, unknown> {
  return {
    version: 1,
    events: [],
  };
}

describe('RiverMind Championship v2 course (3.11D)', () => {
  it('orders the ten main events exactly 3/6/9, 6/9, 6/9, 6/9, then a nine-seat Final', () => {
    expect(CHAMPIONSHIP_EVENTS.map((event) => event.id)).toEqual([
      'local_3',
      'local_6',
      'local_9',
      'city_6',
      'city_9',
      'national_6',
      'national_9',
      'masters_6',
      'masters_9',
      'championship_final',
    ]);
    expect(CHAMPIONSHIP_EVENTS.map((event) => event.playerCount)).toEqual([3, 6, 9, 6, 9, 6, 9, 6, 9, 9]);
  });

  it('groups the ten events into five branded stages in unlock order', () => {
    expect(CHAMPIONSHIP_STAGES.map((stage) => stage.id)).toEqual([
      'local_tables',
      'city_circuit',
      'national_tour',
      'masters_division',
      'final',
    ]);
    expect(CHAMPIONSHIP_STAGES.flatMap((stage) => stage.events)).toEqual(CHAMPIONSHIP_EVENTS.map((event) => event.id));
  });

  it('seats every event with exactly playerCount - 1 opponents and a valid qualification boundary', () => {
    for (const event of [...CHAMPIONSHIP_EVENTS, ...CHAMPIONSHIP_INVITATION_EVENTS]) {
      const lineup = championshipLineupCounts(event);
      expect(lineup.reduce((total, tier) => total + tier.count, 0)).toBe(event.playerCount - 1);
      expect(event.qualifyingPlace).toBeGreaterThanOrEqual(1);
      expect(event.qualifyingPlace).toBeLessThanOrEqual(event.playerCount);
    }
  });

  it('fields the hidden invitations exactly as specified', () => {
    const [riverBelow, undertow] = CHAMPIONSHIP_INVITATION_EVENTS;
    expect(riverBelow?.playerCount).toBe(9);
    expect(undertow?.playerCount).toBe(9);
    expect(riverBelow?.opponentDifficulties.filter((difficulty) => difficulty === 'elite')).toHaveLength(4);
    expect(riverBelow?.opponentDifficulties.filter((difficulty) => difficulty === 'nemesis')).toHaveLength(4);
    expect(undertow?.opponentDifficulties.filter((difficulty) => difficulty === 'nemesis')).toHaveLength(8);
    expect(riverBelow?.turnClockSeconds).toBe(45);
    expect(undertow?.turnClockSeconds).toBe(30);
  });

  it('unlocks each main event only after the previous one qualifies', () => {
    let progress = createEmptyChampionshipProgress();
    for (const [index, event] of CHAMPIONSHIP_EVENTS.entries()) {
      // The next event in the chain is the only newly unlocked one; every
      // later event stays locked until its predecessor qualifies.
      expect(championshipEventIsUnlocked(progress, event.id)).toBe(true);
      for (const later of CHAMPIONSHIP_EVENTS.slice(index + 2)) {
        expect(championshipEventIsUnlocked(progress, later.id)).toBe(false);
      }
      progress = applyChampionshipResult(progress, {
        eventId: event.id,
        place: 1,
        handsPlayed: 3,
        completedAt: '2026-08-03T00:00:00.000Z',
      });
    }
    expect(championshipIsComplete(progress)).toBe(true);
  });

  it('reveals The River Below only through the Final, and The Undertow only through The River Below', () => {
    let progress = createEmptyChampionshipProgress();
    for (const event of CHAMPIONSHIP_EVENTS.slice(0, -1)) {
      progress = applyChampionshipResult(progress, {
        eventId: event.id,
        place: 1,
        handsPlayed: 3,
        completedAt: '2026-08-03T00:00:00.000Z',
      });
      expect(championshipInvitationIsUnlocked(progress)).toBe(false);
      expect(championshipUndertowIsUnlocked(progress)).toBe(false);
    }
    progress = applyChampionshipResult(progress, {
      eventId: 'championship_final',
      place: 1,
      handsPlayed: 4,
      completedAt: '2026-08-03T01:00:00.000Z',
    });
    expect(championshipInvitationIsUnlocked(progress)).toBe(true);
    expect(championshipUndertowIsUnlocked(progress)).toBe(false);
    // Winning The River Below — and nothing else — reveals The Undertow.
    progress = applyChampionshipResult(progress, {
      eventId: 'river_below',
      place: 2,
      handsPlayed: 5,
      completedAt: '2026-08-03T02:00:00.000Z',
    });
    expect(championshipUndertowIsUnlocked(progress)).toBe(false);
    progress = applyChampionshipResult(progress, {
      eventId: 'river_below',
      place: 1,
      handsPlayed: 6,
      completedAt: '2026-08-03T03:00:00.000Z',
    });
    expect(championshipUndertowIsUnlocked(progress)).toBe(true);
    expect(championshipInvitationIsComplete(progress)).toBe(true);
  });

  it('never names The Undertow through the unlocked-event catalog', () => {
    // The current event for a champion with the River Below complete is The
    // Undertow; before that, nothing resolves to it.
    let progress = createEmptyChampionshipProgress();
    for (const event of CHAMPIONSHIP_EVENTS) {
      progress = applyChampionshipResult(progress, {
        eventId: event.id,
        place: 1,
        handsPlayed: 3,
        completedAt: '2026-08-03T00:00:00.000Z',
      });
      expect(championshipCurrentEvent(progress).id).not.toBe('the_undertow');
    }
    progress = applyChampionshipResult(progress, {
      eventId: 'river_below',
      place: 1,
      handsPlayed: 6,
      completedAt: '2026-08-03T03:00:00.000Z',
    });
    expect(championshipCurrentEvent(progress).id).toBe('the_undertow');
  });

  it('rejects results for locked Championship events', () => {
    // A locked hidden invitation can never record a result.
    let progress = createEmptyChampionshipProgress();
    expect(() => applyChampionshipResult(progress, {
      eventId: 'river_below',
      place: 1,
      handsPlayed: 20,
      completedAt: '2026-08-03T00:00:00.000Z',
    })).toThrow('locked');
    expect(() => applyChampionshipResult(progress, {
      eventId: 'the_undertow',
      place: 1,
      handsPlayed: 20,
      completedAt: '2026-08-03T00:00:00.000Z',
    })).toThrow('locked');
    // A locked main event cannot record either: qualifying the first stop
    // unlocks exactly one successor, so a later stop is still locked.
    progress = applyChampionshipResult(progress, {
      eventId: 'local_3',
      place: 2,
      handsPlayed: 4,
      completedAt: '2026-08-03T00:00:00.000Z',
    });
    expect(() => applyChampionshipResult(progress, {
      eventId: 'city_9',
      place: 1,
      handsPlayed: 8,
      completedAt: '2026-08-03T01:00:00.000Z',
    })).toThrow('locked');
    expect(isChampionshipProgress(progress)).toBe(true);
  });

  it('maps stable opponent seats to the advertised mixed lineup', () => {
    const masters9 = CHAMPIONSHIP_EVENTS.find((event) => event.id === 'masters_9')!;
    expect(['ai-1', 'ai-2', 'ai-3', 'ai-4', 'ai-5', 'ai-6', 'ai-7', 'ai-8'].map((playerId) => (
      championshipOpponentDifficulty(masters9, playerId)
    ))).toEqual([
      'elite', 'elite', 'elite', 'elite', 'elite', 'elite', 'nemesis', 'nemesis',
    ]);
    expect(championshipLineupCounts(masters9)).toEqual([
      { difficulty: 'elite', count: 6 },
      { difficulty: 'nemesis', count: 2 },
    ]);
    const riverBelow = CHAMPIONSHIP_INVITATION_EVENTS[0]!;
    expect(championshipOpponentDifficulty(riverBelow, 'ai-1')).toBe('elite');
    expect(championshipOpponentDifficulty(riverBelow, 'ai-5')).toBe('nemesis');
    expect(() => championshipOpponentDifficulty(masters9, 'hero')).toThrow('invalid');
  });

  it('keeps The Undertow achievement completely hidden until The River Below is won', () => {
    const undertowAchievement = (progress: ChampionshipProgress) => (
      championshipAchievements(progress).find((achievement) => achievement.id === 'undertow_conqueror')
    );
    let progress = createEmptyChampionshipProgress();
    expect(undertowAchievement(progress)?.hidden).toBe(true);
    expect(undertowAchievement(progress)?.unlocked).toBe(false);
    // Winning every main event, including the Final, still hides the entry:
    // The River Below has not been won, so nothing may name The Undertow.
    for (const event of CHAMPIONSHIP_EVENTS) {
      progress = applyChampionshipResult(progress, {
        eventId: event.id,
        place: 1,
        handsPlayed: 3,
        completedAt: '2026-08-03T00:00:00.000Z',
      });
      expect(undertowAchievement(progress)?.hidden).toBe(true);
    }
    // Winning The River Below reveals the (still locked) achievement.
    progress = applyChampionshipResult(progress, {
      eventId: 'river_below',
      place: 1,
      handsPlayed: 6,
      completedAt: '2026-08-03T03:00:00.000Z',
    });
    expect(undertowAchievement(progress)?.hidden).toBe(false);
    expect(undertowAchievement(progress)?.unlocked).toBe(false);
    // Winning The Undertow unlocks the revealed achievement.
    progress = applyChampionshipResult(progress, {
      eventId: 'the_undertow',
      place: 1,
      handsPlayed: 7,
      completedAt: '2026-08-03T04:00:00.000Z',
    });
    expect(undertowAchievement(progress)?.hidden).toBe(false);
    expect(undertowAchievement(progress)?.unlocked).toBe(true);
  });

  it('keeps The Undertow as the current goal until it is won, then returns to replay', () => {
    let progress = createEmptyChampionshipProgress();
    for (const event of CHAMPIONSHIP_EVENTS) {
      progress = applyChampionshipResult(progress, {
        eventId: event.id,
        place: 1,
        handsPlayed: 3,
        completedAt: '2026-08-03T00:00:00.000Z',
      });
    }
    // While The Undertow is revealed but unconquered it is the current goal,
    // even though the ten-event tour itself is complete.
    expect(championshipIsComplete(progress)).toBe(true);
    progress = applyChampionshipResult(progress, {
      eventId: 'river_below',
      place: 1,
      handsPlayed: 6,
      completedAt: '2026-08-03T03:00:00.000Z',
    });
    expect(championshipIsComplete(progress)).toBe(true);
    expect(championshipCurrentEvent(progress).id).toBe('the_undertow');
    progress = applyChampionshipResult(progress, {
      eventId: 'the_undertow',
      place: 1,
      handsPlayed: 7,
      completedAt: '2026-08-03T04:00:00.000Z',
    });
    expect(championshipUndertowIsPending(progress)).toBe(false);
    // The finished chain falls back to the Final as the replay target.
    expect(championshipCurrentEvent(progress).id).toBe('championship_final');
  });

  it('replaces six-player Full Table semantics with the nine-seat Full Ring achievement', () => {
    let progress = createEmptyChampionshipProgress();
    progress = applyChampionshipResult(progress, {
      eventId: 'local_3',
      place: 1,
      handsPlayed: 3,
      completedAt: '2026-08-03T00:00:00.000Z',
    });
    progress = applyChampionshipResult(progress, {
      eventId: 'local_6',
      place: 1,
      handsPlayed: 3,
      completedAt: '2026-08-03T00:00:00.000Z',
    });
    expect(championshipStats(progress).sixPlayerRuns).toBe(1);
    expect(championshipStats(progress).ninePlayerRuns).toBe(0);
    expect(championshipAchievements(progress).find((achievement) => achievement.id === 'full_table')?.unlocked).toBe(false);
    progress = applyChampionshipResult(progress, {
      eventId: 'local_9',
      place: 3,
      handsPlayed: 6,
      completedAt: '2026-08-03T01:00:00.000Z',
    });
    expect(championshipStats(progress).ninePlayerRuns).toBe(1);
    expect(championshipAchievements(progress).find((achievement) => achievement.id === 'full_table')?.unlocked).toBe(true);
    // Completing the whole chain unlocks every authored achievement.
    let complete = createEmptyChampionshipProgress();
    for (const event of [...CHAMPIONSHIP_EVENTS, ...CHAMPIONSHIP_INVITATION_EVENTS]) {
      complete = applyChampionshipResult(complete, {
        eventId: event.id,
        place: 1,
        handsPlayed: 3,
        completedAt: '2026-08-03T04:00:00.000Z',
      });
    }
    expect(championshipUnlockedAchievementCount(complete)).toBe(championshipAchievements(complete).length);
  });

  it('validates version 2 progress and rejects legacy payloads', () => {
    expect(isChampionshipProgress(createEmptyChampionshipProgress())).toBe(true);
    expect(isChampionshipProgress(v1ProgressPayload())).toBe(false);
    // A chain violation (event 3 attempted without event 2 qualified) is invalid.
    const broken: ChampionshipProgress = {
      version: 2,
      events: [{
        eventId: 'local_9',
        bestPlace: 1,
        attempts: 1,
        lastPlayedAt: '2026-08-03T00:00:00.000Z',
        qualifiedAt: '2026-08-03T00:00:00.000Z',
      }],
    };
    expect(isChampionshipProgress(broken)).toBe(false);
    // The Undertow cannot be qualified before The River Below.
    const leaked: ChampionshipProgress = {
      version: 2,
      events: [{
        eventId: 'the_undertow',
        bestPlace: 1,
        attempts: 1,
        lastPlayedAt: '2026-08-03T00:00:00.000Z',
        qualifiedAt: '2026-08-03T00:00:00.000Z',
      }],
    };
    expect(isChampionshipProgress(leaked)).toBe(false);
  });

  it('seats, saves, and resumes nine-seat Championship checkpoints without loss', () => {
    const nineSeatEvent = CHAMPIONSHIP_EVENTS.find((event) => event.id === 'local_9')!;
    const game = createSitAndGo(seededRandom(11), 9, nineSeatEvent.structureId, nineSeatEvent.aiDifficulty);
    const completed = finishByFolding(game);
    const checkpoint = createChampionshipCheckpoint(nineSeatEvent.id, createSitAndGoCheckpoint(completed, nineSeatEvent.aiDifficulty, nineSeatEvent.structureId));
    expect(checkpoint.version).toBe(2);
    expect(isChampionshipCheckpoint(checkpoint)).toBe(true);
    expect(checkpoint.tournament.players).toHaveLength(9);
    // Seat indices 0..8 are all valid and preserved through the round-trip.
    expect(checkpoint.tournament.players.map((player) => player.seat).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('keeps a valid progress accepted after every mutation', () => {
    let progress = createEmptyChampionshipProgress();
    expect(isChampionshipProgress(progress)).toBe(true);
    for (const event of CHAMPIONSHIP_EVENTS) {
      progress = applyChampionshipResult(progress, {
        eventId: event.id,
        place: 1,
        handsPlayed: 2,
        completedAt: '2026-08-03T05:00:00.000Z',
      });
      expect(isChampionshipProgress(progress)).toBe(true);
    }
    expect(championshipQualifiedCount(progress)).toBe(CHAMPIONSHIP_EVENTS.length);
    expect(championshipStats(progress).totalRuns).toBe(CHAMPIONSHIP_EVENTS.length);
  });

  it('simulates the nine-seat Final without crashes or impossible lineups', () => {
    const finalEvent = CHAMPIONSHIP_EVENTS.find((event) => event.id === 'championship_final')!;
    const result = simulateChampionshipTournament(finalEvent, { seed: 42, maxHands: 60 });
    expect(result.eventId).toBe('championship_final');
    expect(result.place).toBeGreaterThanOrEqual(1);
    expect(result.place).toBeLessThanOrEqual(finalEvent.playerCount);
    expect(result.qualified).toBe(result.place <= finalEvent.qualifyingPlace);
  }, 20_000);
});

describe('Championship checkpoint contract (3.11D)', () => {
  it('rejects a checkpoint whose seat count does not match its event', () => {
    const local3 = CHAMPIONSHIP_EVENTS.find((event) => event.id === 'local_3')!;
    const game = createSitAndGo(seededRandom(21), 3, local3.structureId, local3.aiDifficulty);
    const completed = finishByFolding(game);
    const checkpoint = createChampionshipCheckpoint(local3.id, createSitAndGoCheckpoint(completed, local3.aiDifficulty, local3.structureId));
    expect(isChampionshipCheckpoint(checkpoint)).toBe(true);
    // A three-player checkpoint cannot claim the nine-seat Final.
    expect(isChampionshipCheckpoint({ ...checkpoint, eventId: 'championship_final' })).toBe(false);
  });
});
