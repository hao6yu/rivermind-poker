import type {
  ChampionshipAchievement,
  ChampionshipAchievementId,
  ChampionshipEvent,
  ChampionshipEventId,
  ChampionshipStageId,
} from '../domain/poker/championship';
import type { MessageKey } from './messages';
import type { TranslationValues } from './core';

type Translator = (key: MessageKey, values?: TranslationValues) => string;

const eventKeys: Record<ChampionshipEventId, { description: MessageKey; title: MessageKey }> = {
  local_3: {
    description: 'championship.event.local_3.description',
    title: 'championship.event.local_3.title',
  },
  local_6: {
    description: 'championship.event.local_6.description',
    title: 'championship.event.local_6.title',
  },
  local_9: {
    description: 'championship.event.local_9.description',
    title: 'championship.event.local_9.title',
  },
  city_6: {
    description: 'championship.event.city_6.description',
    title: 'championship.event.city_6.title',
  },
  city_9: {
    description: 'championship.event.city_9.description',
    title: 'championship.event.city_9.title',
  },
  national_6: {
    description: 'championship.event.national_6.description',
    title: 'championship.event.national_6.title',
  },
  national_9: {
    description: 'championship.event.national_9.description',
    title: 'championship.event.national_9.title',
  },
  masters_6: {
    description: 'championship.event.masters_6.description',
    title: 'championship.event.masters_6.title',
  },
  masters_9: {
    description: 'championship.event.masters_9.description',
    title: 'championship.event.masters_9.title',
  },
  championship_final: {
    description: 'championship.event.championship_final.description',
    title: 'championship.event.championship_final.title',
  },
  river_below: {
    description: 'championship.event.river_below.description',
    title: 'championship.event.river_below.title',
  },
  the_undertow: {
    description: 'championship.event.the_undertow.description',
    title: 'championship.event.the_undertow.title',
  },
};

const stageKeys: Record<ChampionshipStageId, { description: MessageKey; title: MessageKey }> = {
  local_tables: {
    description: 'championship.stage.local_tables.description',
    title: 'championship.stage.local_tables.title',
  },
  city_circuit: {
    description: 'championship.stage.city_circuit.description',
    title: 'championship.stage.city_circuit.title',
  },
  national_tour: {
    description: 'championship.stage.national_tour.description',
    title: 'championship.stage.national_tour.title',
  },
  masters_division: {
    description: 'championship.stage.masters_division.description',
    title: 'championship.stage.masters_division.title',
  },
  final: {
    description: 'championship.stage.final.description',
    title: 'championship.stage.final.title',
  },
};

const achievementKeys: Record<ChampionshipAchievementId, { description: MessageKey; title: MessageKey }> = {
  first_run: {
    description: 'championship.achievement.first_run.description',
    title: 'championship.achievement.first_run.title',
  },
  first_qualification: {
    description: 'championship.achievement.first_qualification.description',
    title: 'championship.achievement.first_qualification.title',
  },
  full_table: {
    description: 'championship.achievement.full_table.description',
    title: 'championship.achievement.full_table.title',
  },
  five_runs: {
    description: 'championship.achievement.five_runs.description',
    title: 'championship.achievement.five_runs.title',
  },
  masters_qualifier: {
    description: 'championship.achievement.masters_qualifier.description',
    title: 'championship.achievement.masters_qualifier.title',
  },
  rivermind_champion: {
    description: 'championship.achievement.rivermind_champion.description',
    title: 'championship.achievement.rivermind_champion.title',
  },
  below_conqueror: {
    description: 'championship.achievement.below_conqueror.description',
    title: 'championship.achievement.below_conqueror.title',
  },
  undertow_conqueror: {
    description: 'championship.achievement.undertow_conqueror.description',
    title: 'championship.achievement.undertow_conqueror.title',
  },
};

export function championshipEventText(
  event: ChampionshipEvent,
  field: 'description' | 'title',
  t: Translator,
): string {
  return t(eventKeys[event.id][field]);
}

export function championshipAchievementText(
  achievement: ChampionshipAchievement,
  field: 'description' | 'title',
  t: Translator,
): string {
  return t(achievementKeys[achievement.id][field]);
}

/**
 * The copy a record surface may show for one achievement. A hidden
 * achievement (The Undertow before The River Below is won) resolves to a
 * neutral placeholder instead of its authored copy, so the hidden invitation
 * is never discoverable through visible text or accessibility labels.
 */
export function championshipAchievementDisplay(
  achievement: ChampionshipAchievement,
  t: Translator,
): { title: string; description: string } {
  if (achievement.hidden) {
    return {
      title: t('championship.record.hiddenAchievementTitle'),
      description: t('championship.record.hiddenAchievementDescription'),
    };
  }
  return {
    title: championshipAchievementText(achievement, 'title', t),
    description: championshipAchievementText(achievement, 'description', t),
  };
}

/**
 * The full accessibility label a record surface announces for one achievement:
 * display copy (hidden-aware) plus the locked/unlocked state. Record surfaces
 * must assemble labels through this helper so a hidden achievement's
 * authored copy can never leak into accessibility output.
 */
export function championshipAchievementAccessibilityLabel(
  achievement: ChampionshipAchievement,
  t: Translator,
): string {
  const display = championshipAchievementDisplay(achievement, t);
  const state = t(achievement.unlocked
    ? 'championship.record.unlocked'
    : 'championship.record.locked');
  return `${display.title}. ${state}. ${display.description}`;
}


export function championshipStageText(
  stage: ChampionshipStageId,
  field: 'description' | 'title',
  t: Translator,
): string {
  return t(stageKeys[stage][field]);
}

/** Stable event identifiers stay untranslated; `the_undertow` must never be
 * discoverable through localization before it unlocks. */
export const UNDERTOW_EVENT_ID = 'the_undertow';
