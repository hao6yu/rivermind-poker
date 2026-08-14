import type { TablePlayerCount } from '../../domain/poker/multiwaySession';
import type { MultiwaySeatAnchor } from './multiwayGameplayPresentation';

export interface MultiwayTableLayout {
  centerInsetPercent: 18 | 24 | 25;
  centerTopPercent: 30 | 34 | 38;
  compact: boolean;
  landscapeSixMax: boolean;
  phoneSixMax: boolean;
  tablet: boolean;
}

/**
 * Six-max needs its own information hierarchy on phones. Merely shrinking the
 * regular seat plaques makes everything fit, but it also pushes names, stacks,
 * and actions below a comfortable reading size.
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
  return {
    // Six-seat tables reserve a real center lane instead of allowing the side
    // plaques to share the same horizontal band as the board and status card.
    centerInsetPercent: tablet && playerCount === 6 ? 25 : phoneSixMax ? 24 : 18,
    centerTopPercent: phoneSixMax ? 38 : compact ? 30 : 34,
    compact,
    landscapeSixMax,
    phoneSixMax,
    tablet,
  };
}

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
 */
export function multiwaySeatAnchorStyle(
  anchor: MultiwaySeatAnchor,
  phoneSixMax: boolean,
  tablet = false,
): MultiwaySeatAnchorStyle {
  switch (anchor) {
    case 'top-left': return { left: phoneSixMax ? '0%' : '5%', top: phoneSixMax ? '1%' : tablet ? '11%' : '9%' };
    case 'top-center': return { left: tablet ? '41.5%' : '38%', top: '1%' };
    case 'top-right': return { right: phoneSixMax ? '0%' : '5%', top: phoneSixMax ? '1%' : tablet ? '11%' : '9%' };
    case 'mid-left': return { left: phoneSixMax ? '0%' : '3%', top: phoneSixMax ? '76%' : tablet ? '50%' : '43%' };
    case 'mid-right': return { right: phoneSixMax ? '0%' : '3%', top: phoneSixMax ? '76%' : tablet ? '50%' : '43%' };
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
  bubbles: Partial<Record<MultiwaySeatAnchor, MultiwayLayoutRect>>;
  center: MultiwayLayoutRect;
  seats: Record<MultiwaySeatAnchor, MultiwayLayoutRect>;
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
  const rectFor = (anchor: MultiwaySeatAnchor): MultiwayLayoutRect => {
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
  const compactBubble = (anchor: Exclude<MultiwaySeatAnchor, 'hero'>): MultiwayLayoutRect => {
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
