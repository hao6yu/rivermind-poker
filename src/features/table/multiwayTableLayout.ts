import type { TablePlayerCount } from '../../domain/poker/multiwaySession';
import type { MultiwaySeatAnchor } from './multiwayGameplayPresentation';

export interface MultiwayTableLayout {
  centerInsetPercent: 18 | 24 | 25;
  centerTopPercent: 30 | 34 | 38;
  compact: boolean;
  landscapeSixMax: boolean;
  phoneNineMax: boolean;
  phoneSixMax: boolean;
  tablet: boolean;
}

/**
 * Six-max needs its own information hierarchy on phones. Merely shrinking the
 * regular seat plaques makes everything fit, but it also pushes names, stacks,
 * and actions below a comfortable reading size.
 *
 * Nine-max reuses that dense hierarchy on an oval seat ring: two opponents
 * across the top, two down each flank, and two beside the hero along the
 * bottom, so the board lane stays plaque-free at the compact felt floor.
 */
export function multiwayTableLayout(
  width: number,
  height: number,
  playerCount: TablePlayerCount,
): MultiwayTableLayout {
  const compact = height < 730 || width < 370;
  const landscapeSixMax = playerCount === 6 && width > height;
  const phoneSixMax = playerCount === 6 && width < 500 && !landscapeSixMax;
  const tablet = Math.min(width, height) >= 700;
  // The roomy nine-seat ring rows plaques vertically and only fits a tall
  // table; a landscape tablet (or any landscape surface) falls back to the
  // dense phone ring, which scales cleanly on its wide, short felt.
  const phoneNineMax = playerCount === 9 && !(tablet && height >= width);
  return {
    // Six- and nine-seat tables reserve a real center lane instead of allowing
    // the side plaques to share the same horizontal band as the board and
    // status card.
    centerInsetPercent: tablet && (playerCount === 6 || playerCount === 9)
      ? 25
      : phoneSixMax || phoneNineMax ? 24 : 18,
    centerTopPercent: phoneSixMax || phoneNineMax ? 38 : compact ? 30 : 34,
    compact,
    landscapeSixMax,
    phoneNineMax,
    phoneSixMax,
    tablet,
  };
}

/**
 * Each table shape places only its own band of anchors: six-max uses two rows
 * plus the flanks, the nine-seat ring uses edges and corners. They share the
 * `MultiwaySeatAnchor` vocabulary but neither layout positions every member of
 * it, so each geometry function is keyed by the anchors it actually places
 * rather than padded with rects for seats it never deals to.
 */
export type MultiwaySixMaxSeatAnchor =
  | 'hero' | 'mid-left' | 'mid-right' | 'top-center' | 'top-left' | 'top-right';
export type MultiwaySixMaxOpponentAnchor = Exclude<MultiwaySixMaxSeatAnchor, 'hero'>;
export type MultiwayNineSeatRingAnchor =
  | 'hero' | 'top-left' | 'top-right'
  | 'upper-left' | 'upper-right' | 'lower-left' | 'lower-right'
  | 'bottom-left' | 'bottom-right';
export type MultiwayNineSeatOpponentAnchor = Exclude<MultiwayNineSeatRingAnchor, 'hero'>;

export interface MultiwaySeatAnchorStyle {
  bottom?: `${number}%`;
  left?: `${number}%`;
  right?: `${number}%`;
  top?: `${number}%`;
}

/**
 * Six-max phones use two explicit seat rows. This leaves a narrow feedback
 * lane below the top row and keeps the board clear even at the runtime 295pt
 * felt minimum.
 *
 * Nine-seat tables (`nineSeat`) instead distribute eight opponents around an
 * oval ring — two on the top edge, two per flank, two on the bottom edge
 * beside the hero — because no fifth horizontal band fits between the board
 * and the bottom edge at the compact felt floor. The phone ring keeps every
 * band outside the reserved center lane; the tablet ring widens the plaques
 * and pulls the flanks outside a 25% inset.
 */
