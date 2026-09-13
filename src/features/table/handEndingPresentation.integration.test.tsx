import { createElement, useLayoutEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearHandPresentationCursor,
  HAND_ENDING_SHOWDOWN_REVEAL_MS,
  HAND_ENDING_STREET_REVEAL_MS,
  recordHandPresentationCursor,
  type HandEndingPace,
} from './handEndingPresentation';
import { useHandEndingPresentation } from './useHandEndingPresentation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TestAction = { playerId: 'hero' | 'ai-1'; type: 'fold' | 'check' | 'call' | 'raise' };

const pace: HandEndingPace = {
  actionBubbleMs: 1_000,
  showdownMs: HAND_ENDING_SHOWDOWN_REVEAL_MS,
  streetRevealMs: HAND_ENDING_STREET_REVEAL_MS,
};

let events: string[];

interface CommitRecord {
  boardCount: number;
  hasOutcome: boolean;
  isTerminalSequence: boolean;
  showdownRevealed: boolean;
}
let commits: CommitRecord[];

function Harness(props: {
  sessionClientId: string;
  handNumber: number;
  history: TestAction[];
  boardCount: number;
  showdown: boolean;
  hasOutcome: boolean;
}) {
  const handEnding = useHandEndingPresentation({
    actorId: (action) => action.playerId,
    boardCount: props.boardCount,
    handNumber: props.handNumber,
    history: props.history,
    outcome: props.hasOutcome ? { showdown: props.showdown } : null,
    pace,
    sessionClientId: props.sessionClientId,
    viewerPlayerId: 'hero',
  });
  // The screens' contract: bubble per presenting action, showdown reveal gate,
  // result surface gate — asserted as an ordered event log. The layout effect
  // records EVERY commit (including the first terminal render, before the
  // hook's effects run) so a first-commit reveal leak cannot hide.
  const bubble = handEnding.isTerminalSequence ? handEnding.presentingAction : null;
  const marker = bubble
    ? `action:${bubble.historyIndex}:${bubble.action.playerId}`
    : !handEnding.isTerminalSequence
      ? 'live'
      : handEnding.presentedOutcome
        ? 'result'
        : handEnding.showdownRevealed
          ? 'showdown'
          : 'runout';
  events.push(marker);
  useLayoutEffect(() => {
    commits.push({
      boardCount: handEnding.presentedBoardCount,
      hasOutcome: props.hasOutcome,
      isTerminalSequence: handEnding.isTerminalSequence,
      showdownRevealed: handEnding.showdownRevealed,
    });
  });
  return createElement('view', {
    testID: 'phase',
    phase: marker,
    boardCount: handEnding.presentedBoardCount,
    resultDelayMs: handEnding.resultDelayMsRef.current,
  });
}

function phaseOf(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root.findByProps({ testID: 'phase' }).props.phase as string;
}

function resultDelayMsOf(renderer: TestRenderer.ReactTestRenderer): number {
  return renderer.root.findByProps({ testID: 'phase' }).props.resultDelayMs as number;
}

