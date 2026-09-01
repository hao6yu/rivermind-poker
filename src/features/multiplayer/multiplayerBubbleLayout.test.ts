import { describe, expect, it } from 'vitest';

import { resolveMultiplayerMeasuredBubbleLayout } from './multiplayerBubbleLayout';

const pane = { bottom: 500, left: 0, right: 360, top: 0 };
const board = { bottom: 330, left: 92, right: 268, top: 170 };

describe('private-table measured action bubbles', () => {
  it('grows a left-edge bubble inward and keeps its full measured frame safe', () => {
    const result = resolveMultiplayerMeasuredBubbleLayout({
      board,
      bubbleHeight: 54,
      bubbleWidth: 172,
      horizontal: 'left',
      pane,
      prefer: 'below',
      seat: { bottom: 128, left: 2, right: 96, top: 64 },
      tailSize: 9,
    });
    expect(result.frame.left).toBeGreaterThanOrEqual(pane.left);
    expect(result.frame.right).toBeLessThanOrEqual(pane.right);
    expect(result.frame.left).toBe(2);
    expect(result.localStyle.left).toBe(0);
  });

  it('grows a right-edge bubble inward rather than clipping past the pane', () => {
    const seat = { bottom: 128, left: 264, right: 358, top: 64 };
    const result = resolveMultiplayerMeasuredBubbleLayout({
      board,
      bubbleHeight: 54,
      bubbleWidth: 172,
      horizontal: 'right',
      pane,
      prefer: 'below',
      seat,
      tailSize: 9,
    });
    expect(result.frame.right).toBeLessThanOrEqual(pane.right);
    expect(result.frame.right).toBe(358);
    expect(result.localStyle.left).toBeLessThan(0);
  });

  it('flips off the protected board lane and preserves the source plaque', () => {
    const seat = { bottom: 166, left: 133, right: 227, top: 102 };
    const result = resolveMultiplayerMeasuredBubbleLayout({
      board,
      bubbleHeight: 58,
      bubbleWidth: 184,
      horizontal: 'center',
      pane,
      prefer: 'below',
      seat,
      tailSize: 9,
    });
    expect(result.placement).toBe('above');
    expect(result.frame.bottom).toBeLessThanOrEqual(seat.top);
    expect(result.frame.top).toBeGreaterThanOrEqual(pane.top);
  });

  it('clamps a large localized bubble inside a short safe pane', () => {
    const shortPane = { bottom: 220, left: 18, right: 542, top: 10 };
    const result = resolveMultiplayerMeasuredBubbleLayout({
      board: { bottom: 152, left: 188, right: 372, top: 74 },
      bubbleHeight: 68,
      bubbleWidth: 250,
      horizontal: 'right',
      pane: shortPane,
      prefer: 'above',
      seat: { bottom: 214, left: 438, right: 536, top: 156 },
      tailSize: 9,
    });
    expect(result.frame.left).toBeGreaterThanOrEqual(shortPane.left);
    expect(result.frame.right).toBeLessThanOrEqual(shortPane.right);
    expect(result.frame.top).toBeGreaterThanOrEqual(shortPane.top);
    expect(result.frame.bottom).toBeLessThanOrEqual(shortPane.bottom);
    expect(result.tailLeft).toBeGreaterThanOrEqual(0);
    expect(result.tailLeft + 9).toBeLessThanOrEqual(result.localStyle.width);
  });
});
