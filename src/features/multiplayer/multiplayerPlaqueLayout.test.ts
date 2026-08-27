import { describe, expect, it } from 'vitest';

import { formatChips, formatChipsCompact } from '../../domain/poker/moneyFormat';
import {
  resolveMultiplayerPlaqueRender,
  multiplayerPlaqueKeepsExactStackSingleLine,
  type MultiplayerPlaqueRender,
} from './multiplayerPlaqueLayout';
import {
  multiplayerSeatFootprintWidth,
  multiplayerSeatLayoutForWidth,
  multiplayerGameSeatAnchor,
  multiplayerTableWidthForScreen,
  type MultiplayerSeatCount,
} from './multiplayerUx';

const DEFAULT_STACK = 4_000;

/** Phone widths the app supports; ordered smallest to largest. */
const WIDTHS = [320, 375, 390, 430] as const;

describe('responsive 6-seat plaque footprint', () => {
  it.each(WIDTHS)('grows the footprint as a %d-point phone widens, without overgrowing', (width) => {
    const layout = multiplayerSeatLayoutForWidth(width);
    const usable = multiplayerTableWidthForScreen(width, 'game', layout);
    const render = resolveMultiplayerPlaqueRender({
      seatCount: 6,
      playerStack: DEFAULT_STACK,
      usableTableWidth: usable,
      layout,
      tablet: false,
    });

    // The smallest phone keeps the tested 92-point footprint; wider phones grow.
    expect(render.footprintWidth).toBeGreaterThanOrEqual(
      multiplayerSeatFootprintWidth('compact', 'game', false, false),
    );
    // Never grow beyond the authored 1.2x ceiling over the smallest-phone value.
    const ceiling = multiplayerSeatFootprintWidth('compact', 'game', false, false) * 1.2;
    expect(render.footprintWidth).toBeLessThanOrEqual(ceiling);
  });

  it('never shrinks or stalls as the phone widens (monotonic growth)', () => {
    let priorFootprint = -Infinity;
    let priorName = -Infinity;
    let priorStack = -Infinity;
    for (const width of WIDTHS) {
      const layout = multiplayerSeatLayoutForWidth(width);
      const usable = multiplayerTableWidthForScreen(width, 'game', layout);
      const render = resolveMultiplayerPlaqueRender({
        seatCount: 6,
        playerStack: DEFAULT_STACK,
        usableTableWidth: usable,
        layout,
        tablet: false,
      });
      // Each successive supported phone is at least as large as the last, and
      // the largest phone is visibly larger than the smallest.
      expect(render.footprintWidth).toBeGreaterThanOrEqual(priorFootprint);
      expect(render.nameFontSize).toBeGreaterThanOrEqual(priorName);
      expect(render.stackFontSize).toBeGreaterThanOrEqual(priorStack);
      priorFootprint = render.footprintWidth;
      priorName = render.nameFontSize;
      priorStack = render.stackFontSize;
    }
    const smallest = resolveMultiplayerPlaqueRender({
      seatCount: 6,
      playerStack: DEFAULT_STACK,
      usableTableWidth: multiplayerTableWidthForScreen(320, 'game', 'compact'),
      layout: 'compact',
      tablet: false,
    });
    const largest = resolveMultiplayerPlaqueRender({
      seatCount: 6,
      playerStack: DEFAULT_STACK,
      usableTableWidth: multiplayerTableWidthForScreen(430, 'game', 'compact'),
      layout: 'compact',
      tablet: false,
    });
    expect(largest.footprintWidth).toBeGreaterThan(smallest.footprintWidth);
  });

  it('keeps 6-seat plaques non-overlapping at every supported width', () => {
    for (const width of WIDTHS) {
      const layout = multiplayerSeatLayoutForWidth(width);
      const usable = multiplayerTableWidthForScreen(width, 'game', layout);
      const render = resolveMultiplayerPlaqueRender({
        seatCount: 6,
        playerStack: DEFAULT_STACK,
        usableTableWidth: usable,
        layout,
        tablet: false,
      });
      // The right-most seat (68.5%) plus its footprint must clear the table edge.
      const lastLeftPx = 0.685 * usable;
      expect(lastLeftPx + render.footprintWidth).toBeLessThanOrEqual(usable + 1);
      // Consecutive seats stay separated: the 1% seat must not touch 34%.
      const firstRightPx = 0.01 * usable + render.footprintWidth;
      expect(firstRightPx).toBeLessThanOrEqual(0.34 * usable + 1);
    }
  });
});

