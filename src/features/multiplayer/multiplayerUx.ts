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

export interface MultiplayerAiRulesPresentation {
  difficultyKey: `difficulty.${AiDifficulty}`;
  difficultySummaryKey: `difficulty.${AiDifficulty}Summary`;
  turnSeconds: MultiplayerTurnSeconds;
}

/**
 * One disclosed rule applies to every AI and timeout-takeover seat at a
 * private table. Keeping these keys together prevents the create form and
 * guest lobby from describing different challenges.
 */
export function multiplayerAiRulesPresentation(
  aiDifficulty: AiDifficulty,
  turnSeconds: MultiplayerTurnSeconds,
): MultiplayerAiRulesPresentation {
  return {
    difficultyKey: `difficulty.${aiDifficulty}`,
    difficultySummaryKey: `difficulty.${aiDifficulty}Summary`,
    turnSeconds,
  };
}

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
export type MultiplayerGamePresentationPhase = 'live' | 'result';

export interface MultiplayerGameLaneBounds {
  board: { bottom: number; top: number };
  bottomFeedback: { bottom: number; top: number };
  bottomSeat: { bottom: number; top: number };
  topFeedback: { bottom: number; top: number };
  topSeat: { bottom: number; top: number };
}

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

/**
 * A portrait iPad can still need the compact anchor map (the 200-point wide
 * plaques do not safely clear every six-seat lane), but it has enough room for
 * a substantially more readable plaque than a 320-point phone.
 */
export const MULTIPLAYER_TABLET_COMPACT_LOBBY_SEAT_WIDTH = 132;
export const MULTIPLAYER_TABLET_COMPACT_GAME_SEAT_WIDTH = 138;
export const MULTIPLAYER_TABLET_COMPACT_GAME_VIEWER_SEAT_WIDTH = 152;
export const MULTIPLAYER_TABLET_VIEWPORT_MIN_EDGE = 700;

export const MULTIPLAYER_WIDE_LOBBY_SEAT_WIDTH = 180;
export const MULTIPLAYER_WIDE_GAME_SEAT_WIDTH = 200;
export const MULTIPLAYER_WIDE_GAME_VIEWER_SEAT_WIDTH = 220;

/**
 * Vertical footprints mirror `MultiplayerFlowModal` exactly. Keeping these
 * values here makes the table's three reserved lanes testable instead of
 * relying on screenshots and percentage anchors alone.
 */
export const MULTIPLAYER_COMPACT_GAME_SEAT_HEIGHT = 103;
export const MULTIPLAYER_TABLET_COMPACT_GAME_SEAT_HEIGHT = 123;
export const MULTIPLAYER_WIDE_GAME_SEAT_HEIGHT = 142;
export const MULTIPLAYER_COMPACT_ACTION_BUBBLE_FOOTPRINT = 40;
export const MULTIPLAYER_TABLET_COMPACT_ACTION_BUBBLE_FOOTPRINT = 51;
export const MULTIPLAYER_WIDE_ACTION_BUBBLE_FOOTPRINT = 56;
export const MULTIPLAYER_COMPACT_BOARD_LANE_HEIGHT = 115;
export const MULTIPLAYER_WIDE_BOARD_LANE_HEIGHT = 142;
export const MULTIPLAYER_COMPACT_RESULT_BOARD_LANE_HEIGHT = 85;
export const MULTIPLAYER_WIDE_RESULT_BOARD_LANE_HEIGHT = 103;
export const MULTIPLAYER_COMPACT_GAME_TABLE_MIN_HEIGHT = 420;
export const MULTIPLAYER_TABLET_COMPACT_GAME_TABLE_MIN_HEIGHT = 500;
export const MULTIPLAYER_WIDE_GAME_TABLE_MIN_HEIGHT = 560;
export const MULTIPLAYER_COMPACT_RESULT_TABLE_MIN_HEIGHT = 340;
export const MULTIPLAYER_TABLET_COMPACT_RESULT_TABLE_MIN_HEIGHT = 420;
export const MULTIPLAYER_WIDE_RESULT_TABLE_MIN_HEIGHT = 460;

