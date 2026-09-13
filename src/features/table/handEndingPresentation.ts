import type { ActionRecord } from '../../domain/poker/types';

/**
 * D1 common completion boundary.
 *
 * The two local table screens historically decided "may I show the result yet"
 * per surface (banner gate, audio schedule, card reveals, pot swap), which let
 * outcome-derived UI appear while — or, after an interruption, instead of — the
 * opponent's final action. This module derives ONE ordered presentation plan
 * from the engine transition, matching the required hand-ending sequence:
 *
 * 1. every committed-but-unpresented action, in engine order;
 * 2. the remaining board runout, if the betting ended before the river;
 * 3. the showdown reveal, if the outcome reached showdown (an uncontested
 *    fold never shows one);
 * 4. the pot allocation / win-loss result, always last.
 *
 * The plan is pure: the screens map steps onto their existing bubble, reveal,
 * banner and feedback surfaces and drive timing from `startMs`. A restored or
 * interrupted hand replays its unpresented tail by passing the actions after
 * the durable presentation cursor — the result step then lands only after the
 * replayed tail, which is the regression the screens must assert.
 */

export type HandEndingStepKind = 'action' | 'streetReveal' | 'showdown' | 'result';

export interface HandEndingActionStep {
  kind: 'action';
  historyIndex: number;
  startMs: number;
  durationMs: number;
  viewerActed: boolean;
}

export interface HandEndingStreetRevealStep {
  kind: 'streetReveal';
  boardCount: number;
  startMs: number;
  durationMs: number;
}

export interface HandEndingShowdownStep {
  kind: 'showdown';
  startMs: number;
  durationMs: number;
}

export interface HandEndingResultStep {
  kind: 'result';
  startMs: number;
}

export type HandEndingStep =
  | HandEndingActionStep
  | HandEndingStreetRevealStep
  | HandEndingShowdownStep
  | HandEndingResultStep;

export interface HandEndingPace {
  actionBubbleMs: number;
  showdownMs: number;
  streetRevealMs: number;
}

export interface HandEndingUnpresentedAction {
  action: Pick<ActionRecord, 'type'>;
  historyIndex: number;
  viewerActed: boolean;
}

export interface HandEndingTransition {
  boardCountBefore: number;
  boardCountNow: number;
  hasOutcome: boolean;
  showdown: boolean;
  unpresented: readonly HandEndingUnpresentedAction[];
}

const defaultPace: HandEndingPace = {
  actionBubbleMs: 1_450,
  showdownMs: 900,
  streetRevealMs: 700,
};

/** Reading window between the final runout card and the showdown reveal. */
export const HAND_ENDING_STREET_REVEAL_MS = 700;
/** Reading window between the showdown reveal and the result surface. */
export const HAND_ENDING_SHOWDOWN_REVEAL_MS = 900;

/**
 * Plans the ordered terminal sequence for one engine transition. Returns null
 * while the hand is still live — callers keep their mid-hand presentation
 * paths in that case.
 */
export function planHandEndingPresentation(
  transition: HandEndingTransition,
  pace: HandEndingPace = defaultPace,
): HandEndingStep[] | null {
  if (!transition.hasOutcome) return null;
  const steps: HandEndingStep[] = [];
  let cursorMs = 0;
  for (const entry of transition.unpresented) {
    steps.push({
      durationMs: pace.actionBubbleMs,
      historyIndex: entry.historyIndex,
      kind: 'action',
      startMs: cursorMs,
      viewerActed: entry.viewerActed,
    });
    cursorMs += pace.actionBubbleMs;
  }
  if (transition.boardCountNow > transition.boardCountBefore) {
    steps.push({
      boardCount: transition.boardCountNow,
      durationMs: pace.streetRevealMs,
      kind: 'streetReveal',
      startMs: cursorMs,
    });
    cursorMs += pace.streetRevealMs;
  }
  if (transition.showdown) {
    steps.push({
      durationMs: pace.showdownMs,
      kind: 'showdown',
      startMs: cursorMs,
    });
    // The result always lands one full showdown reading window after the
    // reveal step STARTS — including a resumed sequence that replays the
    // reveal (empty unpresented tail), whose result feedback must wait behind
    // the still-running visual window. A fully presented RESTORE overrides
    // the timing in the hook (fast-forwarded straight to the result step with
    // a zero delay), so this window never delays a restore.
    cursorMs += pace.showdownMs;
  }
  steps.push({ kind: 'result', startMs: cursorMs });
  return steps;
}

/** When the outcome surface (banner, pot swap, award audio) becomes visible. */
export function handEndingResultDelayMs(steps: readonly HandEndingStep[]): number {
  const result = steps.at(-1);
  return result?.kind === 'result' ? result.startMs : 0;
}

/**
 * The presentation cursor records how far a session has presented a hand's
 * history, so an interrupted or remounted screen can compute the unpresented
 * tail instead of assuming everything visible was seen. Kept per session id at
 * module scope: it intentionally survives screen remounts but not app restarts
 * (a restarted app has no in-flight presentation to protect).
 *
 * The cursor only advances over presentation steps that COMPLETED: a terminal
 * action is recorded when its reading window finishes, and `resultPresented`
 * marks the hand's result step as reached. A cursor that stops short of the
 * full history — or that never reached the result — replays the remainder on
 * the next mount instead of jumping to the result.
 */
export interface HandPresentationCursor {
  handNumber: number;
  historyLength: number;
  /** The terminal sequence reached its result step for this hand. */
  resultPresented?: boolean;
  /**
   * The board size BEFORE the terminal transition's runout, recorded when a
   * terminal plan is created. A remount replaying the sequence re-holds the
   * board at this size until the runout step runs again, so an interrupted
   * preflop/early-street all-in never remounts with the settled board showing.
   */
  boardCountBefore?: number;
}

const presentationCursors = new Map<string, HandPresentationCursor>();

export function readHandPresentationCursor(sessionClientId: string): HandPresentationCursor | null {
  return presentationCursors.get(sessionClientId) ?? null;
}

export function recordHandPresentationCursor(
  sessionClientId: string,
  cursor: HandPresentationCursor,
): void {
  presentationCursors.set(sessionClientId, cursor);
}

export function clearHandPresentationCursor(sessionClientId: string): void {
  presentationCursors.delete(sessionClientId);
}

/**
 * Actions committed after the session's presentation cursor, in engine order.
 * A hand change resets the tail: the cursor follows the new hand on its first
 * presented action, never leaking the previous hand's entries into a result
 * sequence for the next one.
 */
export function unpresentedActionTail<TAction>(
  sessionClientId: string,
  handNumber: number,
  history: readonly TAction[],
): { index: number; action: TAction }[] {
  const cursor = presentationCursors.get(sessionClientId);
  if (!cursor || cursor.handNumber !== handNumber) return [];
  const tail: { index: number; action: TAction }[] = [];
  for (let index = cursor.historyLength; index < history.length; index += 1) {
    tail.push({ action: history[index]!, index });
  }
  return tail;
}
