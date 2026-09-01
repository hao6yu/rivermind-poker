import { describe, expect, it } from 'vitest';

import {
  multiwayNineSeatGeometry,
  multiwayRectsOverlap,
  multiwaySeatAnchorStyle,
  multiwaySixMaxGeometry,
  multiwayTableLayout,
  resolveMeasuredTableLayout,
  type MeasuredTableLayoutInput,
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

describe('measured-pane layout contract (3.11E)', () => {
  const SEAT_COUNTS = [2, 3, 6, 9] as const;
  /** Minimum supported viewport first, then representative modern devices. */
  const VIEWPORTS = [
    { height: 568, insets: { bottom: 0, left: 0, right: 0, top: 20 }, name: 'min-phone', width: 320 },
    { height: 667, insets: { bottom: 0, left: 0, right: 0, top: 20 }, name: 'iphone-se', width: 375 },
    { height: 852, insets: { bottom: 34, left: 0, right: 0, top: 59 }, name: 'iphone-modern', width: 393 },
    { height: 800, insets: { bottom: 24, left: 0, right: 0, top: 48 }, name: 'android', width: 360 },
    { height: 1180, insets: { bottom: 20, left: 0, right: 0, top: 24 }, name: 'ipad-portrait', width: 820 },
    // Landscape contents: the raw window minus side safe areas is what the
    // two-pane split actually measures.
    { height: 320, insets: { bottom: 0, left: 0, right: 0, top: 0 }, name: 'min-landscape', width: 568 },
    { height: 375, insets: { bottom: 21, left: 0, right: 0, top: 0 }, name: 'se-landscape', width: 667 },
    { height: 393, insets: { bottom: 21, left: 47, right: 47, top: 0 }, name: 'iphone-landscape', width: 852 },
    { height: 820, insets: { bottom: 20, left: 0, right: 0, top: 24 }, name: 'ipad-landscape', width: 1180 },
  ] as const;
  const TEXT_SCALES = [1, 1.35, 2] as const;

  function input(overrides: Partial<MeasuredTableLayoutInput> = {}): MeasuredTableLayoutInput {
    return {
      activityFeedMode: 'inline',
      contentHeight: 667,
      contentWidth: 375,
      insets: { bottom: 0, left: 0, right: 0, top: 0 },
      orientation: 'portrait',
      seatCount: 6,
      surface: 'live',
      textScale: 1,
      ...overrides,
    };
  }

  function seatRect(seat: { height: number; width: number; x: number; y: number }) {
    return { bottom: seat.y + seat.height, left: seat.x, right: seat.x + seat.width, top: seat.y };
  }

  function expectNoCollisions(result: ReturnType<typeof resolveMeasuredTableLayout>, label: string) {
    const { boardRect, pane, seats } = result;
    for (const seat of seats) {
      expect(seat.x, `${label} ${seat.anchor} x`).toBeGreaterThanOrEqual(pane.left - 0.5);
      expect(seat.y, `${label} ${seat.anchor} y`).toBeGreaterThanOrEqual(pane.top - 0.5);
      expect(seat.x + seat.width, `${label} ${seat.anchor} right`).toBeLessThanOrEqual(pane.right + 0.5);
      expect(seat.y + seat.height, `${label} ${seat.anchor} bottom`).toBeLessThanOrEqual(pane.bottom + 0.5);
      if (boardRect) {
        expect(multiwayRectsOverlap(seatRect(seat), boardRect), `${label} ${seat.anchor} vs board`).toBe(false);
      }
    }
    for (let i = 0; i < seats.length; i += 1) {
      for (let j = i + 1; j < seats.length; j += 1) {
        expect(multiwayRectsOverlap(seatRect(seats[i]!), seatRect(seats[j]!)), `${label} ${seats[i]!.anchor}/${seats[j]!.anchor}`).toBe(false);
      }
    }
  }

  it('resolves identical geometry for identical inputs', () => {
    const first = resolveMeasuredTableLayout(input());
    const second = resolveMeasuredTableLayout(input());
    expect(second).toEqual(first);
  });

  it('rejects impossible measurements loudly', () => {
    expect(() => resolveMeasuredTableLayout(input({ contentWidth: 0 }))).toThrow();
    expect(() => resolveMeasuredTableLayout(input({ contentHeight: -10 }))).toThrow();
    expect(() => resolveMeasuredTableLayout(input({ textScale: 0.5 }))).toThrow();
    expect(() => resolveMeasuredTableLayout(input({ insets: { bottom: -1, left: 0, right: 0, top: 0 } }))).toThrow();
    expect(() => resolveMeasuredTableLayout(input({ seatCount: 4 as never }))).toThrow();
  });

  it('keeps every seat inside the pane, clear of neighbors and the board, across the whole matrix', () => {
    for (const viewport of VIEWPORTS) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        const landscapeViewport = orientation === 'landscape'
          ? { ...viewport, height: viewport.width, width: viewport.height }
          : viewport;
        for (const seatCount of SEAT_COUNTS) {
          for (const surface of ['setup', 'lobby', 'live', 'result'] as const) {
            for (const feed of ['hidden', 'inline', 'rail'] as const) {
              for (const textScale of TEXT_SCALES) {
                const result = resolveMeasuredTableLayout(input({
                  activityFeedMode: feed,
                  contentHeight: landscapeViewport.height,
                  contentWidth: landscapeViewport.width,
                  insets: landscapeViewport.insets,
                  orientation,
                  seatCount,
                  surface,
                  textScale,
                }));
                expectNoCollisions(result, `${viewport.name}/${orientation}/${seatCount}/${surface}/${feed}/${textScale}`);
              }
            }
          }
        }
      }
    }
  });

  it('keeps every occupied region out of the landscape notch on both rotations (DT-02)', () => {
    // On a notched / Dynamic-Island iPhone in landscape, the protected inset is
    // ASYMMETRIC: the island side is ~59pt and the home-indicator side ~21pt on
    // an 852x393 frame. landscape-left puts the camera island on the LEFT edge
    // and landscape-right puts it on the RIGHT; rotating 180° moves the inset
    // with the physical camera. Every occupied region (seat plaque, board, and
    // side rail) must stay inside [left, width - right] for BOTH rotations,
    // across every seat count and activity-feed mode (bubbles/feed content).
    const ROTATIONS = [
      { bottom: 21, left: 59, name: 'landscape-left', right: 21, top: 0 },
      { bottom: 21, left: 21, name: 'landscape-right', right: 59, top: 0 },
    ] as const;
    const contentWidth = 852;
    const contentHeight = 393;
    const expectInsideSafeContent = (
      rect: { left: number; right: number },
      insets: (typeof ROTATIONS)[number],
      label: string,
    ) => {
      expect(rect.left, `${label} enters the left notch`).toBeGreaterThanOrEqual(insets.left - 0.5);
      expect(rect.right, `${label} enters the right notch`).toBeLessThanOrEqual(contentWidth - insets.right + 0.5);
    };
    for (const insets of ROTATIONS) {
      for (const seatCount of SEAT_COUNTS) {
        for (const feed of ['hidden', 'inline', 'rail'] as const) {
          const result = resolveMeasuredTableLayout(input({
            activityFeedMode: feed,
            contentHeight,
            contentWidth,
            insets: { bottom: insets.bottom, left: insets.left, right: insets.right, top: insets.top },
            orientation: 'landscape',
            seatCount,
            surface: 'live',
          }));
          // The felt pane itself respects the asymmetric notch inset.
          expectInsideSafeContent(result.pane, insets, `${insets.name}/${seatCount}/${feed}/pane`);
          for (const seat of result.seats) {
            expectInsideSafeContent(seatRect(seat), insets, `${insets.name}/${seatCount}/${feed}/${seat.anchor}`);
          }
          if (result.boardRect) {
            expectInsideSafeContent(result.boardRect, insets, `${insets.name}/${seatCount}/${feed}/board`);
          }
          if (result.rail.rect) {
            expectInsideSafeContent(result.rail.rect, insets, `${insets.name}/${seatCount}/${feed}/rail`);
          }
          expectNoCollisions(result, `${insets.name}/${seatCount}/${feed}`);
        }
      }
    }
  });

  it('sizes landscape plaques from the post-rail felt, never the raw window', () => {
    const result = resolveMeasuredTableLayout(input({
      activityFeedMode: 'rail',
      contentHeight: 393,
      contentWidth: 852,
      insets: { bottom: 21, left: 47, right: 47, top: 0 },
      orientation: 'landscape',
      seatCount: 9,
      surface: 'live',
    }));
    expect(result.composition).toBe('landscape-two-pane');
    expect(result.rail.mode).toBe('side');
    expect(result.rail.rect).not.toBeNull();
    const rail = result.rail.rect!;
    // The rail sits inside its tested proportional range and the felt receives
    // the genuine remainder.
    const railWidth = rail.right - rail.left;
    expect(railWidth).toBeGreaterThanOrEqual(200);
    expect(railWidth).toBeLessThanOrEqual(400);
    expect(rail.left).toBeCloseTo(result.pane.right + 12, 0);
    expect(rail.right).toBeLessThanOrEqual(852 - 47 + 0.5);
    // Nine seats still fit the post-rail felt with the board protected.
    expect(result.pane.width).toBeLessThan(852);
    expect(result.seats).toHaveLength(9);
    expectNoCollisions(result, 'rail-matrix');
  });

  it('falls back to the inline composition when a landscape felt cannot stay readable', () => {
    const result = resolveMeasuredTableLayout(input({
      activityFeedMode: 'rail',
      contentHeight: 320,
      contentWidth: 380,
      orientation: 'landscape',
      seatCount: 9,
      surface: 'live',
    }));
    expect(result.composition).toBe('portrait-stack');
    expect(result.rail.mode).toBe('inline');
    expect(result.collapseSecondary).toBe(true);
    expectNoCollisions(result, 'inline-fallback');
  });

  it('fills a tall portrait pane with bounded expansion, not felt stretching (DT-01)', () => {
    // Two felts on the SAME width but different available heights isolate the
    // surplus a taller phone offers. The felt must consume that surplus for
    // real seat/board separation (more vertical spread), yet stay bounded by
    // the portrait min aspect instead of becoming a sliver.
    const compact = resolveMeasuredTableLayout(input({ contentHeight: 667, contentWidth: 393, insets: { bottom: 34, left: 0, right: 0, top: 59 }, seatCount: 9 }));
    const tall = resolveMeasuredTableLayout(input({ contentHeight: 852, contentWidth: 393, insets: { bottom: 34, left: 0, right: 0, top: 59 }, seatCount: 9 }));
    // Both panes consume the available height: a short phone no longer leaves
    // a dead region below the felt, and a tall phone uses its extra height for
    // real separation instead of keeping a stretched floor.
    const compactAvailable = 667 - 59 - 34 - 132;
    const tallAvailable = 852 - 59 - 34 - 132;
    expect(compact.pane.height).toBeGreaterThanOrEqual(compactAvailable - 1);
    expect(tall.pane.height).toBeGreaterThanOrEqual(tallAvailable - 1);
    // Bounded by the portrait min aspect, so it never degenerates into a
    // narrow sliver; the ratio stays inside the portrait band.
    expect(tall.aspectRatio).toBeGreaterThanOrEqual(0.6 - 0.02);
    expect(tall.aspectRatio).toBeLessThan(1.5);
    // No dead region remains below the felt on the tall phone.
    expect(tall.pane.bottom).toBeGreaterThanOrEqual(852 - 34 - 132 - 1);
    // Expansion improves separation, not plaque size: with the width held
    // constant the plaque footprint is identical (width is the binding
    // constraint), so the extra height becomes between-band spacing instead of
    // scaled fonts.
    expect(tall.pane.width).toBe(compact.pane.width);
    expect(tall.seats[0]!.width).toBe(compact.seats[0]!.width);
    expect(tall.seats[0]!.height).toBe(compact.seats[0]!.height);
    const compactSpread = Math.max(...compact.seats.map((s) => s.y + s.height)) - Math.min(...compact.seats.map((s) => s.y));
    const tallSpread = Math.max(...tall.seats.map((s) => s.y + s.height)) - Math.min(...tall.seats.map((s) => s.y));
    expect(tallSpread).toBeGreaterThan(compactSpread);
  });

  it('keeps the expanded portrait felt collision-free at every seat count, Coach on and off (DT-01)', () => {
    // Coach on/off changes the vertical budget the action lane consumes, so
    // model it as two content heights on the same device: the taller Coach-off
    // body and the Coach-on body. Both the compact and tall devices must seat
    // every ring without a seat clipping, overlapping a neighbor, or entering
    // the protected board lane.
    const devices = [
      { name: 'compact', h: 568, w: 320 },
      { name: 'modern', h: 852, w: 393 },
    ] as const;
    for (const device of devices) {
      for (const seatCount of SEAT_COUNTS) {
        for (const budget of ['coach-on', 'coach-off'] as const) {
          const contentHeight = budget === 'coach-on' ? device.h - 48 : device.h;
          const result = resolveMeasuredTableLayout(input({
            contentHeight,
            contentWidth: device.w,
            insets: { bottom: 34, left: 0, right: 0, top: 59 },
            seatCount,
          }));
          expectNoCollisions(result, `${device.name}/${seatCount}/${budget}`);
          // The felt still reaches the action lane (no residual dead zone).
          const available = contentHeight - 59 - 34 - 132;
          expect(result.pane.height, `${device.name}/${seatCount}/${budget} fill`).toBeGreaterThanOrEqual(available - 1);
        }
      }
    }
  });

  it('keeps lobby and setup status copy off the seat map entirely', () => {
    for (const surface of ['setup', 'lobby'] as const) {
      const result = resolveMeasuredTableLayout(input({ surface }));
      expect(result.boardRect).toBeNull();
      expectNoCollisions(result, `status-free-${surface}`);
    }
  });

  it('reserves the protected board lane only on live and result surfaces', () => {
    for (const surface of ['live', 'result'] as const) {
      const result = resolveMeasuredTableLayout(input({ surface }));
      expect(result.boardRect).not.toBeNull();
      const board = result.boardRect!;
      expect(board.left).toBeGreaterThanOrEqual(result.pane.left);
      expect(board.right).toBeLessThanOrEqual(result.pane.right);
      expect(board.top).toBeGreaterThanOrEqual(result.pane.top);
      expect(board.bottom).toBeLessThanOrEqual(result.pane.bottom);
    }
  });

  it('reserves the inline action lane below the live felt', () => {
    const result = resolveMeasuredTableLayout(input({ activityFeedMode: 'inline', surface: 'live', textScale: 1 }));
    // The felt ends above the 132-point lane the actions and collapsed feed need.
    expect(result.pane.bottom).toBeLessThanOrEqual(667 - 130);
  });

  it('collapses secondary plaque metadata instead of clipping at large text scales', () => {
    const result = resolveMeasuredTableLayout(input({ contentHeight: 568, contentWidth: 320, seatCount: 9, textScale: 2 }));
    expect(result.collapseSecondary).toBe(true);
    expect(result.plaqueDensity).toBe('compact');
    expectNoCollisions(result, 'large-text');
  });

  it('always seats the hero at the bottom center and opponents clockwise', () => {
    const result = resolveMeasuredTableLayout(input({ seatCount: 9 }));
    expect(result.seats[0]!.anchor).toBe('hero');
    expect(result.seats[0]!.y).toBeGreaterThan(result.pane.top + result.pane.height / 2);
    const ringAnchors = result.seats.map((seat) => seat.anchor);
    expect(new Set(ringAnchors).size).toBe(9);
    // Ring indexes are unique and complete.
    expect([...result.seats.map((seat) => seat.ringIndex)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
