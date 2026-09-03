/**
 * Presentation rules shared by every multi-seat live table.
 *
 * A seat always reads from the player toward the felt: identity plaque first,
 * then the player's two cards. AI and winner state are boundary treatments,
 * never inline badges that can cover a name.
 */

export const SHARED_TABLE_SEAT_CONTENT_ORDER = ['plaque', 'cards'] as const;

export type SharedTableSeatDensity = 'compact' | 'dense' | 'regular';

export interface SharedTableSeatVisualTreatment {
  borderStyle: 'solid' | 'dashed';
  inlineAiLabel: false;
  inlineWinnerIcon: false;
  tone: 'default' | 'winner';
}

export function sharedTableSeatVisualTreatment(
  playerKind: 'human' | 'ai',
  winner: boolean,
): SharedTableSeatVisualTreatment {
  return {
    borderStyle: playerKind === 'ai' ? 'dashed' : 'solid',
    inlineAiLabel: false,
    inlineWinnerIcon: false,
    tone: winner ? 'winner' : 'default',
  };
}

/** The PlayingCard size variants a seat's density maps to. */
export type SharedTableCardTier = 'regular' | 'compact' | 'medium' | 'small' | 'mini' | 'micro';

/** The card tier each seat density renders (the hero may upgrade one tier). */
export function sharedTableDensityCardTier(
  density: SharedTableSeatDensity,
  tablet: boolean,
): SharedTableCardTier {
  if (density === 'regular') return tablet ? 'medium' : 'compact';
  if (density === 'dense') return 'mini';
  return 'micro';
}

/** Card tier pixel heights — the layout derives the hero envelope delta. */
export const SHARED_TABLE_CARD_HEIGHT: Record<SharedTableCardTier, number> = {
  regular: 74,
  compact: 62,
  medium: 54,
  small: 48,
  mini: 41,
  micro: 26,
};

/** Card tier pixel widths. */
export const SHARED_TABLE_CARD_WIDTH: Record<SharedTableCardTier, number> = {
  regular: 52,
  compact: 44,
  medium: 38,
  small: 34,
  mini: 29,
  micro: 20,
};

/**
 * P18-015: the hero's card tier sits exactly one step above its ring
 * density's tier, so the hero's cards are strictly the largest at the table
 * while the seat frame (and its lane width) stays unchanged — a full-size
 * upgrade widened the hero past the nine-seat flanks and clipped the cards
 * on the phone felt (found in device verification).
 */
export function multiwayHeroCardTier(
  density: SharedTableSeatDensity,
  tablet: boolean,
): SharedTableCardTier {
  if (density === 'regular') return 'regular';
  if (density === 'dense') return 'small';
  return 'mini';
}

/** Full rendered seat envelopes: identity plaque + gap + two-card row. */
export const SHARED_TABLE_SEAT_HEIGHT: Record<SharedTableSeatDensity, number> = {
  // A compact plaque is allowed to grow beyond its nominal 28pt minimum once
  // localized name/stack text and the avatar establish their intrinsic
  // height. Reserve the measured 72pt envelope (plaque + gap + 26pt cards)
  // so an active/scaled viewer seat cannot be clipped by the felt edge.
  compact: 72,
  dense: 96,
  regular: 154,
};