const MULTIPLAYER_COMPACT_GAME_VERTICAL_PADDING = 10;
const MULTIPLAYER_COMPACT_GAME_GAPS = 12;
const MULTIPLAYER_COMPACT_GAME_HEADER_HEIGHT = 46;
const MULTIPLAYER_COMPACT_ACTION_RAIL_MIN_HEIGHT = 54;
const MULTIPLAYER_COMPACT_RESULT_RAIL_MIN_HEIGHT = 86;
const MULTIPLAYER_COMPACT_TRANSPORT_BANNER_HEIGHT = 34;

export function multiplayerSeatLayoutForWidth(screenWidth: number): MultiplayerSeatLayout {
  return Number.isFinite(screenWidth) && screenWidth >= MULTIPLAYER_WIDE_LAYOUT_MIN_WIDTH
    ? 'wide'
    : 'compact';
}

export function multiplayerUsesTabletSeatReadability(
  screenWidth: number,
  screenHeight: number,
): boolean {
  return Number.isFinite(screenWidth)
    && Number.isFinite(screenHeight)
    && Math.min(screenWidth, screenHeight) >= MULTIPLAYER_TABLET_VIEWPORT_MIN_EDGE;
}

export function multiplayerSeatFootprintWidth(
  layout: MultiplayerSeatLayout,
  surface: MultiplayerTableSurface,
  viewer = false,
  tabletCompact = false,
): number {
  if (surface === 'lobby') {
    if (layout === 'compact' && tabletCompact) {
      return MULTIPLAYER_TABLET_COMPACT_LOBBY_SEAT_WIDTH;
    }
    return layout === 'wide' ? MULTIPLAYER_WIDE_LOBBY_SEAT_WIDTH : MULTIPLAYER_COMPACT_SEAT_WIDTH;
  }
  if (layout === 'wide') {
    return viewer ? MULTIPLAYER_WIDE_GAME_VIEWER_SEAT_WIDTH : MULTIPLAYER_WIDE_GAME_SEAT_WIDTH;
  }
  if (tabletCompact) {
    return viewer
      ? MULTIPLAYER_TABLET_COMPACT_GAME_VIEWER_SEAT_WIDTH
      : MULTIPLAYER_TABLET_COMPACT_GAME_SEAT_WIDTH;
  }
  return viewer ? MULTIPLAYER_COMPACT_VIEWER_SEAT_WIDTH : MULTIPLAYER_COMPACT_SEAT_WIDTH;
}

export function multiplayerGameTableMinHeight(
  layout: MultiplayerSeatLayout,
  tabletCompact = false,
  phase: MultiplayerGamePresentationPhase = 'live',
): number {
  if (phase === 'result') {
    if (layout === 'wide') return MULTIPLAYER_WIDE_RESULT_TABLE_MIN_HEIGHT;
    return tabletCompact
      ? MULTIPLAYER_TABLET_COMPACT_RESULT_TABLE_MIN_HEIGHT
      : MULTIPLAYER_COMPACT_RESULT_TABLE_MIN_HEIGHT;
  }
  if (layout === 'wide') return MULTIPLAYER_WIDE_GAME_TABLE_MIN_HEIGHT;
  return tabletCompact
    ? MULTIPLAYER_TABLET_COMPACT_GAME_TABLE_MIN_HEIGHT
    : MULTIPLAYER_COMPACT_GAME_TABLE_MIN_HEIGHT;
}

/**
 * The game table is intentionally split into five non-overlapping bands:
 * top seats, top action feedback, board/status, bottom action feedback, and
 * bottom seats. This prevents a lower corner plaque or transient bubble from
 * drifting across the community cards as the viewport changes.
 */
