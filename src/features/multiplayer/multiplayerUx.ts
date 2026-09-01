import type { AiDifficulty } from '../../domain/poker/aiProfiles';
import {
  DEFAULT_PLAYER_DISPLAY_NAME,
  type HumanAvatarReference,
  isValidPlayerDisplayName,
} from '../../domain/playerProfile';

export type MultiplayerSeatCount = 2 | 3 | 6 | 9;
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
  avatar?: HumanAvatarReference | null;
  displayName: string | null;
  kind: 'human' | 'ai' | 'open';
  ready: boolean;
  seat: number;
  isHost?: boolean;
  isViewer?: boolean;
}

export const multiplayerSeatOptions: readonly MultiplayerSeatCount[] = [2, 3, 6, 9];
export const multiplayerStackOptions: readonly MultiplayerStartingStack[] = [800, 2_000, 4_000];
export const multiplayerSessionOptions: readonly MultiplayerSessionLength[] = [5, 10, 'open'];
export const multiplayerTimerOptions: readonly MultiplayerTurnSeconds[] = [30, 45, 60];

export const defaultMultiplayerDraft: MultiplayerTableDraft = {
  aiDifficulty: 'club',
  playerName: DEFAULT_PLAYER_DISPLAY_NAME,
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
 * Nine-seat footprints. A nine-seat table rows five plaques along the top
 * edge, so the widest lane is one fifth of the usable table: 92 points on the
 * smallest landscape phone (554-point table), 126 on a portrait tablet (five
 * 130-point plaques would not clear the 686-point table of a 700-point iPad),
 * and 142 on a wide tablet (five 158-point plaques overflow the 764-point
 * table of an 820-point screen). The viewer keeps the same footprint as every
 * other seat so the four bottom lanes stay separated at every width.
 */
export const MULTIPLAYER_NINE_GAME_SEAT_WIDTH = 92;
export const MULTIPLAYER_NINE_TABLET_COMPACT_GAME_SEAT_WIDTH = 126;
export const MULTIPLAYER_NINE_WIDE_GAME_SEAT_WIDTH = 142;

/**
 * Vertical footprint of a nine-seat compact seat on a phone in landscape.
 * Two rows of 72-point plaques plus the centered board lane fit the ~253-point
 * table of a 375-point landscape phone; on the 320-point phone the board lane
 * pins to the top row and the pot stays visible in the header pill.
 */
export const MULTIPLAYER_NINE_LANDSCAPE_GAME_SEAT_HEIGHT = 72;

/**
 * Board lane of a nine-seat phone-landscape table with the center status line:
 * pot pill (25) + gap (3) + card row (48) + gap (3) + turn pill (20). The turn
 * pill is transient, so the lane always reserves it; when it is hidden the
 * column simply does not reach the lane bottom. At 99 points the lane fits the
 * ~104-point gap of a 375-point landscape phone with a small margin.
 */
export const MULTIPLAYER_NINE_LANDSCAPE_BOARD_LANE_HEIGHT = 99;

/**
 * Board lane of a nine-seat phone-landscape table on the shortest phones: the
 * pot lives in the header pill and the center status line is omitted (there is
 * no room between the 72-point seat rows), leaving just the 48-point card row.
 */
export const MULTIPLAYER_NINE_LANDSCAPE_COMPACT_BOARD_LANE_HEIGHT = 48;

/**
 * Below this compact live-table budget the pot also appears in the game
 * header pill, so a 320-point landscape phone always shows the pot even while
 * the center board lane is squeezed between the two seat rows.
 */
export const MULTIPLAYER_NINE_LANDSCAPE_POT_IN_HEADER_MAX_TABLE_HEIGHT = 240;

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
  seatCount: MultiplayerSeatCount = 6,
): number {
  if (surface === 'lobby') {
    if (layout === 'compact' && tabletCompact) {
      return MULTIPLAYER_TABLET_COMPACT_LOBBY_SEAT_WIDTH;
    }
    return layout === 'wide' ? MULTIPLAYER_WIDE_LOBBY_SEAT_WIDTH : MULTIPLAYER_COMPACT_SEAT_WIDTH;
  }
  if (seatCount === 9) {
    // Every nine-seat seat shares one footprint so the five top-row lanes and
    // four bottom-row lanes stay separated at every supported width.
    if (layout === 'wide') return MULTIPLAYER_NINE_WIDE_GAME_SEAT_WIDTH;
    return tabletCompact
      ? MULTIPLAYER_NINE_TABLET_COMPACT_GAME_SEAT_WIDTH
      : MULTIPLAYER_NINE_GAME_SEAT_WIDTH;
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
 * Whether a nine-seat phone in landscape is too short for the center status
 * line (pot pill / turn pill) between the seat rows: below this compact
 * live-table budget the pot lives only in the game header pill, the center
 * shows just the board cards, and the turn prompt is carried by the action
 * rail and the accessibility announcement instead of a center pill.
 */
export function multiplayerNineSeatPotInHeader(safeAreaHeight: number): boolean {
  return Number.isFinite(safeAreaHeight)
    && multiplayerCompactLiveTableBudget(safeAreaHeight) < MULTIPLAYER_NINE_LANDSCAPE_POT_IN_HEADER_MAX_TABLE_HEIGHT;
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
  seatCount: MultiplayerSeatCount = 6,
  nineLandscape = false,
  ninePotInHeader = false,
): MultiplayerGameLaneBounds {
  const normalizedHeight = Math.max(0, tableHeight);
  const nine = seatCount === 9;
  const seatHeight = nine && nineLandscape
    ? MULTIPLAYER_NINE_LANDSCAPE_GAME_SEAT_HEIGHT
    : layout === 'wide'
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
  // Nine-seat phone landscape has no room for the 40-point feedback bands
  // between 72-point rows; the plaque meta line carries the last action there,
  // so the transient bubbles never need a reserved lane. The board lane is the
  // pot-and-cards block, or just the cards when the pot is in the header.
  const feedbackHeightReserved = nine && nineLandscape ? 0 : feedbackHeight;
  const boardHeight = nine && nineLandscape
    ? ninePotInHeader
      ? MULTIPLAYER_NINE_LANDSCAPE_COMPACT_BOARD_LANE_HEIGHT
      : MULTIPLAYER_NINE_LANDSCAPE_BOARD_LANE_HEIGHT
    : phase === 'result'
      ? layout === 'wide'
        ? MULTIPLAYER_WIDE_RESULT_BOARD_LANE_HEIGHT
        : MULTIPLAYER_COMPACT_RESULT_BOARD_LANE_HEIGHT
      : layout === 'wide'
        ? MULTIPLAYER_WIDE_BOARD_LANE_HEIGHT
        : MULTIPLAYER_COMPACT_BOARD_LANE_HEIGHT;
  const topSeatTop = normalizedHeight * 0.01;
  const bottomSeatTop = normalizedHeight * 0.99 - seatHeight;
  // Nine-seat phone landscape centers the board lane between the two seat
  // rows (and pins it to the top row when the gap is too short to hold it).
  const boardTop = nine && nineLandscape
    ? Math.max(
      topSeatTop + seatHeight,
      topSeatTop + seatHeight + Math.max(0, (bottomSeatTop - topSeatTop - seatHeight - boardHeight) / 2),
    )
    : normalizedHeight * 0.37;
  return {
    board: { bottom: boardTop + boardHeight, top: boardTop },
    bottomFeedback: { bottom: bottomSeatTop, top: bottomSeatTop - feedbackHeightReserved },
    bottomSeat: { bottom: bottomSeatTop + seatHeight, top: bottomSeatTop },
    topFeedback: {
      bottom: topSeatTop + seatHeight + feedbackHeightReserved,
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
 * seat points inward above its label. Nine-seat tables row five seats along
 * the top edge (relative seats 2–6) and four along the bottom edge
 * (0, 1, 7, 8).
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
  if (seatCount === 9) return relativeSeat >= 2 && relativeSeat <= 6;
  return relativeSeat >= 2 && relativeSeat <= 4;
}

/**
 * Nine-seat lobby seats form a 3×3 grid: top row 2,3,4; middle row 5,6,7;
 * bottom row 8,0,1 with the viewer centered. Three columns of 92-point
 * plaques fit the 306-point table of a 320-point phone, and the vertical
 * thirds fit the compact lobby table height.
 */
const NINE_SEAT_LOBBY_ANCHORS: ReadonlyArray<{ left: `${number}%`; top: `${number}%` }> = [
  { left: '34%', top: '70%' },
  { left: '68.5%', top: '70%' },
  { left: '1%', top: '4%' },
  { left: '34%', top: '4%' },
  { left: '68.5%', top: '4%' },
  { left: '1%', top: '37%' },
  { left: '34%', top: '37%' },
  { left: '68.5%', top: '37%' },
  { left: '1%', top: '70%' },
];

/**
 * Nine-seat game tables row five plaques along the top edge (1%, 21%, 41%,
 * 61%, 81%) and four along the bottom edge (1%, 27%, 53%, 79%). The rightmost
 * top plaque clears the table edge even at the widest footprint: 81% plus a
 * 92/126/142-point plaque stays inside every supported table width. Bottom
 * seats are bottom-anchored by `multiplayerGameSeatAnchor`, so short
 * landscape tables keep the whole plaque visible.
 */
const NINE_SEAT_GAME_ANCHORS: ReadonlyArray<{ left: `${number}%`; top: `${number}%` }> = [
  { left: '27%', top: '75%' },
  { left: '1%', top: '75%' },
  { left: '1%', top: '1%' },
  { left: '21%', top: '1%' },
  { left: '41%', top: '1%' },
  { left: '61%', top: '1%' },
  { left: '81%', top: '1%' },
  { left: '53%', top: '75%' },
  { left: '79%', top: '75%' },
];

const NINE_SEAT_WIDE_GAME_ANCHORS: ReadonlyArray<{ left: `${number}%`; top: `${number}%` }> = [
  { left: '27%', top: '73%' },
  { left: '1%', top: '73%' },
  { left: '1%', top: '1%' },
  { left: '21%', top: '1%' },
  { left: '41%', top: '1%' },
  { left: '61%', top: '1%' },
  { left: '81%', top: '1%' },
  { left: '53%', top: '73%' },
  { left: '79%', top: '73%' },
];

export function multiplayerSeatAnchor(
  seatCount: MultiplayerSeatCount,
  seat: number,
  layout: MultiplayerSeatLayout = 'compact',
  surface: MultiplayerTableSurface = 'game',
): { left: `${number}%`; top: `${number}%` } {
  if (seatCount === 9) {
    const anchors = surface === 'lobby'
      ? NINE_SEAT_LOBBY_ANCHORS
      : layout === 'wide' ? NINE_SEAT_WIDE_GAME_ANCHORS : NINE_SEAT_GAME_ANCHORS;
    const anchor = anchors[seat];
    if (!anchor) throw new Error(`Seat ${seat} is outside a ${seatCount}-seat lobby.`);
    return anchor;
  }
  const compactGameAnchors: Record<Exclude<MultiplayerSeatCount, 9>, Array<{ left: `${number}%`; top: `${number}%` }>> = {
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

/**
 * Nine-seat phone portrait uses an oval ring instead of squeezing five
 * plaques across one short edge. Two seats sit across the top, two down each
 * side, and three across the bottom with the viewer centered. This keeps the
 * board lane open while allowing a full-ring table without forcing the player
 * to rotate a phone.
 */
const NINE_SEAT_PHONE_PORTRAIT_GAME_ANCHORS: ReadonlyArray<{
  bottom?: `${number}%`;
  left: `${number}%`;
  top?: `${number}%`;
}> = [
  { bottom: '1%', left: '38%' },
  // Ring indices advance clockwise from the viewer: bottom-left, up the left
  // edge, across the top, down the right edge, then bottom-right. The lobby
  // preview consumes this exact map too, so starting a hand never mirrors the
  // people who were shown in the prepared room.
  { bottom: '1%', left: '1%' },
  { left: '1%', top: '58%' },
  { left: '1%', top: '24%' },
  { left: '22%', top: '1%' },
  { left: '56%', top: '1%' },
  { left: '76%', top: '24%' },
  { left: '76%', top: '58%' },
  { bottom: '1%', left: '72%' },
];

export function multiplayerNineSeatPhonePortraitAnchor(
  seat: number,
): { bottom?: `${number}%`; left: `${number}%`; top?: `${number}%` } {
  const anchor = NINE_SEAT_PHONE_PORTRAIT_GAME_ANCHORS[seat];
  if (!anchor) throw new Error(`Seat ${seat} is outside a nine-seat phone table.`);
  return anchor;
}

/** The prepared-room preview and live table must show one canonical clockwise
 * ring. Nine-seat portrait phones use the same oval anchor map on both
 * surfaces; other lobby layouts retain their adaptive lobby anchors. */
export function multiplayerLobbySeatAnchor(
  seatCount: MultiplayerSeatCount,
  seat: number,
  layout: MultiplayerSeatLayout = 'compact',
  ninePortraitPhone = false,
): { bottom?: `${number}%`; left: `${number}%`; top?: `${number}%` } {
  if (ninePortraitPhone) {
    if (seatCount !== 9) throw new Error('The nine-seat portrait ring requires exactly nine seats.');
    return multiplayerNineSeatPhonePortraitAnchor(seat);
  }
  return multiplayerSeatAnchor(seatCount, seat, layout, 'lobby');
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
