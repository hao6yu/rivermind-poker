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