describe('single-line identity copy', () => {
  it.each(WIDTHS)('keeps the 4,000 default stack exact and single-line on a %d-point phone', (width) => {
    const layout = multiplayerSeatLayoutForWidth(width);
    const usable = multiplayerTableWidthForScreen(width, 'game', layout);
    const render = resolveMultiplayerPlaqueRender({
      seatCount: 6,
      playerStack: DEFAULT_STACK,
      usableTableWidth: usable,
      layout,
      tablet: false,
    });
    expect(render.stackSingleLine).toBe(true);
    expect(render.stackLabel).toBe('4,000');
  });

  it.each([2, 3, 6])('keeps 4,000 single-line for a %d-seat table on the smallest phone', (seatCount) => {
    const usable = multiplayerTableWidthForScreen(320, 'game', 'compact');
    expect(multiplayerPlaqueKeepsExactStackSingleLine(seatCount as MultiplayerSeatCount, DEFAULT_STACK, usable)).toBe(true);
  });

  it('keeps a short stack exact but collapses a long stack to the compact form on a narrow lane', () => {
    // A short, exact four-digit stack stays single-line on a normal 320-point lane.
    const normal = resolveMultiplayerPlaqueRender({
      seatCount: 6,
      playerStack: DEFAULT_STACK,
      usableTableWidth: 306,
      layout: 'compact',
      tablet: false,
    });
    expect(normal.stackLabel).toBe('4,000');

    // A long stack cannot stay one line in the narrowest identity copy, so it
    // falls back to the compact label but still renders on one line.
    const longStack = 123_456;
    const tight = resolveMultiplayerPlaqueRender({
      seatCount: 6,
      playerStack: longStack,
      usableTableWidth: 120,
      layout: 'compact',
      tablet: false,
    });
    expect(tight.stackLabel).toBe(formatChipsCompact(longStack));
    expect(tight.stackLabel).not.toBe(formatChips(longStack));
    expect(tight.stackSingleLine).toBe(true);
  });
});

describe('responsive font sizing', () => {
  it('scales name, stack, and meta base sizes between 1x and the 1.2x ceiling', () => {
    for (const width of WIDTHS) {
      const layout = multiplayerSeatLayoutForWidth(width);
      const usable = multiplayerTableWidthForScreen(width, 'game', layout);
      const render = resolveMultiplayerPlaqueRender({
        seatCount: 6,
        playerStack: DEFAULT_STACK,
        usableTableWidth: usable,
        layout,
        tablet: false,
      });
      const canonical = multiplayerSeatFootprintWidth('compact', 'game', false, false);
      expect(render.fontScale).toBeGreaterThanOrEqual(1);
      expect(render.fontScale).toBeLessThanOrEqual(1.2);
      // Every scaled base size is at least the smallest-phone base size.
      expect(render.nameFontSize).toBeGreaterThanOrEqual(10.5);
      expect(render.stackFontSize).toBeGreaterThanOrEqual(9.5);
      expect(render.metaFontSize).toBeGreaterThanOrEqual(8.5);
    }
  });

  it('never reports a negative identity-copy width', () => {
    const render = resolveMultiplayerPlaqueRender({
      seatCount: 6,
      playerStack: DEFAULT_STACK,
      usableTableWidth: 120,
      layout: 'compact',
      tablet: false,
    });
    expect(render.identityCopyWidth).toBeGreaterThanOrEqual(0);
  });
});

describe('viewer, tablet, and wide layouts', () => {
  it('gives the local (viewer) seat a little more room on the same phone', () => {
    const usable = multiplayerTableWidthForScreen(390, 'game', 'compact');
    const nonViewer = resolveMultiplayerPlaqueRender({
      seatCount: 6,
      playerStack: DEFAULT_STACK,
      usableTableWidth: usable,
      layout: 'compact',
      tablet: false,
      viewer: false,
    });
    const viewer = resolveMultiplayerPlaqueRender({
      seatCount: 6,
      playerStack: DEFAULT_STACK,
      usableTableWidth: usable,
      layout: 'compact',
      tablet: false,
      viewer: true,
    });
    expect(viewer.footprintWidth).toBeGreaterThan(nonViewer.footprintWidth);
    expect(viewer.stackLabel).toBe('4,000');
  });

  it.each([
    { expected: 'compact', width: 768 },
    { expected: 'wide', width: 1_024 },
  ])('keeps single-line scaling in range for a ${expected} viewport', ({ expected, width }) => {
    const layout = multiplayerSeatLayoutForWidth(width);
    expect(layout).toBe(expected);
    const usable = multiplayerTableWidthForScreen(width, 'game', layout);
    for (const seatCount of [2, 3, 6] as const) {
      const render = resolveMultiplayerPlaqueRender({
        seatCount,
        playerStack: DEFAULT_STACK,
        usableTableWidth: usable,
        layout,
        tablet: true,
      });
      expect(render.stackSingleLine).toBe(true);
      expect(render.stackLabel).toBe('4,000');
    }
  });
});

describe('seat anchor sanity', () => {
  it('documents the 6-seat horizontal anchors the tests rely on', () => {
    const anchors = [0, 1, 2, 3, 4, 5].map((seat) =>
      Number.parseInt(multiplayerGameSeatAnchor(6, seat, 'compact').left ?? '0%', 10),
    );
    expect([...anchors].sort((a, b) => a - b)).toEqual([1, 1, 34, 34, 68, 68]);
  });
});

// Kept as a compile-time guard that the render shape the modal consumes stays
// stable: consumers destructure every field, so a dropped shape member is a
// build error here before it is a runtime crash in the modal.
it('exposes the full render contract', () => {
  const render: MultiplayerPlaqueRender = resolveMultiplayerPlaqueRender({
    seatCount: 6,
    playerStack: DEFAULT_STACK,
    usableTableWidth: 306,
    layout: 'compact',
    tablet: false,
  });
  const keys = Object.keys(render).sort();
  expect(keys).toEqual([
    'fontScale',
    'footprintWidth',
    'identityCopyWidth',
    'metaFontSize',
    'nameFontSize',
    'stackFontSize',
    'stackLabel',
    'stackSingleLine',
  ]);
});
