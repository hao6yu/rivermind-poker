import { describe, expect, it } from 'vitest';

import {
  TABLE_ACTIVITY_MIN_FELT_WIDTH,
  tableActivityLayout,
} from './tableActivityLayout';

describe('table activity shell layout', () => {
  it('uses a disclosure in portrait without narrowing the felt', () => {
    expect(tableActivityLayout(375, 667)).toEqual({
      landscape: false,
      mode: 'disclosure',
      railWidth: 0,
    });
  });

  it('keeps a 30-percent rail on supported landscape phones and tablets', () => {
    expect(tableActivityLayout(667, 375)).toMatchObject({ landscape: true, mode: 'rail', railWidth: 193 });
    expect(tableActivityLayout(932, 430)).toMatchObject({ landscape: true, mode: 'rail', railWidth: 272 });
    expect(tableActivityLayout(1194, 834)).toMatchObject({ landscape: true, mode: 'rail', railWidth: 351 });
  });

  it('collapses the feed before violating the minimum playable felt width', () => {
    const shortest = tableActivityLayout(568, 320);
    expect(shortest).toEqual({ landscape: true, mode: 'disclosure', railWidth: 0 });

    const large = tableActivityLayout(932, 430);
    expect(932 - 24 - large.railWidth - 10).toBeGreaterThanOrEqual(TABLE_ACTIVITY_MIN_FELT_WIDTH);
  });
});
