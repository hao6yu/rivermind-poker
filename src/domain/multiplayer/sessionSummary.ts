import type {
  MultiplayerRoomSnapshot,
  MultiplayerSessionStanding,
  MultiplayerSessionSummary,
} from './contracts.ts';

type SessionSummarySource = Pick<
  MultiplayerRoomSnapshot,
  'completionReason' | 'config' | 'hand' | 'seats' | 'sessionNumber' | 'status'
>;

/**
 * Builds the shared, deterministic final standings from authoritative stacks.
 * Equal stacks share a place; canonical seat order breaks visual ties so every
 * client renders the same row order.
 */
export function buildMultiplayerSessionSummary(
  source: SessionSummarySource,
  viewerPlayerId: string,
): MultiplayerSessionSummary | null {
  const { completionReason, hand } = source;
  if (source.status !== 'complete' || !completionReason || !hand?.outcome) return null;

  const seats = new Map(source.seats.map((seat) => [seat.playerId, seat]));
  const ordered = hand.tablePlayerIds
    .map((playerId) => {
      const player = hand.players[playerId];
      const seat = seats.get(playerId);
      if (!player || !seat) return null;
      return {
        avatar: seat.avatar ?? null,
        delta: player.stack - source.config.startingStackChips,
        isViewer: playerId === viewerPlayerId,
        kind: seat.kind,
        label: player.name,
        place: 0,
        playerId,
        seat: seat.seat,
        stack: player.stack,
      } satisfies MultiplayerSessionStanding;
    })
    .filter((row): row is MultiplayerSessionStanding => row !== null)
    .sort((left, right) => right.stack - left.stack || left.seat - right.seat);

  let previousStack: number | null = null;
  let previousPlace = 0;
  const rows = ordered.map((row, index) => {
    const place = previousStack === row.stack ? previousPlace : index + 1;
    previousStack = row.stack;
    previousPlace = place;
    return { ...row, place };
  });

  return {
    completionReason,
    handsPlayed: hand.handNumber,
    rows,
    sessionNumber: source.sessionNumber,
    viewerPlace: rows.find((row) => row.isViewer)?.place ?? null,
  };
}
