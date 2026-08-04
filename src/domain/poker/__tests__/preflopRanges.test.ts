import { describe, expect, it } from 'vitest';
import { combosForKey, HAND_CLASS_KEYS, parseRangeSpec } from '../preflopRanges';

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
