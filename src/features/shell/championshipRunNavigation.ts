import {
  CHAMPIONSHIP_ALL_EVENTS,
  championshipEventIsUnlocked,
  championshipEventProgress,
  type ChampionshipEvent,
  type ChampionshipEventId,
  type ChampionshipProgress,
} from '../../domain/poker/championship';

/**
 * B1/P1 (v1.3 review): the map's preselected stop after a completed
 * Championship run. The next stop is the first later event that is unlocked
 * and not yet qualified; the unlock chain guarantees one exists right after
 * qualifying. Extracted from AppShell so the shell navigation order — core
 * events, then invitational unlocks — is testable without mounting the shell.
 */
export function resolveNextChampionshipEvent(
  progress: ChampionshipProgress,
  completedEventId: ChampionshipEventId,
): ChampionshipEvent | null {
  const completedIndex = CHAMPIONSHIP_ALL_EVENTS.findIndex((item) => item.id === completedEventId);
  if (completedIndex < 0) return null;
  return CHAMPIONSHIP_ALL_EVENTS.slice(completedIndex + 1).find((item) => (
    championshipEventIsUnlocked(progress, item.id)
    && !championshipEventProgress(progress, item.id)?.qualifiedAt
  )) ?? null;
}
