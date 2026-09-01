import { describe, expect, it } from 'vitest';

import {
  SHARED_TABLE_SEAT_CONTENT_ORDER,
  SHARED_TABLE_SEAT_HEIGHT,
  sharedTableSeatVisualTreatment,
} from './sharedTableSeatPresentation';

describe('shared table seat presentation', () => {
  it('keeps the identity plaque above the cards on every table', () => {
    expect(SHARED_TABLE_SEAT_CONTENT_ORDER).toEqual(['plaque', 'cards']);
  });

  it.each([
    ['human', false, 'solid', 'default'],
    ['ai', false, 'dashed', 'default'],
    ['human', true, 'solid', 'winner'],
    ['ai', true, 'dashed', 'winner'],
  ] as const)('keeps %s and winner identity on the plaque boundary', (kind, winner, borderStyle, tone) => {
    expect(sharedTableSeatVisualTreatment(kind, winner)).toEqual({
      borderStyle,
      inlineAiLabel: false,
      inlineWinnerIcon: false,
      tone,
    });
  });

  it('publishes honest full-seat envelopes for the measured ring', () => {
    expect(SHARED_TABLE_SEAT_HEIGHT.regular).toBeGreaterThan(SHARED_TABLE_SEAT_HEIGHT.dense);
    expect(SHARED_TABLE_SEAT_HEIGHT.dense).toBeGreaterThan(SHARED_TABLE_SEAT_HEIGHT.compact);
    expect(SHARED_TABLE_SEAT_HEIGHT.compact).toBeGreaterThanOrEqual(58);
  });
});
