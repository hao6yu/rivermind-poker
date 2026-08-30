/**
 * Shared geometry for rendering human identity. Slice 3.11A introduced one
 * normalized framing so every authored avatar reads optically centered at
 * every size and in every surface (Home, Learn, Play, Profile, setup, tables,
 * results, replay) instead of relying on per-screen offsets.
 *
 * The authored silhouette artwork shares one geometry across all six assets:
 * the figure's top edge sits at 15.0% of the frame while the shoulders run
 * past the bottom edge (center of mass at 66.6% of the frame height). Rendered
 * as a plain full-bleed square the figure therefore reads undersized and low.
 *
 * `authoredAvatarTransform` applies the single reviewed correction: a slight
 * zoom plus upward shift that leaves ~9% headroom above the head and carries
 * the shoulders to the circular boundary. Uploaded photos are already square
 * crops and render full-bleed without a transform; initials are text and own
 * their centering.
 */

/** Authored artwork geometry, measured from the shipped 512×512 sources. */
export const AUTHORED_AVATAR_FIGURE_TOP = 0.15;
export const AUTHORED_AVATAR_CENTER_OF_MASS = 0.666;

/** The reviewed normalized framing, as (translateY, scale) around the center. */
export const AUTHORED_AVATAR_SCALE = 1.07;
export const AUTHORED_AVATAR_TRANSLATE_Y = -0.035;

export interface AuthoredAvatarTransform {
  /** Fraction of the rendered avatar size to shift the artwork up. */
  translateY: number;
  /** Uniform zoom applied around the artwork center. */
  scale: number;
}

/**
 * The deterministic transform for one authored avatar rendered at `size`
 * logical points. Headroom after the transform is
 * `(AUTHORED_AVATAR_FIGURE_TOP - 0.5) * scale + 0.5 + translateY ≈ 0.0905`,
 * and the figure's bottom edge lands past the circular clip so the shoulders
 * meet the boundary — the standard portrait framing, identical at every size.
 */
export function authoredAvatarTransform(size: number): AuthoredAvatarTransform {
  if (!(size > 0)) throw new Error('authoredAvatarTransform requires a positive size.');
  return { translateY: AUTHORED_AVATAR_TRANSLATE_Y * size, scale: AUTHORED_AVATAR_SCALE };
}

/** Headroom above the figure after normalization, as a fraction of `size`. */
export function authoredAvatarHeadroom(): number {
  return (AUTHORED_AVATAR_FIGURE_TOP - 0.5) * AUTHORED_AVATAR_SCALE + 0.5 + AUTHORED_AVATAR_TRANSLATE_Y;
}

/** Shared avatar-button geometry: one boundary for every tappable identity. */
export const AVATAR_BUTTON_SIDE = 44;
/** Visible avatar diameter inside the shared button. */
export const AVATAR_BUTTON_AVATAR_SIZE = 32;
/** Camera/edit badge diameter and its overlap into the avatar. */
export const AVATAR_BADGE_SIZE = 16;
export const AVATAR_BADGE_OVERLAP = 2;
