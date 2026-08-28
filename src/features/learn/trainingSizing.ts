/**
 * Pure training-layout sizing rules.
 *
 * The Learn screens used to shrink poker cards to the smallest available variant
 * on almost every phone, which made the primary scenario area the least readable
 * part of the screen. These rules pick the largest card variant that still fits
 * inside the padded card at the current viewport, and keep the table card's
 * minimum height proportional to the cards it now has to hold. Every rule is a
 * pure function of the viewport so the four supported phone widths and iPad can
 * be proven without rendering anything.
 */

export type TrainingCardSize = 'mini' | 'small' | 'medium' | 'compact' | 'regular';

export interface TrainingViewport {
  /** Logical (density-independent) viewport width in points. */
  width: number;
  /** Logical viewport height in points. */
  height: number;
}

/** Mirrors the `PlayingCard` variant boxes so the fit math below stays honest. */
export const TRAINING_CARD_BOX: Record<TrainingCardSize, { height: number; width: number }> = {
  regular: { width: 52, height: 74 },
  compact: { width: 44, height: 62 },
  medium: { width: 38, height: 54 },
  small: { width: 34, height: 48 },
  mini: { width: 29, height: 41 },
};

/** Variant order from largest to smallest; selection always starts at the top. */
const CARD_SIZE_ORDER: readonly TrainingCardSize[] = ['regular', 'compact', 'medium', 'small', 'mini'];

export const TABLET_MIN_WIDTH = 700;
/** Horizontal padding around scenario/trainer content plus the card's own padding. */
export const SCENARIO_ROW_H_GAP = 4;
/** `content` horizontal padding (18) + `tableCard` horizontal padding (15). */
const SCENARIO_INSET = 66;
/** Lesson/trainer example boxes sit inside a second padded card. */
const EXAMPLE_INSET = 72;
/** Phones whose vertical room is tight enough to keep the table card compact. */
const SHORT_VIEWPORT_HEIGHT = 720;
/** Tall phones and tablets may grow the table card without hiding the choices. */
const TALL_VIEWPORT_HEIGHT = 850;

function isTablet(width: number): boolean {
  return width >= TABLET_MIN_WIDTH;
}

/** True when the count of cards plus their gaps fits the available row width. */
function rowFits(size: TrainingCardSize, count: number, availableWidth: number, gap = SCENARIO_ROW_H_GAP): boolean {
  const box = TRAINING_CARD_BOX[size];
  return box.width * count + gap * (count - 1) <= availableWidth;
}

/** The largest variant that fits `count` cards in a padded row. */
function largestFittingSize(count: number, availableWidth: number, ceiling: TrainingCardSize): TrainingCardSize {
  const ceilingIndex = CARD_SIZE_ORDER.indexOf(ceiling);
  for (const size of CARD_SIZE_ORDER.slice(ceilingIndex)) {
    if (rowFits(size, count, availableWidth)) return size;
  }
  return 'mini';
}

/**
 * The five-card community board: the widest constraint in the scenario card. It
 * never drops below `medium`, and reaches full size on tablet and on a tall
 * large-phone viewport where the vertical room genuinely exists.
 */
export function scenarioBoardSize(viewport: TrainingViewport): TrainingCardSize {
  const available = viewport.width - SCENARIO_INSET;
  const ceiling: TrainingCardSize = isTablet(viewport.width)
    || (viewport.width >= 420 && viewport.height >= TALL_VIEWPORT_HEIGHT)
    ? 'regular'
    : 'compact';
  return largestFittingSize(5, available, ceiling);
}

/**
 * The hero hand is the decision the learner is making, so it is always at least
 * as large as the board and gets the full-size treatment earlier: only two cards
 * have to fit.
 */
export function scenarioHeroSize(viewport: TrainingViewport): TrainingCardSize {
  const board = scenarioBoardSize(viewport);
  const available = viewport.width - SCENARIO_INSET;
  const ceiling: TrainingCardSize = viewport.width >= 390 || isTablet(viewport.width) ? 'regular' : board;
  const largest = largestFittingSize(2, available, ceiling);
  // Never smaller than the board: the hero cards must not read as an afterthought.
  return CARD_SIZE_ORDER.indexOf(largest) <= CARD_SIZE_ORDER.indexOf(board) ? largest : board;
}

/**
 * Inline card examples inside lesson, trainer, and reference cards. They live in a
 * second padded box, so the fit math uses the tighter inset and a full-size
 * treatment only where there is real room.
 */
export function exampleCardSize(viewport: TrainingViewport): TrainingCardSize {
  const available = viewport.width - EXAMPLE_INSET;
  const ceiling: TrainingCardSize = isTablet(viewport.width) ? 'regular' : 'compact';
  return largestFittingSize(5, available, ceiling);
}

/**
 * The scenario card's minimum height grows with its cards so the opponent row,
 * board, and hero row keep breathing room instead of collapsing into each other.
 */
export function scenarioTableCardMinHeight(viewport: TrainingViewport): number {
  const hero = TRAINING_CARD_BOX[scenarioHeroSize(viewport)].height;
  const board = TRAINING_CARD_BOX[scenarioBoardSize(viewport)].height;
  // Rows + pot pill + progress/meta rows + the card's own vertical padding.
  const natural = hero + board * 2 + 116;
  if (viewport.height < SHORT_VIEWPORT_HEIGHT) {
    // Keep the first choices peeking above the fold on a short phone.
    return Math.min(natural, 268);
  }
  return natural;
}

/** The `PlayingCard` variant props matching one computed size. */
export interface PlayingCardSizeProps {
  compact: boolean;
  medium: boolean;
  mini: boolean;
  small: boolean;
}

/**
 * Translate a computed size into the props `PlayingCard` understands. `regular`
 * is that component's default, so it sets no variant flag.
 */
export function playingCardSizeProps(size: TrainingCardSize): PlayingCardSizeProps {
  return {
    compact: size === 'compact',
    medium: size === 'medium',
    mini: size === 'mini',
    small: size === 'small',
  };
}
