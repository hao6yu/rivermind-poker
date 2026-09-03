/**
 * Responsive sizing for the private multiplayer live-table seat plaques.
 *
 * The seat footprint (where a plaque sits, and how wide the reserved lane is)
 * is defined by `multiplayerSeatFootprintWidth` and never overlaps its neighbors.
 * That footprint is fixed at the smallest supported phone so the 320-point
 * layout keeps its tested, non-overlapping lanes; the *rendered* plaque is what
 * had to become responsive.
 *
 * This helper grows the plaque the wider the table gets. A wider usable table
 * gives a wider lane, and the 33% seat anchors leave a real gap, so the plaque
 * footprint can safely expand toward that lane — and the identity copy (name,
 * stack, status) can grow with it. Every supported phone therefore reads
 * larger as the phone gets wider, while the smallest phones stay dense.
 *
 * The returned sizing is what the modal actually renders: base font sizes, the
 * exact or compact stack label, and a single-line guarantee. The stack label is
 * measured against the *actual* identity-copy area (footprint minus the avatar
 * and role padding), not the wider lane, because the copy is what has to fit
 * there. The exact `4,000` label is kept whenever it fits one line; it only
 * collapses to the compact form when the copy is genuinely too narrow.
 *
 * Pure by design: the modal passes the numbers it already has, so the geometry
 * is exercised with plain values instead of a React Native rendering harness.
 */

import { formatChips, formatChipsCompact } from '../../domain/poker/moneyFormat';
import {
  multiplayerSeatFootprintWidth,
  type MultiplayerSeatCount,
} from './multiplayerUx';

/** Character advance factor for the numeral-heavy chips font at the base size. */
const PLAQUE_CHAR_ADVANCE_FACTOR = 0.62;

/** Inner padding reserved inside the identity copy before the stack is measured. */
const PLAQUE_STACK_PADDING = 6;
/** P18-009: the winner boundary (border width × both sides) must fit too. */
const PLAQUE_WINNER_BORDER_WIDTH = 2.5;

/**
 * How far the plaque footprint may grow from the smallest-phone value. Kept
 * small so larger phones read a touch bigger, never wildly so.
 */
const PLAQUE_MAX_GROWTH = 1.2;

/**
 * Horizontal space a single seat may occupy before it would collide a neighbor
 * on the same edge. Two-seat tables have no horizontal neighbor, so the whole
 * usable table is the lane; three- and six-seat tables place three distinct
 * horizontal anchors per edge (1% / 34% / 68.5%), so each lane is a third of
 * the usable table; nine-seat tables row five plaques along the top edge
 * (1% / 21% / 41% / 61% / 81%), so the lane is a fifth of the usable table and
 * every seat — bottom row included — shares that most-constrained width. All
 * phones share these anchor maps, so the lane width keeps every seat's
 * footprint non-overlapping at every width.
 */
function multiplayerPlaqueLaneWidth(usableTableWidth: number, seatCount: MultiplayerSeatCount): number {
  const lanesPerEdge = seatCount === 2 ? 1 : seatCount === 9 ? 5 : 3;
  return usableTableWidth / lanesPerEdge;
}

/** Identity-copy horizontal padding, by layout. Mirrors the modal styles. */
function identityCopyPadding(layout: 'compact' | 'wide', tablet: boolean, hasRole: boolean): { left: number; right: number } {
  const left = layout === 'wide' ? 39 : tablet ? 33 : 27;
  // A seat with a role badge reserves the right edge around that badge; a seat
  // without one only clears the avatar.
  const right = hasRole
    ? layout === 'wide' ? 40 : tablet ? 34 : 29
    : layout === 'wide' ? 7 : tablet ? 6 : 5;
  return { left, right };
}

/**
 * Base font sizes before any responsive scaling, by layout. Mirrors the modal
 * seat copy so the rendered sizes match the authored intent.
 */
function baseFontSize(layout: 'compact' | 'wide', tablet: boolean, kind: 'name' | 'stack' | 'meta'): number {
  switch (kind) {
    case 'name':
      return layout === 'wide' ? 16 : tablet ? 12.5 : 10.5;
    case 'stack':
      return layout === 'wide' ? 14 : tablet ? 11.5 : 9.5;
    case 'meta':
      return layout === 'wide' ? 11.5 : tablet ? 10 : 8.5;
  }
}

