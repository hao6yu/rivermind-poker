import { describe, expect, it } from 'vitest';

import {
  draftForCurrentAmount,
  applyBetSizingKeypadKey,
  normalizeBetSizingInput,
  parseBetSizingValue,
  submitBetSizingAmount,
  resetBetSizingDraftOnClose,
  type BetSizingBounds,
} from './betSizingEntry';

const bounds: BetSizingBounds = { minRaiseTo: 40, maxRaiseTo: 2_000 };

describe('parseBetSizingValue', () => {
  it('parses plain whole numbers', () => {
    expect(parseBetSizingValue('40')).toBe(40);
    expect(parseBetSizingValue('4000')).toBe(4_000);
    expect(parseBetSizingValue('0')).toBe(0);
    expect(parseBetSizingValue('007')).toBe(7);
  });

  it('rejects empty input', () => {
    expect(parseBetSizingValue('')).toBeNull();
    expect(parseBetSizingValue('   ')).toBeNull();
  });

  it('rejects decimals and partial numbers', () => {
    expect(parseBetSizingValue('40.5')).toBeNull();
    expect(parseBetSizingValue('.5')).toBeNull();
    expect(parseBetSizingValue('4.')).toBeNull();
    expect(parseBetSizingValue('1e3')).toBeNull();
  });

  it('rejects signs, spaces, units, and other non-numeric input', () => {
    expect(parseBetSizingValue('-5')).toBeNull();
    expect(parseBetSizingValue('+5')).toBeNull();
    expect(parseBetSizingValue('1 000')).toBeNull();
    expect(parseBetSizingValue('1,000')).toBeNull();
    expect(parseBetSizingValue('100chips')).toBeNull();
    expect(parseBetSizingValue('chips')).toBeNull();
    expect(parseBetSizingValue('💯')).toBeNull();
  });

  it('treats non-string input as no value', () => {
    // The field is always a string, but the guard keeps the helper total.
    expect(parseBetSizingValue(null as unknown as string)).toBeNull();
  });
});

describe('normalizeBetSizingInput', () => {
  it('accepts a legal amount unchanged', () => {
    const result = normalizeBetSizingInput('250', bounds, 40);
    expect(result.value).toBe(250);
    expect(result.normalized).toBe(250);
    expect(result.hint).toBe('legal');
    expect(result.unusable).toBe(false);
  });

  it('clamps a below-minimum amount up to the legal minimum', () => {
    const result = normalizeBetSizingInput('10', bounds, 40);
    expect(result.value).toBe(10);
    expect(result.normalized).toBe(40);
    expect(result.hint).toBe('clamped');
    expect(result.outOfRange).toBe(true);
  });

  it('clamps an above-maximum amount down to the legal maximum', () => {
    const result = normalizeBetSizingInput('9999', bounds, 40);
    expect(result.value).toBe(9_999);
    expect(result.normalized).toBe(2_000);
    expect(result.hint).toBe('clamped');
    expect(result.outOfRange).toBe(true);
  });

  it('accepts the exact minimum and maximum boundaries', () => {
    expect(normalizeBetSizingInput('40', bounds, 40).normalized).toBe(40);
    expect(normalizeBetSizingInput('2000', bounds, 40).normalized).toBe(2_000);
  });

  it('rounds fractional parsed values through the shared clammer', () => {
    // parseBetSizingValue only accepts whole numbers; the clammer still rounds
    // fallback-derived amounts (e.g. presets) consistently.
    expect(normalizeBetSizingInput('', bounds, 1999.6).normalized).toBe(2_000);
  });

  it('returns the fallback for empty input without crashing', () => {
    const result = normalizeBetSizingInput('', bounds, 150);
    expect(result.hint).toBe('empty');
    expect(result.unusable).toBe(true);
    expect(result.normalized).toBe(150);
  });

  it('keeps invalid text from becoming a wager and keeps editing', () => {
    const result = normalizeBetSizingInput('4..5', bounds, 150);
    expect(result.value).toBeNull();
    expect(result.hint).toBe('invalid');
    expect(result.unusable).toBe(true);
    // The submit-safe amount stays a legal fallback, not the malformed text.
    expect(result.normalized).toBe(150);
  });

  it('min-equals-max resolves to that single legal amount', () => {
    const fixed: BetSizingBounds = { minRaiseTo: 100, maxRaiseTo: 100 };
    expect(normalizeBetSizingInput('1', fixed, 100).normalized).toBe(100);
    expect(normalizeBetSizingInput('5000', fixed, 100).normalized).toBe(100);
  });

  it('supports an all-in maximum larger than any direct entry', () => {
    const allIn: BetSizingBounds = { minRaiseTo: 40, maxRaiseTo: 4_320 };
    expect(normalizeBetSizingInput('1000', allIn, 40).normalized).toBe(1_000);
    expect(normalizeBetSizingInput('100000', allIn, 40).normalized).toBe(4_320);
  });
});

