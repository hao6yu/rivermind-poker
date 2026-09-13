import { describe, expect, it } from 'vitest';

import {
  CHAMPIONSHIP_EVENTS,
  championshipEvent,
  createEmptyChampionshipProgress,
  type ChampionshipProgress,
} from '../../domain/poker/championship';
import { buildChampionshipOutcomeMoment } from './championshipVictory';

function qualifiedProgress(count: number): ChampionshipProgress {
  return {
    events: CHAMPIONSHIP_EVENTS.slice(0, count).map((event) => ({
      eventId: event.id,
      bestPlace: 1,
      attempts: 1,
      qualifiedAt: '2026-09-10',
      lastPlayedAt: '2026-09-10',
    })),
    version: 2,
  };
}

describe('championship outcome moment (B3)', () => {
  it('marks a stop victory and reveals the next unlocked destination', () => {
    const before = qualifiedProgress(1); // local_3 qualified
    const after = qualifiedProgress(2); // city_6 now qualified → next stop unlocked
    const moment = buildChampionshipOutcomeMoment({
      event: championshipEvent('city_6'),
      place: 1,
      progressAfter: after,
      progressBefore: before,
    });
    expect(moment.kind).toBe('victory');
    expect(moment.titleKey).toBe('championship.moment.victoryTitle');
    expect(moment.unlockedEventId).toBe('local_9');
    // No NEW achievement tier between these two runs — the reward line stays
    // quiet rather than re-granting an earned title.
    expect(moment.rewardAchievement).toBeNull();
  });

  it('marks a qualification without a victory and keeps the tour-open detail', () => {
    const before = createEmptyChampionshipProgress();
    const after = qualifiedProgress(1);
    const moment = buildChampionshipOutcomeMoment({
      event: championshipEvent('local_3'),
      place: 2,
      progressAfter: after,
      progressBefore: before,
    });
    expect(moment.kind).toBe('qualification');
    expect(moment.detailKey).toBe('championship.moment.qualifiedDetail');
    expect(moment.unlockedEventId).toBe('local_6');
  });

  it('grants the newest earned cosmetic title from existing progress', () => {
    const moment = buildChampionshipOutcomeMoment({
      event: championshipEvent('local_3'),
      place: 1,
      progressAfter: qualifiedProgress(1),
      progressBefore: createEmptyChampionshipProgress(),
    });
    // First Shuffle (first run) and On the Road (first qualification) unlock
    // together; the moment surfaces the newest earned ACHIEVEMENT — the view
    // resolves its localized, hidden-aware display copy.
    expect(moment.rewardAchievement?.id).toBe('first_qualification');
    expect(moment.rewardAchievement?.title).toBe('On the Road');
  });

  it('marks an elimination without unlocking anything', () => {
    const progress = createEmptyChampionshipProgress();
    const moment = buildChampionshipOutcomeMoment({
      event: championshipEvent('local_3'),
      place: 7,
      progressAfter: progress,
      progressBefore: progress,
    });
    expect(moment.kind).toBe('elimination');
    expect(moment.detailKey).toBe('championship.moment.eliminatedDetail');
    expect(moment.unlockedEventId).toBeNull();
    expect(moment.rewardAchievement).toBeNull();
  });

  it('names a hidden invitation only after its own unlock gate opens', () => {
    // Winning the Final reveals The River Below — the only path.
    const before = qualifiedProgress(9);
    const after = qualifiedProgress(10);
    const moment = buildChampionshipOutcomeMoment({
      event: championshipEvent('championship_final'),
      place: 1,
      progressAfter: after,
      progressBefore: before,
    });
    expect(moment.kind).toBe('victory');
    expect(moment.unlockedEventId).toBe('river_below');
    expect(moment.detailKey).toBe('championship.moment.tourCompleteDetail');
    expect(moment.rewardAchievement?.id).toBe('rivermind_champion');
  });
});
