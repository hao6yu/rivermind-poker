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
  compact: 58,
  dense: 96,
  regular: 154,
};
