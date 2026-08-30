import type { MultiplayerSeatCount } from './contracts.ts';

/**
 * Ephemeral table moments (reactions and quick phrases).
 *
 * A table moment is a transient, authored reaction that travels only over the
 * private room Broadcast topic. It is never persisted anywhere: no table, no
 * snapshot field, no archive, no replay record, no offline queue, and no
 * analytics event. Reconnecting and late-joining players intentionally receive
 * no earlier moments. The room coordinator derives the sender seat from the
 * authenticated membership and revalidates the hand sequence, payload id,
 * rolling sender/room burst limits immediately before the Edge Function emits the
 * broadcast, so a spoofed seat, stale or future hand, duplicate payload id, or
 * cross-room attempt is rejected before anything leaves the room.
 */

export const TABLE_MOMENT_PROTOCOL_VERSION = 1;

/** The twelve authored version-1 reaction ids; the catalog never grows silently. */
export const TABLE_MOMENT_REACTION_IDS = [
  'cheer',
  'surprised',
  'laugh',
  'niceHand',
  'thinking',
  'disappointed',
  'goodLuck',
  'wellPlayed',
  'bigMove',
  'soClose',
  'onFire',
  'goodGame',
] as const;

export type TableMomentReactionId = typeof TABLE_MOMENT_REACTION_IDS[number];

/** Payload ids are client-generated dedup keys; bound them at the contract. */
export const TABLE_MOMENT_MAX_PAYLOAD_ID_LENGTH = 80;

/**
 * A broadcast envelope for one table moment. `seat` and `playerId` are always
 * derived by the coordinator from the authenticated membership — a client can
 * never choose whose moment is shown. `atMs` is the coordinator's authoritative
 * clock. The envelope is the only shape that leaves the room; it carries no
 * user ids and no hole-card or deck data.
 */
export interface TableMomentEnvelope {
  atMs: number;
  handNumber: number;
  id: string;
  playerId: string;
  protocolVersion: typeof TABLE_MOMENT_PROTOCOL_VERSION;
  reactionId: TableMomentReactionId;
  roomId: string;
  seat: number;
}

/**
 * The authored version-1 moment catalog. Each reaction carries a stable
 * localization key for its quick phrase; the presentation layer renders the
 * phrase, sticker, and sound entirely from this catalog so no reaction media
 * is ever fetched from a URL.
 */
export const TABLE_MOMENT_CATALOG: Readonly<Record<
  TableMomentReactionId,
  { accessibilityKey: string; phraseKey: string }
>> = {
  cheer: { accessibilityKey: 'multiplayer.moment.cheerLabel', phraseKey: 'multiplayer.moment.cheer' },
  surprised: { accessibilityKey: 'multiplayer.moment.surprisedLabel', phraseKey: 'multiplayer.moment.surprised' },
  laugh: { accessibilityKey: 'multiplayer.moment.laughLabel', phraseKey: 'multiplayer.moment.laugh' },
  niceHand: { accessibilityKey: 'multiplayer.moment.niceHandLabel', phraseKey: 'multiplayer.moment.niceHand' },
  thinking: { accessibilityKey: 'multiplayer.moment.thinkingLabel', phraseKey: 'multiplayer.moment.thinking' },
  disappointed: { accessibilityKey: 'multiplayer.moment.disappointedLabel', phraseKey: 'multiplayer.moment.disappointed' },
  goodLuck: { accessibilityKey: 'multiplayer.moment.goodLuckLabel', phraseKey: 'multiplayer.moment.goodLuck' },
  wellPlayed: { accessibilityKey: 'multiplayer.moment.wellPlayedLabel', phraseKey: 'multiplayer.moment.wellPlayed' },
  bigMove: { accessibilityKey: 'multiplayer.moment.bigMoveLabel', phraseKey: 'multiplayer.moment.bigMove' },
  soClose: { accessibilityKey: 'multiplayer.moment.soCloseLabel', phraseKey: 'multiplayer.moment.soClose' },
  onFire: { accessibilityKey: 'multiplayer.moment.onFireLabel', phraseKey: 'multiplayer.moment.onFire' },
  goodGame: { accessibilityKey: 'multiplayer.moment.goodGameLabel', phraseKey: 'multiplayer.moment.goodGame' },
};