export function multiwaySeatAnchorStyle(
  anchor: MultiwaySeatAnchor,
  phoneSixMax: boolean,
  tablet = false,
  nineSeat = false,
): MultiwaySeatAnchorStyle {
  if (nineSeat) {
    if (tablet) {
      switch (anchor) {
        case 'top-left': return { left: '5%', top: '11%' };
        case 'top-right': return { right: '5%', top: '11%' };
        case 'upper-left': return { left: '2%', top: '30%' };
        case 'upper-right': return { right: '2%', top: '30%' };
        case 'lower-left': return { left: '2%', top: '56%' };
        case 'lower-right': return { right: '2%', top: '56%' };
        case 'bottom-left': return { left: '2%', bottom: '2%' };
        case 'bottom-right': return { right: '2%', bottom: '2%' };
        case 'hero': return { bottom: '2%', left: '41.5%' };
        case 'top-center': return { left: '41.5%', top: '1%' };
        case 'mid-left': return { left: '3%', top: '50%' };
        case 'mid-right': return { right: '3%', top: '50%' };
      }
    }
    switch (anchor) {
      case 'top-left': return { left: '0%', top: '1%' };
      case 'top-right': return { right: '0%', top: '1%' };
      case 'upper-left': return { left: '0%', top: '19%' };
      case 'upper-right': return { right: '0%', top: '19%' };
      case 'lower-left': return { left: '0%', top: '60.5%' };
      case 'lower-right': return { right: '0%', top: '60.5%' };
      case 'bottom-left': return { left: '0%', bottom: '1%' };
      case 'bottom-right': return { right: '0%', bottom: '1%' };
      case 'hero': return { bottom: '1%', left: '37%' };
      case 'top-center': return { left: '38%', top: '1%' };
      case 'mid-left': return { left: '0%', top: '19%' };
      case 'mid-right': return { right: '0%', top: '19%' };
    }
  }
  switch (anchor) {
    case 'top-left': return { left: phoneSixMax ? '0%' : '5%', top: phoneSixMax ? '1%' : tablet ? '11%' : '9%' };
    case 'top-center': return { left: tablet ? '41.5%' : '38%', top: '1%' };
    case 'top-right': return { right: phoneSixMax ? '0%' : '5%', top: phoneSixMax ? '1%' : tablet ? '11%' : '9%' };
    case 'mid-left': return { left: phoneSixMax ? '0%' : '3%', top: phoneSixMax ? '76%' : tablet ? '50%' : '43%' };
    case 'mid-right': return { right: phoneSixMax ? '0%' : '3%', top: phoneSixMax ? '76%' : tablet ? '50%' : '43%' };
    case 'upper-left': return { left: '0%', top: '19%' };
    case 'upper-right': return { right: '0%', top: '19%' };
    case 'lower-left': return { left: '0%', top: '60.5%' };
    case 'lower-right': return { right: '0%', top: '60.5%' };
    case 'bottom-left': return { left: '0%', bottom: '1%' };
    case 'bottom-right': return { right: '0%', bottom: '1%' };
    case 'hero': return { bottom: '2%', left: tablet ? '41.5%' : '37%' };
  }
}

export interface MultiwayLayoutRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/**
 * Pixel envelopes used by the layout tests. They intentionally model the
 * rendered seat, including its cards, rather than only the plaque. Keeping the
 * calculation beside the percentage anchors makes future visual tuning prove
 * that the reserved board lane still clears every six-max seat.
 */
