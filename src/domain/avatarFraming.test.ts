import { describe, expect, it } from 'vitest';

import {
  AUTHORED_AVATAR_CENTER_OF_MASS,
  AUTHORED_AVATAR_FIGURE_TOP,
  AVATAR_BADGE_SIZE,
  AVATAR_BUTTON_AVATAR_SIZE,
  AVATAR_BUTTON_SIDE,
  authoredAvatarHeadroom,
  authoredAvatarTransform,
} from './avatarFraming';

describe('authored avatar framing', () => {
  it('applies one deterministic transform at every size', () => {
    for (const size of [24, 32, 36, 40, 58, 76, 88, 128]) {
      const transform = authoredAvatarTransform(size);
      expect(transform.scale).toBeCloseTo(1.07, 10);
      expect(transform.translateY).toBeCloseTo(-0.035 * size, 10);
    }
  });

  it('leaves reviewed headroom above the figure at every size', () => {
    const headroom = authoredAvatarHeadroom();
    // The figure top moves from 15% of the raw frame to ~9% of the rendered
    // avatar, so the head gains the visual weight the scope requires without
    // floating free of the circular boundary.
    expect(headroom).toBeGreaterThan(0.075);
    expect(headroom).toBeLessThan(0.11);
    expect(headroom).toBeCloseTo((AUTHORED_AVATAR_FIGURE_TOP - 0.5) * 1.07 + 0.5 - 0.035, 10);
  });

  it('carries the figure bottom past the circular clip', () => {
    // Raw figure bottom ≈ 1.0 (clipped in the source). After the transform the
    // bottom edge stays at or beyond the boundary at every size.
    const bottomAfterTransform = (1 - 0.5) * 1.07 + 0.5 - 0.035;
    expect(bottomAfterTransform).toBeGreaterThanOrEqual(1);
  });

  it('keeps the normalized center of mass below center for a bust silhouette', () => {
    const com = (AUTHORED_AVATAR_CENTER_OF_MASS - 0.5) * 1.07 + 0.5 - 0.035;
    expect(com).toBeGreaterThan(0.5);
    expect(com).toBeLessThan(0.7);
  });

  it('rejects non-positive sizes', () => {
    expect(() => authoredAvatarTransform(0)).toThrow();
    expect(() => authoredAvatarTransform(-8)).toThrow();
  });

  it('keeps the shared button geometry at accessible sizes', () => {
    expect(AVATAR_BUTTON_SIDE).toBeGreaterThanOrEqual(44);
    expect(AVATAR_BUTTON_AVATAR_SIZE).toBeGreaterThanOrEqual(30);
    expect(AVATAR_BUTTON_AVATAR_SIZE).toBeLessThanOrEqual(32);
    expect(AVATAR_BADGE_SIZE).toBeLessThan(AVATAR_BUTTON_AVATAR_SIZE);
  });
});
