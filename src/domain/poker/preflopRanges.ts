import type { TablePosition } from './multiway';

const RANK_ORDER = '23456789TJQKA';

function rankIndex(char: string): number {
  const index = RANK_ORDER.indexOf(char);
  if (index < 0) throw new Error(`Unsupported range token: ${char}`);
  return index;
}

function rankChar(index: number): string {
  const char = RANK_ORDER[index];
  if (!char) throw new Error(`Rank index ${index} is out of bounds.`);
  return char;
}

export const HAND_CLASS_KEYS: readonly string[] = (() => {
  const keys: string[] = [];
  for (let high = RANK_ORDER.length - 1; high >= 0; high -= 1) {
    for (let low = high; low >= 0; low -= 1) {
      if (high === low) keys.push(`${rankChar(high)}${rankChar(low)}`);
      else keys.push(`${rankChar(high)}${rankChar(low)}s`, `${rankChar(high)}${rankChar(low)}o`);
    }
  }
  return keys;
})();

export function combosForKey(key: string): number {
  if (key.length === 2) return 6;
  return key.endsWith('s') ? 4 : 12;
}

const TOKEN_PATTERN = /^([2-9TJQKA])([2-9TJQKA])([so])?(\+)?(?:-([2-9TJQKA])([2-9TJQKA])([so])?)?$/;

/** Expands compact range notation ("JJ+, ATs+, A5s-A2s, KQo") into hand-class keys. */
export function parseRangeSpec(spec: string): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const raw of spec.split(',')) {
    const token = raw.replaceAll(/\s+/g, '');
    if (token.length === 0) throw new Error(`Unsupported range token: ${raw}`);
    const match = TOKEN_PATTERN.exec(token);
    if (!match) throw new Error(`Unsupported range token: ${token}`);
    const [, highChar, lowChar, suffix, plus, endHighChar, endLowChar, endSuffix] = match;
    const high = rankIndex(highChar!);
    const low = rankIndex(lowChar!);
    const pair = high === low;
    if (pair && suffix) throw new Error(`Unsupported range token: ${token}`);
    if (!pair && !suffix) throw new Error(`Unsupported range token: ${token}`);
    if (high < low) throw new Error(`Unsupported range token: ${token}`);
    if (plus && endHighChar) throw new Error(`Unsupported range token: ${token}`);

    if (endHighChar) {
      const endHigh = rankIndex(endHighChar);
      const endLow = rankIndex(endLowChar!);
      if (pair) {
        if (endHigh !== endLow || endHigh > high) throw new Error(`Unsupported range token: ${token}`);
        for (let rank = high; rank >= endHigh; rank -= 1) keys.add(`${rankChar(rank)}${rankChar(rank)}`);
      } else {
        if (endHigh !== high || endSuffix !== suffix || endLow > low) {
          throw new Error(`Unsupported range token: ${token}`);
        }
        for (let kicker = low; kicker >= endLow; kicker -= 1) {
          keys.add(`${rankChar(high)}${rankChar(kicker)}${suffix}`);
        }
      }
    } else if (plus) {
      if (pair) {
        for (let rank = high; rank < RANK_ORDER.length; rank += 1) keys.add(`${rankChar(rank)}${rankChar(rank)}`);
      } else {
        // Connectors ("54s+") are ambiguous notation in the wild (kicker-run vs
        // connector-run) — force table authors to list them explicitly.
        if (high - low === 1) throw new Error(`Unsupported range token: ${token}`);
        for (let kicker = low; kicker < high; kicker += 1) keys.add(`${rankChar(high)}${rankChar(kicker)}${suffix}`);
      }
    } else {
      keys.add(pair ? `${rankChar(high)}${rankChar(low)}` : `${rankChar(high)}${rankChar(low)}${suffix}`);
    }
  }
  return keys;
}

export interface RangeBand {
  /** parseRangeSpec notation. Bands are evaluated in order; first match wins. */
  hands: string;
  raise: number;
  call: number; // unopened: open-limp; facing raise: flat call; limped: over-limp
  wide?: boolean; // scaled by archetype wideScale and tier wideScale
}