describe('raise-to semantics', () => {
  it('treats the typed value as a raise-to/bet-to total, not an increment', () => {
    // With the current bet already at 30, typing "80" is a bet/raise of 80 to,
    // not 30 + 80. The helper has no current-bet, because the amount it clamps
    // is already the absolute raise-to target every other control produces.
    const result = normalizeBetSizingInput('80', { minRaiseTo: 40, maxRaiseTo: 2_000 }, 40);
    expect(result.normalized).toBe(80);
  });

  it('clamps a raise that would under-raise up to the legal minimum raise', () => {
    const raiseBounds: BetSizingBounds = { minRaiseTo: 80, maxRaiseTo: 2_000 };
    expect(normalizeBetSizingInput('50', raiseBounds, 80).normalized).toBe(80);
  });
});

describe('submitBetSizingAmount', () => {
  it('always returns the normalized, legal amount for every caller', () => {
    const cases: Array<[string, BetSizingBounds, number]> = [
      ['legal', bounds, 250],
      ['below-min', bounds, 10],
      ['above-max', bounds, 9_999],
      ['min boundary', bounds, 40],
      ['max boundary', bounds, 2_000],
      ['empty', bounds, 150],
      ['invalid', bounds, 150],
    ];
    for (const [_label, b, fallback] of cases) {
      // Feed each an out-of-range/invalid draft; the submitted amount must be legal.
      const draft = _label.startsWith('above') ? '999999' : _label.startsWith('below') ? '1' : _label === 'empty' ? '' : _label === 'invalid' ? 'xx' : String(fallback);
      const result = normalizeBetSizingInput(draft, b, fallback);
      const submitted = submitBetSizingAmount(result);
      expect(submitted).toBeGreaterThanOrEqual(b.minRaiseTo);
      expect(submitted).toBeLessThanOrEqual(b.maxRaiseTo);
    }
  });

  it('never returns a parsed-but-illegal amount', () => {
    const result = normalizeBetSizingInput('5', { minRaiseTo: 40, maxRaiseTo: 2_000 }, 150);
    expect(result.value).toBe(5);
    // A raw parsed value below the floor must not be submitted.
    expect(submitBetSizingAmount(result)).toBe(40);
  });
});

describe('draftForCurrentAmount', () => {
  it('seeds the draft from a whole-number legal amount', () => {
    expect(draftForCurrentAmount(250)).toBe('250');
    expect(draftForCurrentAmount(1999.9)).toBe('2000');
    expect(draftForCurrentAmount(0)).toBe('0');
  });
});

describe('applyBetSizingKeypadKey', () => {
  it('builds a digits-only amount and replaces a leading zero', () => {
    expect(applyBetSizingKeypadKey('', '1')).toBe('1');
    expect(applyBetSizingKeypadKey('12', '3')).toBe('123');
    expect(applyBetSizingKeypadKey('0', '7')).toBe('7');
  });

  it('supports backspace and clear without producing invalid text', () => {
    expect(applyBetSizingKeypadKey('123', 'backspace')).toBe('12');
    expect(applyBetSizingKeypadKey('', 'backspace')).toBe('');
    expect(applyBetSizingKeypadKey('123', 'clear')).toBe('');
  });

  it('bounds the draft instead of allowing an unbounded integer', () => {
    expect(applyBetSizingKeypadKey('1234', '5', 4)).toBe('1234');
  });
});

describe('resetBetSizingDraftOnClose', () => {
  it('clears editing and reopens on the last legal amount', () => {
    // The player was mid-edit on a value that never got committed; closing while
    // editing must drop that stale draft and land back on the legal target.
    const closing = { target: 250, draft: '888', editing: true };
    const next = resetBetSizingDraftOnClose(closing);
    expect(next.editing).toBe(false);
    expect(next.target).toBe(250); // amount preserved, not the ghost draft
    expect(next.draft).toBe(draftForCurrentAmount(250));
  });

  it('keeps editing closed when nothing was being edited', () => {
    const next = resetBetSizingDraftOnClose({ target: 120, draft: '120', editing: false });
    expect(next.editing).toBe(false);
    expect(next.target).toBe(120);
    expect(next.draft).toBe('120');
  });

  it('re-submits the preserved legal amount through the shared clammer', () => {
    // The whole point of the reset: after keyboard cancel + reopen, the amount
    // the player ends up submitting is the last legal one, not their typing.
    const bounds: BetSizingBounds = { minRaiseTo: 40, maxRaiseTo: 2_000 };
    const closing = { target: 400, draft: '12345', editing: true };
    const next = resetBetSizingDraftOnClose(closing);
    const result = normalizeBetSizingInput(next.draft, bounds, next.target);
    expect(submitBetSizingAmount(result)).toBe(next.target);
  });
});
