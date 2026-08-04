import { describe, expect, it } from 'vitest';
import { combosForKey, HAND_CLASS_KEYS, parseRangeSpec } from '../preflopRanges';
import { compileTable, lookupBand, rfiTable, tableWidth } from '../preflopRanges';
import {
  applyOpenSizeScale, applyOvercallAdjustment, defenseTable,
  raiserBucket, vsFourBetTable, vsThreeBetTable,
} from '../preflopRanges';
import {
  applyArchetype, applyShortStack, applyTier, limpedTable,
} from '../preflopRanges';

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
    // Blind-versus-blind exception: the SB completes for 3:1 against a single
    // opponent, so limp-inclusive strategies enter ~60-70% of the deal. See
    // docs/PR48_AI_REALISM_QA.md.
    expect(tableWidth(rfiTable('SB'))).toBeGreaterThan(0.5);
    expect(tableWidth(rfiTable('SB'))).toBeLessThan(0.75);
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

describe('defense tables', () => {
  it('defends the BB widest against late opens', () => {
    const bbLate = tableWidth(defenseTable('BB', 'late'));
    const bbEarly = tableWidth(defenseTable('BB', 'early'));
    expect(bbLate).toBeGreaterThan(0.42);
    expect(bbLate).toBeLessThan(0.62);
    expect(bbEarly).toBeGreaterThan(0.25);
    expect(bbEarly).toBeLessThan(bbLate);
  });

  it('gives in-position seats a real cold-calling range including set-mining pairs', () => {
    const ipEarly = defenseTable('BTN', 'early');
    for (const pairKey of ['22', '55', '88'] as const) {
      const band = lookupBand(ipEarly, pairKey);
      expect(band).not.toBeNull();
      expect(band!.call).toBeGreaterThanOrEqual(0.5);
    }
    // Club-baseline recreational over-calling: the population this AI models
    // flats well past the solver's cold-call threshold, which is the product's
    // realism goal. See docs/PR48_AI_REALISM_QA.md.
    expect(tableWidth(ipEarly)).toBeGreaterThan(0.12);
    expect(tableWidth(ipEarly)).toBeLessThan(0.28);
  });

  it('pins the Task 7 cold-call widenings to a two-sided bracket', () => {
    // Task 7 widened these three cold-call tables (measured: IP_VS_LATE 40.5%,
    // SB_VS_LATE 39.8%, SB_VS_EARLY 27.3%) to make multiway flops reachable, but
    // the QA doc's own grant caps how far that can go: per-seat
    // fold-versus-single-open must stay at or above ~50%, i.e. these tables may
    // not cross roughly half the deal. Floors keep the widenings honest so a
    // future regression toward the pre-Task-7 (much narrower) tables is caught.
    const ipVsLate = tableWidth(defenseTable('BTN', 'late'));
    expect(ipVsLate).toBeGreaterThan(0.3);
    expect(ipVsLate).toBeLessThan(0.48);
    const sbVsLate = tableWidth(defenseTable('SB', 'late'));
    expect(sbVsLate).toBeGreaterThan(0.3);
    expect(sbVsLate).toBeLessThan(0.48);
    const sbVsEarly = tableWidth(defenseTable('SB', 'early'));
    expect(sbVsEarly).toBeGreaterThan(0.18);
    expect(sbVsEarly).toBeLessThan(0.35);
  });

  it('keeps 3-bets premium-weighted but not dominant', () => {
    const bbLate = defenseTable('BB', 'late');
    expect(lookupBand(bbLate, 'AA')!.raise).toBeGreaterThan(0.5);
    expect(lookupBand(bbLate, '76s')!.raise).toBeLessThan(0.25);
    // Combo-weighted 3-bet share of the whole deal must be modest.
    let threeBet = 0;
    for (const key of HAND_CLASS_KEYS) {
      const band = lookupBand(bbLate, key);
      if (band) threeBet += combosForKey(key) * band.raise;
    }
    expect(threeBet / 1326).toBeGreaterThan(0.04);
    expect(threeBet / 1326).toBeLessThan(0.13);
  });

  it('continues narrow and strong versus 3-bets and 4-bets', () => {
    expect(tableWidth(vsThreeBetTable())).toBeGreaterThan(0.08);
    expect(tableWidth(vsThreeBetTable())).toBeLessThan(0.2);
    expect(tableWidth(vsFourBetTable())).toBeLessThan(0.06);
    expect(lookupBand(vsThreeBetTable(), 'AA')!.raise).toBeGreaterThan(0.5);
  });

  it('buckets raiser positions', () => {
    expect(raiserBucket('UTG')).toBe('early');
    expect(raiserBucket('HJ')).toBe('early');
    expect(raiserBucket('CO')).toBe('late');
    expect(raiserBucket('BTN/SB')).toBe('late');
    expect(raiserBucket(undefined)).toBe('late');
  });
});

