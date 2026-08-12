const TABLET_PORTRAIT_MIN_WIDTH = 700;

/**
 * Keep the richer coach surface for a true tablet canvas. Narrow split-screen
 * windows fall back to the compact strip even when they are running on iPad.
 */
export function showsExpandedPortraitCoach(width: number, height: number): boolean {
  return width >= TABLET_PORTRAIT_MIN_WIDTH && height > width;
}