export interface MultiplayerPlaqueRender {
  /** Plaque (footprint) width the modal renders, responsive to the table. */
  footprintWidth: number;
  /** Usable width for the identity copy after the avatar and role are cleared. */
  identityCopyWidth: number;
  /** Responsive scale of the base font, between 1 and PLAQUE_MAX_GROWTH. */
  fontScale: number;
  /** Base font size for the player name at this width. */
  nameFontSize: number;
  /** Base font size for the stack chips label at this width. */
  stackFontSize: number;
  /** Base font size for the meta (action/status) line at this width. */
  metaFontSize: number;
  /** The stack label to render: the exact "4,000" when it fits, else the compact form. */
  stackLabel: string;
  /**
   * Always true. The exact label is only chosen when it fits the identity copy
   * on one line, and the modal constrains every stack line with `numberOfLines`.
   */
  stackSingleLine: true;
}

/**
 * Resolve the exact plaque sizing the modal renders for one seat. This is the
 * single source of truth for how a plaque is sized, so the rendering and the
 * tests share one geometry instead of the modal guessing from the lane width.
 */
export function resolveMultiplayerPlaqueRender(options: {
  seatCount: MultiplayerSeatCount;
  playerStack: number;
  usableTableWidth: number;
  layout: 'compact' | 'wide';
  tablet: boolean;
  viewer?: boolean;
  hasRole?: boolean;
  /**
   * P18-009: the winner treatment draws a thicker boundary around the plaque.
   * The geometry must reserve that width so the widest localized stack still
   * fits its identity copy instead of being truncated by the border.
   */
  winner?: boolean;
}): MultiplayerPlaqueRender {
  const { seatCount, playerStack, usableTableWidth, layout, tablet, viewer = false, hasRole = true, winner = false } = options;

  // The smallest-phone footprint is the floor; wider tables can expand toward it.
  const canonical = multiplayerSeatFootprintWidth(
    layout,
    'game',
    viewer,
    tablet && layout === 'compact',
    seatCount,
  );
  const maxFootprint = canonical * PLAQUE_MAX_GROWTH;
  const laneWidth = multiplayerPlaqueLaneWidth(usableTableWidth, seatCount);
  // Grow toward the lane (lane * 0.9 never exceeds the 33% seat anchors), clamped
  // to the floor and the authored growth ceiling.
  const footprintWidth = Math.round(clamp(laneWidth * 0.9, canonical, maxFootprint));

  const { left, right } = identityCopyPadding(layout, tablet, hasRole);
  const winnerBoundary = winner ? PLAQUE_WINNER_BORDER_WIDTH * 2 : 0;
  const identityCopyWidth = Math.max(0, footprintWidth - left - right - winnerBoundary);
  const fontScale = clamp(footprintWidth / canonical, 1, PLAQUE_MAX_GROWTH);

  const nameFontSize = round(baseFontSize(layout, tablet, 'name') * fontScale);
  const stackFontSize = round(baseFontSize(layout, tablet, 'stack') * fontScale);
  const metaFontSize = round(baseFontSize(layout, tablet, 'meta') * fontScale);

  // Prefer the exact chips label; fall back to the compact form only when the
  // exact one could not stay on one line in the identity copy.
  const charWidth = stackFontSize * PLAQUE_CHAR_ADVANCE_FACTOR;
  const exactLabel = formatChips(playerStack);
  const compactLabel = formatChipsCompact(playerStack);
  const exactFits = exactLabel.length * charWidth <= identityCopyWidth - PLAQUE_STACK_PADDING;
  const stackLabel = exactFits ? exactLabel : compactLabel;

  return {
    footprintWidth,
    identityCopyWidth,
    fontScale,
    nameFontSize,
    stackFontSize,
    metaFontSize,
    stackLabel,
    stackSingleLine: true,
  };
}

/**
 * Whether a plain stack like `4,000` keeps its exact, four-digit form on one
 * line at this width — i.e. the identity copy is wide enough to avoid collapsing
 * to the compact `4K` label. This is the regression guard that keeps the default
 * starting stack legible on the narrowest seat, so tests assert the exact label
 * rather than trusting a helper to promise it.
 */
export function multiplayerPlaqueKeepsExactStackSingleLine(
  seatCount: MultiplayerSeatCount,
  playerStack: number,
  usableTableWidth: number,
  layout: 'compact' | 'wide' = 'compact',
  tablet: boolean = false,
  viewer: boolean = false,
  hasRole: boolean = true,
): boolean {
  const exact = formatChips(playerStack);
  const render = resolveMultiplayerPlaqueRender({
    seatCount,
    playerStack,
    usableTableWidth,
    layout,
    tablet,
    viewer,
    hasRole,
  });
  return render.stackSingleLine && render.stackLabel === exact;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