export function multiplayerGameLaneBounds(
  tableHeight: number,
  layout: MultiplayerSeatLayout,
  tabletCompact = false,
  phase: MultiplayerGamePresentationPhase = 'live',
): MultiplayerGameLaneBounds {
  const normalizedHeight = Math.max(0, tableHeight);
  const seatHeight = layout === 'wide'
    ? MULTIPLAYER_WIDE_GAME_SEAT_HEIGHT
    : tabletCompact
      ? MULTIPLAYER_TABLET_COMPACT_GAME_SEAT_HEIGHT
      : MULTIPLAYER_COMPACT_GAME_SEAT_HEIGHT;
  const feedbackHeight = phase === 'result'
    ? 0
    : layout === 'wide'
      ? MULTIPLAYER_WIDE_ACTION_BUBBLE_FOOTPRINT
      : tabletCompact
        ? MULTIPLAYER_TABLET_COMPACT_ACTION_BUBBLE_FOOTPRINT
        : MULTIPLAYER_COMPACT_ACTION_BUBBLE_FOOTPRINT;
  const boardHeight = phase === 'result'
    ? layout === 'wide'
      ? MULTIPLAYER_WIDE_RESULT_BOARD_LANE_HEIGHT
      : MULTIPLAYER_COMPACT_RESULT_BOARD_LANE_HEIGHT
    : layout === 'wide'
      ? MULTIPLAYER_WIDE_BOARD_LANE_HEIGHT
      : MULTIPLAYER_COMPACT_BOARD_LANE_HEIGHT;
  const topSeatTop = normalizedHeight * 0.01;
  const bottomSeatTop = normalizedHeight * 0.99 - seatHeight;
  const boardTop = normalizedHeight * 0.37;
  return {
    board: { bottom: boardTop + boardHeight, top: boardTop },
    bottomFeedback: { bottom: bottomSeatTop, top: bottomSeatTop - feedbackHeight },
    bottomSeat: { bottom: bottomSeatTop + seatHeight, top: bottomSeatTop },
    topFeedback: {
      bottom: topSeatTop + seatHeight + feedbackHeight,
      top: topSeatTop + seatHeight,
    },
    topSeat: { bottom: topSeatTop + seatHeight, top: topSeatTop },
  };
}

/**
 * Remaining compact table height after fixed result-state chrome. A 320×568
 * phone has roughly 548 safe-area points; even a 106-point wrapped result rail
 * plus a reconnect banner leaves the 340-point result table intact.
 */
export function multiplayerCompactResultTableBudget(
  safeAreaHeight: number,
  options: { resultRailHeight?: number; transportBanner?: boolean } = {},
): number {
  if (!Number.isFinite(safeAreaHeight) || safeAreaHeight <= 0) return 0;
  const resultRailHeight = Math.max(
    MULTIPLAYER_COMPACT_RESULT_RAIL_MIN_HEIGHT,
    options.resultRailHeight ?? MULTIPLAYER_COMPACT_RESULT_RAIL_MIN_HEIGHT,
  );
  return Math.max(0, safeAreaHeight
    - MULTIPLAYER_COMPACT_GAME_VERTICAL_PADDING
    - MULTIPLAYER_COMPACT_GAME_GAPS
    - MULTIPLAYER_COMPACT_GAME_HEADER_HEIGHT
    - resultRailHeight
    - (options.transportBanner ? MULTIPLAYER_COMPACT_TRANSPORT_BANNER_HEIGHT : 0));
}

/**
 * Remaining compact table height during a live hand. Compact games present a
 * transient transport notice inside the existing 46-point header, rather than
 * inserting a new row above the table. This keeps the 54-point action rail and
 * the table's five reserved lanes intact on a 320 x 568 phone.
 */
