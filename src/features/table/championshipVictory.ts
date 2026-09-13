import {
  CHAMPIONSHIP_EVENTS,
  CHAMPIONSHIP_INVITATION_EVENTS,
  championshipAchievements,
  championshipEventIsUnlocked,
  championshipQualifies,
  type ChampionshipAchievement,
  type ChampionshipEvent,
  type ChampionshipEventId,
  type ChampionshipProgress,
} from '../../domain/poker/championship';
import type { MessageKey } from '../../localization';

/**
 * B3: the end-of-run Championship moment. One model drives the distinct
 * presentation for victories, qualifications and eliminations, names the newly
 * unlocked destination by id (a hidden event is named only once its unlock
 * gate has actually opened — the view resolves the localized title), and
 * grants the cosmetic title earned from EXISTING progress — earned
 * achievements, never a tour reset.
 */

export type ChampionshipOutcomeKind = 'victory' | 'qualification' | 'elimination';

export interface ChampionshipOutcomeMoment {
  detailKey: MessageKey;
  eyebrowKey: MessageKey;
  kind: ChampionshipOutcomeKind;
  /**
   * Newest achievement earned with this result, from existing progress. The
   * model carries the ACHIEVEMENT, not its authored English title: the view
   * resolves localized copy through `championshipAchievementDisplay`, so the
   * reward card reads in the viewer's language (and stays hidden-aware).
   */
  rewardAchievement: ChampionshipAchievement | null;
  titleKey: MessageKey;
  /** First event whose unlock gate opened with this result, if any. */
  unlockedEventId: ChampionshipEventId | null;
}

function newlyUnlockedEvent(before: ChampionshipProgress, after: ChampionshipProgress): ChampionshipEventId | null {
  for (const event of [...CHAMPIONSHIP_EVENTS, ...CHAMPIONSHIP_INVITATION_EVENTS]) {
    if (championshipEventIsUnlocked(after, event.id)
      && !championshipEventIsUnlocked(before, event.id)) {
      return event.id;
    }
  }
  return null;
}

function newestEarnedAchievement(
  before: ChampionshipProgress,
  after: ChampionshipProgress,
): ChampionshipAchievement | null {
  const unlockedTitles = (progress: ChampionshipProgress): ChampionshipAchievement[] =>
    championshipAchievements(progress).filter((achievement) => achievement.unlocked && !achievement.hidden);
  const earnedBefore = new Set(unlockedTitles(before).map((achievement) => achievement.id));
  const fresh = unlockedTitles(after).filter((achievement) => !earnedBefore.has(achievement.id));
  return fresh.at(-1) ?? null;
}

export function buildChampionshipOutcomeMoment(input: {
  event: ChampionshipEvent;
  place: number;
  progressBefore: ChampionshipProgress;
  progressAfter: ChampionshipProgress;
}): ChampionshipOutcomeMoment {
  const { event, place, progressAfter, progressBefore } = input;
  const kind: ChampionshipOutcomeKind = place === 1
    ? 'victory'
    : championshipQualifies(event, place) ? 'qualification' : 'elimination';
  const eyebrowKey: MessageKey = kind === 'victory'
    ? 'championship.moment.victoryEyebrow'
    : kind === 'qualification'
      ? 'championship.moment.qualifiedEyebrow'
      : 'championship.moment.eliminatedEyebrow';
  const titleKey: MessageKey = kind === 'victory'
    ? 'championship.moment.victoryTitle'
    : kind === 'qualification'
      ? 'championship.moment.qualifiedTitle'
      : 'championship.moment.eliminatedTitle';
  const stageDone = event.stage === 'final' && kind !== 'elimination';
  return {
    detailKey: stageDone
      ? 'championship.moment.tourCompleteDetail'
      : kind === 'elimination'
        ? 'championship.moment.eliminatedDetail'
        : 'championship.moment.qualifiedDetail',
    eyebrowKey,
    kind,
    rewardAchievement: newestEarnedAchievement(progressBefore, progressAfter),
    titleKey,
    unlockedEventId: newlyUnlockedEvent(progressBefore, progressAfter),
  };
}
