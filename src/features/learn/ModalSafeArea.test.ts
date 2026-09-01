import { describe, expect, it } from 'vitest';

import { modalSafeAreaPadding } from './modalSafeAreaGeometry';

describe('modal safe-area padding', () => {
  it('protects both landscape hardware edges', () => {
    expect(modalSafeAreaPadding(
      { bottom: 21, left: 59, right: 8, top: 0 },
      { bottom: 0, left: 8, right: 59, top: 0 },
    )).toEqual({ bottom: 21, left: 59, right: 59, top: 0 });
  });

  it('retains initial metrics until live rotation metrics catch up', () => {
    expect(modalSafeAreaPadding(
      { bottom: 0, left: 0, right: 0, top: 0 },
      { bottom: 34, left: 0, right: 0, top: 47 },
    )).toEqual({ bottom: 34, left: 0, right: 0, top: 47 });
  });
});
