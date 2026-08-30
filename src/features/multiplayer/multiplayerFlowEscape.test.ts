import { describe, expect, it } from 'vitest';

import { multiplayerFlowEscapeRoute } from './multiplayerFlowEscape';

/**
 * The accessibility escape must follow the same route as Back (Slice 3.9C):
 * setup closes to Play without touching a room, the lobby walks the existing
 * leave-room boundary, and a live game stays behind the guarded exit
 * confirmation. Hardware Back keeps exactly this route too.
 */
describe('multiplayer flow escape routing', () => {
  it('routes escape on create setup back to Play without creating or mutating a room', () => {
    expect(multiplayerFlowEscapeRoute({ page: 'create', activeGame: false })).toBe('setup-close');
  });

  it('routes escape on join setup back to Play without creating or mutating a room', () => {
    expect(multiplayerFlowEscapeRoute({ page: 'join', activeGame: false })).toBe('setup-close');
  });

  it('routes escape in a lobby through the existing leave-room boundary', () => {
    expect(multiplayerFlowEscapeRoute({ page: 'lobby', activeGame: false })).toBe('lobby-leave');
  });

  it('routes escape during a live game to the guarded exit confirmation', () => {
    expect(multiplayerFlowEscapeRoute({ page: 'lobby', activeGame: true })).toBe('game-exit-confirmation');
  });

  it('never lets a live game be misread as setup or lobby', () => {
    // activeGame dominates: the lobby page renders the table once a game starts,
    // and only its status distinguishes waiting from playing.
    expect(multiplayerFlowEscapeRoute({ page: 'lobby', activeGame: true }))
      .not.toBe('lobby-leave');
    expect(multiplayerFlowEscapeRoute({ page: 'lobby', activeGame: true }))
      .not.toBe('setup-close');
  });
});
