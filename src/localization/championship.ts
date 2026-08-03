import type {
  ChampionshipAchievement,
  ChampionshipAchievementId,
  ChampionshipEvent,
  ChampionshipEventId,
} from '../domain/poker/championship';
import type { MessageKey } from './messages';
import type { TranslationValues } from './core';

type Translator = (key: MessageKey, values?: TranslationValues) => string;

const eventKeys: Record<ChampionshipEventId, { description: MessageKey; title: MessageKey }> = {
  local_tables: {
    description: 'championship.event.local_tables.description',
    title: 'championship.event.local_tables.title',
  },
  city_circuit: {
    description: 'championship.event.city_circuit.description',
    title: 'championship.event.city_circuit.title',
  },
  national_tour: {
    description: 'championship.event.national_tour.description',
    title: 'championship.event.national_tour.title',
  },
  masters_division: {
    description: 'championship.event.masters_division.description',
    title: 'championship.event.masters_division.title',
  },
  championship_final: {
    description: 'championship.event.championship_final.description',
    title: 'championship.event.championship_final.title',
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
