import { describe, expect, it } from 'vitest';
import { combosForKey, HAND_CLASS_KEYS, parseRangeSpec } from '../preflopRanges';
import { compileTable, lookupBand, rfiTable, tableWidth } from '../preflopRanges';

describe('parseRangeSpec', () => {
  it('expands pairs, pair-plus, and pair spans', () => {
    expect([...parseRangeSpec('88')]).toEqual(['88']);
    expect(parseRangeSpec('JJ+')).toEqual(new Set(['JJ', 'QQ', 'KK', 'AA']));
    expect(parseRangeSpec('88-55')).toEqual(new Set(['88', '77', '66', '55']));
  });

  it('expands kicker-plus and kicker spans', () => {
    expect(parseRangeSpec('ATs+')).toEqual(new Set(['ATs', 'AJs', 'AQs', 'AKs']));
    expect(parseRangeSpec('KTo+')).toEqual(new Set(['KTo', 'KJo', 'KQo']));
    expect(parseRangeSpec('A5s-A2s')).toEqual(new Set(['A5s', 'A4s', 'A3s', 'A2s']));
    expect(parseRangeSpec('T8s+')).toEqual(new Set(['T8s', 'T9s']));
  });

  it('merges comma lists and tolerates whitespace', () => {
    expect(parseRangeSpec('99+, ATs+ , KQo')).toEqual(
      new Set(['99', 'TT', 'JJ', 'QQ', 'KK', 'AA', 'ATs', 'AJs', 'AQs', 'AKs', 'KQo']),
    );
  });

  it('rejects malformed tokens', () => {
    for (const bad of ['54s+', '72', 'AKx', 'A5s-K2s', 'ATs-AJo', '']) {
      expect(() => parseRangeSpec(bad === '' ? ',' : bad)).toThrow(/Unsupported range token/);
    }
  });

  it('enumerates all 169 classes with correct combo counts', () => {
    expect(HAND_CLASS_KEYS).toHaveLength(169);
    const total = HAND_CLASS_KEYS.reduce((sum, key) => sum + combosForKey(key), 0);
    expect(total).toBe(1326);
    expect(combosForKey('AA')).toBe(6);
    expect(combosForKey('AKs')).toBe(4);
    expect(combosForKey('AKo')).toBe(12);
  });
});

describe('RFI tables', () => {
  it('produces realistic opening widths per position', () => {
    // Fractions of all 1326 combos entered (frequency-weighted raise+call).
    // Brackets are calibrated to the authored tables below (rough combo math),
    // slightly wider than real-game norms to leave tuning room.
    expect(tableWidth(rfiTable('UTG'))).toBeGreaterThan(0.1);
    expect(tableWidth(rfiTable('UTG'))).toBeLessThan(0.2);
    expect(tableWidth(rfiTable('HJ'))).toBeGreaterThan(0.14);
    expect(tableWidth(rfiTable('HJ'))).toBeLessThan(0.24);
    expect(tableWidth(rfiTable('CO'))).toBeGreaterThan(0.22);
    expect(tableWidth(rfiTable('CO'))).toBeLessThan(0.33);
    expect(tableWidth(rfiTable('BTN'))).toBeGreaterThan(0.35);
    expect(tableWidth(rfiTable('BTN'))).toBeLessThan(0.48);
    expect(tableWidth(rfiTable('SB'))).toBeGreaterThan(0.32);
    expect(tableWidth(rfiTable('SB'))).toBeLessThan(0.48);
    expect(tableWidth(rfiTable('BTN/SB'))).toBeGreaterThan(0.55);
    expect(tableWidth(rfiTable('BTN/SB'))).toBeLessThan(0.8);
  });

  it('orders positions monotonically and never opens trash from early seats', () => {
    expect(tableWidth(rfiTable('UTG'))).toBeLessThan(tableWidth(rfiTable('HJ')));
    expect(tableWidth(rfiTable('HJ'))).toBeLessThan(tableWidth(rfiTable('CO')));
    expect(tableWidth(rfiTable('CO'))).toBeLessThan(tableWidth(rfiTable('BTN')));
    for (const position of ['UTG', 'HJ', 'CO', 'BTN', 'SB'] as const) {
      expect(lookupBand(rfiTable(position), '72o')).toBeNull();
      expect(lookupBand(rfiTable(position), 'AA')!.raise).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('opens every pocket pair from the button and lets the SB limp', () => {
    for (const pairKey of ['22', '55', '99', 'QQ'] as const) {
      expect(lookupBand(rfiTable('BTN'), pairKey)).not.toBeNull();
    }
    const sbWide = lookupBand(rfiTable('SB'), '98o');
    expect(sbWide).not.toBeNull();
    expect(sbWide!.call).toBeGreaterThan(0.2); // SB open-limps its wide band
  });

  it('rejects a BB first-in table', () => {
    expect(() => rfiTable('BB')).toThrow();
  });
});
