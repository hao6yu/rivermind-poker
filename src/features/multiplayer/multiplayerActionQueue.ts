import type {
  MultiplayerPublicTransition,
  MultiplayerViewerProjection,
} from '../../domain/multiplayer/contracts';
import type {
  MultiwayActionRecord,
  MultiwayHandState,
} from '../../domain/poker/multiway';

const MAX_LIVE_HANDOFF_FRAMES = 2;
const LIVE_HANDOFF_FRAME_MS = 1_800;

export interface MultiplayerPresentationTransition {
  handNumber: number;
  transition: MultiplayerPublicTransition;
}

export interface MultiplayerActionFrame {
  action: MultiwayActionRecord;
  board: MultiwayHandState['board'];
  durationMs: number;
  historyIndex: number;
  id: string;
  key: string;
}

export interface BuildMultiplayerActionFramesInput {
  currentHand: MultiwayHandState;
  /** The table street that was authoritative when this frame batch was built. */
  displayedStreet?: MultiwayActionRecord['street'];
  previousHistoryLength: number;
  sameHand: boolean;
  transitions: MultiplayerPresentationTransition[];
}

export interface MultiplayerPresentationCursor {
  consumedTransitionVersions: ReadonlySet<number>;
  observedHistory: { handNumber: number; length: number } | null;
  presentedActionIds: ReadonlySet<string>;
}

export interface PendingMultiplayerActionPresentationInput extends MultiplayerPresentationCursor {
  currentHand: MultiwayHandState | null;
  roomVersion: number;
  transitions: MultiplayerPresentationTransition[];
}

function sameMultiplayerAction(left: MultiwayActionRecord, right: MultiwayActionRecord): boolean {
  return left.playerId === right.playerId
    && left.type === right.type
    && left.amount === right.amount
    && left.street === right.street
    && left.potAfter === right.potAfter;
}

function boardForStreet(
  board: MultiwayHandState['board'],
  street: MultiwayActionRecord['street'],
): MultiwayHandState['board'] {
  const visible = street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
  return board.slice(0, visible);
}

function presentationStreetForHand(
  hand: Pick<MultiwayHandState, 'history' | 'street'>,
): MultiwayActionRecord['street'] | null {
  if (hand.street !== 'complete') return hand.street;
  return hand.history.at(-1)?.street ?? null;
}

/**
 * Builds bubbles that are synchronized with the authoritative table now on
 * screen. The coordinator can resolve the end of one street and the beginning
 * of the next in a single response. Those earlier actions remain in hand
 * history, but replaying them over the newer board made a legal preflop Call
 * appear to conflict with the same AI's later flop Check.
 */
export function buildMultiplayerActionFrames({
  currentHand,
  displayedStreet,
  previousHistoryLength,
  sameHand,
  transitions,
}: BuildMultiplayerActionFramesInput): MultiplayerActionFrame[] {
  const additions: MultiplayerActionFrame[] = [];
  const presentationStreet = displayedStreet ?? presentationStreetForHand(currentHand);
  if (!presentationStreet) return additions;
  if (transitions.length > 0) {
    let searchFrom = sameHand ? Math.min(previousHistoryLength, currentHand.history.length) : 0;
    transitions.forEach(({ transition }) => {
      const synchronizedActions = transition.actionBatch
        .map((action, offset) => ({ action, offset }))
        .filter(({ action }) => action.street === presentationStreet);
      // Exact actions stay under every seat. Before returning controls, keep
      // only the final live handoff so presentation never consumes a large
      // share of the authoritative turn clock.
      const presentedActions = synchronizedActions.slice(-MAX_LIVE_HANDOFF_FRAMES);
      presentedActions.forEach(({ action: publicAction, offset }) => {
        const action = publicAction as MultiwayActionRecord;
        const matchedIndex = currentHand.history.findIndex((candidate, index) => (
          index >= searchFrom && sameMultiplayerAction(candidate, action)
        ));
        // Never attribute an unmatched broadcast action to a guessed suffix
        // index. It may be delayed from an older snapshot/hand, or may already
        // sit before the observed cursor. Only authoritative current-hand
        // history can create a visible frame.
        if (matchedIndex < 0) return;
        const historyIndex = matchedIndex;
        searchFrom = historyIndex + 1;
        additions.push({
          action: currentHand.history[matchedIndex]!,
          board: boardForStreet(currentHand.board, action.street),
          durationMs: LIVE_HANDOFF_FRAME_MS,
          historyIndex,
          id: `${currentHand.handNumber}:${historyIndex}`,
          key: `transition:${transition.version}:${offset}`,
        });
      });
    });
    // The budget applies to the whole render handoff, even when Realtime
    // delivered several transitions before the snapshot caught up.
    return additions.slice(-MAX_LIVE_HANDOFF_FRAMES);
  }

  if (!sameHand || previousHistoryLength >= currentHand.history.length) return additions;
  const start = Math.min(previousHistoryLength, currentHand.history.length);
  const synchronizedActions = currentHand.history
    .map((action, historyIndex) => ({ action, historyIndex }))
    .slice(start)
    .filter(({ action }) => action.street === presentationStreet)
    .slice(-MAX_LIVE_HANDOFF_FRAMES);
  synchronizedActions.forEach(({ action, historyIndex }) => {
    additions.push({
      action,
      board: boardForStreet(currentHand.board, action.street),
      durationMs: LIVE_HANDOFF_FRAME_MS,
      historyIndex,
      id: `${currentHand.handNumber}:${historyIndex}`,
      key: `history:${currentHand.handNumber}:${historyIndex}`,
    });
  });
  return additions;
}

