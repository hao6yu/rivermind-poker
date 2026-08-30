import type { TableMomentEnvelope, TableMomentReactionId } from '../../domain/multiplayer/tableMoments';
import { tableMomentEnvelopeIsFresh } from '../../domain/multiplayer/tableMoments';
import type { MultiwayActionRecord, MultiwayHandState } from '../../domain/poker/multiway';
import type { ActionRecord, Card, GameState, Street } from '../../domain/poker/types';

export type TableActivityEventKind =
  | 'action'
  | 'award'
  | 'board'
  | 'moment'
  | 'result'
  | 'street';

export interface TableActivityEvent {
  action?: ActionRecord['type'];
  aggression?: 'bet' | 'raise';
  allIn?: boolean;
  amount?: number;
  cards?: Card[];
  ephemeral?: boolean;
  id: string;
  kind: TableActivityEventKind;
  playerId?: string;
  playerName?: string;
  reactionId?: TableMomentReactionId;
  sequence: number;
  street?: Street;
  winnerNames?: string[];
}

const PLAYABLE_STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river'];

function visibleBoardCount(street: Street): number {
  if (street === 'flop') return 3;
  if (street === 'turn') return 4;
  if (street === 'river' || street === 'complete') return 5;
  return 0;
}

function appendStreet(
  events: TableActivityEvent[],
  emitted: Set<Street>,
  handNumber: number,
  street: Street,
  board: Card[],
) {
  if (street === 'complete' || emitted.has(street)) return;
  emitted.add(street);
  events.push({
    id: `${handNumber}:street:${street}`,
    kind: 'street',
    sequence: events.length,
    street,
  });
  const count = visibleBoardCount(street);
  if (count > 0 && board.length >= count) {
    events.push({
      cards: street === 'flop' ? board.slice(0, 3) : board.slice(count - 1, count),
      id: `${handNumber}:board:${street}`,
      kind: 'board',
      sequence: events.length,
      street,
    });
  }
}

function headsUpActionIsAllIn(action: ActionRecord): boolean {
  const paid = action.type === 'raise'
    ? Math.max(0, action.amount - action.decisionContext.playerStreetBetBefore)
    : action.amount;
  return action.type !== 'fold'
    && action.type !== 'check'
    && paid >= action.decisionContext.playerStackBefore;
}

function multiwayActionIsAllIn(action: MultiwayActionRecord): boolean {
  if (!action.decisionContext || action.type === 'fold' || action.type === 'check') return false;
  const paid = action.type === 'raise'
    ? Math.max(0, action.amount - action.decisionContext.playerStreetBetBefore)
    : action.amount;
  return paid >= action.decisionContext.playerStackBefore;
}

export function projectHeadsUpTableActivity(game: GameState): TableActivityEvent[] {
  const events: TableActivityEvent[] = [];
  const emitted = new Set<Street>();
  appendStreet(events, emitted, game.handNumber, 'preflop', game.board);
  game.history.forEach((action, index) => {
    appendStreet(events, emitted, game.handNumber, action.street, action.decisionContext.board);
    events.push({
      action: action.type,
      aggression: action.type === 'raise'
        ? action.decisionContext.currentBet === 0 ? 'bet' : 'raise'
        : undefined,
      allIn: headsUpActionIsAllIn(action),
      amount: action.amount,
      id: `${game.handNumber}:action:${index}`,
      kind: 'action',
      playerId: action.player,
      playerName: game.players[action.player].name,
      sequence: events.length,
      street: action.street,
    });
  });
  for (const street of PLAYABLE_STREETS) {
    if (game.board.length >= visibleBoardCount(street)) {
      appendStreet(events, emitted, game.handNumber, street, game.board);
    }
  }
  if (game.outcome) {
    events.push({
      amount: game.outcome.potWon,
      id: `${game.handNumber}:result`,
      kind: 'result',
      sequence: events.length,
      winnerNames: game.outcome.winner === 'tie'
        ? []
        : [game.players[game.outcome.winner].name],
    });
  }
  return events;
}

export function projectMultiwayTableActivity(game: MultiwayHandState): TableActivityEvent[] {
  const events: TableActivityEvent[] = [];
  const emitted = new Set<Street>();
  appendStreet(events, emitted, game.handNumber, 'preflop', game.board);
  game.history.forEach((action, index) => {
    appendStreet(
      events,
      emitted,
      game.handNumber,
      action.street,
      action.decisionContext?.board ?? game.board,
    );
    events.push({
      action: action.type,
      aggression: action.type === 'raise'
        ? (action.decisionContext?.currentBet ?? 0) === 0 ? 'bet' : 'raise'
        : undefined,
      allIn: multiwayActionIsAllIn(action),
      amount: action.amount,
      id: `${game.handNumber}:action:${index}`,
      kind: 'action',
      playerId: action.playerId,
      playerName: game.players[action.playerId]?.name ?? action.playerId,
      sequence: events.length,
      street: action.street,
    });
  });
  for (const street of PLAYABLE_STREETS) {
    if (game.board.length >= visibleBoardCount(street)) {
      appendStreet(events, emitted, game.handNumber, street, game.board);
    }
  }
  game.outcome?.awards.forEach((award, index) => {
    events.push({
      amount: award.amount,
      id: `${game.handNumber}:award:${index}`,
      kind: 'award',
      sequence: events.length,
      winnerNames: award.winnerPlayerIds.map((playerId) => game.players[playerId]?.name ?? playerId),
    });
  });
  if (game.outcome) {
    events.push({
      amount: game.outcome.totalPot,
      id: `${game.handNumber}:result`,
      kind: 'result',
      sequence: events.length,
      winnerNames: game.outcome.winnerPlayerIds.map((playerId) => game.players[playerId]?.name ?? playerId),
    });
  }
  return events;
}

export function projectTableMomentActivity(
  moments: readonly TableMomentEnvelope[],
  playerNames: Readonly<Record<string, string>>,
  handNumber: number,
  nowMs: number,
): TableActivityEvent[] {
  const seen = new Set<string>();
  return moments
    .filter((moment) => moment.handNumber === handNumber && tableMomentEnvelopeIsFresh(moment, nowMs))
    .sort((left, right) => left.atMs - right.atMs || left.id.localeCompare(right.id))
    .filter((moment) => {
      if (seen.has(moment.id)) return false;
      seen.add(moment.id);
      return true;
    })
    .map((moment, index) => ({
      ephemeral: true,
      id: `moment:${moment.id}`,
      kind: 'moment',
      playerId: moment.playerId,
      playerName: playerNames[moment.playerId] ?? `#${moment.seat + 1}`,
      reactionId: moment.reactionId,
      sequence: index,
    }));
}

/**
 * Keeps already-observed chronology stable as canonical projections grow.
 * Durable current-hand rows stay reconstructable; expired moment rows are
 * removed when the next projection no longer contains them.
 */
export function mergeTableActivityEvents(
  current: readonly TableActivityEvent[],
  projected: readonly TableActivityEvent[],
  capacity = 80,
): TableActivityEvent[] {
  const projectedById = new Map(projected.map((event) => [event.id, event]));
  const seen = new Set<string>();
  const merged: TableActivityEvent[] = [];
  for (const event of current) {
    const replacement = projectedById.get(event.id);
    if (event.ephemeral && !replacement) continue;
    if (seen.has(event.id)) continue;
    merged.push(replacement ?? event);
    seen.add(event.id);
  }
  for (const event of projected) {
    if (seen.has(event.id)) continue;
    merged.push(event);
    seen.add(event.id);
  }
  return merged.slice(-capacity).map((event, sequence) => ({ ...event, sequence }));
}
