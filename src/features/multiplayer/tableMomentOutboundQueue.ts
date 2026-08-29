import type { TableMomentReactionId } from '../../domain/multiplayer/tableMoments';

export const TABLE_MOMENT_OUTBOUND_CAPACITY = 24;
export const TABLE_MOMENT_DEFAULT_RETRY_AFTER_MS = 1_000;

export interface TableMomentOutboundItem {
  id: string;
  notBeforeMs: number;
  reactionId: TableMomentReactionId;
}

export interface TableMomentOutboundQueue {
  items: TableMomentOutboundItem[];
}

export function createTableMomentOutboundQueue(): TableMomentOutboundQueue {
  return { items: [] };
}

export function enqueueTableMoment(
  state: TableMomentOutboundQueue,
  item: Omit<TableMomentOutboundItem, 'notBeforeMs'>,
  nowMs: number,
): { accepted: boolean; state: TableMomentOutboundQueue } {
  if (state.items.length >= TABLE_MOMENT_OUTBOUND_CAPACITY) return { accepted: false, state };
  return {
    accepted: true,
    state: { items: [...state.items, { ...item, notBeforeMs: nowMs }] },
  };
}

export function nextTableMomentOutbound(
  state: TableMomentOutboundQueue,
  nowMs: number,
): { item: TableMomentOutboundItem | null; waitMs: number } {
  const item = state.items[0] ?? null;
  return item
    ? { item: item.notBeforeMs <= nowMs ? item : null, waitMs: Math.max(0, item.notBeforeMs - nowMs) }
    : { item: null, waitMs: 0 };
}

export function settleTableMomentOutbound(
  state: TableMomentOutboundQueue,
  id: string,
  outcome: { status: 'accepted' | 'error' } | { retryAfterMs: number; status: 'retry' },
  nowMs: number,
): TableMomentOutboundQueue {
  const head = state.items[0];
  if (!head || head.id !== id) return state;
  if (outcome.status === 'retry') {
    return {
      items: [{
        ...head,
        notBeforeMs: nowMs + Math.max(1, Math.ceil(outcome.retryAfterMs)),
      }, ...state.items.slice(1)],
    };
  }
  return { items: state.items.slice(1) };
}
