import { describe, expect, it } from 'vitest';

import {
  applyChampionshipResult,
  championshipEvent,
  createEmptyChampionshipProgress,
  type ChampionshipProgress,
} from '../../domain/poker/championship';
import { resolveNextChampionshipEvent } from './championshipRunNavigation';

/**
 * AppShell's Next-event preselection (B1/P1 review fix): the map opens on the
 * first LATER event that is unlocked and not yet qualified. Extracted from
 * AppShell so the shell navigation order — core events, then invitational
 * unlocks — is testable without mounting the shell.
 */

function progressAfter(eventId: Parameters<typeof applyChampionshipResult>[1]['eventId'], place: number): ChampionshipProgress {
  return applyChampionshipResult(createEmptyChampionshipProgress(), { eventId, place, handsPlayed: 3, completedAt: '2026-09-10T00:00:00.000Z' });
}

/** Wins every event up to and including `eventId`, in shipped order. */
function progressWinningThrough(eventId: Parameters<typeof applyChampionshipResult>[1]['eventId']): ChampionshipProgress {
  const order = [
    'local_3', 'local_6', 'local_9',
    'city_6', 'city_9',
    'national_6', 'national_9',
    'masters_6', 'masters_9',
    'championship_final',
    'river_below',
    'the_undertow',
  ] as const;
  let progress = createEmptyChampionshipProgress();
  for (const id of order) {
    progress = applyChampionshipResult(progress, { eventId: id, place: 1, handsPlayed: 3, completedAt: '2026-09-10T00:00:00.000Z' });
    if (id === eventId) return progress;
  }
  throw new Error(`Unknown stop ${eventId}`);
}

describe('next Championship event resolution', () => {
  it('preselects the next unlocked, unqualified event after a qualification', () => {
    // Winning local_3 unlocks local_6; the map should open there.
    const progress = progressAfter('local_3', 1);
    expect(resolveNextChampionshipEvent(progress, 'local_3')?.id).toBe('local_6');
  });

  it('skips already-qualified events', () => {
    const progress = progressAfter('local_3', 1);
    // local_6 also qualified: the next stop is local_9 (newly unlocked).
    const after = applyChampionshipResult(progress, { eventId: 'local_6', place: 1, handsPlayed: 3, completedAt: '2026-09-10T00:00:00.000Z' });
    expect(resolveNextChampionshipEvent(after, 'local_6')?.id).toBe('local_9');
  });

  it('opens the first invitational event after the Final and the second after a win', () => {
    const finalWon = progressWinningThrough('championship_final');
    expect(resolveNextChampionshipEvent(finalWon, 'championship_final')?.id).toBe('river_below');
    const riverWon = applyChampionshipResult(finalWon, { eventId: 'river_below', place: 1, handsPlayed: 5, completedAt: '2026-09-10T00:00:00.000Z' });
    expect(resolveNextChampionshipEvent(riverWon, 'river_below')?.id).toBe('the_undertow');
  });

  it('resolves nothing when the completed event is unknown or last', () => {
    const undertowWon = progressWinningThrough('the_undertow');
    expect(resolveNextChampionshipEvent(undertowWon, 'the_undertow')).toBeNull();
    expect(resolveNextChampionshipEvent(createEmptyChampionshipProgress(), 'not_an_event' as never)).toBeNull();
  });

  it('stays consistent with the shipped event order (core, then invitations)', () => {
    const progress = progressWinningThrough('local_9');
    const next = resolveNextChampionshipEvent(progress, 'local_9');
    expect(next?.id).toBe('city_6');
    expect(championshipEvent('city_6').stage).toBe('city_circuit');
  });
});
