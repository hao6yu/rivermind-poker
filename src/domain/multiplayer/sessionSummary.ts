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

  // The SESSION roster is the row source, not the last hand's dealt-player
  // subset (R3/adjacent check 4): a participant who sat out, was omitted, or
  // permanently left before the final hand keeps their settled ledger row in
  // the standings, the live Table stats sheet, and the archive.
  const ordered = source.seats
    .map((seat) => {
      const player = hand.players[seat.playerId];
      const settledStack = seat.ledger?.settledStack
        ?? (player ? player.stack : source.config.startingStackChips);
      return {
        avatar: seat.avatar ?? null,
        // The ledger delta (scope 3.11F): settled stack minus the COMPLETE
        // buy-in (original plus every rebuy) — identical to the live Table
        // stats sheet. Legacy seats without a ledger row fall back to the
        // one-buy-in delta.
        delta: seat.ledger
          ? seat.ledger.settledStack - seat.ledger.totalBuyIn
          : settledStack - source.config.startingStackChips,
        isViewer: seat.playerId === viewerPlayerId,
        kind: seat.kind,
        label: player?.name ?? seat.displayName,
        place: 0,
        playerId: seat.playerId,
        seat: seat.seat,
        stack: settledStack,
      } satisfies MultiplayerSessionStanding;
    })
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
