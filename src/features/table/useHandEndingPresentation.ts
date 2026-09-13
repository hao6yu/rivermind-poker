import { useEffect, useRef, useState, type RefObject } from 'react';

import type { ActionType } from '../../domain/poker/types';
import {
  handEndingResultDelayMs,
  planHandEndingPresentation,
  readHandPresentationCursor,
  recordHandPresentationCursor,
  type HandEndingPace,
  type HandEndingStep,
} from './handEndingPresentation';

export interface UseHandEndingPresentationInput<TAction> {
  /** Module-scope presentation cursor key; survives screen remounts. */
  sessionClientId: string;
  handNumber: number;
  history: readonly TAction[];
  actorId: (action: TAction) => string;
  viewerPlayerId: string;
  boardCount: number;
  /** Null while the hand is live; the hook only sequences terminal hands. */
  outcome: { showdown: boolean } | null;
  pace: HandEndingPace;
}

export interface HandEndingPresentationController<TAction> {
  /**
   * Synchronous mirror of the terminal-sequence state. Effects that run in the
   * same commit (the screens' legacy action effects) must read this ref, not
   * the state, or they act one transition too early.
   */
  isTerminalSequenceRef: RefObject<boolean>;
  /** Synchronous mirror of `resultDelayMs` for same-commit scheduling effects. */
  resultDelayMsRef: RefObject<number>;
  isTerminalSequence: boolean;
  presentingAction: { action: TAction; historyIndex: number; viewerActed: boolean } | null;
  /** The result surface (banner, winner labels) may render. */
  presentedOutcome: boolean;
  /** Showdown cards may flip. Always true for restores with nothing to replay. */
  showdownRevealed: boolean;
  /**
   * Board cards the presentation may show. Inside a terminal sequence the
   * runout is a planned step, so the board holds its pre-runout size until
   * that step starts; outside one, this equals the live engine board.
   */
  presentedBoardCount: number;
  /** Delay from the terminal transition to the result step, for audio. */
  resultDelayMs: number;
}

interface TerminalSequenceState {
  key: string;
  plan: HandEndingStep[];
  step: number;
  /** Board size before the terminal transition's runout, for the reveal gate. */
  boardCountBefore: number;
}

/**
 * D1 common completion boundary for the local table screens. Terminal hands
 * are presented as ONE ordered plan — committed actions (replayed after an
 * interruption via the session presentation cursor), then the board runout,
 * then the showdown reveal, then the result — instead of each surface gating
 * independently. Mid-hand transitions keep the screens' existing presentation.
 *
 * The session cursor only advances over presentation steps that completed:
 * planning a sequence records the boundary BEFORE its tail, each finished
 * action step advances it, and reaching the result marks the hand presented.
 * An interrupted action therefore replays on the next mount instead of
 * skipping straight to the result. Resets key on the full session/hand
 * identity — a new session that reuses a hand number never inherits the
 * previous session's terminal state.
 */