interface CompiledBand {
  hands: ReadonlySet<string>;
  raise: number;
  call: number;
  wide: boolean;
}

export interface CompiledRangeTable {
  bands: readonly CompiledBand[];
}

export function compileTable(bands: readonly RangeBand[]): CompiledRangeTable {
  return {
    bands: bands.map((band) => ({
      hands: parseRangeSpec(band.hands),
      raise: band.raise,
      call: band.call,
      wide: band.wide ?? false,
    })),
  };
}

export function lookupBand(
  table: CompiledRangeTable,
  key: string,
): { raise: number; call: number; wide: boolean } | null {
  for (const band of table.bands) {
    if (band.hands.has(key)) return { raise: band.raise, call: band.call, wide: band.wide };
  }
  return null;
}

export function tableWidth(table: CompiledRangeTable): number {
  let entered = 0;
  for (const key of HAND_CLASS_KEYS) {
    const band = lookupBand(table, key);
    if (!band) continue;
    entered += combosForKey(key) * Math.min(1, band.raise + band.call);
  }
  return entered / 1326;
}

const RFI_TABLES: Partial<Record<TablePosition, CompiledRangeTable>> = {
  UTG: compileTable([
    { hands: '77+, ATs+, KJs+, QJs, JTs, T9s, 98s, AJo+, KQo', raise: 0.95, call: 0 },
    { hands: '66-22, A9s-A2s, KTs, K9s, QTs, J9s, 87s, 76s, ATo, KJo', raise: 0.32, call: 0, wide: true },
  ]),
  HJ: compileTable([
    { hands: '66+, A9s+, KTs+, QTs+, JTs, T9s, 98s, 87s, ATo+, KJo+, QJo', raise: 0.95, call: 0 },
    { hands: '55-22, A8s-A2s, K9s, Q9s, J9s, T8s, 76s, 65s, A9o, KTo, QTo', raise: 0.35, call: 0, wide: true },
  ]),
  CO: compileTable([
    { hands: '55+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, A9o+, KTo+, QTo+, JTo', raise: 0.95, call: 0 },
    { hands: '44-22, K8s-K5s, Q8s, T7s, 97s, 86s, 65s, 54s, A8o-A5o, K9o, Q9o, J9o, T9o', raise: 0.4, call: 0, wide: true },
  ]),
  BTN: compileTable([
    { hands: '22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, 54s, A4o+, K9o+, Q9o+, J9o+, T9o', raise: 0.95, call: 0 },
    { hands: 'K4s-K2s, Q6s-Q4s, J7s, T7s, 96s, 85s, 75s, 64s, 53s, A3o-A2o, K8o, Q8o, J8o, T8o, 98o, 87o', raise: 0.45, call: 0, wide: true },
  ]),
  SB: compileTable([
    { hands: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A7o+, KTo+, QTo+, JTo', raise: 0.85, call: 0.12 },
    { hands: 'K5s-K2s, Q7s-Q4s, J7s, T7s, 96s, 86s, 75s, 54s, A6o-A2o, K9o, Q9o, J9o, T9o, 98o', raise: 0.3, call: 0.35, wide: true },
  ]),
  'BTN/SB': compileTable([
    { hands: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K5o+, Q8o+, J8o+, T8o+, 98o', raise: 0.85, call: 0.12 },
    { hands: 'J3s-J2s, T5s-T2s, 95s-92s, 85s-82s, 74s, 64s, 53s, 43s, K4o-K2o, Q7o-Q2o, J7o-J5o, T7o, 97o, 87o, 76o, 65o', raise: 0.35, call: 0.4, wide: true },
  ]),
};

export function rfiTable(position: TablePosition): CompiledRangeTable {
  const table = RFI_TABLES[position];
  if (!table) throw new Error(`No first-in range table exists for ${position}.`);
  return table;
}
