import type { MultiwayLayoutRect } from '../table/multiwayTableLayout';
import { resolveMultiwayBubbleFrame } from '../table/multiwayGameplayPresentation';

export interface MultiplayerMeasuredBubbleLayoutInput {
  board: MultiwayLayoutRect | null;
  bubbleHeight: number;
  bubbleWidth: number;
  horizontal: 'center' | 'left' | 'right';
  pane: MultiwayLayoutRect;
  prefer: 'above' | 'below';
  seat: MultiwayLayoutRect;
  tailSize: number;
}

export interface MultiplayerMeasuredBubbleLayout {
  frame: MultiwayLayoutRect;
  localStyle: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
  placement: 'above' | 'below';
  /** Seat-relative left offset that keeps the tail aimed at the source plaque
   * even when the bubble itself was clamped inward. */
  tailLeft: number;
}

/**
 * Private-table adapter around the shared measured resolver. The source seat
 * and safe pane are table-relative, while the returned style is seat-relative
 * because the rendered bubble is a child of the occupied plaque.
 */
export function resolveMultiplayerMeasuredBubbleLayout(
  input: MultiplayerMeasuredBubbleLayoutInput,
): MultiplayerMeasuredBubbleLayout {
  const anchor = input.horizontal === 'left'
    ? 'mid-left'
    : input.horizontal === 'right' ? 'mid-right' : 'top-center';
  const resolved = resolveMultiwayBubbleFrame({
    anchor,
    board: input.board,
    bubbleHeight: input.bubbleHeight,
    bubbleWidth: input.bubbleWidth,
    pane: input.pane,
    prefer: input.prefer,
    seat: input.seat,
  });
  const width = resolved.right - resolved.left;
  const sourceCenter = (input.seat.left + input.seat.right) / 2;
  const tailMargin = Math.min(8, Math.max(0, (width - input.tailSize) / 2));
  const tailLeft = Math.max(
    tailMargin,
    Math.min(sourceCenter - resolved.left - input.tailSize / 2, width - input.tailSize - tailMargin),
  );
  return {
    frame: resolved,
    localStyle: {
      height: resolved.bottom - resolved.top,
      left: resolved.left - input.seat.left,
      top: resolved.top - input.seat.top,
      width: resolved.right - resolved.left,
    },
    placement: resolved.placement,
    tailLeft,
  };
}