describe('defense adjustments', () => {
  const band = { raise: 0.1, call: 0.6, wide: false };

  it('softens instead of cliffs against larger opens', () => {
    const vs25 = applyOpenSizeScale(band, 2.5);
    const vs4 = applyOpenSizeScale(band, 4);
    const vs5 = applyOpenSizeScale(band, 5);
    expect(vs25.call).toBeCloseTo(0.6, 5);
    expect(vs4.call).toBeLessThan(vs25.call);
    expect(vs5.call).toBeLessThan(vs4.call);
    expect(vs5.call).toBeGreaterThan(0.32); // no collapse to near-zero
    const vs2 = applyOpenSizeScale(band, 2);
    expect(vs2.call).toBeGreaterThan(vs25.call); // min-raises get defended MORE
  });

  it('loosens pot-odds hands and tightens dominated hands as callers pile in', () => {
    const pairNoCallers = applyOvercallAdjustment(band, '55', 0);
    const pairTwoCallers = applyOvercallAdjustment(band, '55', 2);
    expect(pairTwoCallers.call).toBeGreaterThan(pairNoCallers.call);
    const offsuitTwoCallers = applyOvercallAdjustment(band, 'KJo', 2);
    expect(offsuitTwoCallers.call).toBeLessThan(band.call);
    const suitedTwoCallers = applyOvercallAdjustment(band, '87s', 2);
    expect(suitedTwoCallers.call).toBeGreaterThan(band.call);
    expect(pairTwoCallers.raise).toBeLessThan(band.raise); // squeeze less into crowds
  });
});

describe('lookupBand (deferred Task 3 findings)', () => {
  it('returns the FIRST band\'s frequencies when a hand key appears in multiple bands', () => {
    const table = compileTable([
      { hands: 'AA', raise: 0.9, call: 0.1 },
      { hands: 'AA', raise: 0.1, call: 0.9 },
    ]);
    const band = lookupBand(table, 'AA');
    expect(band).not.toBeNull();
    expect(band!.raise).toBe(0.9);
    expect(band!.call).toBe(0.1);
  });

  it('reports wide: true for wide-band hands and wide: false for core-band hands', () => {
    const table = rfiTable('BTN');
    const core = lookupBand(table, 'AA');
    const wide = lookupBand(table, 'K4s');
    expect(core).not.toBeNull();
    expect(core!.wide).toBe(false);
    expect(wide).not.toBeNull();
    expect(wide!.wide).toBe(true);
  });
});

describe('limped-pot tables', () => {
  it('lets any position over-limp playable hands and iso-raise strong ones', () => {
    const table = limpedTable('CO');
    expect(lookupBand(table, 'AA')!.raise).toBeGreaterThan(0.8);
    const smallPair = lookupBand(table, '44');
    expect(smallPair).not.toBeNull();
    expect(smallPair!.call).toBeGreaterThan(0.4);
    const suitedConnector = lookupBand(table, '76s');
    expect(suitedConnector).not.toBeNull();
    expect(suitedConnector!.call).toBeGreaterThan(0.4);
  });

  it('keeps a meaningful iso-raise mix on strong-speculative hands instead of pure over-limp', () => {
    const table = limpedTable('CO');
    const pair88 = lookupBand(table, '88');
    expect(pair88).not.toBeNull();
    expect(pair88!.raise).toBeGreaterThanOrEqual(0.25);
    expect(pair88!.call).toBeGreaterThanOrEqual(0.4);
    const kts = lookupBand(table, 'KTs');
    expect(kts).not.toBeNull();
    expect(kts!.raise).toBeGreaterThanOrEqual(0.25);
  });
});

