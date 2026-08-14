import { describe, expect, it } from 'vitest';

import {
  TABLE_OVERLAY_LARGE_TEXT_SCALE,
  TABLE_OVERLAY_TABLET_MIN_EDGE,
  tableOverlayLayout,
} from './tableOverlayLayout';

describe('table overlay responsive layout', () => {
  it('uses tablet typography for portrait and landscape iPad canvases', () => {
    expect(tableOverlayLayout(768, 1_024)).toMatchObject({ compactHeight: false, tablet: true });
    expect(tableOverlayLayout(810, 1_080)).toMatchObject({ compactHeight: false, tablet: true });
    expect(tableOverlayLayout(1_024, 768)).toMatchObject({ compactHeight: false, tablet: true });
  });

  it('does not mistake a landscape phone for a tablet', () => {
    expect(tableOverlayLayout(844, 390).tablet).toBe(false);
    expect(tableOverlayLayout(TABLE_OVERLAY_TABLET_MIN_EDGE - 1, 1_024).tablet).toBe(false);
  });

  it('reserves more vertical flexibility for accessibility font sizes', () => {
    expect(tableOverlayLayout(768, 1_024, TABLE_OVERLAY_LARGE_TEXT_SCALE - 0.01).largeText).toBe(false);
    expect(tableOverlayLayout(768, 1_024, TABLE_OVERLAY_LARGE_TEXT_SCALE).largeText).toBe(true);
    expect(tableOverlayLayout(Number.NaN, Number.POSITIVE_INFINITY, Number.NaN)).toEqual({
      compactHeight: true,
      largeText: false,
      tablet: false,
    });
  });
});
