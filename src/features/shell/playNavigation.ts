import { QUICK_PLAY_SESSION_CONFIG, type PracticeSessionConfig } from '../../domain/poker/session';
import { TABLE_PLAYER_COUNT_OPTIONS, type TablePlayerCount } from '../../domain/poker/multiwaySession';
import type { MessageKey } from '../../localization/messages';

/**
 * Every destination Play offers. The Play screen is allowed to reorder, regroup,
 * and restyle itself, but a destination may only leave this list when the mode
 * itself leaves the product: the navigation test fails on either direction, so
 * simplifying the screen cannot quietly strand a mode a player used before.
 */
export const PLAY_DESTINATIONS = [
  'quickGame',
  'privateTableCreate',
  'privateTableJoin',
  'privateTableResume',
  'championship',
  'dailyChallenge',
  'sitAndGo',
  'customTable',
  'scenarioTraining',
] as const;
export type PlayDestination = typeof PLAY_DESTINATIONS[number];

export type PlayGroupId = 'quick' | 'friends' | 'games' | 'setup';

export interface PlayGroupModel {
  destinations: readonly PlayDestination[];
  id: PlayGroupId;
  /** Collapsed-by-default groups hide nothing a first-time player needs. */
  startsOpen: boolean;
  titleKey: MessageKey | null;
}

/**
 * The Play hierarchy, in the order it is rendered: one dominant quick game,
 * then the private table, then the secondary modes in two compact groups. The
 * quick-game and private-table bands have no group title because each owns a
 * card that already names itself.
 */
export const PLAY_GROUPS: readonly PlayGroupModel[] = [
  { destinations: ['quickGame'], id: 'quick', startsOpen: true, titleKey: null },
  { destinations: ['privateTableCreate', 'privateTableJoin', 'privateTableResume'], id: 'friends', startsOpen: true, titleKey: null },
  {
    destinations: ['championship', 'dailyChallenge', 'sitAndGo'],
    id: 'games',
    startsOpen: true,
    titleKey: 'play.group.games',
  },
  {
    destinations: ['customTable', 'scenarioTraining'],
    id: 'setup',
    startsOpen: true,
    titleKey: 'play.group.setup',
  },
];

/** The seat sizes a quick game can be dealt with, straight from the table model. */
export const QUICK_GAME_SEAT_COUNTS: readonly TablePlayerCount[] = TABLE_PLAYER_COUNT_OPTIONS;

/**
 * Quick games are one configuration seated two, three, six, or nine ways. There
 * is deliberately no per-size variant here: a nine-seat quick game and a
 * heads-up quick game share the stack and the hand target, so the validated
 * session configuration is the only source of truth.
 */
export const QUICK_GAME_SESSION_CONFIG: PracticeSessionConfig = QUICK_PLAY_SESSION_CONFIG;

/**
 * Resolve a titled band. An untitled band is a card, not a group, so asking for
 * its title is a wiring mistake worth hearing about rather than rendering an
 * empty header over hidden destinations.
 */
export function playGroupTitle(id: PlayGroupId): { startsOpen: boolean; titleKey: MessageKey } {
  const group = PLAY_GROUPS.find((candidate) => candidate.id === id);
  const titleKey = group?.titleKey;
  if (!group || !titleKey) throw new Error(`The Play band "${id}" is not a titled group.`);
  return { startsOpen: group.startsOpen, titleKey };
}
