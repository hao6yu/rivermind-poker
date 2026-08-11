import { describe, expect, it } from 'vitest';

import { multiwaySeatAnchorStyle, multiwayTableLayout } from './multiwayTableLayout';

describe('multiway table layout', () => {
  it('uses the focused six-max phone presentation on compact phones', () => {
    expect(multiwayTableLayout(375, 667, 6)).toEqual({
      compact: true,
      phoneSixMax: true,
      recentActionLimit: 2,
    });
  });

  it('keeps six-max phone seats simplified on taller phones', () => {
    expect(multiwayTableLayout(430, 932, 6)).toEqual({
      compact: false,
      phoneSixMax: true,
      recentActionLimit: 3,
    });
  });

  it('does not simplify three-player tables just because the screen is small', () => {
    expect(multiwayTableLayout(360, 640, 3)).toEqual({
      compact: true,
      phoneSixMax: false,
      recentActionLimit: 3,
    });
  });

  it('uses the full six-max presentation on tablet-sized layouts', () => {
    expect(multiwayTableLayout(768, 1024, 6)).toEqual({
      compact: false,
      phoneSixMax: false,
      recentActionLimit: 3,
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
});
