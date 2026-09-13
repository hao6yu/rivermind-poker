import { describe, expect, it } from 'vitest';

import {
  clearHandPresentationCursor,
  handEndingResultDelayMs,
  planHandEndingPresentation,
  readHandPresentationCursor,
  recordHandPresentationCursor,
  unpresentedActionTail,
} from './handEndingPresentation';

const pace = { actionBubbleMs: 1_000, showdownMs: 500, streetRevealMs: 400 };

describe('hand ending presentation plan', () => {
  it('returns null while the hand is still live', () => {
    expect(planHandEndingPresentation({
      boardCountBefore: 4,
      boardCountNow: 4,
      hasOutcome: false,
      showdown: false,
      unpresented: [{ action: { type: 'raise' }, historyIndex: 6, viewerActed: true }],
    }, pace)).toBeNull();
  });

  it('orders the river all-in call before the showdown and the result', () => {
    const steps = planHandEndingPresentation({
      boardCountBefore: 5,
      boardCountNow: 5,
      hasOutcome: true,
      showdown: true,
      unpresented: [{ action: { type: 'call' }, historyIndex: 7, viewerActed: false }],
    }, pace);
    expect(steps?.map((step) => step.kind)).toEqual(['action', 'showdown', 'result']);
    expect(steps?.[0]).toMatchObject({ historyIndex: 7, startMs: 0, durationMs: 1_000, viewerActed: false });
    expect(steps?.[1]).toMatchObject({ startMs: 1_000 });
    expect(steps?.[2]).toMatchObject({ startMs: 1_500 });
    expect(handEndingResultDelayMs(steps!)).toBe(1_500);
  });

  it('presents every remaining AI response in order before the result', () => {
    const steps = planHandEndingPresentation({
      boardCountBefore: 5,
      boardCountNow: 5,
      hasOutcome: true,
      showdown: true,
      unpresented: [
        { action: { type: 'call' }, historyIndex: 7, viewerActed: false },
        { action: { type: 'fold' }, historyIndex: 8, viewerActed: false },
      ],
    }, pace);
    expect(steps?.map((step) => step.kind)).toEqual(['action', 'action', 'showdown', 'result']);
    expect(steps?.[1]).toMatchObject({ historyIndex: 8, startMs: 1_000 });
    expect(handEndingResultDelayMs(steps!)).toBe(2_500);
  });

  it('runs the board out in order between the final action and a showdown', () => {
    const steps = planHandEndingPresentation({
      boardCountBefore: 4,
      boardCountNow: 5,
      hasOutcome: true,
      showdown: true,
      unpresented: [{ action: { type: 'call' }, historyIndex: 5, viewerActed: false }],
    }, pace);
    expect(steps?.map((step) => step.kind)).toEqual(['action', 'streetReveal', 'showdown', 'result']);
    expect(steps?.[1]).toMatchObject({ boardCount: 5, startMs: 1_000 });
    expect(handEndingResultDelayMs(steps!)).toBe(1_900);
  });

  it('never shows a showdown for an uncontested fold', () => {
    const steps = planHandEndingPresentation({
      boardCountBefore: 5,
      boardCountNow: 5,
      hasOutcome: true,
      showdown: false,
      unpresented: [{ action: { type: 'fold' }, historyIndex: 6, viewerActed: false }],
    }, pace);
    expect(steps?.map((step) => step.kind)).toEqual(['action', 'result']);
  });

  it('plans the reveal ahead of the result for a hand with no unpresented tail', () => {
    // A hand re-engaged with an empty tail (interrupted during the reveal)
    // still runs the showdown window before the result — the result delay must
    // match the visual sequence. A fully presented RESTORE fast-forwards in
    // the hook with a zero delay instead of re-running this window.
    const steps = planHandEndingPresentation({
      boardCountBefore: 5,
      boardCountNow: 5,
      hasOutcome: true,
      showdown: true,
      unpresented: [],
    }, pace);
    expect(steps?.map((step) => step.kind)).toEqual(['showdown', 'result']);
    expect(steps?.[0]).toMatchObject({ startMs: 0, durationMs: 500 });
    expect(handEndingResultDelayMs(steps!)).toBe(500);
  });

  it('replays the unpresented tail after an interruption before the result', () => {
    const sessionId = 'session:interrupt';
    clearHandPresentationCursor(sessionId);
    // The hand completed while the app was backgrounded: two actions committed
    // after the last presented boundary, then the outcome.
    recordHandPresentationCursor(sessionId, { handNumber: 4, historyLength: 5 });
    const history = [
      { type: 'raise' }, { type: 'call' }, { type: 'raise' }, { type: 'call' }, { type: 'raise' },
      { type: 'call' }, { type: 'fold' },
    ] as const;
    const tail = unpresentedActionTail(sessionId, 4, history);
    expect(tail.map(({ index }) => index)).toEqual([5, 6]);
    const steps = planHandEndingPresentation({
      boardCountBefore: 5,
      boardCountNow: 5,
      hasOutcome: true,
      showdown: true,
      unpresented: tail.map(({ action, index }) => ({ action, historyIndex: index, viewerActed: false })),
    }, pace);
    expect(steps?.map((step) => step.kind)).toEqual(['action', 'action', 'showdown', 'result']);
    expect(handEndingResultDelayMs(steps!)).toBe(2_500);
  });

  it('keeps presentation cursors per session and resets them on a new hand', () => {
    const first = 'session:a';
    const second = 'session:b';
    recordHandPresentationCursor(first, { handNumber: 2, historyLength: 1 });
    recordHandPresentationCursor(second, { handNumber: 9, historyLength: 1 });
    expect(readHandPresentationCursor(first)).toEqual({ handNumber: 2, historyLength: 1 });
    const history = [{ type: 'check' }, { type: 'call' }];
    // Same hand, unpresented entries returned; a different hand returns none.
    expect(unpresentedActionTail(first, 2, history)).toEqual([{ action: { type: 'call' }, index: 1 }]);
    expect(unpresentedActionTail(first, 3, history)).toEqual([]);
    clearHandPresentationCursor(first);
    expect(readHandPresentationCursor(first)).toBeNull();
    clearHandPresentationCursor(second);
  });
});
