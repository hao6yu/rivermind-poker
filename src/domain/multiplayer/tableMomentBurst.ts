/** Exact rolling-burst defaults mirrored by the transactional database claim. */
export const TABLE_MOMENT_SENDER_BURST_CAPACITY = 8;
export const TABLE_MOMENT_SENDER_REFILL_PER_SECOND = 4;
export const TABLE_MOMENT_ROOM_BURST_CAPACITY = 24;
export const TABLE_MOMENT_ROOM_REFILL_PER_SECOND = 8;

export interface TableMomentTokenBucket {
  atMs: number;
  tokens: number;
}

export interface TableMomentBurstState {
  room: TableMomentTokenBucket;
  sender: TableMomentTokenBucket;
}

export type TableMomentBurstDecision =
  | { accepted: true; state: TableMomentBurstState }
  | { accepted: false; retryAfterMs: number; state: TableMomentBurstState };

function refill(
  bucket: TableMomentTokenBucket,
  nowMs: number,
  capacity: number,
  refillPerSecond: number,
): TableMomentTokenBucket {
  const elapsedMs = Math.max(0, nowMs - bucket.atMs);
  return {
    atMs: nowMs,
    tokens: Math.min(capacity, bucket.tokens + elapsedMs * refillPerSecond / 1_000),
  };
}

export function createTableMomentBurstState(nowMs: number): TableMomentBurstState {
  return {
    room: { atMs: nowMs, tokens: TABLE_MOMENT_ROOM_BURST_CAPACITY },
    sender: { atMs: nowMs, tokens: TABLE_MOMENT_SENDER_BURST_CAPACITY },
  };
}

/**
 * Pure token-bucket decision with an injected clock. A refusal never consumes
 * either bucket and reports the first instant when both have one full token.
 */
export function evaluateTableMomentBurst(
  state: TableMomentBurstState,
  nowMs: number,
): TableMomentBurstDecision {
  const sender = refill(
    state.sender,
    nowMs,
    TABLE_MOMENT_SENDER_BURST_CAPACITY,
    TABLE_MOMENT_SENDER_REFILL_PER_SECOND,
  );
  const room = refill(
    state.room,
    nowMs,
    TABLE_MOMENT_ROOM_BURST_CAPACITY,
    TABLE_MOMENT_ROOM_REFILL_PER_SECOND,
  );
  if (sender.tokens < 1 || room.tokens < 1) {
    const senderWait = sender.tokens >= 1
      ? 0
      : Math.ceil((1 - sender.tokens) * 1_000 / TABLE_MOMENT_SENDER_REFILL_PER_SECOND - 1e-9);
    const roomWait = room.tokens >= 1
      ? 0
      : Math.ceil((1 - room.tokens) * 1_000 / TABLE_MOMENT_ROOM_REFILL_PER_SECOND - 1e-9);
    return {
      accepted: false,
      retryAfterMs: Math.max(1, senderWait, roomWait),
      state: { room, sender },
    };
  }
  return {
    accepted: true,
    state: {
      room: { ...room, tokens: room.tokens - 1 },
      sender: { ...sender, tokens: sender.tokens - 1 },
    },
  };
}
