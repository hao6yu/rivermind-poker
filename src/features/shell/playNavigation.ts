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

export type PlayGroupId = 'quick' | 'friends' | 'championship' | 'games';

export interface PlayGroupModel {
  destinations: readonly PlayDestination[];
  id: PlayGroupId;
  /** Collapsed-by-default groups hide nothing a first-time player needs. */
  startsOpen: boolean;
  titleKey: MessageKey | null;
}

/**
 * The Play hierarchy, in the order it is rendered — and the Play screen
 * renders EXACTLY this model (P18-018): one configurator card owns the three
 * AI-table destinations (quick game, custom table, and the tournament format
 * that is the Sit & Go), the friend-table and championship cards name
 * themselves, and one titled band holds the remaining rows. Bands without a
 * title are cards, not groups.
 */
export const PLAY_GROUPS: readonly PlayGroupModel[] = [
  { destinations: ['privateTableCreate', 'privateTableJoin', 'privateTableResume'], id: 'friends', startsOpen: true, titleKey: null },
  { destinations: ['championship'], id: 'championship', startsOpen: true, titleKey: null },
  // The AI configurator card: quick game, custom table, and Sit & Go are the
  // same configurable AI table with different presets (the separate custom
  // screen duplicated it and was removed — P18-018).
  { destinations: ['quickGame', 'sitAndGo', 'customTable'], id: 'quick', startsOpen: true, titleKey: null },
  {
    destinations: ['dailyChallenge', 'scenarioTraining'],
    id: 'games',
    startsOpen: true,
    titleKey: 'play.group.games',
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
