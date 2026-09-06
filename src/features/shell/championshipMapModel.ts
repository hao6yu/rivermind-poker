import {
  CHAMPIONSHIP_EVENTS, CHAMPIONSHIP_INVITATION_EVENTS,
  championshipEventIsUnlocked,
  type ChampionshipEventId, type ChampionshipProgress,
} from '../../domain/poker/championship';

/** Markers sit directly at venue entrances. The final stays on the plaza
 * below the skyline; venue coordinates also center the event artwork preview. */
export const CHAMPIONSHIP_MAP_STOPS = [
  { id: 'local_3', x: 0.23, y: 0.83, venueX: 0.23, venueY: 0.83 },
  { id: 'local_6', x: 0.80, y: 0.86, venueX: 0.80, venueY: 0.86 },
  { id: 'local_9', x: 0.73, y: 0.64, venueX: 0.73, venueY: 0.64 },
  { id: 'city_6', x: 0.32, y: 0.575, venueX: 0.32, venueY: 0.575 },
  { id: 'city_9', x: 0.17, y: 0.458, venueX: 0.17, venueY: 0.458 },
  { id: 'national_6', x: 0.32, y: 0.40, venueX: 0.32, venueY: 0.40 },
  { id: 'national_9', x: 0.78, y: 0.378, venueX: 0.78, venueY: 0.378 },
  { id: 'masters_6', x: 0.28, y: 0.283, venueX: 0.28, venueY: 0.283 },
  { id: 'masters_9', x: 0.52, y: 0.19, venueX: 0.52, venueY: 0.19 },
  { id: 'championship_final', x: 0.56, y: 0.115, venueX: 0.56, venueY: 0.115 },
] as const satisfies readonly { id: ChampionshipEventId; x: number; y: number; venueX: number; venueY: number }[];

export const CHAMPIONSHIP_SECRET_SPOT = { x: 0.90, y: 0.197, venueX: 0.90, venueY: 0.197 } as const;

export function championshipVisibleEvents(progress: ChampionshipProgress) {
  return [...CHAMPIONSHIP_EVENTS, ...CHAMPIONSHIP_INVITATION_EVENTS.filter(
    (event) => championshipEventIsUnlocked(progress, event.id),
  )];
}

export function championshipMapLayout(width: number, height: number) {
  return {
    sidePanel: width >= 900 || (width > height && width >= 640),
    // Enough vertical separation for 48pt targets, including narrow phones.
    mapHeight: Math.max(820, width * 1.5, height),
  };
}
