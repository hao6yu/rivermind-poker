export interface TableOverlayLayout {
  compactHeight: boolean;
  largeText: boolean;
  tablet: boolean;
}

export const TABLE_OVERLAY_TABLET_MIN_EDGE = 700;
export const TABLE_OVERLAY_LARGE_TEXT_SCALE = 1.35;

/**
 * Shared presentation breakpoints for history and replay overlays.
 *
 * The shorter edge distinguishes an iPad canvas from a landscape phone, while
 * font scale is kept separate from geometry so large accessibility text can
 * gain vertical room without collapsing a tablet back to phone typography.
 */
export function tableOverlayLayout(
  width: number,
  height: number,
  fontScale = 1,
): TableOverlayLayout {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
  const safeFontScale = Number.isFinite(fontScale) ? Math.max(0, fontScale) : 1;
  const tablet = Math.min(safeWidth, safeHeight) >= TABLE_OVERLAY_TABLET_MIN_EDGE;
  return {
    compactHeight: !tablet && safeHeight < 720,
    largeText: safeFontScale >= TABLE_OVERLAY_LARGE_TEXT_SCALE,
    tablet,
  };
}
