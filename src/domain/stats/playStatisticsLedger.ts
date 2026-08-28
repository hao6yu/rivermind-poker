import type { MultiwayHandOutcome, MultiwayHandState } from '../poker/multiway';
import type { GameState } from '../poker/types';
import {
  PLAY_STATISTICS_SOURCES,
  type PlayHandRecord,
  type PlayHandResult,
  type PlayStatisticsSource,
} from './playStatistics';

/**
 * Adapters from the three canonical completed-hand ledgers into the one shape the
 * statistics projection counts. They are deliberately structural: each takes
 * only the fields that decide "did this player complete this hand, and did they
 * win it", so the counting rules are testable without a table, a fetch, or a
 * database, and the service layer stays a thin reader.
 */

/** The local player's seat id in their own solo and local-multiway tables. */
const HERO_PLAYER_ID = 'hero';

/** Minimum shape of a saved heads-up hand (`HeadsUpSessionHandRecord`). */
export interface HeadsUpLedgerHand {
  clientId: string;
  game: Pick<GameState, 'street' | 'outcome'> | null | undefined;
}

/** Minimum shape of a saved local multiway hand (`MultiwaySessionHandRecord`). */
export interface LocalMultiwayLedgerHand {
  clientId: string;
  game: Pick<MultiwayHandState, 'street' | 'outcome'> | null | undefined;
}

/** Minimum shape of one archived private-table hand. */
export interface PrivateLedgerHand {
  roomId: string;
  sessionNumber: number;
  viewerPlayerId: string;
  hand: Pick<MultiwayHandState, 'handNumber' | 'street' | 'outcome'>;
}

/**
 * A hand counts as completed only when the engine itself closed it: the street
 * reached `complete` and an outcome was recorded. A hand abandoned mid-street —
 * an app closed at the table, a room left before settle — has no outcome, and a
 * record whose state never finished is not evidence of a played hand.
 */
function isCompletedStreet(street: unknown, outcome: unknown): boolean {
  return street === 'complete' && outcome !== null && outcome !== undefined;
}

/**
 * The stable identity of the table a hand belongs to in the player's own
 * records. Hand writes key themselves as `${sessionClientId}:hand:${handNumber}`;
 * an id without that shape stands alone as its own table rather than silently
 * merging into another session.
 */
function ownTableId(clientId: unknown): string | null {
  if (typeof clientId !== 'string' || clientId.trim() === '') return null;
  const separator = clientId.lastIndexOf(':hand:');
  return separator > 0 ? clientId.slice(0, separator) : clientId;
}

function headsUpResult(outcome: GameState['outcome']): PlayHandResult {
  if (outcome?.winner === HERO_PLAYER_ID) return 'won';
  if (outcome?.winner === 'tie') return 'split';
  return 'lost';
}

/**
 * The multiway reading of a win. A seat that took the only pot won the hand; a
 * seat that was paid alongside anyone else — a shared main pot, or a side pot
 * while somebody else took another — is credited as a shared win, because
 * counting that hand as a loss would understate the record exactly as much as
 * counting it outright would overstate it.
 */
function multiwayResult(outcome: MultiwayHandOutcome | undefined, playerId: string): PlayHandResult {
  if (!outcome) return 'lost';
  const paidSeats = new Set<string>();
  for (const award of outcome.awards ?? []) {
    for (const winner of award.winnerPlayerIds ?? []) {
      if ((award.shares[winner] ?? 0) > 0) paidSeats.add(winner);
    }
  }
  if (!paidSeats.has(playerId)) return 'lost';
  return paidSeats.size > 1 ? 'split' : 'won';
}

function counted(
  source: PlayStatisticsSource,
  handId: string,
  tableId: string,
  result: PlayHandResult,
): PlayHandRecord {
  return { handId, source, tableId, completed: true, result };
}

function mapLedgerHands<T>(
  hands: readonly T[],
  build: (hand: T) => PlayHandRecord | null,
): PlayHandRecord[] {
  const records: PlayHandRecord[] = [];
  for (const hand of hands) {
    const record = build(hand);
    if (record) records.push(record);
  }
  return records;
}

/** Heads-up solo practice hands. */
export function soloPlayHandRecords(hands: readonly HeadsUpLedgerHand[]): PlayHandRecord[] {
  return mapLedgerHands(hands, (hand) => {
    const handId = typeof hand?.clientId === 'string' ? hand.clientId.trim() : '';
    const tableId = ownTableId(hand?.clientId);
    if (!handId || !tableId) return null;
    if (!isCompletedStreet(hand.game?.street, hand.game?.outcome)) return null;
    return counted('solo', handId, tableId, headsUpResult(hand.game?.outcome));
  });
}

/** Local multiway table hands, played against the app's own seats. */
export function localPlayHandRecords(hands: readonly LocalMultiwayLedgerHand[]): PlayHandRecord[] {
  return mapLedgerHands(hands, (hand) => {
    const handId = typeof hand?.clientId === 'string' ? hand.clientId.trim() : '';
    const tableId = ownTableId(hand?.clientId);
    if (!handId || !tableId) return null;
    if (!isCompletedStreet(hand.game?.street, hand.game?.outcome)) return null;
    return counted('local', handId, tableId, multiwayResult(hand.game?.outcome, HERO_PLAYER_ID));
  });
}

/**
 * Private-table hands from the viewer's own archive. The archive is written per
 * human seat only when a hand settles, and hand identity is the room, the
 * session number, and the hand number — so the same hand fetched twice, or
 * fetched once per seat, is still one hand counted once.
 */
export function privatePlayHandRecords(hands: readonly PrivateLedgerHand[]): PlayHandRecord[] {
  return mapLedgerHands(hands, (hand) => {
    const roomId = typeof hand?.roomId === 'string' ? hand.roomId.trim() : '';
    const viewerPlayerId = typeof hand?.viewerPlayerId === 'string' ? hand.viewerPlayerId.trim() : '';
    const handNumber = hand?.hand?.handNumber;
    if (!roomId || !viewerPlayerId || !Number.isSafeInteger(handNumber) || (handNumber ?? 0) <= 0) return null;
    if (!isCompletedStreet(hand.hand?.street, hand.hand?.outcome)) return null;
    const tableId = `${roomId}:${hand.sessionNumber}`;
    return counted('private', `${tableId}:${handNumber}`, tableId, multiwayResult(hand.hand?.outcome, viewerPlayerId));
  });
}

/**
 * Every ledger row in display order. Sources the caller did not read are simply
 * absent, which the projection then reports as unavailable instead of zero.
 */
export function allPlayHandRecords(input: {
  solo?: readonly HeadsUpLedgerHand[];
  local?: readonly LocalMultiwayLedgerHand[];
  private?: readonly PrivateLedgerHand[];
}): PlayHandRecord[] {
  const records: PlayHandRecord[] = [];
  for (const source of PLAY_STATISTICS_SOURCES) {
    if (source === 'solo') records.push(...soloPlayHandRecords(input.solo ?? []));
    if (source === 'local') records.push(...localPlayHandRecords(input.local ?? []));
    if (source === 'private') records.push(...privatePlayHandRecords(input.private ?? []));
  }
  return records;
}
