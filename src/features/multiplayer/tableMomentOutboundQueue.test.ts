import { describe, expect, it } from 'vitest';

import {
  TABLE_MOMENT_OUTBOUND_CAPACITY,
  createTableMomentOutboundQueue,
  enqueueTableMoment,
  nextTableMomentOutbound,
  settleTableMomentOutbound,
} from './tableMomentOutboundQueue';

describe('table moment outbound queue', () => {
  it('keeps repeated and mixed taps distinct and FIFO', () => {
    let state = createTableMomentOutboundQueue();
    for (const [id, reactionId] of [['a', 'cheer'], ['b', 'cheer'], ['c', 'laugh']] as const) {
      const result = enqueueTableMoment(state, { id, reactionId }, 1_000);
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    expect(state.items.map(({ id, reactionId }) => [id, reactionId])).toEqual([
      ['a', 'cheer'], ['b', 'cheer'], ['c', 'laugh'],
    ]);
    state = settleTableMomentOutbound(state, 'a', { status: 'accepted' }, 1_000);
    expect(nextTableMomentOutbound(state, 1_000).item?.id).toBe('b');
  });

  it('honors retry-after internally without removing or reordering the head', () => {
    let state = enqueueTableMoment(
      createTableMomentOutboundQueue(),
      { id: 'same-id', reactionId: 'niceHand' },
      1_000,
    ).state;
    state = settleTableMomentOutbound(state, 'same-id', { retryAfterMs: 250, status: 'retry' }, 1_000);
    expect(nextTableMomentOutbound(state, 1_249)).toEqual({ item: null, waitMs: 1 });
    expect(nextTableMomentOutbound(state, 1_250).item?.id).toBe('same-id');
  });

  it('bounds allocation at 24 and reports the full tap', () => {
    let state = createTableMomentOutboundQueue();
    for (let index = 0; index < TABLE_MOMENT_OUTBOUND_CAPACITY; index += 1) {
      state = enqueueTableMoment(
        state,
        { id: `m-${index}`, reactionId: 'goodLuck' },
        1_000,
      ).state;
    }
    const overflow = enqueueTableMoment(state, { id: 'overflow', reactionId: 'goodGame' }, 1_000);
    expect(overflow.accepted).toBe(false);
    expect(overflow.state.items).toHaveLength(TABLE_MOMENT_OUTBOUND_CAPACITY);
  });
});