export function useHandEndingPresentation<TAction extends { type: ActionType }>(
  input: UseHandEndingPresentationInput<TAction>,
): HandEndingPresentationController<TAction> {
  const { actorId, boardCount, handNumber, history, outcome, pace, sessionClientId, viewerPlayerId } = input;
  const presentedThrough = useRef({ session: sessionClientId, handNumber, length: history.length });
  // P2 (remediation review): the FIRST committed render must already hold the
  // saved board boundary. This ref initializer runs before this hook's effect
  // can adopt the cursor, so a remounted interrupted all-in — settled engine
  // board of five cards, saved boundary of zero — would otherwise commit the
  // full runout once and only then re-hold the board during the replayed
  // action. A matching UNFINISHED cursor supplies the boundary; unrelated
  // hands and fully presented restores keep the live engine board.
  const initialCursor = readHandPresentationCursor(sessionClientId);
  const boardCountBefore = useRef(
    initialCursor !== null
      && initialCursor.handNumber === handNumber
      && initialCursor.resultPresented !== true
      && typeof initialCursor.boardCountBefore === 'number'
      ? Math.min(initialCursor.boardCountBefore, boardCount)
      : boardCount,
  );
  const plannedKey = useRef<string | null>(null);
  const [terminal, setTerminal] = useState<TerminalSequenceState | null>(null);
  const isTerminalSequenceRef = useRef(false);
  const resultDelayMsRef = useRef(0);

  useEffect(() => {
    if (presentedThrough.current.session !== sessionClientId || presentedThrough.current.handNumber !== handNumber) {
      const sameSession = presentedThrough.current.session === sessionClientId;
      presentedThrough.current = { session: sessionClientId, handNumber, length: history.length };
      boardCountBefore.current = boardCount;
      plannedKey.current = null;
      isTerminalSequenceRef.current = false;
      resultDelayMsRef.current = 0;
      setTerminal(null);
      // Only the SAME session's cursor follows the new hand. A different
      // session has presented nothing here, so it gets no cursor: its first
      // terminal hand is planned from what this mount actually presents.
      if (sameSession) {
        recordHandPresentationCursor(sessionClientId, { handNumber, historyLength: history.length });
      }
      return;
    }
    // A remount re-initializes the local boundary at the current length; the
    // session cursor remembers which presentation steps COMPLETED, so an
    // interrupted tail replays instead of the result appearing immediately.
    // The cursor's pre-transition board size lets a replay re-hold the board
    // until its runout step runs again.
    const cursor = readHandPresentationCursor(sessionClientId);
    const cursorForHand = cursor && cursor.handNumber === handNumber && cursor.resultPresented !== true
      ? cursor
      : null;
    const replayBoardCountBefore = cursorForHand?.boardCountBefore ?? null;
    // Both replay branches re-engage a partially presented sequence: adopt the
    // cursor's pre-transition board size so a pending runout replays behind
    // the remaining steps instead of appearing settled on the remount.
    if (replayBoardCountBefore !== null) boardCountBefore.current = replayBoardCountBefore;
    let start: number;
    if (history.length > presentedThrough.current.length) {
      // New committed actions on this mount: present from the boundary the
      // viewer last saw, never re-showing steps the cursor completed.
      start = Math.min(presentedThrough.current.length, cursorForHand ? cursorForHand.historyLength : history.length);
    } else if (cursorForHand && cursorForHand.historyLength < history.length) {
      // A remount with unpresented committed actions (interrupted mid-sequence).
      start = cursorForHand.historyLength;
    } else if (cursorForHand) {
      // Every committed action finished its window, but the result step never
      // ran (interrupted during the runout/showdown windows): re-engage the
      // plan from its first non-action step instead of fast-forwarding.
      start = history.length;
    } else {
      // Nothing unpresented. A restored terminal hand still engages the plan
      // (fast-forwarded) so every result surface shares one boundary.
      const key = `${sessionClientId}:${handNumber}`;
      if (outcome && plannedKey.current !== key) {
        plannedKey.current = key;
        const plan = planHandEndingPresentation({
          boardCountBefore: boardCount,
          boardCountNow: boardCount,
          hasOutcome: true,
          showdown: outcome.showdown,
          unpresented: [],
        }, pace);
        if (plan) {
          isTerminalSequenceRef.current = true;
          resultDelayMsRef.current = 0;
          setTerminal({ boardCountBefore: boardCount, key, plan, step: plan.length - 1 });
        }
      }
      return;
    }
    const tail: { action: TAction; historyIndex: number; viewerActed: boolean }[] = [];
    for (let index = start; index < history.length; index += 1) {
      const action = history[index]!;
      tail.push({ action, historyIndex: index, viewerActed: actorId(action) === viewerPlayerId });
    }
    presentedThrough.current = { session: sessionClientId, handNumber, length: history.length };
    const previousBoardCount = boardCountBefore.current;
    boardCountBefore.current = boardCount;
    if (!outcome) {
      // Live actions present immediately through the screens' legacy bubble
      // path, so the cursor follows them at once.
      isTerminalSequenceRef.current = false;
      resultDelayMsRef.current = 0;
      setTerminal(null);
      recordHandPresentationCursor(sessionClientId, { handNumber, historyLength: history.length });
      return;
    }
    // Only steps before the tail completed; the tail itself is recorded step
    // by step as its presentation windows finish. The pre-transition board
    // size rides along so a replay can re-hold the board during its runout.
    recordHandPresentationCursor(sessionClientId, {
      boardCountBefore: previousBoardCount,
      handNumber,
      historyLength: start,
      resultPresented: false,
    });
    const key = `${sessionClientId}:${handNumber}`;
    if (plannedKey.current === key) return;
    plannedKey.current = key;
    const plan = planHandEndingPresentation({
      boardCountBefore: previousBoardCount,
      boardCountNow: boardCount,
      hasOutcome: true,
      showdown: outcome.showdown,
      unpresented: tail.map(({ action, historyIndex, viewerActed }) => ({
        action,
        historyIndex,
        viewerActed,
      })),
    }, pace);
    if (!plan) return;
    isTerminalSequenceRef.current = true;
    resultDelayMsRef.current = handEndingResultDelayMs(plan);
    setTerminal({ boardCountBefore: previousBoardCount, key, plan, step: 0 });
  }, [actorId, boardCount, handNumber, history, outcome, pace, sessionClientId, viewerPlayerId]);

  const plan = terminal?.plan ?? null;
  const step = terminal?.step ?? 0;
  const currentStep: HandEndingStep | null = plan ? plan[Math.min(step, plan.length - 1)]! : null;

  useEffect(() => {
    if (!plan || !terminal) return undefined;
    if (terminal.step >= plan.length - 1) return undefined;
    const currentEntry = plan[terminal.step]!;
    const durationMs = currentEntry.kind === 'result' ? 0 : currentEntry.durationMs;
    const timer = setTimeout(() => {
      // The step's reading window finished: it is now presented, and a remount
      // must never replay it. The pre-transition board size rides along so a
      // replay of the remaining steps can still re-hold the board.
      if (currentEntry.kind === 'action') {
        recordHandPresentationCursor(sessionClientId, {
          boardCountBefore: terminal.boardCountBefore,
          handNumber,
          historyLength: currentEntry.historyIndex + 1,
          resultPresented: false,
        });
      }
      setTerminal((current) => current?.key === terminal.key
        ? { ...current, step: current.step + 1 }
        : current);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [handNumber, plan, sessionClientId, terminal]);

  // The result step is the presentation boundary: once it is visible, the
  // hand's sequence completed and a later remount fast-forwards instead of
  // replaying a fully presented hand. The key check keeps a stale terminal
  // state from stamping a cursor for a hand it does not belong to.
  useEffect(() => {
    const key = `${sessionClientId}:${handNumber}`;
    if (!terminal || terminal.key !== key) return;
    if (terminal.step < terminal.plan.length - 1) return;
    if (terminal.plan[terminal.plan.length - 1]?.kind !== 'result') return;
    recordHandPresentationCursor(sessionClientId, {
      handNumber,
      historyLength: history.length,
      resultPresented: true,
    });
  }, [handNumber, history.length, sessionClientId, terminal]);

  const presentingAction = currentStep?.kind === 'action'
    ? {
      action: history[currentStep.historyIndex]!,
      historyIndex: currentStep.historyIndex,
      viewerActed: currentStep.viewerActed,
    }
    : null;
  const showdownStepIndex = plan?.findIndex((entry) => entry.kind === 'showdown') ?? -1;
  const streetRevealStepIndex = plan?.findIndex((entry) => entry.kind === 'streetReveal') ?? -1;
  const resultDelayMs = plan ? handEndingResultDelayMs(plan) : 0;

  return {
    isTerminalSequenceRef,
    resultDelayMsRef,
    isTerminalSequence: terminal !== null,
    presentingAction,
    presentedBoardCount: terminal
      ? (streetRevealStepIndex >= 0 && step < streetRevealStepIndex ? terminal.boardCountBefore : boardCount)
      // The render between an outcome commit and this effect's plan engagement
      // must not flash the settled runout either: the ref still holds the
      // pre-transition board size in that render.
      : outcome
        ? boardCountBefore.current
        : boardCount,
    presentedOutcome: currentStep?.kind === 'result',
    // The reveal gate must hold on the FIRST terminal render too — before this
    // effect engages the plan, `terminal` is still null and an outcome-derived
    // fallback here would let showdown cards commit one render early. A hand
    // with no terminal plan has nothing revealed; restored hands fast-forward
    // through the plan and reveal immediately after engagement.
    showdownRevealed: terminal
      ? (showdownStepIndex < 0 || step >= showdownStepIndex)
      : false,
    resultDelayMs,
  };
}