export function multiwaySixMaxGeometry(
  feltWidth: number,
  feltHeight: number,
  phoneSixMax: boolean,
  tablet: boolean,
): {
  bubbles: Partial<Record<MultiwaySixMaxOpponentAnchor, MultiwayLayoutRect>>;
  center: MultiwayLayoutRect;
  seats: Record<MultiwaySixMaxSeatAnchor, MultiwayLayoutRect>;
} {
  const layout = {
    centerInsetPercent: tablet ? 25 : phoneSixMax ? 24 : 18,
    centerTopPercent: phoneSixMax ? 38 : 34,
  } as const;
  const opponentWidth = tablet ? 144 : phoneSixMax ? 88 : 100;
  const opponentHeight = tablet ? 138 : phoneSixMax ? 67 : 108;
  const heroWidth = tablet ? 144 : 91;
  const heroHeight = tablet ? 134 : phoneSixMax ? 100 : 112;
  const centerHeight = tablet ? 180 : phoneSixMax ? 70 : 160;
  const pct = (value: `${number}%`, total: number) => Number.parseFloat(value) * total / 100;
  const rectFor = (anchor: MultiwaySixMaxSeatAnchor): MultiwayLayoutRect => {
    const style = multiwaySeatAnchorStyle(anchor, phoneSixMax, tablet);
    const hero = anchor === 'hero';
    const width = hero ? heroWidth : opponentWidth;
    const height = hero ? heroHeight : opponentHeight;
    const left = style.left !== undefined
      ? pct(style.left, feltWidth)
      : feltWidth - pct(style.right ?? '0%', feltWidth) - width;
    const top = style.top !== undefined
      ? pct(style.top, feltHeight)
      : feltHeight - pct(style.bottom ?? '0%', feltHeight) - height;
    return { bottom: top + height, left, right: left + width, top };
  };
  const centerWidth = phoneSixMax ? Math.min(feltWidth, 178) : feltWidth * (1 - layout.centerInsetPercent * 2 / 100);
  const centerLeft = (feltWidth - centerWidth) / 2;
  const centerTop = feltHeight * layout.centerTopPercent / 100;
  const seats = {
    hero: rectFor('hero'),
    'mid-left': rectFor('mid-left'),
    'mid-right': rectFor('mid-right'),
    'top-center': rectFor('top-center'),
    'top-left': rectFor('top-left'),
    'top-right': rectFor('top-right'),
  };
  const compactBubble = (anchor: MultiwaySixMaxOpponentAnchor): MultiwayLayoutRect => {
    const seat = seats[anchor];
    const topRow = anchor.startsWith('top-');
    const top = topRow ? seat.bottom + 4 : seat.top - 40;
    return { bottom: top + 36, left: seat.left, right: seat.left + 88, top };
  };
  return {
    bubbles: phoneSixMax ? {
      'mid-left': compactBubble('mid-left'),
      'mid-right': compactBubble('mid-right'),
      'top-center': compactBubble('top-center'),
      'top-left': compactBubble('top-left'),
      'top-right': compactBubble('top-right'),
    } : {},
    center: {
      bottom: centerTop + centerHeight,
      left: centerLeft,
      right: centerLeft + centerWidth,
      top: centerTop,
    },
    seats,
  };
}

