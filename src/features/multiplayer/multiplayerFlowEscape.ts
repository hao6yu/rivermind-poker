import type { MultiplayerFlowMode } from './multiplayerUx';

/** The pages the private-table flow can present. */
export type MultiplayerFlowPage = MultiplayerFlowMode | 'lobby';

/**
 * Where an escape gesture must route, decided purely from the flow state so the
 * same answer drives hardware Back, the top-left Back, and the accessibility
 * escape:
 *
 * - `setup-close` — create/join setup. A room only comes into existence when
 *   Continue is pressed, so closing here returns to Play without creating or
 *   mutating one.
 * - `lobby-leave` — the waiting lobby. Leaving really does depart a table, so
 *   the escape walks the same leave-room boundary as the close glyph.
 * - `game-exit-confirmation` — a live game. The exit stays behind the existing
 *   guarded confirmation instead of dropping a player mid-hand.
 */
export type MultiplayerFlowEscapeRoute =
  | 'setup-close'
  | 'lobby-leave'
  | 'game-exit-confirmation';

/** Classifies the escape route for one moment in the private-table flow. */
export function multiplayerFlowEscapeRoute(input: {
  page: MultiplayerFlowPage;
  activeGame: boolean;
}): MultiplayerFlowEscapeRoute {
  if (input.activeGame) return 'game-exit-confirmation';
  if (input.page === 'lobby') return 'lobby-leave';
  return 'setup-close';
}
