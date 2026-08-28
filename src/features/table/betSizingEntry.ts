/**
 * Exact, direct bet/raise entry shared by heads-up, local multiway, and private
 * multiplayer sizing sheets.
 *
 * The field shows whatever the player is typing so it can be edited, but the
 * amount ever submitted is produced by exactly one pure path: parse the draft,
 * then normalize it through the engine-provided legal raise-to bounds. Nothing
 * in a React component guesses a legal amount, and every caller submits the
 * normalized value, so "never submit an illegal amount" is a property of the
 * helper rather than of each screen.
 *
 * The value a player types is always a raise-**to** / bet-**to** total, matching
 * the presets and the increment controls — never the number of chips added on
 * top of the current bet.
 */

import { clampRaiseTarget } from './gameplayPresentation';

/** Legal raise-to bounds, as provided by the poker engine for the current street. */
export interface BetSizingBounds {
  minRaiseTo: number;
  maxRaiseTo: number;
}

export type BetSizingHint =
  /** The draft is a legal whole-number raise-to amount. */
  | 'legal'
  /** The draft is empty — prompt the player to enter an amount. */
  | 'empty'
  /** The draft is not a whole number — prompt for a number, leave the amount unchanged. */
  | 'invalid'
  /** The draft is a number but outside the legal range — clamp it to the range on commit. */
  | 'clamped';

export interface BetSizingInputResult {
  /** The raw draft text, preserved while editing so the player can still correct it. */
  raw: string;
  /** The parsed whole number, or null when the draft is empty or not a whole number. */
  value: number | null;
  /**
   * The legal, normalized raise-to amount to submit. When the draft is empty or
   * invalid this is the last legal fallback; otherwise it is the draft clamped
   * into `[minRaiseTo, maxRaiseTo]`.
   */
  normalized: number;
  /** Presentation hint for the field so copy and accessibility stay consistent. */
  hint: BetSizingHint;
  /** The draft is a whole number but outside the legal range. */
  outOfRange: boolean;
  /** The draft is empty or otherwise not a whole number. */
  unusable: boolean;
}

/**
 * Parse the raw draft into a whole-number raise-to amount.
 *
 * Only a run of ASCII digits is a number here: empty, decimal, signed, spaced,
 * or otherwise non-numeric input returns null so it can never become a wager.
 * The field is a numeric keyboard, so this also guards against anything that
 * slips past it (paste, autofill, or a fallback keyboard).
 */
export function parseBetSizingValue(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parse a draft and normalize it to the legal raise-to range in one step. The
 * result always carries a clamped, submit-safe amount plus the hint a screen
 * should surface, so callers never branch on legality of their own.
 */
export function normalizeBetSizingInput(
  raw: string,
  bounds: BetSizingBounds,
  fallback: number,
): BetSizingInputResult {
  const value = parseBetSizingValue(raw);
  const clamped = clampRaiseTarget(value ?? fallback, bounds);

  if (value === null) {
    return {
      raw,
      value: null,
      normalized: clampRaiseTarget(fallback, bounds),
      hint: raw.trim() === '' ? 'empty' : 'invalid',
      outOfRange: false,
      unusable: true,
    };
  }

  const below = value < bounds.minRaiseTo;
  const above = value > bounds.maxRaiseTo;
  const outOfRange = below || above;

  return {
    raw,
    value,
    normalized: clamped,
    hint: outOfRange ? 'clamped' : 'legal',
    outOfRange,
    unusable: false,
  };
}

/**
 * The value a caller actually submits. The component is the only place a draft
 * becomes an amount, and it always passes the normalized result here so a
 * malformed or out-of-range field can never reach the engine.
 */
export function submitBetSizingAmount(result: BetSizingInputResult): number {
  return result.normalized;
}

/**
 * A single tap on the field seeds the draft from the current legal amount so the
 * player edits a meaningful starting number, and keeps it in sync whenever the
 * legal bounds or a preset/increment change the amount.
 */
export function draftForCurrentAmount(amount: number): string {
  return String(Math.round(amount));
}

export type BetSizingKeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'backspace' | 'clear';

/**
 * Applies one key from the in-sheet numeric pad. Keeping this pure means the
 * custom pad and every caller share the same bounded, digits-only draft; the
 * existing normalizer remains the sole path from a draft to a legal wager.
 */
export function applyBetSizingKeypadKey(
  draft: string,
  key: BetSizingKeypadKey,
  maxDigits = 9,
): string {
  if (key === 'clear') return '';
  if (key === 'backspace') return draft.slice(0, -1);
  if (draft.length >= Math.max(1, maxDigits)) return draft;
  return draft === '0' ? key : `${draft}${key}`;
}

/**
 * The bet-sizing sheet is re-shown only when `visible` flips back, so any edit
 * in progress must be cleared when it is closed — backdrop, the close button,
 * or Android back. Closing leaves the field unmounted, so a stale, pre-filled
 * draft would otherwise survive and reopen as a ghost field. This rebuilds the
 * draft from the (unchanged) legal amount and marks editing closed, so the sheet
 * reliably reopens on the last legal amount as a closed tap target. Pure by
 * design, so the close-while-editing reopen transition is testable without
 * rendering the sheet.
 */
export function resetBetSizingDraftOnClose(
  current: { target: number; draft: string; editing: boolean },
): { target: number; draft: string; editing: false } {
  return { target: current.target, draft: draftForCurrentAmount(current.target), editing: false };
}