describe('archetype and tier transforms', () => {
  const band = { raise: 0.3, call: 0.4, wide: false };
  const wideBand = { raise: 0.2, call: 0.3, wide: true };

  it('separates sticky and patient by a wide margin', () => {
    const sticky = applyArchetype(wideBand, 'sticky', 'raised');
    const patient = applyArchetype(wideBand, 'patient', 'raised');
    expect(sticky.call).toBeGreaterThan(patient.call * 2);
    expect(sticky.raise).toBeLessThan(applyArchetype(wideBand, 'pressure', 'raised').raise);
  });

  it('never widens a loose-passive archetype\'s raising range', () => {
    // wideScale is an entry-WIDTH lever, not an aggression lever. The first-in
    // tables author their wide bands at call 0, so widening a loose-passive
    // archetype there has nowhere to land but the raise leg — which made the
    // station open-raise marginal hands more often than a balanced player,
    // inverting the personality on exactly the hands that define it.
    const balanced = applyArchetype(wideBand, 'balanced', 'unopened');
    const sticky = applyArchetype(wideBand, 'sticky', 'unopened');
    expect(sticky.raise).toBeLessThan(balanced.raise);
    // Loose-aggressive archetypes still widen what they raise.
    expect(applyArchetype(wideBand, 'pressure', 'unopened').raise)
      .toBeGreaterThan(balanced.raise);
    // Tightening still narrows both legs — a nit plays marginal hands less in
    // every way, so patient must keep its narrowed opening range.
    expect(applyArchetype(wideBand, 'patient', 'unopened').raise)
      .toBeLessThan(sticky.raise);
  });

  it('scales three-bets for pressure and limps for sticky', () => {
    expect(applyArchetype(band, 'pressure', 'raised').raise).toBeGreaterThan(band.raise);
    expect(applyArchetype(band, 'sticky', 'raised').raise).toBeLessThan(band.raise);
    expect(applyArchetype(band, 'sticky', 'unopened').call).toBeGreaterThan(band.call);
    expect(applyArchetype(band, undefined, 'raised')).toEqual(band);
  });

  it('caps combined frequency at 0.98', () => {
    const loose = applyArchetype({ raise: 0.5, call: 0.6, wide: true }, 'sticky', 'raised');
    expect(loose.raise + loose.call).toBeLessThanOrEqual(0.98);
  });

  it('makes friendly passive-loose and elite disciplined', () => {
    const friendly = applyTier(wideBand, 'friendly');
    const elite = applyTier(wideBand, 'elite');
    expect(friendly.call).toBeGreaterThan(wideBand.call);       // raise mass shifts to call
    expect(friendly.raise).toBeLessThan(wideBand.raise);
    expect(elite.call + elite.raise).toBeLessThan(wideBand.call + wideBand.raise); // wide bands trimmed
    expect(applyTier(band, 'club')).toEqual(band);
  });

  it('tightens speculative hands when short-stacked', () => {
    const short = applyShortStack({ raise: 0.2, call: 0.5, wide: true }, '76s', 'short');
    expect(short.call).toBeLessThan(0.5 * 0.7);
    const pairShort = applyShortStack({ raise: 0.2, call: 0.5, wide: false }, '77', 'short');
    expect(pairShort.call).toBeGreaterThan(0.3); // pairs keep most of their value shoving/calling
    expect(applyShortStack({ raise: 0.2, call: 0.5, wide: false }, '76s', 'deep').call).toBe(0.5);
  });
});
