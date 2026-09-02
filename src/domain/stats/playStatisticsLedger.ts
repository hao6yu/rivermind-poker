import type { MultiwayHandOutcome, MultiwayHandState, TablePosition } from '../poker/multiway';
import type { GameState } from '../poker/types';
import {
  PLAY_STATISTICS_SOURCES,
  type PlayHandRecord,
  type PlayHandResult,
  type PlaySpotFacts,
  type PlaySpotFamily,
  type PlaySpotPosition,
  type PlaySpotStreet,
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
  game: Pick<GameState, 'street' | 'outcome' | 'bigBlind' | 'button' | 'players' | 'history'> | null | undefined;
  completedAt?: string;
}

/** Minimum shape of a saved local multiway hand (`MultiwaySessionHandRecord`). */
export interface LocalMultiwayLedgerHand {
  clientId: string;
  game: Pick<MultiwayHandState, 'street' | 'outcome' | 'bigBlind' | 'players' | 'history'> | null | undefined;
  completedAt?: string;
}

/** Minimum shape of one archived private-table hand. */
export interface PrivateLedgerHand {
  roomId: string;
  sessionNumber: number;
  viewerPlayerId: string;
  hand: Pick<MultiwayHandState, 'handNumber' | 'street' | 'outcome' | 'bigBlind' | 'players' | 'history'>;
  completedAtMs?: number;
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
  spot?: PlaySpotFacts,
  completedAtMs?: number,
): PlayHandRecord {
  return {
    completed: true,
    ...(completedAtMs === undefined ? {} : { completedAtMs }),
    handId,
    result,
    source,
    ...(spot ? { spot } : {}),
    tableId,
  };
}

// --- S6 (P18-037): the stable spot taxonomy ------------------------------
//
// The derivation below is the single definition of how a completed hand maps
// to one spot key. It reads only public information: the viewer's seat
// position, the street of their last recorded decision, the raise/pot/stack
// context at that decision, and the hand's own big blind for normalization.

/** A hero at or below this many big blinds is playing short stack. */
const SHORT_STACK_BB = 10;
/** A pot at or above this many big blinds at the hero's decision is a big pot. */
const BIG_POT_BB = 15;

function positionBucket(position: TablePosition | undefined): PlaySpotPosition | null {
  switch (position) {
    case 'SB':
    case 'BB':
    case 'BTN/SB': return 'blinds';
    case 'UTG':
    case 'UTG+1': return 'early';
    case 'MP':
    case 'LJ':
    case 'HJ': return 'middle';
    case 'CO':
    case 'BTN': return 'late';
    default: return null;
  }
}

function lastDecisionStreet(
  history: ReadonlyArray<{ playerId?: string; player?: string; street?: string }>,
  viewerPlayerId: string,
): PlaySpotStreet | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const record = history[index]!;
    // Heads-up history keys the actor as `player`; multiway as `playerId`.
    if (record.playerId !== viewerPlayerId && record.player !== viewerPlayerId) continue;
    if (record.street === 'preflop' || record.street === 'flop' || record.street === 'turn' || record.street === 'river') {
      return record.street;
    }
  }
  return null;
}

function spotFamily(input: {
  bigBlind: number;
  heroInBlinds: boolean;
  /** Public decision context at the hero's last decision, when present. */
  context: { playerStackBefore?: number; playerStreetBetBefore?: number; potBefore?: number } | undefined;
  preflopRaiseCount: number;
}): PlaySpotFamily {
  // Fixed precedence (documented on PlaySpotFamilies): the raise-context
  // families come first — a blind facing action is blind defense even when a
  // three-bet happened — then the stack/pot conditions, then the residual so
  // every spot-carrying hand lands in exactly one family.
  if (input.heroInBlinds && input.preflopRaiseCount >= 1) return 'blind-defense';
  if (input.preflopRaiseCount >= 2) return 'three-bet-pot';
  if (input.preflopRaiseCount === 1) return 'facing-open';
  if (input.context && input.bigBlind > 0) {
    const stackBb = (input.context.playerStackBefore ?? 0) + (input.context.playerStreetBetBefore ?? 0);
    if (stackBb > 0 && stackBb <= SHORT_STACK_BB * input.bigBlind) return 'short-stack';
    if ((input.context.potBefore ?? 0) >= BIG_POT_BB * input.bigBlind) return 'big-pot';
  }
  return 'other';
}

function preflopRaisesBefore(
  history: ReadonlyArray<{ playerId?: string; street?: string; type?: string }>,
  decisionIndex: number,
): number {
  return history.slice(0, decisionIndex).filter((record) => (
    record.street === 'preflop' && record.type === 'raise'
  )).length;
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
    const game = hand.game;
    const spot = game ? headsUpSpotFacts(game) : null;
    const completedAtMs = parseCompletedAtMs(hand.completedAt);
    return counted('solo', handId, tableId, headsUpResult(game?.outcome), spot ?? undefined, completedAtMs);
  });
}