export function multiwayRectsOverlap(a: MultiwayLayoutRect, b: MultiwayLayoutRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Slice 3.11E — the one measured layout contract.
 *
 * Every table-bearing surface (setup, lobby, live, result) resolves its
 * geometry from the space actually allocated to it — never from raw window
 * width alone. The resolver is pure: it consumes the measured content
 * rectangle plus the environment facts and returns pixel rectangles the
 * renderer must honor, so collision tests can reject overlaps without a
 * React Native harness.
 * ──────────────────────────────────────────────────────────────────────────── */

export type MeasuredTableSurface = 'setup' | 'lobby' | 'live' | 'result';

/** How the activity/action information is presented next to the felt. */
export type MeasuredActivityFeedMode = 'hidden' | 'inline' | 'rail';

export type MeasuredPlaqueDensity = 'regular' | 'dense' | 'compact';

export interface MeasuredSafeAreaInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface MeasuredTableLayoutInput {
  /** The measured content rectangle INSIDE the screen chrome (headers,
   * sticky bottom actions, and the outer padding are already subtracted by
   * the caller's flex/onLayout measurement). */
  contentWidth: number;
  contentHeight: number;
  insets: MeasuredSafeAreaInsets;
  orientation: 'landscape' | 'portrait';
  seatCount: TablePlayerCount;
  surface: MeasuredTableSurface;
  activityFeedMode: MeasuredActivityFeedMode;
  /** Accessibility text scale, 1 = default. Larger scales collapse secondary
   * metadata instead of clipping plaques. */
  textScale: number;
}

export interface MeasuredSeatPlacement {
  anchor: string;
  /** Canonical ring slot: 0 is the viewer's seat; 1..n−1 follow clockwise. */
  ringIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MeasuredActivityRail {
  mode: 'inline' | 'side';
  /** Pixel bounds within the content rectangle; null for mode 'inline',
   * which renders below the felt pane instead of beside it. */
  rect: MultiwayLayoutRect | null;
}

export type MeasuredPaneRect = MultiwayLayoutRect & { height: number; width: number };

export interface MeasuredTableLayoutResult {
  aspectRatio: number;
  /** The protected board/status rectangle on the felt; null for lobby/setup,
   * whose status copy lives in the info hierarchy, never on the seat map. */
  boardRect: MultiwayLayoutRect | null;
  collapseSecondary: boolean;
  composition: 'landscape-two-pane' | 'portrait-stack';
  insets: MeasuredSafeAreaInsets;
  orientation: 'landscape' | 'portrait';
  pane: MeasuredPaneRect;
  plaqueDensity: MeasuredPlaqueDensity;
  rail: MeasuredActivityRail;
  seatCount: TablePlayerCount;
  seats: MeasuredSeatPlacement[];
  surface: MeasuredTableSurface;
  textScale: number;
}

/**
 * The seating ring as vertical BANDS (top → bottom) of anchors sharing one
 * row. Band centers derive from the measured pane and the plaque height, so
 * short felts compress the ring instead of clipping it, and every seat count
 * shares one adaptive ring model.
 */
const MEASURED_RING_BANDS: Record<TablePlayerCount, ReadonlyArray<readonly string[]>> = {
  2: [['top-center'], ['hero']],
  3: [['top-left', 'top-right'], ['hero']],
  6: [['top-left', 'top-center', 'top-right'], ['mid-left', 'mid-right'], ['hero']],
  9: [
    ['top-left', 'top-right'],
    ['upper-left', 'upper-right'],
    ['lower-left', 'lower-right'],
    ['bottom-left', 'hero', 'bottom-right'],
  ],
};

/** Horizontal ring centers as a fraction of the pane width, keyed by anchor. */
const MEASURED_RING_CX: Record<string, number> = {
  'bottom-left': 0.19,
  'bottom-right': 0.81,
  hero: 0.5,
  'lower-left': 0.055,
  'lower-right': 0.945,
  'mid-left': 0.07,
  'mid-right': 0.93,
  'top-center': 0.5,
  'top-left': 0.16,
  'top-right': 0.84,
  'upper-left': 0.055,
  'upper-right': 0.945,
};

/**
 * A ring anchor's effective horizontal center. Edge anchors tuck inward on
 * narrow panes so even the widest candidate plaque keeps a margin inside the
 * felt — the ring adapts to the measurement instead of clipping.
 */
function measuredAnchorCx(anchor: string, paneWidth: number, plaqueWidth: number): number {
  const base = MEASURED_RING_CX[anchor] ?? 0.5;
  const margin = plaqueWidth / 2 / paneWidth + 2 / paneWidth;
  if (base < 0.5) return Math.max(base, margin);
  if (base > 0.5) return Math.min(base, 1 - margin);
  return base;
}

/** Canonical ring-slot order per seat count: 0 is the viewer's seat, the rest
 * proceed clockwise around the felt. */
const MEASURED_RING_ORDER: Record<TablePlayerCount, ReadonlyArray<string>> = {
  2: ['hero', 'top-center'],
  3: ['hero', 'top-left', 'top-right'],
  6: ['hero', 'mid-left', 'top-left', 'top-center', 'top-right', 'mid-right'],
  9: [
    'hero',
    'bottom-left', 'lower-left', 'upper-left', 'top-left',
    'top-right', 'upper-right', 'lower-right', 'bottom-right',
  ],
};

/** Base plaque footprints per density, before surface and text-scale tuning. */
const MEASURED_DENSITY_SIZES: Record<MeasuredPlaqueDensity, { height: number; width: number }> = {
  regular: { height: 100, width: 128 },
  dense: { height: 78, width: 100 },
  compact: { height: 58, width: 88 },
};

const MEASURED_BOARD_INSET = 24;
/** The protected board lane never narrows below this readable width. */
const MEASURED_BOARD_MIN_WIDTH = 176;
/** Minimum horizontal breathing room between two plaques and around the board. */
const MEASURED_SEAT_GAP = 4;
/** The side rail's tested proportional range and readable bounds (scope 3.11E:
 * a true two-pane landscape whose rail never selects plaques from raw width). */
const MEASURED_RAIL_MIN_WIDTH = 200;
const MEASURED_RAIL_MAX_WIDTH = 400;
const MEASURED_RAIL_WIDTH_RATIO = 0.32;
const MEASURED_RAIL_GAP = 12;
/** Inline (below-felt) lane for the action buttons plus the collapsed feed. */
const MEASURED_INLINE_LANE_BASE = 132;

function measuredClamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The felt's bounded aspect ratio keeps portrait tables from stretching into
 * surplus height and landscape felts from becoming slivers. */
const MEASURED_ASPECT = {
  landscape: { ideal: 1.85, max: 2.4, min: 1.5 },
  portrait: { ideal: 1.2, max: 1.5, min: 0.95 },
} as const;

/**
 * Resolve one deterministic measured layout. Throws on impossible inputs so a
 * broken measurement surfaces loudly instead of silently mis-seating players.
 */
export function resolveMeasuredTableLayout(input: MeasuredTableLayoutInput): MeasuredTableLayoutResult {
  const { contentWidth, contentHeight, insets, orientation, seatCount, surface, activityFeedMode, textScale } = input;
  if (!Number.isFinite(contentWidth) || !Number.isFinite(contentHeight) || contentWidth <= 0 || contentHeight <= 0) {
    throw new Error('The measured content rectangle must be positive and finite.');
  }
  if (!MEASURED_RING_BANDS[seatCount]) throw new Error(`Unsupported table seat count ${seatCount}.`);
  if (!Number.isFinite(textScale) || textScale < 1) throw new Error('The text scale must be a finite value of at least 1.');
  if (Object.values(insets).some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Safe-area insets must be non-negative and finite.');
  }

  // 1. Landscape two-pane: the rail takes its share FIRST; the felt receives
  // the remaining width. Plaques are sized from this post-rail pane, never
  // from the raw window.
  const sideRailWanted = orientation === 'landscape' && activityFeedMode === 'rail' && surface !== 'setup' && surface !== 'lobby';
  const railWidth = sideRailWanted
    ? measuredClamp(Math.round(contentWidth * MEASURED_RAIL_WIDTH_RATIO), MEASURED_RAIL_MIN_WIDTH, MEASURED_RAIL_MAX_WIDTH)
    : 0;
  const availableWidth = contentWidth - insets.left - insets.right;
  let paneWidth = sideRailWanted ? availableWidth - railWidth - MEASURED_RAIL_GAP : availableWidth;
  let composition: MeasuredTableLayoutResult['composition'] = sideRailWanted ? 'landscape-two-pane' : 'portrait-stack';
  // A felt narrower than its readable floor cannot host the two-pane split:
  // the rail falls back inline and secondary metadata collapses instead.
  const feltFloor = 264;
  let sideRail = sideRailWanted;
  if (sideRail && paneWidth < feltFloor) {
    sideRail = false;
    composition = 'portrait-stack';
    paneWidth = availableWidth;
  }

  // 2. Vertical budget: live/result reserve the inline action lane below the
  // felt; setup/lobby callers already measured around their sticky actions.
  const inlineLane = !sideRail && (surface === 'live' || surface === 'result') && activityFeedMode !== 'hidden'
    ? Math.round(MEASURED_INLINE_LANE_BASE + measuredClamp((textScale - 1) * 24, 0, 48))
    : 0;
  const availableHeight = contentHeight - insets.top - insets.bottom - inlineLane;
  const aspectBounds = MEASURED_ASPECT[orientation];
  const idealHeight = paneWidth / aspectBounds.ideal;
  const paneHeight = Math.max(0, Math.min(availableHeight, idealHeight));
  const paneTop = insets.top + Math.max(0, (availableHeight - paneHeight) / 2);
  const paneLeft = insets.left;
  const pane: MeasuredPaneRect = {
    bottom: paneTop + paneHeight,
    height: paneHeight,
    left: paneLeft,
    right: paneLeft + paneWidth,
    top: paneTop,
    width: paneWidth,
  };

  // 3. Protected center rectangle: live/result reserve a real board lane;
  // lobby/setup keep status copy in the info hierarchy so no seat can ever
  // overlap it (scope issue 10). The lane's horizontal corridor is DERIVED
  // from the chosen seat ring — the flank plaques define it — so the board
  // can never sit under a seat at any measured size.
  const needsBoard = surface === 'live' || surface === 'result';

  // 4. Plaque sizing: the ring's band centers derive from the plaque height,
  // so try densities top-down; each must fit its horizontal lane and vertical
  // bands without touching a neighbor or the board. A final shrink loop
  // guarantees a collision-free fit on even the shortest measured felt.
  const bands = MEASURED_RING_BANDS[seatCount];
  const surfaceFactor = surface === 'setup' || surface === 'lobby' ? 0.92 : 1;
  const widthScale = Math.min(textScale, 1.12);
  const heightScale = Math.min(textScale, 1.35);
  // Large accessibility text scales collapse the plaque's secondary metadata
  // instead of letting the ring clip.
  const collapseSecondary = textScale >= 1.6;
  let chosen: { corridor: { left: number; right: number }; density: MeasuredPlaqueDensity; height: number; width: number } | null = null;
  for (const density of ['regular', 'dense', 'compact'] as const) {
    const size = MEASURED_DENSITY_SIZES[density];
    const width = Math.round(size.width * surfaceFactor * widthScale);
    const height = Math.round(size.height * surfaceFactor * heightScale);
    const fit = measuredRingFit(bands, paneWidth, paneHeight, width, height, needsBoard ? 'required' : 'none');
    if (fit) {
      chosen = { corridor: fit, density, height, width };
      break;
    }
  }
  if (!chosen) {
    // Guarantee a fit: compact plaques shrink toward the measured bands. The
    // ring geometry stays intact; only the secondary metadata inside collapses.
    const size = MEASURED_DENSITY_SIZES.compact;
    for (let scale = 1; scale >= 0.2 && !chosen; scale = Math.round((scale - 0.05) * 100) / 100) {
      const width = Math.round(size.width * surfaceFactor * widthScale * scale);
      const height = Math.round(size.height * surfaceFactor * heightScale * scale);
      const fit = measuredRingFit(bands, paneWidth, paneHeight, width, height, needsBoard ? 'required' : 'none');
      if (fit) chosen = { corridor: fit, density: 'compact', height, width };
    }
    if (!chosen) {
      // Degenerate pane: force the minimum footprint so the renderer still
      // receives finite, ring-consistent geometry; the board lane degrades to
      // whatever corridor the minimum ring leaves instead of overlapping it.
      const width = Math.max(40, Math.round(size.width * surfaceFactor * 0.2));
      const height = Math.max(18, Math.round(size.height * surfaceFactor * 0.2));
      const fit = measuredRingFit(bands, paneWidth, paneHeight, width, height, 'degraded')
        ?? { left: MEASURED_BOARD_INSET, right: Math.max(MEASURED_BOARD_INSET + 1, paneWidth - MEASURED_BOARD_INSET) };
      chosen = { corridor: fit, density: 'compact', height, width };
    }
  }

  // Ring centers: horizontal from the anchor map, vertical from the adaptive
  // bands (top band hugs the top edge, bottom band the bottom edge, middle
  // bands spread evenly between them).
  const bandCenters = bands.map((_, bandIndex) => {
    const last = bands.length - 1;
    if (bandIndex === 0) return chosen!.height / 2 + MEASURED_SEAT_GAP;
    if (bandIndex === last) return paneHeight - chosen!.height / 2 - MEASURED_SEAT_GAP;
    const top = chosen!.height / 2 + MEASURED_SEAT_GAP;
    const bottom = paneHeight - chosen!.height / 2 - MEASURED_SEAT_GAP;
    return top + (bottom - top) * bandIndex / last;
  });
  const anchorToCenter = new Map<string, { cx: number; cy: number }>();
  bands.forEach((band, bandIndex) => {
    for (const anchor of band) {
      anchorToCenter.set(anchor, { cx: measuredAnchorCx(anchor, paneWidth, chosen!.width), cy: bandCenters[bandIndex]! });
    }
  });

  const seats: MeasuredSeatPlacement[] = MEASURED_RING_ORDER[seatCount].map((anchor, ringIndex) => {
    const center = anchorToCenter.get(anchor)!;
    return {
      anchor,
      height: chosen!.height,
      ringIndex,
      width: chosen!.width,
      x: Math.round(paneLeft + center.cx * paneWidth - chosen!.width / 2),
      y: Math.round(paneTop + center.cy - chosen!.height / 2),
    };
  });

  const boardRect = needsBoard
    ? {
        bottom: pane.top + paneHeight * 0.68,
        left: pane.left + chosen.corridor.left,
        right: pane.left + chosen.corridor.right,
        top: pane.top + paneHeight * 0.3,
      }
    : null;

  return {
    aspectRatio: paneHeight > 0 ? paneWidth / paneHeight : aspectBounds.max,
    boardRect,
    collapseSecondary: collapseSecondary || chosen.density === 'compact',
    composition,
    insets,
    orientation,
    pane,
    plaqueDensity: chosen.density,
    rail: {
      mode: sideRail ? 'side' : 'inline',
      rect: sideRail ? {
        bottom: contentHeight - insets.bottom,
        left: pane.right + MEASURED_RAIL_GAP,
        right: contentWidth - insets.right,
        top: insets.top,
      } : null,
    },
    seatCount,
    seats,
    surface,
    textScale,
  };
}

/**
 * Whether every plaque at this size clears its neighbors, with the ring's
 * vertical bands derived from the plaque height itself. When the surface
 * needs a protected board lane, the function also derives the horizontal
 * corridor the ring leaves free across the board's vertical band and requires
 * it to stay readable; the returned corridor is pane-relative.
 */
function measuredRingFit(
  bands: ReadonlyArray<readonly string[]>,
  paneWidth: number,
  paneHeight: number,
  plaqueWidth: number,
  plaqueHeight: number,
  boardMode: 'degraded' | 'none' | 'required',
): { left: number; right: number } | null {
  const gap = MEASURED_SEAT_GAP;
  const bandCenters = bands.map((_, bandIndex) => {
    const last = bands.length - 1;
    if (bandIndex === 0) return plaqueHeight / 2 + gap;
    if (bandIndex === last) return paneHeight - plaqueHeight / 2 - gap;
    const top = plaqueHeight / 2 + gap;
    const bottom = paneHeight - plaqueHeight / 2 - gap;
    return top + (bottom - top) * bandIndex / last;
  });
  const rects: Array<{ anchor: string; rect: MultiwayLayoutRect }> = [];
  bands.forEach((band, bandIndex) => {
    for (const anchor of band) {
      const cx = measuredAnchorCx(anchor, paneWidth, plaqueWidth);
      const cy = bandCenters[bandIndex]!;
      rects.push({
        anchor,
        rect: {
          bottom: cy + plaqueHeight / 2,
          left: cx * paneWidth - plaqueWidth / 2,
          right: cx * paneWidth + plaqueWidth / 2,
          top: cy - plaqueHeight / 2,
        },
      });
    }
  });
  for (const { rect } of rects) {
    if (rect.left < 0 || rect.top < 0 || rect.right > paneWidth || rect.bottom > paneHeight) return null;
  }
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (multiwayRectsOverlap(
        {
          bottom: rects[i]!.rect.bottom + gap,
          left: rects[i]!.rect.left - gap,
          right: rects[i]!.rect.right + gap,
          top: rects[i]!.rect.top - gap,
        },
        rects[j]!.rect,
      )) return null;
    }
  }
  if (boardMode === 'none') return { left: MEASURED_BOARD_INSET, right: paneWidth - MEASURED_BOARD_INSET };
  // Derive the board corridor from the seats that vertically overlap the
  // board band: left-side seats bound it from the left, right-side from the
  // right, and a seat covering the centerline makes the lane impossible.
  const boardTop = paneHeight * 0.3;
  const boardBottom = paneHeight * 0.68;
  let corridorLeft = MEASURED_BOARD_INSET;
  let corridorRight = paneWidth - MEASURED_BOARD_INSET;
  for (const { anchor, rect } of rects) {
    if (rect.bottom <= boardTop || rect.top >= boardBottom) continue;
    const cx = measuredAnchorCx(anchor, paneWidth, plaqueWidth);
    if (Math.abs(cx * paneWidth - paneWidth / 2) < plaqueWidth / 2 + gap) return null;
    if (cx < 0.5) corridorLeft = Math.max(corridorLeft, rect.right + gap);
    else corridorRight = Math.min(corridorRight, rect.left - gap);
  }
  if (boardMode === 'required' && corridorRight - corridorLeft < MEASURED_BOARD_MIN_WIDTH) return null;
  // Degenerate panes can gap-adjacent the flanks; never emit an inverted rect.
  return { left: corridorLeft, right: Math.max(corridorRight, corridorLeft) };
}

