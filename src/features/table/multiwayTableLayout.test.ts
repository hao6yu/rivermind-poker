import { describe, expect, it } from 'vitest';

import {
  multiwayRectsOverlap,
  multiwaySeatAnchorStyle,
  multiwaySixMaxGeometry,
  multiwayTableLayout,
} from './multiwayTableLayout';

describe('multiway table layout', () => {
  it('uses the focused six-max phone presentation on compact phones', () => {
    expect(multiwayTableLayout(375, 667, 6)).toEqual({
      centerInsetPercent: 24,
      centerTopPercent: 38,
      compact: true,
      landscapeSixMax: false,
      phoneSixMax: true,
      tablet: false,
    });
  });

  it('keeps six-max phone seats simplified on taller phones', () => {
    expect(multiwayTableLayout(430, 932, 6)).toEqual({
      centerInsetPercent: 24,
      centerTopPercent: 38,
      compact: false,
      landscapeSixMax: false,
      phoneSixMax: true,
      tablet: false,
    });
  });

  it('does not simplify three-player tables just because the screen is small', () => {
    expect(multiwayTableLayout(360, 640, 3)).toEqual({
      centerInsetPercent: 18,
      centerTopPercent: 30,
      compact: true,
      landscapeSixMax: false,
      phoneSixMax: false,
      tablet: false,
    });
  });

  it('uses the full six-max presentation on tablet-sized layouts', () => {
    expect(multiwayTableLayout(768, 1024, 6)).toEqual({
      centerInsetPercent: 25,
      centerTopPercent: 34,
      compact: false,
      landscapeSixMax: false,
      phoneSixMax: false,
      tablet: true,
    });
  });

  it('uses a dedicated six-max landscape presentation without phone simplification', () => {
    expect(multiwayTableLayout(844, 390, 6)).toEqual({
      centerInsetPercent: 18,
      centerTopPercent: 30,
      compact: true,
      landscapeSixMax: true,
      phoneSixMax: false,
      tablet: false,
    });
  });

  it('places six-max phone opponents in explicit top and bottom rows', () => {
    expect(multiwaySeatAnchorStyle('top-left', true)).toEqual({ left: '0%', top: '1%' });
    expect(multiwaySeatAnchorStyle('top-right', true)).toEqual({ right: '0%', top: '1%' });
    expect(multiwaySeatAnchorStyle('mid-left', true)).toEqual({ left: '0%', top: '76%' });
    expect(multiwaySeatAnchorStyle('mid-right', true)).toEqual({ right: '0%', top: '76%' });
  });

  it('preserves the established side-seat geometry outside six-max phones', () => {
    expect(multiwaySeatAnchorStyle('top-left', false)).toEqual({ left: '5%', top: '9%' });
    expect(multiwaySeatAnchorStyle('mid-right', false)).toEqual({ right: '3%', top: '43%' });
  });

  it('centers the wider top and hero seats on tablet layouts', () => {
    expect(multiwaySeatAnchorStyle('top-center', false, true)).toEqual({ left: '41.5%', top: '1%' });
    expect(multiwaySeatAnchorStyle('hero', false, true)).toEqual({ bottom: '2%', left: '41.5%' });
  });

  it('moves tablet side pairs away from the reserved board lane', () => {
    expect(multiwaySeatAnchorStyle('top-left', false, true)).toEqual({ left: '5%', top: '11%' });
    expect(multiwaySeatAnchorStyle('top-right', false, true)).toEqual({ right: '5%', top: '11%' });
    expect(multiwaySeatAnchorStyle('mid-left', false, true)).toEqual({ left: '3%', top: '50%' });
    expect(multiwaySeatAnchorStyle('mid-right', false, true)).toEqual({ right: '3%', top: '50%' });
  });

  it.each([302, 356])('keeps every six-max phone seat and bubble outside the protected center at %ipx', (feltWidth) => {
    const geometry = multiwaySixMaxGeometry(feltWidth, 295, true, false);
    for (const seat of Object.values(geometry.seats)) {
      expect(multiwayRectsOverlap(seat, geometry.center)).toBe(false);
    }
    for (const bubble of Object.values(geometry.bubbles)) {
      expect(multiwayRectsOverlap(bubble, geometry.center)).toBe(false);
      expect(bubble.top).toBeGreaterThanOrEqual(0);
      expect(bubble.bottom).toBeLessThanOrEqual(295);
    }
  });

  it('keeps every six-max iPad seat outside the protected center rectangle', () => {
    const geometry = multiwaySixMaxGeometry(808, 870, false, true);
    for (const seat of Object.values(geometry.seats)) {
      expect(multiwayRectsOverlap(seat, geometry.center)).toBe(false);
    }
  });
});