describe('hand-ending presentation integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    commits = [];
  });
  afterEach(() => {
    vi.useRealTimers();
    clearHandPresentationCursor('session:test');
  });

  const terminalState = (showdown: boolean, extra: TestAction[] = []): {
    history: TestAction[];
    boardCount: number;
  } => ({
    boardCount: showdown ? 5 : 5,
    history: [
      { playerId: 'hero', type: 'raise' },
      { playerId: 'ai-1', type: 'call' },
      ...extra,
    ],
  });

  it('presents the AI final action before the showdown and the result on a river all-in', () => {
    const state = terminalState(true);
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 3,
        history: state.history.slice(0, 1),
        boardCount: 5,
        showdown: false,
        hasOutcome: false,
      }));
    });
    expect(phaseOf(renderer!)).toBe('live');
    // The AI calls all-in: the hand ends in the same transition (engine truth).
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 3,
        history: state.history,
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    // The terminal action bubble is visible immediately; no result yet.
    expect(phaseOf(renderer!)).toBe('action:1:ai-1');
    // result banner must NOT be present while the action is presented
    expect(events).not.toContain('result');
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    expect(phaseOf(renderer!)).toBe('showdown');
    act(() => { vi.advanceTimersByTime(HAND_ENDING_SHOWDOWN_REVEAL_MS); });
    expect(phaseOf(renderer!)).toBe('result');
    // Order: the AI action strictly precedes the showdown reveal and the result.
    expect(events.indexOf('action:1:ai-1'))
      .toBeLessThan(events.indexOf('showdown'));
    expect(events.indexOf('showdown')).toBeLessThan(events.indexOf('result'));
  });

  it('keeps the result hidden through the runout between an earlier-street all-in and the showdown', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 1,
        history: [{ playerId: 'hero', type: 'raise' }],
        boardCount: 4,
        showdown: false,
        hasOutcome: false,
      }));
    });
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 1,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    expect(phaseOf(renderer!)).toBe('action:1:ai-1');
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    expect(phaseOf(renderer!)).toBe('runout'); // board runout presented first
    act(() => { vi.advanceTimersByTime(HAND_ENDING_STREET_REVEAL_MS); });
    expect(phaseOf(renderer!)).toBe('showdown');
    expect(events).not.toContain('result');
    act(() => { vi.advanceTimersByTime(HAND_ENDING_SHOWDOWN_REVEAL_MS); });
    expect(phaseOf(renderer!)).toBe('result');
    expect(events.indexOf('action:1:ai-1')).toBeLessThan(events.indexOf('runout'));
    expect(events.indexOf('runout')).toBeLessThan(events.indexOf('result'));
  });

  it('shows the result without a showdown for an uncontested fold', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 2,
        history: [{ playerId: 'hero', type: 'raise' }],
        boardCount: 5,
        showdown: false,
        hasOutcome: false,
      }));
    });
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 2,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'fold' },
        ],
        boardCount: 5,
        showdown: false,
        hasOutcome: true,
      }));
    });
    expect(phaseOf(renderer!)).toBe('action:1:ai-1');
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    expect(phaseOf(renderer!)).toBe('result');
    expect(events).not.toContain('showdown');
  });

  it('replays the unpresented tail after a remount before showing the result', () => {
    // A hand completed while the screen was away: the cursor marks everything
    // through the hero raise as presented; the AI call and fold landed after.
    recordHandPresentationCursor('session:test', { handNumber: 7, historyLength: 1 });
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 7,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
          { playerId: 'ai-1', type: 'fold' },
        ],
        boardCount: 5,
        showdown: false,
        hasOutcome: true,
      }));
    });
    // Remount with a terminal state: the missed actions replay in order first.
    expect(phaseOf(renderer!)).toBe('action:1:ai-1');
    expect(events).not.toContain('result');
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    expect(phaseOf(renderer!)).toBe('action:2:ai-1');
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    expect(phaseOf(renderer!)).toBe('result');
    expect(events.indexOf('action:1:ai-1')).toBeLessThan(events.indexOf('action:2:ai-1'));
    expect(events.indexOf('action:2:ai-1')).toBeLessThan(events.indexOf('result'));
  });

  it('shows the result immediately for a restored hand with nothing unpresented', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 9,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    expect(phaseOf(renderer!)).toBe('result');
  });

  it('replays an action the hook itself recorded as interrupted mid-window', () => {
    // v1.3 review regression: the cursor must only record presentation steps
    // that COMPLETED. An unmount 100ms into the final action's own reading
    // window leaves that action unpresented, so the remount replays it instead
    // of jumping to the result — using exactly what the live hook wrote.
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 4,
        history: [{ playerId: 'hero', type: 'raise' }],
        boardCount: 5,
        showdown: false,
        hasOutcome: false,
      }));
    });
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 4,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    expect(phaseOf(renderer!)).toBe('action:1:ai-1');
    // Actually unmount the interrupted instance so its timers are gone — the
    // remount below is a true cold start, not a second live hook.
    act(() => { vi.advanceTimersByTime(100); renderer!.unmount(); });
    let restored: TestRenderer.ReactTestRenderer;
    act(() => {
      restored = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 4,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    expect(phaseOf(restored!), 'interrupted action must replay before the result').toBe('action:1:ai-1');
    expect(events).not.toContain('result');
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    expect(phaseOf(restored!)).toBe('showdown');
    act(() => { vi.advanceTimersByTime(HAND_ENDING_SHOWDOWN_REVEAL_MS); });
    expect(phaseOf(restored!)).toBe('result');
  });

  it('clears terminal state when a new session starts at the same hand number', () => {
    // v1.3 review regression: resets key on the FULL session/hand identity — a
    // new session that reuses hand 1 must not inherit the previous session's
    // finished presentation (which suppresses new action presentation).
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 1,
        history: [{ playerId: 'hero', type: 'raise' }],
        boardCount: 5,
        showdown: false,
        hasOutcome: false,
      }));
    });
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 1,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    act(() => { vi.advanceTimersByTime(HAND_ENDING_SHOWDOWN_REVEAL_MS + 1); });
    expect(phaseOf(renderer!)).toBe('result');
    // The SAME mounted hook instance receives the new session id — a fresh
    // renderer would not exercise the in-place reset.
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:next',
        handNumber: 1,
        history: [{ playerId: 'hero', type: 'raise' }],
        boardCount: 5,
        showdown: false,
        hasOutcome: false,
      }));
    });
    expect(phaseOf(renderer!), 'the live hook must reset in place').toBe('live');
  });

  it('holds the board runout until the runout step starts', () => {
    // v1.3 review regression: the board is a planned step — a preflop all-in
    // keeps the previous (empty) board while the final action is presented.
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 2,
        history: [{ playerId: 'hero', type: 'raise' }],
        boardCount: 0,
        showdown: false,
        hasOutcome: false,
      }));
    });
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 2,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    expect(phaseOf(renderer!)).toBe('action:1:ai-1');
    expect(renderer!.root.findByProps({ testID: 'phase' }).props.boardCount).toBe(0);
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    expect(phaseOf(renderer!)).toBe('runout');
    expect(renderer!.root.findByProps({ testID: 'phase' }).props.boardCount).toBe(5);
    act(() => { vi.advanceTimersByTime(HAND_ENDING_STREET_REVEAL_MS); });
    expect(phaseOf(renderer!)).toBe('showdown');
    act(() => { vi.advanceTimersByTime(HAND_ENDING_SHOWDOWN_REVEAL_MS + 1); });
    expect(phaseOf(renderer!)).toBe('result');
    expect(renderer!.root.findByProps({ testID: 'phase' }).props.boardCount).toBe(5);
  });

  it('never permits opponent-card revelation on the first terminal commit', () => {
    // v1.3 follow-up review: before the hook's effects engage the plan, the
    // first committed terminal render must already gate the reveal — no
    // outcome-derived fallback may flash the cards for one commit.
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 5,
        history: [{ playerId: 'hero', type: 'raise' }],
        boardCount: 5,
        showdown: false,
        hasOutcome: false,
      }));
    });
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 5,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    const outcomeCommits = commits.filter((commit) => commit.hasOutcome);
    expect(outcomeCommits.length).toBeGreaterThan(0);
    // The FIRST outcome commit happens before the plan engages: the reveal
    // must be gated and the sequence must already be treated as running.
    expect(outcomeCommits[0]!.isTerminalSequence).toBe(false);
    expect(outcomeCommits[0]!.showdownRevealed).toBe(false);
    // No outcome commit may reveal before the plan reaches the reveal step:
    // the phase log and the commit log advance in lockstep (one entry per
    // render), so everything before the reveal phase must be gated.
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    expect(phaseOf(renderer!)).toBe('showdown');
    const revealIndex = events.indexOf('showdown');
    expect(revealIndex).toBeGreaterThan(0);
    for (const commit of commits.slice(0, revealIndex)) {
      if (commit.hasOutcome) expect(commit.showdownRevealed).toBe(false);
    }
    act(() => { vi.advanceTimersByTime(HAND_ENDING_SHOWDOWN_REVEAL_MS + 1); });
    expect(phaseOf(renderer!)).toBe('result');
  });

  it('resumes an interrupted showdown with matching visual and feedback timing', () => {
    // v1.3 follow-up review: unmount during the showdown window (after the
    // final action finished), remount — the replayed showdown keeps its
    // reading window and the result feedback must report the SAME delay, not
    // a zero-delay cue ahead of the visuals.
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 6,
        history: [{ playerId: 'hero', type: 'raise' }],
        boardCount: 5,
        showdown: false,
        hasOutcome: false,
      }));
    });
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 6,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    expect(phaseOf(renderer!)).toBe('showdown');
    expect(renderer!.root.findByProps({ testID: 'phase' }).props.resultDelayMs)
      .toBe(pace.actionBubbleMs + HAND_ENDING_SHOWDOWN_REVEAL_MS);
    act(() => { renderer!.unmount(); });
    let restored: TestRenderer.ReactTestRenderer;
    act(() => {
      restored = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 6,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    // The resumed sequence replays the reveal: the result step is still ahead,
    // and the controller schedules the cue exactly one showdown window out.
    expect(phaseOf(restored!)).toBe('showdown');
    expect(restored!.root.findByProps({ testID: 'phase' }).props.resultDelayMs)
      .toBe(HAND_ENDING_SHOWDOWN_REVEAL_MS);
    expect(events).not.toContain('result');
    act(() => { vi.advanceTimersByTime(HAND_ENDING_SHOWDOWN_REVEAL_MS + 1); });
    expect(phaseOf(restored!)).toBe('result');
  });

  it('replays an interrupted runout before the reveal and the result', () => {
    // Interruption inside the RUNOUT window (not only the action window): the
    // cursor's pre-transition board size re-holds the board, so the remount
    // replays the runout step, the reveal, and the result — the settled board
    // never appears as if the sequence had finished.
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 7,
        history: [{ playerId: 'hero', type: 'raise' }],
        boardCount: 0,
        showdown: false,
        hasOutcome: false,
      }));
    });
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 7,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs + 100); });
    expect(phaseOf(renderer!)).toBe('runout');
    act(() => { renderer!.unmount(); });
    commits = [];
    let restored: TestRenderer.ReactTestRenderer;
    act(() => {
      restored = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 7,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    // The completed action does not replay, but the pending runout is still
    // the active step: the runout phase is in progress (its reveal shows the
    // board as it steps) and the result feedback waits behind the remaining
    // runout and reveal windows. The FIRST commit still holds the saved
    // boundary — the reveal belongs to the runout step, not the settled state.
    expect(phaseOf(restored!)).toBe('runout');
    expect(restored!.root.findByProps({ testID: 'phase' }).props.boardCount).toBe(5);
    expect(commits[0]!.boardCount, 'the first committed render holds the saved boundary').toBe(0);
    expect(restored!.root.findByProps({ testID: 'phase' }).props.resultDelayMs)
      .toBe(HAND_ENDING_STREET_REVEAL_MS + HAND_ENDING_SHOWDOWN_REVEAL_MS);
    expect(events).not.toContain('result');
    act(() => { vi.advanceTimersByTime(HAND_ENDING_STREET_REVEAL_MS); });
    expect(phaseOf(restored!)).toBe('showdown');
    expect(restored!.root.findByProps({ testID: 'phase' }).props.boardCount).toBe(5);
    act(() => { vi.advanceTimersByTime(HAND_ENDING_SHOWDOWN_REVEAL_MS + 1); });
    expect(phaseOf(restored!)).toBe('result');
  });

  it('re-holds the board during a replayed action when the runout is still pending', () => {
    // Interruption inside the action window of a preflop all-in: the remount
    // replays the final action with the board held at its pre-transition size,
    // then runs the runout, the reveal, and the result in order.
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 8,
        history: [{ playerId: 'hero', type: 'raise' }],
        boardCount: 0,
        showdown: false,
        hasOutcome: false,
      }));
    });
    act(() => {
      renderer!.update(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 8,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    act(() => { vi.advanceTimersByTime(100); renderer!.unmount(); });
    commits = [];
    let restored: TestRenderer.ReactTestRenderer;
    act(() => {
      restored = TestRenderer.create(createElement(Harness, {
        sessionClientId: 'session:test',
        handNumber: 8,
        history: [
          { playerId: 'hero', type: 'raise' },
          { playerId: 'ai-1', type: 'call' },
        ],
        boardCount: 5,
        showdown: true,
        hasOutcome: true,
      }));
    });
    expect(phaseOf(restored!)).toBe('action:1:ai-1');
    expect(restored!.root.findByProps({ testID: 'phase' }).props.boardCount).toBe(0);
    // Every commit of the restored mount — including the FIRST one, before
    // this hook's effects run — must hold the saved pre-runout boundary. A
    // commit showing the settled board here is the ungated flash the
    // remediation review reproduced.
    const restoredCommits = commits.filter((commit) => commit.hasOutcome);
    expect(restoredCommits.length).toBeGreaterThan(0);
    expect(restoredCommits[0]!.boardCount, 'the first committed restore render must hold the saved board boundary').toBe(0);
    expect(restoredCommits[0]!.isTerminalSequence).toBe(false);
    const revealCommitIndex = events.indexOf('runout');
    for (const commit of commits.slice(0, revealCommitIndex)) {
      if (commit.hasOutcome) expect(commit.boardCount).toBe(0);
    }
    act(() => { vi.advanceTimersByTime(pace.actionBubbleMs); });
    expect(phaseOf(restored!)).toBe('runout');
    expect(restored!.root.findByProps({ testID: 'phase' }).props.boardCount).toBe(5);
    act(() => { vi.advanceTimersByTime(HAND_ENDING_STREET_REVEAL_MS); });
    expect(phaseOf(restored!)).toBe('showdown');
    act(() => { vi.advanceTimersByTime(HAND_ENDING_SHOWDOWN_REVEAL_MS + 1); });
    expect(phaseOf(restored!)).toBe('result');
  });
});