export function isTableMomentReactionId(value: unknown): value is TableMomentReactionId {
  return typeof value === 'string' && TABLE_MOMENT_REACTION_IDS.includes(value as TableMomentReactionId);
}

/**
 * Builds a broadcast envelope with the coordinator-derived sender identity.
 * Pure and total: callers validate membership, hand sequence, and the payload
 * id before constructing the envelope.
 */
export function createTableMomentEnvelope(input: {
  atMs: number;
  handNumber: number;
  id: string;
  playerId: string;
  reactionId: TableMomentReactionId;
  roomId: string;
  seat: number;
  seatCount: MultiplayerSeatCount;
}): TableMomentEnvelope {
  if (!Number.isSafeInteger(input.atMs) || input.atMs <= 0) {
    throw new Error('A table moment requires a positive timestamp.');
  }
  if (!Number.isSafeInteger(input.handNumber) || input.handNumber < 0) {
    throw new Error('A table moment requires a non-negative hand number.');
  }
  if (!isTableMomentReactionId(input.reactionId)) {
    throw new Error('A table moment requires an authored reaction id.');
  }
  if (typeof input.id !== 'string' || input.id.trim().length === 0 || input.id.length > TABLE_MOMENT_MAX_PAYLOAD_ID_LENGTH) {
    throw new Error('A table moment requires a bounded payload id.');
  }
  if (!Number.isSafeInteger(input.seat) || input.seat < 0 || input.seat >= input.seatCount) {
    throw new Error('A table moment requires a seat inside the room.');
  }
  return {
    atMs: input.atMs,
    handNumber: input.handNumber,
    id: input.id,
    playerId: input.playerId,
    protocolVersion: TABLE_MOMENT_PROTOCOL_VERSION,
    reactionId: input.reactionId,
    roomId: input.roomId,
    seat: input.seat,
  };
}

/**
 * Strictly parses a client moment request body (the command the app sends to
 * the multiplayer-room Edge Function). The client never supplies a seat or
 * player id; those are derived from the authenticated membership. Returns null
 * for malformed or future-protocol requests.
 */
export function parseTableMomentRequest(value: unknown): {
  handNumber: number;
  id: string;
  protocolVersion: number;
  reactionId: TableMomentReactionId;
  roomId: string;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const roomId = typeof source.roomId === 'string'
    ? source.roomId.trim().toLowerCase()
    : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(roomId)) return null;
  if (source.protocolVersion !== TABLE_MOMENT_PROTOCOL_VERSION) return null;
  if (!isTableMomentReactionId(source.reactionId)) return null;
  const id = typeof source.id === 'string' ? source.id : '';
  if (id.trim().length === 0 || id.length > TABLE_MOMENT_MAX_PAYLOAD_ID_LENGTH) return null;
  const handNumber = source.handNumber;
  if (typeof handNumber !== 'number' || !Number.isSafeInteger(handNumber) || handNumber < 0) return null;
  return {
    handNumber,
    id,
    protocolVersion: TABLE_MOMENT_PROTOCOL_VERSION,
    reactionId: source.reactionId,
    roomId,
  };
}

/**
 * Whether a received envelope is still presentable. Moments have a bounded
 * presentation lifetime; anything older than `maxAgeMs`, or stamped so far in
 * the future that it cannot be an honest broadcast, is dropped rather than
 * rendered. This guards the client bullet-screen clock skew; the server keeps
 * its own authoritative cooldown.
 */
export function tableMomentEnvelopeIsFresh(
  moment: TableMomentEnvelope,
  nowMs: number,
  options: { maxAgeMs?: number; maxFutureMs?: number } = {},
): boolean {
  const maxAgeMs = options.maxAgeMs ?? 10_000;
  const maxFutureMs = options.maxFutureMs ?? 30_000;
  const ageMs = nowMs - moment.atMs;
  return ageMs >= -maxFutureMs && ageMs <= maxAgeMs;
}

/**
 * Pure payload-id dedup over a bounded recent set: a replayed id is rejected
 * so a network retry can never double-emit. The server's authoritative dedup
 * lives in the ledger claim; this helper keeps the boundary testable.
 */
export function tableMomentPayloadIdIsNew(seenPayloadIds: ReadonlySet<string>, id: string): boolean {
  return !seenPayloadIds.has(id);
}