/** Local multiway table hands, played against the app's own seats. */
export function localPlayHandRecords(hands: readonly LocalMultiwayLedgerHand[]): PlayHandRecord[] {
  return mapLedgerHands(hands, (hand) => {
    const handId = typeof hand?.clientId === 'string' ? hand.clientId.trim() : '';
    const tableId = ownTableId(hand?.clientId);
    if (!handId || !tableId) return null;
    if (!isCompletedStreet(hand.game?.street, hand.game?.outcome)) return null;
    const game = hand.game;
    const spot = game ? multiwaySpotFacts(game, HERO_PLAYER_ID) : null;
    const completedAtMs = parseCompletedAtMs(hand.completedAt);
    return counted('local', handId, tableId, multiwayResult(game?.outcome, HERO_PLAYER_ID), spot ?? undefined, completedAtMs);
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
    const spot = hand.hand ? multiwaySpotFacts(hand.hand, viewerPlayerId) : null;
    return counted('private', `${tableId}:${handNumber}`, tableId, multiwayResult(hand.hand?.outcome, viewerPlayerId), spot ?? undefined, hand.completedAtMs);
  });
}

// --- Spot fact derivation -------------------------------------------------

function parseCompletedAtMs(completedAt: string | undefined): number | undefined {
  if (typeof completedAt !== 'string' || completedAt.length === 0) return undefined;
  const ms = Date.parse(completedAt);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Heads-up spot facts. Heads-up positions are the blinds (BTN/SB and BB), so
 * the whole solo record aggregates under the blinds bucket by design.
 */
function headsUpSpotFacts(game: Pick<GameState, 'street' | 'outcome' | 'bigBlind' | 'button' | 'players' | 'history'>): PlaySpotFacts | null {
  const hero = game.players?.hero;
  if (!hero) return null;
  const decisionIndex = game.history
    ? game.history.findIndex((record, index) => record.player === 'hero' && index >= 0)
    : -1;
  const street = lastDecisionStreet(game.history ?? [], 'hero');
  if (!street) return null;
  const lastDecision = decisionIndex >= 0 ? game.history[decisionIndex] : undefined;
  const context = lastDecision?.decisionContext;
  const family = spotFamily({
    bigBlind: game.bigBlind,
    context,
    heroInBlinds: true,
    preflopRaiseCount: decisionIndex >= 0 ? preflopRaisesBefore(game.history, decisionIndex) : 0,
  });
  const pot = game.outcome?.potWon ?? 0;
  const netChips = game.outcome?.winner === 'hero'
    ? pot - hero.totalCommitted
    : game.outcome?.winner === 'villain'
      ? -hero.totalCommitted
      // The engine splits a tie evenly and awards the odd chip to the button;
      // the equivalence test pins this derivation to the engine's payouts.
      : Math.floor(pot / 2) + (game.button === 'hero' ? pot - Math.floor(pot / 2) * 2 : 0) - hero.totalCommitted;
  return {
    bigBlind: game.bigBlind,
    family,
    netChips,
    position: 'blinds',
    street,
  };
}

/**
 * Multiway spot facts for one viewer seat, from public information only:
 * the seat's engine position, their last decision's street, and the public
 * raise/stack/pot context at that decision.
 */
function multiwaySpotFacts(
  game: Pick<MultiwayHandState, 'street' | 'outcome' | 'bigBlind' | 'players' | 'history'>,
  viewerPlayerId: string,
): PlaySpotFacts | null {
  const viewer = game.players?.[viewerPlayerId];
  if (!viewer) return null;
  const position = positionBucket(viewer.position);
  const street = lastDecisionStreet(game.history ?? [], viewerPlayerId);
  if (!position || !street) return null;

  let decisionIndex = -1;
  for (let index = game.history.length - 1; index >= 0; index -= 1) {
    if (game.history[index]?.playerId === viewerPlayerId) {
      decisionIndex = index;
      break;
    }
  }
  const lastDecision = decisionIndex >= 0 ? game.history[decisionIndex] : undefined;
  const context = lastDecision?.decisionContext;
  const family = spotFamily({
    bigBlind: game.bigBlind,
    context,
    heroInBlinds: position === 'blinds',
    preflopRaiseCount: decisionIndex >= 0 ? preflopRaisesBefore(game.history, decisionIndex) : 0,
  });
  const award = (game.outcome?.awards ?? []).reduce(
    (total, awardEntry) => total + (awardEntry.shares[viewerPlayerId] ?? 0),
    0,
  );
  return {
    bigBlind: game.bigBlind,
    family,
    netChips: award - viewer.totalCommitted,
    position,
    street,
  };
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
