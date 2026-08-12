import { describe, expect, it } from 'vitest';

import { multiwaySeatAnchorStyle, multiwayTableLayout } from './multiwayTableLayout';

describe('multiway table layout', () => {
  it('uses the focused six-max phone presentation on compact phones', () => {
    expect(multiwayTableLayout(375, 667, 6)).toEqual({
      compact: true,
      landscapeSixMax: false,
      phoneSixMax: true,
      recentActionLimit: 2,
      tablet: false,
    });
  });

  it('keeps six-max phone seats simplified on taller phones', () => {
    expect(multiwayTableLayout(430, 932, 6)).toEqual({
      compact: false,
      landscapeSixMax: false,
      phoneSixMax: true,
      recentActionLimit: 3,
      tablet: false,
    });
  });

  it('does not simplify three-player tables just because the screen is small', () => {
    expect(multiwayTableLayout(360, 640, 3)).toEqual({
      compact: true,
      landscapeSixMax: false,
      phoneSixMax: false,
      recentActionLimit: 3,
      tablet: false,
    });
  });

  it('uses the full six-max presentation on tablet-sized layouts', () => {
    expect(multiwayTableLayout(768, 1024, 6)).toEqual({
      compact: false,
      landscapeSixMax: false,
      phoneSixMax: false,
      recentActionLimit: 3,
      tablet: true,
    });
  });

  it('uses a dedicated six-max landscape presentation without phone simplification', () => {
    expect(multiwayTableLayout(844, 390, 6)).toEqual({
      compact: true,
      landscapeSixMax: true,
      phoneSixMax: false,
      recentActionLimit: 2,
      tablet: false,
    });
  });

  it('staggers both side pairs lower on six-max phones', () => {
    expect(multiwaySeatAnchorStyle('top-left', true)).toEqual({ left: '5%', top: '13%' });
    expect(multiwaySeatAnchorStyle('top-right', true)).toEqual({ right: '5%', top: '13%' });
    expect(multiwaySeatAnchorStyle('mid-left', true)).toEqual({ left: '3%', top: '63%' });
    expect(multiwaySeatAnchorStyle('mid-right', true)).toEqual({ right: '3%', top: '63%' });
  });

  it('preserves the established side-seat geometry outside six-max phones', () => {
    expect(multiwaySeatAnchorStyle('top-left', false)).toEqual({ left: '5%', top: '9%' });
    expect(multiwaySeatAnchorStyle('mid-right', false)).toEqual({ right: '3%', top: '43%' });
  });

  it('centers the wider top and hero seats on tablet layouts', () => {
    expect(multiwaySeatAnchorStyle('top-center', false, true)).toEqual({ left: '41.5%', top: '1%' });
    expect(multiwaySeatAnchorStyle('hero', false, true)).toEqual({ bottom: '2%', left: '41.5%' });
  });
});
