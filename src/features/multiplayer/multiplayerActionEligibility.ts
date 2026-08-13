import type {
  MultiplayerRoomCommand,
  MultiplayerViewerProjection,
} from '../../domain/multiplayer/contracts';

type NonActionCommandType = Exclude<MultiplayerRoomCommand['type'], 'action'>;

export type MultiplayerActionSubmissionCommand =
  | Pick<Extract<MultiplayerRoomCommand, { type: 'action' }>, 'action' | 'type'>
  | { type: NonActionCommandType };

export interface MultiplayerActionSubmissionOrigin {
  roomId: string;
  version: number;
}

/**
 * Last-mile client preflight against the newest personalized projection.
 * The coordinator remains authoritative; this prevents a stale rendered
 * button, accessibility event, or sizing sheet from sending a command that
 * the current snapshot already proves is invalid.
 */
export function canSubmitMultiplayerAction(
  latest: MultiplayerViewerProjection | null,
  command: MultiplayerActionSubmissionCommand,
  origin: MultiplayerActionSubmissionOrigin,
): boolean {
  if (
    !latest
    || latest.roomId !== origin.roomId
    || latest.version !== origin.version
    || latest.status !== 'playing'
    || command.type !== 'action'
    || !latest.hand
    || latest.hand.street === 'complete'
    || latest.hand.toAct !== latest.viewerPlayerId
  ) return false;

  const viewerSeat = latest.seats.find((seat) => seat.playerId === latest.viewerPlayerId);
  if (
    !viewerSeat
    || viewerSeat.kind !== 'human'
    || viewerSeat.control !== 'human'
    || viewerSeat.connection !== 'online'
  ) return false;

  const legal = latest.legalActions;
  if (!legal) return false;

  switch (command.action.type) {
    case 'fold':
      return legal.canFold;
    case 'check':
      return legal.canCheck;
    case 'call':
      return legal.canCall;
    case 'raise': {
      const target = command.action.amount;
      return legal.canRaise
        && typeof target === 'number'
        && Number.isSafeInteger(target)
        && target > latest.hand.currentBet
        && target >= legal.minRaiseTo
        && target <= legal.maxRaiseTo;
    }
  }
}
