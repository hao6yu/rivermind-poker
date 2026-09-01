export interface ModalSafeAreaInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** Keep modal content clear of the CURRENT hardware edges without permanently
 * combining portrait metrics with a later landscape orientation. Initial
 * metrics are only a first-frame fallback for an axis whose live pair is still
 * all zero. Once either live inset on an axis is non-zero, that live pair is
 * authoritative. This prevents a rotation from reserving the old portrait top
 * plus both the old and new landscape camera sides at the same time. */
export function modalSafeAreaPadding(
  live: ModalSafeAreaInsets,
  initial?: ModalSafeAreaInsets,
): ModalSafeAreaInsets {
  const liveHorizontalReady = live.left > 0 || live.right > 0;
  const liveVerticalReady = live.top > 0 || live.bottom > 0;
  return {
    bottom: liveVerticalReady ? live.bottom : initial?.bottom ?? 0,
    left: liveHorizontalReady ? live.left : initial?.left ?? 0,
    right: liveHorizontalReady ? live.right : initial?.right ?? 0,
    top: liveVerticalReady ? live.top : initial?.top ?? 0,
  };
}
