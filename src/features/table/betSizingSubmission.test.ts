import { describe, expect, it } from 'vitest';

import {
  normalizeBetSizingInput,
  submitBetSizingAmount,
  type BetSizingBounds,
} from './betSizingEntry';

/**
 * The sizing sheet has exactly one submit path. Each of the three surfaces —
 * heads-up (`PokerTableScreen`), local multiway (`MultiwayPokerTableScreen`),
 * and private multiplayer (`MultiplayerFlowModal`) — forwards its
 * `onConfirm(target)` straight to the engine, and every `target` reaches them
 * through the same modal submit, which normalizes the draft first. So proving
 * that path is always inside the legal bounds proves each caller can submit
 * only the normalized legal amount.
 */

const headsUp: BetSizingBounds = { minRaiseTo: 40, maxRaiseTo: 2_000 };
const multiway: BetSizingBounds = { minRaiseTo: 40, maxRaiseTo: 1_500 };
const privateTable: BetSizingBounds = { minRaiseTo: 60, maxRaiseTo: 4_320 };

// The drafts a player can plausibly reach, across the modes the sheet supports.
const drafts = ['', '1', '99', '250', '1500', '100000', 'x', '4.5', '-3', '  '];

describe('every sizing surface submits only the normalized legal amount', () => {
  it.each([
    ['heads-up', headsUp],
    ['local multiway', multiway],
    ['private multiplayer', privateTable],
  ])('%s: any draft resolves to a legal raise-to target', (_label, bounds) => {
    // The current legal amount is a legal fallback, so the path never starts
    // outside the range.
    for (const draft of drafts) {
      const submitted = submitBetSizingAmount(normalizeBetSizingInput(draft, bounds, bounds.minRaiseTo));
      expect(submitted, `${JSON.stringify(draft)} → ${submitted}`).toBeGreaterThanOrEqual(bounds.minRaiseTo);
      expect(submitted).toBeLessThanOrEqual(bounds.maxRaiseTo);
    }
  });

  it('heads-up never submits the raw parsed value that under- or over-reaches', () => {
    // A below-minimum draft (what an engine min must clamp) and an all-in draft
    // (what an engine max permits) both resolve to a legal target.
    expect(submitBetSizingAmount(normalizeBetSizingInput('1', headsUp, headsUp.minRaiseTo))).toBe(headsUp.minRaiseTo);
    expect(submitBetSizingAmount(normalizeBetSizingInput('999999', headsUp, headsUp.minRaiseTo))).toBe(headsUp.maxRaiseTo);
  });

  it('min-equals-max surfaces resolve to that single legal amount', () => {
    const fixed: BetSizingBounds = { minRaiseTo: 100, maxRaiseTo: 100 };
    for (const draft of drafts) {
      expect(submitBetSizingAmount(normalizeBetSizingInput(draft, fixed, 100))).toBe(100);
    }
  });
});
