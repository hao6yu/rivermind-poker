export type TableContinuationMode =
  | 'heads_up_practice'
  | 'multiway_practice'
  | 'daily_challenge'
  | 'sit_and_go'
  | 'championship'
  | 'learning_mission';

export type TableContinuationAction =
  | 'next_hand'
  | 'play_again'
  | 'replay_today'
  | 'view_summary'
  | 'review_hand';

export interface TableContinuationActions {
  primary: TableContinuationAction;
  secondary: TableContinuationAction;
  tertiary: TableContinuationAction | null;
}

/**
 * Keeps the end-of-hand continuation promise consistent across every local
 * table. Practice players should never have to open a summary just to play
 * again; competitive and lesson modes still lead with their meaningful result.
 */
export function tableContinuationActions(
  mode: TableContinuationMode,
  sessionComplete: boolean,
): TableContinuationActions {
  if (!sessionComplete) {
    return {
      primary: 'next_hand',
      secondary: 'review_hand',
      tertiary: null,
    };
  }

  if (mode === 'heads_up_practice' || mode === 'multiway_practice') {
    return {
      primary: 'play_again',
      secondary: 'view_summary',
      tertiary: null,
    };
  }

  if (mode === 'daily_challenge') {
    return {
      primary: 'replay_today',
      secondary: 'view_summary',
      tertiary: null,
    };
  }

  return {
    primary: 'view_summary',
    secondary: 'review_hand',
    tertiary: null,
  };
}