export function multiplayerCompactLiveTableBudget(
  safeAreaHeight: number,
  options: { transportBanner?: boolean; transportBannerInline?: boolean } = {},
): number {
  if (!Number.isFinite(safeAreaHeight) || safeAreaHeight <= 0) return 0;
  const stackedTransportHeight = options.transportBanner && !options.transportBannerInline
    ? MULTIPLAYER_COMPACT_TRANSPORT_BANNER_HEIGHT
    : 0;
  return Math.max(0, safeAreaHeight
    - MULTIPLAYER_COMPACT_GAME_VERTICAL_PADDING
    - MULTIPLAYER_COMPACT_GAME_GAPS
    - MULTIPLAYER_COMPACT_GAME_HEADER_HEIGHT
    - MULTIPLAYER_COMPACT_ACTION_RAIL_MIN_HEIGHT
    - stackedTransportHeight);
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
  surface: MultiplayerTableSurface = 'game',
): { left: `${number}%`; top: `${number}%` } {
  const compactGameAnchors: Record<MultiplayerSeatCount, Array<{ left: `${number}%`; top: `${number}%` }>> = {
    2: [
      { left: '34%', top: '75%' },
      { left: '34%', top: '1%' },
    ],
    3: [
      { left: '34%', top: '75%' },
      { left: '1%', top: '1%' },
      { left: '68.5%', top: '1%' },
    ],
    6: [
      { left: '34%', top: '75%' },
      { left: '1%', top: '75%' },
      { left: '1%', top: '1%' },
      { left: '34%', top: '1%' },
      { left: '68.5%', top: '1%' },
      { left: '68.5%', top: '75%' },
    ],
  };
  const wideGameAnchors: typeof compactGameAnchors = {
    2: [
      { left: '37%', top: '73%' },
      { left: '37%', top: '1%' },
    ],
    3: [
      { left: '37%', top: '73%' },
      { left: '1%', top: '1%' },
      { left: '66%', top: '1%' },
    ],
    6: [
      { left: '37%', top: '73%' },
      { left: '1%', top: '73%' },
      { left: '1%', top: '1%' },
      { left: '37%', top: '1%' },
      { left: '66%', top: '1%' },
      { left: '66%', top: '73%' },
    ],
  };
  const compactLobbyAnchors = Object.fromEntries(
    Object.entries(compactGameAnchors).map(([count, anchors]) => [
      count,
      anchors.map((anchor, index) => ({
        ...anchor,
        top: (multiplayerSeatIsTopRow(Number(count) as MultiplayerSeatCount, index)
          ? '4%'
          : '70%') as `${number}%`,
      })),
    ]),
  ) as typeof compactGameAnchors;
  const wideLobbyAnchors = Object.fromEntries(
    Object.entries(wideGameAnchors).map(([count, anchors]) => [
      count,
      anchors.map((anchor, index) => ({
        ...anchor,
        top: (multiplayerSeatIsTopRow(Number(count) as MultiplayerSeatCount, index)
          ? '4%'
          : '70%') as `${number}%`,
      })),
    ]),
  ) as typeof wideGameAnchors;
  const anchors = surface === 'lobby'
    ? layout === 'wide' ? wideLobbyAnchors : compactLobbyAnchors
    : layout === 'wide' ? wideGameAnchors : compactGameAnchors;
  const anchor = anchors[seatCount][seat];
  if (!anchor) throw new Error(`Seat ${seat} is outside a ${seatCount}-seat lobby.`);
  return anchor;
}

/** Bottom seats stay attached to the table edge as result tables flex. */
export function multiplayerGameSeatAnchor(
  seatCount: MultiplayerSeatCount,
  seat: number,
  layout: MultiplayerSeatLayout = 'compact',
): { bottom?: `${number}%`; left: `${number}%`; top?: `${number}%` } {
  const horizontal = multiplayerSeatAnchor(seatCount, seat, layout, 'game').left;
  return multiplayerSeatIsTopRow(seatCount, seat)
    ? { left: horizontal, top: '1%' }
    : { bottom: '1%', left: horizontal };
}

export function multiplayerSeatHorizontalAlignment(
  seatCount: MultiplayerSeatCount,
  seat: number,
  layout: MultiplayerSeatLayout = 'compact',
): MultiplayerSeatHorizontalAlignment {
  const left = Number.parseInt(multiplayerSeatAnchor(seatCount, seat, layout, 'game').left, 10);
  if (left <= 10) return 'left';
  if (left >= 60) return 'right';
  return 'center';
}
