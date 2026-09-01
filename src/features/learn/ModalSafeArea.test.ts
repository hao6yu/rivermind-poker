import { describe, expect, it } from 'vitest';

import { modalSafeAreaPadding } from './modalSafeAreaGeometry';

describe('modal safe-area padding', () => {
  it('uses the live landscape side instead of reserving both rotated sides', () => {
    expect(modalSafeAreaPadding(
      { bottom: 21, left: 59, right: 8, top: 0 },
      { bottom: 0, left: 8, right: 59, top: 0 },
    )).toEqual({ bottom: 21, left: 59, right: 8, top: 0 });
  });

  it('retains initial metrics only while a live axis has not reported', () => {
    expect(modalSafeAreaPadding(
      { bottom: 0, left: 0, right: 0, top: 0 },
      { bottom: 34, left: 0, right: 0, top: 47 },
    )).toEqual({ bottom: 34, left: 0, right: 0, top: 47 });
  });

  it('drops stale portrait top padding as soon as landscape reports its bottom', () => {
    expect(modalSafeAreaPadding(
      { bottom: 21, left: 59, right: 8, top: 0 },
      { bottom: 34, left: 0, right: 0, top: 59 },
    )).toEqual({ bottom: 21, left: 59, right: 8, top: 0 });
  });
});
