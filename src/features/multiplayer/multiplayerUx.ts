import type { AiDifficulty } from '../../domain/poker/aiProfiles';
import { isValidPlayerDisplayName } from '../../domain/playerProfile';

export type MultiplayerSeatCount = 2 | 3 | 6;
export type MultiplayerStartingStack = 800 | 2_000 | 4_000;
export type MultiplayerSessionLength = 5 | 10 | 'open';
export type MultiplayerTurnSeconds = 30 | 45 | 60;
export type MultiplayerFlowMode = 'create' | 'join';

export interface MultiplayerTableDraft {
  aiDifficulty: AiDifficulty;
  playerName: string;
  seatCount: MultiplayerSeatCount;
  sessionLength: MultiplayerSessionLength;
  startingStackChips: MultiplayerStartingStack;
  turnSeconds: MultiplayerTurnSeconds;
}

export interface MultiplayerLobbySeat {
  displayName: string | null;
  kind: 'human' | 'ai' | 'open';
  ready: boolean;
  seat: number;
  isHost?: boolean;
  isViewer?: boolean;
}

export const multiplayerSeatOptions: readonly MultiplayerSeatCount[] = [2, 3, 6];
export const multiplayerStackOptions: readonly MultiplayerStartingStack[] = [800, 2_000, 4_000];
export const multiplayerSessionOptions: readonly MultiplayerSessionLength[] = [5, 10, 'open'];
export const multiplayerTimerOptions: readonly MultiplayerTurnSeconds[] = [30, 45, 60];

export const defaultMultiplayerDraft: MultiplayerTableDraft = {
  aiDifficulty: 'club',
  playerName: '',
  seatCount: 3,
  sessionLength: 10,
  startingStackChips: 2_000,
  turnSeconds: 45,
};

export function normalizeMultiplayerRoomCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function isValidMultiplayerRoomCode(value: string): boolean {
  return normalizeMultiplayerRoomCode(value).length === 6;
}

export function isValidMultiplayerDisplayName(value: string): boolean {
  return isValidPlayerDisplayName(value);
}

export type MultiplayerSeatLayout = 'compact' | 'wide';
export type MultiplayerSeatHorizontalAlignment = 'center' | 'left' | 'right';
export type MultiplayerTableSurface = 'game' | 'lobby';

/**
 * The 200–220 point wide game plaques need at least a 764 point table to keep
 * all three six-seat footprints separated. A 700/768 point iPad split view is
 * therefore compact; full-width modern iPads retain the larger presentation.
 */
export const MULTIPLAYER_WIDE_LAYOUT_MIN_WIDTH = 820;

export const MULTIPLAYER_COMPACT_GAME_HORIZONTAL_PADDING = 7;
export const MULTIPLAYER_WIDE_GAME_HORIZONTAL_PADDING = 28;
export const MULTIPLAYER_COMPACT_LOBBY_HORIZONTAL_PADDING = 12;
export const MULTIPLAYER_WIDE_LOBBY_HORIZONTAL_PADDING = 30;
export const MULTIPLAYER_GAME_SHELL_MAX_WIDTH = 980;
export const MULTIPLAYER_GAME_TABLE_MAX_WIDTH = 880;
export const MULTIPLAYER_LOBBY_SHELL_MAX_WIDTH = 820;
export const MULTIPLAYER_LOBBY_TABLE_MAX_WIDTH = 720;

/**
 * Shared by compact lobby plaques and non-viewer game plaques.
 *
 * Three seats share a lane on six-player tables. Keeping this footprint below
 * one third of the 296-point table available on a 320-point phone prevents the
 * center plaque from touching either edge plaque.
 */
export const MULTIPLAYER_COMPACT_SEAT_WIDTH = 92;

/** The local-player plaque gets a little more room without crowding its lane. */
export const MULTIPLAYER_COMPACT_VIEWER_SEAT_WIDTH = 104;

export const MULTIPLAYER_WIDE_LOBBY_SEAT_WIDTH = 180;
export const MULTIPLAYER_WIDE_GAME_SEAT_WIDTH = 200;
export const MULTIPLAYER_WIDE_GAME_VIEWER_SEAT_WIDTH = 220;

export function multiplayerSeatLayoutForWidth(screenWidth: number): MultiplayerSeatLayout {
  return Number.isFinite(screenWidth) && screenWidth >= MULTIPLAYER_WIDE_LAYOUT_MIN_WIDTH
    ? 'wide'
    : 'compact';
}