/**
 * Pixel envelopes for the nine-seat oval ring, mirroring
 * `multiwaySixMaxGeometry`. Phone plaques are label-only (the hole-card
 * back chip lives inside the label) because five card-bearing bands cannot
 * fit above the 350pt felt floor, and their action feedback is an inline
 * line inside the plaque rather than an external bubble — so `bubbles` is
 * empty on phones. Tablets keep the larger plaques and report external
 * bubbles above each flank and bottom seat.
 */
export function multiwayNineSeatGeometry(
  feltWidth: number,
  feltHeight: number,
  phoneNineMax: boolean,
  tablet: boolean,
): {
  bubbles: Partial<Record<MultiwayNineSeatOpponentAnchor, MultiwayLayoutRect>>;
  center: MultiwayLayoutRect;
  seats: Record<MultiwayNineSeatRingAnchor, MultiwayLayoutRect>;
} {
  const layout = {
    centerInsetPercent: tablet ? 25 : 24,
    centerTopPercent: 38,
  } as const;
  const opponentWidth = tablet ? 144 : 88;
  const opponentHeight = tablet ? 138 : 58;
  const heroWidth = tablet ? 144 : 91;
  const heroHeight = tablet ? 134 : 80;
  const centerHeight = tablet ? 180 : 70;
  const pct = (value: `${number}%`, total: number) => Number.parseFloat(value) * total / 100;
  const rectFor = (anchor: MultiwayNineSeatRingAnchor): MultiwayLayoutRect => {
    const style = multiwaySeatAnchorStyle(anchor, phoneNineMax, tablet, true);
    const hero = anchor === 'hero';
    const width = hero ? heroWidth : opponentWidth;
    const height = hero ? heroHeight : opponentHeight;
    const left = style.left !== undefined
      ? pct(style.left, feltWidth)
      : feltWidth - pct(style.right ?? '0%', feltWidth) - width;
    const top = style.top !== undefined
      ? pct(style.top, feltHeight)
      : feltHeight - pct(style.bottom ?? '0%', feltHeight) - height;
    return { bottom: top + height, left, right: left + width, top };
  };
  const ringAnchors = [
    'top-left',
    'top-right',
    'upper-left',
    'upper-right',
    'lower-left',
    'lower-right',
    'bottom-left',
    'bottom-right',
  ] as const;
  const centerWidth = feltWidth * (1 - layout.centerInsetPercent * 2 / 100);
  const centerLeft = (feltWidth - centerWidth) / 2;
  const centerTop = feltHeight * layout.centerTopPercent / 100;
  const seats = {
    hero: rectFor('hero'),
    'top-left': rectFor('top-left'),
    'top-right': rectFor('top-right'),
    'upper-left': rectFor('upper-left'),
    'upper-right': rectFor('upper-right'),
    'lower-left': rectFor('lower-left'),
    'lower-right': rectFor('lower-right'),
    'bottom-left': rectFor('bottom-left'),
    'bottom-right': rectFor('bottom-right'),
  };
  const ringBubble = (anchor: typeof ringAnchors[number]): MultiwayLayoutRect => {
    const seat = seats[anchor];
    // The four flank plaques share their horizontal band with the board lane,
    // so their tablet bubble stays inside the flank gutter instead of reaching
    // across the felt; the top and edge plaques keep the wider report.
    const flank = anchor.startsWith('upper') || anchor.startsWith('lower');
    const width = tablet ? (flank ? 140 : 190) : 88;
    const left = anchor.endsWith('right') ? seat.right - width : seat.left;
    // Every ring bubble reports above its plaque, away from the bottom edge.
    const top = seat.top - 50;
    return { bottom: top + 46, left, right: left + width, top };
  };
  return {
    bubbles: phoneNineMax ? {} : Object.fromEntries(
      ringAnchors.map((anchor) => [anchor, ringBubble(anchor)]),
    ) as Partial<Record<MultiwayNineSeatOpponentAnchor, MultiwayLayoutRect>>,
    center: {
      bottom: centerTop + centerHeight,
      left: centerLeft,
      right: centerLeft + centerWidth,
      top: centerTop,
    },
    seats,
  };
}
