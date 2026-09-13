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
 * Builds the shared, deterministic final standings. Sessions rank by FINAL
 * STACK — the rule every shipped client computes — with equal stacks sharing a
 * place and canonical seat order breaking visual ties so every client renders
 * the same row order.
 *
 * A3 net ranking is DEFERRED (v1.3 follow-up review): a complete per-seat
 * ledger does not identify which ranking algorithm the seat's client
 * understands — the previous implementation already reads the same ledger and
 * always sorts by final stack, and server-created seats carry ledgers
 * regardless of client version. Ranking the same snapshot by net where one
 * client sorts by stack names different winners (reproduced: stack 3,500 net
 * −500 vs stack 2,500 net +500). Until a real session/protocol capability
 * boundary exists that keeps old clients out of net-ranked sessions, the
 * legacy rule is the only boundary that cannot disagree. `rankedByNet` stays
 * `false` and is reserved for that future, versioned rollout — see
 * `docs/RELEASE_1_3_A3_STANDINGS_RULE_PROPOSAL.md`.
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
        // one-buy-in delta. The delta is display data; it is not the ranking
        // key (see the deferred A3 note above).
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
    // Reserved for the deferred A3 net rule: always false until a session
    // capability boundary makes net ranking safe across client versions.
    rankedByNet: false,
    rows,
    sessionNumber: source.sessionNumber,
    viewerPlace: rows.find((row) => row.isViewer)?.place ?? null,
  };
}