/**
 * Returns the exact frames an effect has not consumed yet. Callers can use
 * this during render to lock controls before the queue-populating effect runs,
 * closing the one-paint gap between an authoritative snapshot and its live
 * action presentation.
 */
export function pendingMultiplayerActionFrames({
  consumedTransitionVersions,
  currentHand,
  observedHistory,
  presentedActionIds,
  roomVersion,
  transitions,
}: PendingMultiplayerActionPresentationInput): MultiplayerActionFrame[] {
  if (!currentHand) return [];
  const sameHand = observedHistory?.handNumber === currentHand.handNumber;
  const pendingTransitions = transitions
    .filter(({ handNumber, transition }) => (
      handNumber === currentHand.handNumber
      && transition.version <= roomVersion
      && !consumedTransitionVersions.has(transition.version)
    ))
    .sort((left, right) => left.transition.version - right.transition.version);
  return buildMultiplayerActionFrames({
    currentHand,
    previousHistoryLength: observedHistory?.length ?? 0,
    sameHand,
    transitions: pendingTransitions,
  }).filter(({ id }) => !presentedActionIds.has(id));
}

/** Render-time boolean form of `pendingMultiplayerActionFrames`. */
export function hasPendingMultiplayerActionPresentation(
  input: PendingMultiplayerActionPresentationInput,
): boolean {
  return pendingMultiplayerActionFrames(input).length > 0;
}

/** Action controls remain locked while any delayed synchronized bubble is visible. */
export function multiplayerActionControlsEnabled(
  room: Pick<MultiplayerViewerProjection, 'legalActions' | 'viewerPlayerId'>,
  frame: MultiplayerActionFrame | undefined,
  pendingPresentation = false,
): boolean {
  return room.legalActions !== null && frame === undefined && !pendingPresentation;
}

/**
 * Keep the visible frame stable, prefer the newest waiting action, and never
 * let incremental transition delivery grow the queue beyond the same two-frame
 * / 3.6-second budget used by the builder.
 */
export function mergeMultiplayerActionFrames(
  current: MultiplayerActionFrame[],
  additions: MultiplayerActionFrame[],
  currentHand: Pick<MultiwayHandState, 'history' | 'street'>,
): MultiplayerActionFrame[] {
  if (additions.length > 0) {
    const newestPresentedStreet = additions.at(-1)!.action.street;
    const sameStreetCurrent = current.filter(
      ({ action }) => action.street === newestPresentedStreet,
    );
    const merged = [
      ...sameStreetCurrent,
      ...additions,
    ];
    if (merged.length <= MAX_LIVE_HANDOFF_FRAMES) return merged;
    if (sameStreetCurrent.length === 0) return merged.slice(-MAX_LIVE_HANDOFF_FRAMES);
    const visible = sameStreetCurrent[0]!;
    const newest = merged.at(-1)!;
    return visible.id === newest.id ? [visible] : [visible, newest];
  }
  const presentationStreet = presentationStreetForHand(currentHand);
  if (!presentationStreet) return [];
  return [
    ...current.filter(({ action }) => action.street === presentationStreet),
  ];
}

/** The visible turn follows delayed presentation until it catches the snapshot. */
export function multiplayerPresentedTurnPlayerId(
  authoritativePlayerId: string | null,
  frame: MultiplayerActionFrame | undefined,
): string | null {
  return frame?.action.playerId ?? authoritativePlayerId;
}

/**
 * A delayed bubble must never be painted over a board from another street.
 * If the authoritative snapshot has already advanced, stage the board at the
 * frame's street until presentation reaches the newer action.
 */
export function multiplayerPresentedStreet(
  authoritativeStreet: MultiwayHandState['street'],
  frame: MultiplayerActionFrame | undefined,
): MultiwayHandState['street'] {
  return frame?.action.street ?? authoritativeStreet;
}

/** Keep pot copy synchronized with the visible action, not a later snapshot. */
export function multiplayerPresentedPot(
  authoritativePot: number,
  frame: MultiplayerActionFrame | undefined,
): number {
  return frame?.action.potAfter ?? authoritativePot;
}
