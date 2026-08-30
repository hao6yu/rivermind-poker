import { describe, expect, it } from 'vitest';

import {
  multiwayNineSeatGeometry,
  multiwayRectsOverlap,
  multiwaySeatAnchorStyle,
  multiwaySixMaxGeometry,
  multiwayTableLayout,
  type MultiwayNineSeatRingAnchor,
} from './multiwayTableLayout';

const NINE_SEAT_RING: readonly MultiwayNineSeatRingAnchor[] = [
  'top-left',
  'top-right',
  'upper-left',
  'upper-right',
  'lower-left',
  'lower-right',
  'bottom-left',
  'bottom-right',
  'hero',
];

describe('multiway table layout', () => {
  it('uses the focused six-max phone presentation on compact phones', () => {
    expect(multiwayTableLayout(375, 667, 6)).toEqual({
      centerInsetPercent: 24,
      centerTopPercent: 38,
      compact: true,
      landscapeSixMax: false,
      phoneNineMax: false,
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
      phoneNineMax: false,
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
      phoneNineMax: false,
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
      phoneNineMax: false,
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
      phoneNineMax: false,
      phoneSixMax: false,
      tablet: false,
    });
  });

  it('rings nine-seat phones with the dense presentation and a reserved lane', () => {
    expect(multiwayTableLayout(320, 568, 9)).toEqual({
      centerInsetPercent: 24,
      centerTopPercent: 38,
      compact: true,
      landscapeSixMax: false,
      phoneNineMax: true,
      phoneSixMax: false,
      tablet: false,
    });
  });

  it('rings nine-seat portrait tablets with full plaques and a wide lane', () => {
    expect(multiwayTableLayout(768, 1024, 9)).toEqual({
      centerInsetPercent: 25,
      centerTopPercent: 34,
      compact: false,
      landscapeSixMax: false,
      phoneNineMax: false,
      phoneSixMax: false,
      tablet: true,
    });
  });

  it('falls back to the dense nine-seat ring on short or landscape surfaces', () => {
    expect(multiwayTableLayout(1024, 768, 9)).toMatchObject({ phoneNineMax: true });
    expect(multiwayTableLayout(844, 390, 9)).toMatchObject({
      landscapeSixMax: false,
      phoneNineMax: true,
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

  it('anchors the nine-seat phone ring along the felt edges', () => {
    expect(multiwaySeatAnchorStyle('top-left', true, false, true)).toEqual({ left: '0%', top: '1%' });
    expect(multiwaySeatAnchorStyle('top-right', true, false, true)).toEqual({ right: '0%', top: '1%' });
    expect(multiwaySeatAnchorStyle('upper-left', true, false, true)).toEqual({ left: '0%', top: '19%' });
    expect(multiwaySeatAnchorStyle('upper-right', true, false, true)).toEqual({ right: '0%', top: '19%' });
    expect(multiwaySeatAnchorStyle('lower-left', true, false, true)).toEqual({ left: '0%', top: '60.5%' });
    expect(multiwaySeatAnchorStyle('lower-right', true, false, true)).toEqual({ right: '0%', top: '60.5%' });
    expect(multiwaySeatAnchorStyle('bottom-left', true, false, true)).toEqual({ left: '0%', bottom: '1%' });
    expect(multiwaySeatAnchorStyle('bottom-right', true, false, true)).toEqual({ right: '0%', bottom: '1%' });
    expect(multiwaySeatAnchorStyle('hero', true, false, true)).toEqual({ bottom: '1%', left: '37%' });
  });

  it('anchors the nine-seat tablet ring outside the widened tablet lane', () => {
    expect(multiwaySeatAnchorStyle('upper-left', false, true, true)).toEqual({ left: '2%', top: '30%' });
    expect(multiwaySeatAnchorStyle('lower-right', false, true, true)).toEqual({ right: '2%', top: '56%' });
    expect(multiwaySeatAnchorStyle('bottom-left', false, true, true)).toEqual({ left: '2%', bottom: '2%' });
    expect(multiwaySeatAnchorStyle('hero', false, true, true)).toEqual({ bottom: '2%', left: '41.5%' });
  });

  it.each([302, 356])('keeps every six-max phone seat and bubble outside the protected center at %ipx', (feltWidth) => {
    const geometry = multiwaySixMaxGeometry(feltWidth, 295, true, false);
    for (const seat of Object.values(geometry.seats)) {
      expect(multiwayRectsOverlap(seat, geometry.center)).toBe(false);
    }
    for (const bubble of Object.values(geometry.bubbles)) {
      expect(bubble).toBeDefined();
      if (!bubble) continue;
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

describe('nine-seat table geometry', () => {
  const phoneFelts = [
    { screen: '320×568 phone', feltWidth: 302, feltHeight: 350 },
    { screen: '360×640 phone', feltWidth: 340, feltHeight: 350 },
    { screen: '375×667 phone', feltWidth: 356, feltHeight: 400 },
    { screen: '390×844 phone', feltWidth: 362, feltHeight: 520 },
    { screen: '430×932 phone', feltWidth: 402, feltHeight: 600 },
  ];
  const tabletFelts = [
    { screen: '768×1024 iPad', feltWidth: 740, feltHeight: 780 },
    { screen: '1024×1366 iPad', feltWidth: 1004, feltHeight: 1100 },
  ];

  const expectClearLayout = (
    screen: string,
    geometry: ReturnType<typeof multiwayNineSeatGeometry>,
    feltWidth: number,
    feltHeight: number,
  ) => {
    const seats = NINE_SEAT_RING.map((anchor) => geometry.seats[anchor]);
    expect(seats.every((seat) => seat !== undefined), screen).toBe(true);
    for (let left = 0; left < seats.length; left += 1) {
      for (let right = left + 1; right < seats.length; right += 1) {
        const a = seats[left];
        const b = seats[right];
        if (!a || !b) continue;
        expect(multiwayRectsOverlap(a, b), `${screen}: seat ${left}/${right}`).toBe(false);
      }
    }
    for (const anchor of NINE_SEAT_RING) {
      const seat = geometry.seats[anchor];
      if (!seat) continue;
      expect(multiwayRectsOverlap(seat, geometry.center), `${screen}: ${anchor} vs board`).toBe(false);
      expect(seat.left, screen).toBeGreaterThanOrEqual(0);
      expect(seat.top, screen).toBeGreaterThanOrEqual(0);
      expect(seat.right, screen).toBeLessThanOrEqual(feltWidth + 0.5);
      expect(seat.bottom, screen).toBeLessThanOrEqual(feltHeight + 0.5);
    }
  };

  phoneFelts.forEach(({ feltHeight, feltWidth, screen }) => {
    it(`keeps all nine phone plaques outside each other and the board lane at ${screen}`, () => {
      const geometry = multiwayNineSeatGeometry(feltWidth, feltHeight, true, false);
      expect(Object.keys(geometry.bubbles)).toHaveLength(0);
      expectClearLayout(screen, geometry, feltWidth, feltHeight);
    });
  });

  tabletFelts.forEach(({ feltHeight, feltWidth, screen }) => {
    it(`keeps all nine tablet plaques and bubbles clear of the board lane at ${screen}`, () => {
      const geometry = multiwayNineSeatGeometry(feltWidth, feltHeight, false, true);
      expectClearLayout(screen, geometry, feltWidth, feltHeight);
      const bubbles = Object.values(geometry.bubbles);
      expect(bubbles).toHaveLength(8);
      for (const bubble of bubbles) {
        if (!bubble) continue;
        expect(multiwayRectsOverlap(bubble, geometry.center), screen).toBe(false);
        expect(bubble.top, screen).toBeGreaterThanOrEqual(0);
        expect(bubble.bottom, screen).toBeLessThanOrEqual(feltHeight);
      }
    });
  });

  it('rows the phone ring as two top, two per flank, and two beside the hero', () => {
    const geometry = multiwayNineSeatGeometry(302, 350, true, false);
    const seats = geometry.seats;
    // Top edge shares one band; the hero sits on the bottom edge between the
    // two bottom plaques, and no plaque ever enters the board lane.
    expect(seats['top-left']!.top).toBeCloseTo(seats['top-right']!.top);
    expect(seats['bottom-left']!.bottom).toBeCloseTo(seats['bottom-right']!.bottom);
    expect(seats['bottom-left']!.bottom).toBeCloseTo(seats.hero!.bottom);
    expect(seats['upper-left']!.top).toBeGreaterThan(seats['top-left']!.bottom);
    expect(seats['lower-left']!.top).toBeGreaterThan(geometry.center.bottom);
    expect(seats['bottom-left']!.top).toBeGreaterThan(seats['lower-left']!.bottom);
    expect(seats.hero!.left).toBeGreaterThan(seats['bottom-left']!.right);
    expect(seats.hero!.right).toBeLessThan(seats['bottom-right']!.left);
  });
});
