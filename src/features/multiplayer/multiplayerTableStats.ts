import type { MultiplayerLedgerEntry, MultiplayerParticipationState, MultiplayerSeatState } from '../../domain/multiplayer/contracts';
import { formatChips } from '../../domain/poker/moneyFormat';
import type { MessageKey } from '../../localization/messages';

/**
 * The live Table stats presentation (scope 3.11F): every participant's
 * settled result against their complete buy-in ledger, frozen through the
 * active hand and sorted from the largest winner to the largest loser with
 * canonical-seat tie breaks. Values derive from net chips — never from the
 * final stack alone — so a rebuy is never misread as a win.
 */

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export interface MultiplayerTableStatsRow {
  accessibilityLabel: string;
  /** Explicit AI/Human identity shown on the row. */
  identityLabel: string;
  /** Localized signed result: Won 8,000 / Lost 4,000 / Even. */
  resultLabel: string;
  /** Human participation qualifier shown on the row, when any. */
  qualifierLabel: string | null;
  rebuyCountLabel: string;
  seat: number;
  /** Supporting values: settled stack, total buy-in, rebuy count. */
  stackLabel: string;
  totalBuyInLabel: string;
}

export interface MultiplayerTableStatsPanel {
  /** Localized "Through hand N" while a hand is active; null when idle. */
  throughHandLabel: string | null;
  rows: MultiplayerTableStatsRow[];
}

/** Net chips against the complete buy-in ledger. */
export function multiplayerLedgerNetChips(entry: MultiplayerLedgerEntry): number {
  return entry.settledStack - entry.totalBuyIn;
}

/** The localized signed result for one net value: Won/Lost/Even. */
export function multiplayerLedgerResultLabel(netChips: number, t: Translate): string {
  if (netChips > 0) return t('multiplayer.stats.won', { amount: formatChips(netChips) });
  if (netChips < 0) return t('multiplayer.stats.lost', { amount: formatChips(-netChips) });
  return t('multiplayer.stats.even');
}

/** The explicit participation qualifier for a human seat, when any. */
export function multiplayerParticipationLabel(
  seat: Pick<MultiplayerSeatState, 'kind' | 'participation'>,
  t: Translate,
): string | null {
  if (seat.kind !== 'human') return null;
  switch (seat.participation) {
    case 'disconnected': return t('multiplayer.stats.disconnected');
    case 'left': return t('multiplayer.stats.left');
    case 'rebuy-pending': return t('multiplayer.stats.rebuyPending');
    case 'sitting-out': return t('multiplayer.stats.sittingOut');
    default: return null;
  }
}

/** Whether the room has completed at least one settled hand. */
function hasSettledHand(seats: ReadonlyArray<Partial<MultiplayerSeatState>>): boolean {
  return seats.some((seat) => (seat.ledger?.settledHandNumber ?? 0) > 0);
}

/**
 * The whole panel: all participants (including AI, busted, sitting-out,
 * disconnected, and departed seats), ordered by net chips descending with
 * canonical-seat tie breaks, rendered Even across the board before the first
 * settled hand.
 */
export function buildMultiplayerTableStats(
  seats: ReadonlyArray<Pick<MultiplayerSeatState, 'displayName' | 'kind' | 'ledger' | 'participation' | 'playerId' | 'seat'>>,
  activeHandNumber: number | null,
  t: Translate,
): MultiplayerTableStatsPanel {
  const ordered = [...seats].sort((left, right) => {
    const leftNet = left.ledger ? multiplayerLedgerNetChips(left.ledger) : 0;
    const rightNet = right.ledger ? multiplayerLedgerNetChips(right.ledger) : 0;
    if (leftNet !== rightNet) return rightNet - leftNet;
    return left.seat - right.seat;
  });
  const settled = hasSettledHand(seats);
  const rows = ordered.map((seat) => {
    const net = seat.ledger ? multiplayerLedgerNetChips(seat.ledger) : 0;
    // Before the first settled hand every participant reads Even — never a
    // winner or loser (scope 3.11F).
    const resultLabel = settled ? multiplayerLedgerResultLabel(net, t) : t('multiplayer.stats.even');
    const qualifierLabel = multiplayerParticipationLabel(seat, t);
    const identity = seat.kind === 'ai'
      ? t('multiplayer.lobby.ai')
      : t('multiplayer.profile.human');
    const accessibilityLabel = [
      seat.displayName,
      qualifierLabel ?? identity,
      resultLabel,
      t('multiplayer.stats.stack', { amount: formatChips(seat.ledger?.settledStack ?? 0) }),
      t('multiplayer.stats.buyIn', { amount: formatChips(seat.ledger?.totalBuyIn ?? 0) }),
      t('multiplayer.stats.rebuys', { count: seat.ledger?.rebuyCount ?? 0 }),
    ].filter(Boolean).join('. ');
    return {
      accessibilityLabel,
      identityLabel: identity,
      qualifierLabel,
      rebuyCountLabel: t('multiplayer.stats.rebuys', { count: seat.ledger?.rebuyCount ?? 0 }),
      resultLabel,
      seat: seat.seat,
      stackLabel: formatChips(seat.ledger?.settledStack ?? 0),
      totalBuyInLabel: formatChips(seat.ledger?.totalBuyIn ?? 0),
    };
  });
  return {
    rows,
    throughHandLabel: activeHandNumber !== null
      ? t('multiplayer.stats.throughHand', { hand: activeHandNumber })
      : null,
  };
}

export type { MultiplayerParticipationState };