export function multiplayerSeatFootprintWidth(
  layout: MultiplayerSeatLayout,
  surface: MultiplayerTableSurface,
  viewer = false,
): number {
  if (surface === 'lobby') {
    return layout === 'wide' ? MULTIPLAYER_WIDE_LOBBY_SEAT_WIDTH : MULTIPLAYER_COMPACT_SEAT_WIDTH;
  }
  if (layout === 'wide') {
    return viewer ? MULTIPLAYER_WIDE_GAME_VIEWER_SEAT_WIDTH : MULTIPLAYER_WIDE_GAME_SEAT_WIDTH;
  }
  return viewer ? MULTIPLAYER_COMPACT_VIEWER_SEAT_WIDTH : MULTIPLAYER_COMPACT_SEAT_WIDTH;
}

/** Mirrors the width caps and horizontal padding used by the table shells. */
export function multiplayerTableWidthForScreen(
  screenWidth: number,
  surface: MultiplayerTableSurface,
  layout = multiplayerSeatLayoutForWidth(screenWidth),
): number {
  if (!Number.isFinite(screenWidth) || screenWidth < 0) return 0;
  const game = surface === 'game';
  const shellMaxWidth = game ? MULTIPLAYER_GAME_SHELL_MAX_WIDTH : MULTIPLAYER_LOBBY_SHELL_MAX_WIDTH;
  const tableMaxWidth = game ? MULTIPLAYER_GAME_TABLE_MAX_WIDTH : MULTIPLAYER_LOBBY_TABLE_MAX_WIDTH;
  const horizontalPadding = game
    ? layout === 'wide' ? MULTIPLAYER_WIDE_GAME_HORIZONTAL_PADDING : MULTIPLAYER_COMPACT_GAME_HORIZONTAL_PADDING
    : layout === 'wide' ? MULTIPLAYER_WIDE_LOBBY_HORIZONTAL_PADDING : MULTIPLAYER_COMPACT_LOBBY_HORIZONTAL_PADDING;
  return Math.max(
    0,
    Math.min(tableMaxWidth, Math.min(screenWidth, shellMaxWidth) - horizontalPadding * 2),
  );
}

/**
 * Relative seats that face the viewer from the top edge of the table.
 * Cards for these seats point inward below the player label; every other
 * seat points inward above its label.
 */
export function multiplayerSeatIsTopRow(
  seatCount: MultiplayerSeatCount,
  relativeSeat: number,
): boolean {
  if (relativeSeat < 0 || relativeSeat >= seatCount) {
    throw new Error(`Seat ${relativeSeat} is outside a ${seatCount}-seat table.`);
  }
  if (seatCount === 2) return relativeSeat === 1;
  if (seatCount === 3) return relativeSeat !== 0;
  return relativeSeat >= 2 && relativeSeat <= 4;
}

export function multiplayerSeatAnchor(
  seatCount: MultiplayerSeatCount,
  seat: number,
  layout: MultiplayerSeatLayout = 'compact',
): { left: `${number}%`; top: `${number}%` } {
  const compactAnchors: Record<MultiplayerSeatCount, Array<{ left: `${number}%`; top: `${number}%` }>> = {
    2: [
      { left: '34%', top: '73%' },
      { left: '34%', top: '3%' },
    ],
    3: [
      { left: '34%', top: '73%' },
      { left: '1%', top: '4%' },
      { left: '68.5%', top: '4%' },
    ],
    6: [
      { left: '34%', top: '72%' },
      { left: '1%', top: '72%' },
      { left: '1%', top: '2%' },
      { left: '34%', top: '2%' },
      { left: '68.5%', top: '2%' },
      { left: '68.5%', top: '72%' },
    ],
  };
  const wideAnchors: typeof compactAnchors = {
    2: [
      { left: '37%', top: '73%' },
      { left: '37%', top: '3%' },
    ],
    3: [
      { left: '37%', top: '73%' },
      { left: '7%', top: '4%' },
      { left: '64%', top: '4%' },
    ],
    6: [
      { left: '37%', top: '77%' },
      { left: '1%', top: '62%' },
      { left: '4%', top: '5%' },
      { left: '37%', top: '2%' },
      { left: '66%', top: '5%' },
      { left: '66%', top: '62%' },
    ],
  };
  const anchors = layout === 'wide' ? wideAnchors : compactAnchors;
  const anchor = anchors[seatCount][seat];
  if (!anchor) throw new Error(`Seat ${seat} is outside a ${seatCount}-seat lobby.`);
  return anchor;
}

export function multiplayerSeatHorizontalAlignment(
  seatCount: MultiplayerSeatCount,
  seat: number,
  layout: MultiplayerSeatLayout = 'compact',
): MultiplayerSeatHorizontalAlignment {
  const left = Number.parseInt(multiplayerSeatAnchor(seatCount, seat, layout).left, 10);
  if (left <= 10) return 'left';
  if (left >= 60) return 'right';
  return 'center';
}
