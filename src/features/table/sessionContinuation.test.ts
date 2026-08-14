import { describe, expect, it } from 'vitest';

import { tableContinuationActions } from './sessionContinuation';

describe('local table continuation actions', () => {
  it('keeps next hand prominent while a session is still running', () => {
    expect(tableContinuationActions('daily_challenge', false)).toEqual({
      primary: 'next_hand',
      secondary: 'review_hand',
      tertiary: null,
    });
  });

  it.each(['heads_up_practice', 'multiway_practice'] as const)(
    'offers direct play again before the completed %s summary',
    (mode) => {
      expect(tableContinuationActions(mode, true)).toEqual({
        primary: 'play_again',
        secondary: 'view_summary',
        tertiary: null,
      });
    },
  );

  it('offers a direct deterministic Daily replay alongside its summary', () => {
    expect(tableContinuationActions('daily_challenge', true)).toEqual({
      primary: 'replay_today',
      secondary: 'view_summary',
      tertiary: null,
    });
  });

  it.each(['heads_up_practice', 'multiway_practice', 'daily_challenge'] as const)(
    'caps the completed %s phone footer at two readable actions',
    (mode) => {
      const actions = tableContinuationActions(mode, true);
      expect([actions.primary, actions.secondary, actions.tertiary].filter(Boolean)).toHaveLength(2);
    },
  );

  it.each(['sit_and_go', 'championship', 'learning_mission'] as const)(
    'keeps the completed %s result as the primary destination',
    (mode) => {
      expect(tableContinuationActions(mode, true)).toEqual({
        primary: 'view_summary',
        secondary: 'review_hand',
        tertiary: null,
      });
    },
  );
});
