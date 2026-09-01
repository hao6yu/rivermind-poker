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
