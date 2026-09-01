export interface ModalSafeAreaInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** Keep modal content clear of every hardware edge in either landscape
 * direction. Initial metrics cover the first native frame; live metrics take
 * over after rotation. */
export function modalSafeAreaPadding(
  live: ModalSafeAreaInsets,
  initial?: ModalSafeAreaInsets,
): ModalSafeAreaInsets {
  return {
    bottom: Math.max(live.bottom, initial?.bottom ?? 0),
    left: Math.max(live.left, initial?.left ?? 0),
    right: Math.max(live.right, initial?.right ?? 0),
    top: Math.max(live.top, initial?.top ?? 0),
  };
}
