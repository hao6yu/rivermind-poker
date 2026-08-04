import type { TablePosition } from './multiway';
import type { AiDifficulty } from './aiProfiles';

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
  /**
   * Models how the AI population plays, not how anyone should play. Only
   * callers that model an opponent (a strategyTier or archetype) receive
   * population bands; the neutral teaching baseline skips them.
   */
  population?: boolean;
}

interface CompiledBand {
  hands: ReadonlySet<string>;
  raise: number;
  call: number;
  wide: boolean;
  population: boolean;
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
      population: band.population ?? false,
    })),
  };
}

export function lookupBand(
  table: CompiledRangeTable,
  key: string,
): { raise: number; call: number; wide: boolean; population: boolean } | null {
  for (const band of table.bands) {
    if (band.hands.has(key)) {
      return { raise: band.raise, call: band.call, wide: band.wide, population: band.population };
    }
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
    { hands: '66-22, A9s-A2s, KTs, K9s, QTs, J9s, 87s, 76s, ATo, KJo', raise: 0.42, call: 0, wide: true },
  ]),
  HJ: compileTable([
    { hands: '66+, A9s+, KTs+, QTs+, JTs, T9s, 98s, 87s, ATo+, KJo+, QJo', raise: 0.95, call: 0 },
    { hands: '55-22, A8s-A2s, K9s, Q9s, J9s, T8s, 76s, 65s, A9o, KTo, QTo', raise: 0.35, call: 0, wide: true },
  ]),
  CO: compileTable([
    { hands: '55+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, A9o+, KTo+, QTo+, JTo', raise: 0.95, call: 0 },
    { hands: '44-22, K8s-K5s, Q8s, T7s, 97s, 86s, 65s, 54s, A8o-A5o, K9o, Q9o, J9o, T9o', raise: 0.5, call: 0, wide: true },
  ]),
  BTN: compileTable([
    { hands: '22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, 54s, A4o+, K9o+, Q9o+, J9o+, T9o', raise: 0.95, call: 0 },
    { hands: 'K4s-K2s, Q6s-Q4s, J7s, T7s, 96s, 85s, 75s, 64s, 53s, A3o-A2o, K8o, Q8o, J8o, T8o, 98o, 87o', raise: 0.45, call: 0, wide: true },
  ]),
  // Blind-versus-blind: the small blind is already in for half a bet and only
  // one opponent remains, so completing costs 0.5 BB to win a 1.5 BB pot (3:1).
  // Modern limp-inclusive SB strategies therefore play ~65-75% of the deal —
  // a narrow raising range on top of a very wide completing range. The two
  // junk-complete bands below mirror BB_VS_LATE's junk-defense pattern: the
  // suited/connected junk completes more often than the offsuit trash, and the
  // two worst holdings (72o, 32o) stay outside the range entirely.
  SB: compileTable([
    { hands: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A7o+, KTo+, QTo+, JTo', raise: 0.85, call: 0.12 },
    { hands: 'K5s-K2s, Q7s-Q4s, J7s, T7s, 96s, 86s, 75s, 54s, A6o-A2o, K9o, Q9o, J9o, T9o, 98o', raise: 0.3, call: 0.5, wide: true },
    { hands: 'Q3s-Q2s, J6s-J2s, T6s-T2s, 95s-92s, 85s-82s, 74s-72s, 64s-62s, 53s-52s, 43s-42s, 32s, K8o-K5o, Q8o-Q6o, J8o-J6o, T8o-T6o, 97o-95o, 87o-85o, 76o-74o, 65o-63o, 54o-52o', raise: 0.22, call: 0.45, wide: true },
    { hands: 'K4o-K2o, Q5o-Q2o, J5o-J2o, T5o-T2o, 94o-92o, 84o-82o, 73o, 62o, 43o-42o', raise: 0.12, call: 0.42, wide: true },
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

export type RaiserBucket = 'early' | 'late';

export function raiserBucket(position: TablePosition | undefined): RaiserBucket {
  return position === 'UTG' || position === 'HJ' ? 'early' : 'late';
}

// Combo-weighted width lands near 55%: the BB closes the action for roughly
// 2.3:1 against a 2.5x steal, so folding more than ~45% of the deal is a large
// over-fold. Calibrated against the >=48% defend floor in multiwayAi.test.ts.
const BB_VS_LATE = compileTable([
  { hands: 'JJ+, AQs+, AKo', raise: 0.7, call: 0.3 },
  { hands: 'TT-99, AJs, ATs, KQs, KJs, QJs, JTs, AQo', raise: 0.25, call: 0.7 },
  { hands: 'A5s-A2s, K9s, Q9s, J9s, T8s, 97s, 86s, 75s, 65s, 54s', raise: 0.2, call: 0.6 },
  { hands: '88-22, A9s-A6s, K8s-K2s, Q8s-Q4s, J8s, T9s, 98s, 87s, 76s, 64s, 53s, 43s, AJo-ATo, KTo+, QTo+, JTo, T9o, 98o', raise: 0.04, call: 0.88 },
  { hands: 'A9o-A2o, K9o, Q9o, J9o, T8o, 97o, 87o, 76o, 65o, J7s, T7s, T6s, 96s, 85s, 74s, 63s', raise: 0.02, call: 0.7, wide: true },
  // Pot-odds junk defenses: the BB closes the action getting a big price, so
  // even weak offsuit hands continue at a low frequency against a normal open.
  { hands: 'K8o-K2o, Q8o-Q2o, J8o-J2o, T7o-T2o, 96o-92o, 86o-82o, 75o-72o, 64o-62o, 54o-52o, 43o-42o, 32o, J6s-J2s, T5s-T2s, 95s-92s, 84s-82s, 73s-72s, 62s, 52s, 42s, 32s', raise: 0, call: 0.3, wide: true },
]);

const BB_VS_EARLY = compileTable([
  { hands: 'QQ+, AKs, AKo', raise: 0.6, call: 0.4 },
  { hands: 'JJ-99, AQs, AJs, KQs, AQo', raise: 0.2, call: 0.75 },
  { hands: '88-22, ATs-A2s, KJs-K9s, QTs+, JTs, T9s, 98s, 87s, 76s, 65s, 54s, AJo, KQo', raise: 0.04, call: 0.66 },
  { hands: 'ATo-A8o, KJo, QJo, JTo, K8s-K6s, Q9s, J9s, T8s, 97s, 86s, 75s', raise: 0.02, call: 0.35, wide: true },
  // Pot-odds junk defenses: mirrors BB_VS_LATE's blanket junk band at a lower
  // frequency (the early-position raiser's range is stronger, so the BB
  // continues everything else less often, but still gets a price to look).
  { hands: 'A7o-A2o, KTo, K9o, QTo, T9o, 98o, 87o, K5s-K2s, Q8s-Q5s, J8s, 64s, 53s, K8o-K2o, Q9o-Q2o, Q4s-Q2s, J9o-J2o, J7s-J2s, T8o-T2o, T7s-T2s, 97o-92o, 96s-92s, 86o-82o, 85s-82s, 76o-72o, 74s-72s, 65o-62o, 63s-62s, 54o-52o, 52s, 43s-42s, 43o-42o, 32s, 32o', raise: 0, call: 0.16, wide: true },
]);

/**
 * Club-baseline recreational over-calling. Below the solver's cold-call
 * threshold these hands are folds, but the low-stakes population this AI
 * models flats them at a low frequency to see a cheap multiway flop. It is
 * appended last to the cold-call tables, so every hand the table already
 * prices keeps its own frequencies (`lookupBand` takes the first match) and
 * this band only catches what would otherwise fold outright. Deliberately
 * looser than a GTO cold-calling range — see docs/PR48_AI_REALISM_QA.md.
 * True trash (K4o and below, Q5o and below, 32o and friends) is still folded.
 */
const RECREATIONAL_OVERCALL_HANDS =
  'A2s+, K2s+, Q2s+, J2s+, T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s,'
  + ' A2o+, K5o+, Q6o+, J6o+, T7o+, 96o+, 86o+, 75o+, 64o+, 54o';

function recreationalOvercall(call: number): RangeBand {
  return { hands: RECREATIONAL_OVERCALL_HANDS, raise: 0, call, wide: true, population: true };
}

const SB_VS_EARLY = compileTable([
  { hands: 'QQ+, AKs, AKo', raise: 0.75, call: 0.25 },
  { hands: 'JJ-TT, AQs, AJs, KQs, AQo', raise: 0.45, call: 0.5 },
  { hands: '99-55, ATs, KJs, QJs, JTs, T9s, 98s, AJo', raise: 0.12, call: 0.6 },
  { hands: '44-22, A9s-A5s, KTs, QTs, 87s, 76s, KQo', raise: 0.06, call: 0.42, wide: true },
  recreationalOvercall(0.3),
]);

const SB_VS_LATE = compileTable([
  { hands: 'TT+, AQs+, AQo+', raise: 0.7, call: 0.3 },
  { hands: '99-77, AJs, ATs, KQs, KJs, QJs, JTs, AJo, KQo', raise: 0.3, call: 0.55 },
  { hands: '66-22, A9s-A2s, KTs, QTs, J9s, T9s, 98s, 87s, 76s, 65s, ATo, KJo', raise: 0.1, call: 0.62 },
  { hands: 'A9o-A7o, KTo, QTo, JTo, K9s, Q9s, T8s, 97s, 54s', raise: 0.08, call: 0.48, wide: true },
  recreationalOvercall(0.47),
]);

const IP_VS_EARLY = compileTable([
  { hands: 'QQ+, AKs, AKo', raise: 0.65, call: 0.35 },
  { hands: 'JJ-TT, AQs, AQo', raise: 0.25, call: 0.7 },
  { hands: '99-22, AJs, ATs, KQs, KJs, QJs, JTs, T9s, 98s', raise: 0.05, call: 0.6 },
  { hands: 'A5s-A2s, AJo, KQo, QTs, J9s, 87s, 76s, 65s, 97s, 86s, 75s, 64s, 53s, 43s, KJo, QJo, JTo, KTo', raise: 0.08, call: 0.42, wide: true },
  recreationalOvercall(0.28),
]);

const IP_VS_LATE = compileTable([
  { hands: 'JJ+, AQs+, AKo', raise: 0.7, call: 0.3 },
  { hands: 'TT-88, AJs, ATs, KQs, KJs, QJs, JTs, AQo', raise: 0.3, call: 0.6 },
  { hands: '77-22, A9s-A2s, KTs, QTs, T9s, 98s, 87s, 76s, 65s, AJo, ATo, KQo, KJo', raise: 0.08, call: 0.65 },
  { hands: '54s, J9s, T8s, 97s, QJo, JTo', raise: 0.06, call: 0.48, wide: true },
  recreationalOvercall(0.5),
]);

const VS_THREE_BET = compileTable([
  { hands: 'KK+, AKs', raise: 0.75, call: 0.25 },
  { hands: 'QQ, JJ, AKo, AQs', raise: 0.3, call: 0.6 },
  { hands: 'TT-88, AJs, ATs, KQs, A5s-A4s, QJs, JTs, T9s', raise: 0.08, call: 0.45 },
  { hands: '77-22, KJs, QTs, 98s, 87s, AQo, A9s-A6s, A3s-A2s, KTs-K9s, J9s-J8s, T8s-T7s, 76s, 65s, 54s, 97s, 86s, 75s, 64s, 53s, AJo-ATo, KQo, QJo, JTo', raise: 0.03, call: 0.25, wide: true },
]);

const VS_FOUR_BET = compileTable([
  { hands: 'KK+, AKs', raise: 0.6, call: 0.4 },
  { hands: 'QQ, AKo', raise: 0.25, call: 0.45 },
  { hands: 'JJ, AQs, A5s', raise: 0.08, call: 0.2 },
]);

export function defenseTable(position: TablePosition, raiser: RaiserBucket): CompiledRangeTable {
  if (position === 'BB') return raiser === 'early' ? BB_VS_EARLY : BB_VS_LATE;
  if (position === 'SB' || position === 'BTN/SB') return raiser === 'early' ? SB_VS_EARLY : SB_VS_LATE;
  return raiser === 'early' ? IP_VS_EARLY : IP_VS_LATE;
}

export function vsThreeBetTable(): CompiledRangeTable { return VS_THREE_BET; }
export function vsFourBetTable(): CompiledRangeTable { return VS_FOUR_BET; }

export interface BandFrequencies { raise: number; call: number; wide: boolean }

function clampFrequency(value: number): number {
  return Math.max(0, Math.min(0.98, value));
}

/** Price-aware defense: shrink continues smoothly as the open grows, expand vs min-raises. */
export function applyOpenSizeScale(
  band: BandFrequencies,
  raiseSizeBb: number | undefined,
): BandFrequencies {
  const size = Math.max(2, Math.min(6, raiseSizeBb ?? 2.5));
  const callScale = Math.pow(2.5 / size, 0.5);
  const raiseScale = Math.pow(2.5 / size, 0.25);
  return {
    raise: clampFrequency(band.raise * raiseScale),
    call: clampFrequency(band.call * callScale),
    wide: band.wide,
  };
}

/** Overcalls: pot odds and multiway playability loosen pairs/suited hands, tighten offsuit. */
export function applyOvercallAdjustment(
  band: BandFrequencies,
  key: string,
  callersAfterRaise: number,
): BandFrequencies {
  if (callersAfterRaise <= 0) return band;
  const pair = key.length === 2;
  const suited = key.endsWith('s');
  const perCaller = pair || suited ? 1.15 : 0.85;
  const callScale = Math.min(1.35, Math.pow(perCaller, callersAfterRaise));
  const raiseScale = Math.pow(0.9, callersAfterRaise);
  return {
    raise: clampFrequency(band.raise * raiseScale),
    call: clampFrequency(band.call * callScale),
    wide: band.wide,
  };
}

// Strong-speculative: still over-limps behind, but iso-raises at a meaningful mix
// too (e.g. CO's 88/KTs/ATo shouldn't disappear into a pure over-limp frequency).
const OVERLIMP_STRONG: RangeBand = {
  hands: '88-66, A9s-A7s, KTs, QTs, J9s+, ATo, KJo, QJo, JTo',
  raise: 0.3,
  call: 0.55,
};

// Speculative: mostly over-limps for set value / implied odds, rarely isolates.
const OVERLIMP_SPECULATIVE: RangeBand = {
  hands: '55-22, A6s-A2s, K9s-K8s, Q9s, T8s+, 97s+, 87s, 76s, 65s, 54s',
  raise: 0.08,
  call: 0.6,
};

const LIMPED_TABLES = new Map<TablePosition, CompiledRangeTable>();

/**
 * Facing limpers: the over-limp bands intentionally precede the position's RFI
 * bands (lookupBand takes the first match), so playable-but-not-premium hands
 * over-limp (or iso-raise at a mixed frequency for the stronger-speculative
 * band) instead of being swallowed by the RFI table's own frequencies.
 * Premium/value hands aren't members of either over-limp band, so they fall
 * through to the position's opening range and iso-raise there.
 */
export function limpedTable(position: TablePosition): CompiledRangeTable {
  const cached = LIMPED_TABLES.get(position);
  if (cached) return cached;
  const base = position === 'BB' ? rfiTable('BTN') : rfiTable(position);
  const table: CompiledRangeTable = {
    bands: [...compileTable([OVERLIMP_STRONG, OVERLIMP_SPECULATIVE]).bands, ...base.bands],
  };
  LIMPED_TABLES.set(position, table);
  return table;
}

export type PreflopArchetype = 'balanced' | 'patient' | 'pressure' | 'sticky' | 'deceptive';

interface ArchetypePreflopProfile {
  raiseScale: number;
  callScale: number;
  wideScale: number;
  threeBetScale: number;
  limpScale: number;
}

// `limpScale` multiplies the `call` leg of unopened and limped spots. The
// tight/aggressive archetypes still limp least, but 0.6/0.5 was authored before
// the small blind had a real completion range: completing for 3:1 against one
// opponent is a price play, not a passivity leak, so patient/pressure sit at
// 0.9/0.8 rather than crushing the blind-versus-blind discount.
const ARCHETYPE_PREFLOP: Record<PreflopArchetype, ArchetypePreflopProfile> = {
  balanced: { raiseScale: 1, callScale: 1, wideScale: 1, threeBetScale: 1, limpScale: 1 },
  patient: { raiseScale: 0.95, callScale: 0.85, wideScale: 0.4, threeBetScale: 0.85, limpScale: 0.9 },
  pressure: { raiseScale: 1.2, callScale: 0.9, wideScale: 1.5, threeBetScale: 1.45, limpScale: 0.8 },
  sticky: { raiseScale: 0.8, callScale: 1.6, wideScale: 1.9, threeBetScale: 0.6, limpScale: 2 },
  deceptive: { raiseScale: 1, callScale: 1.1, wideScale: 1.1, threeBetScale: 1.1, limpScale: 1.4 },
};

function capPair(raise: number, call: number, wide: boolean): BandFrequencies {
  const total = raise + call;
  if (total <= 0.98) return { raise, call, wide };
  const scale = 0.98 / total;
  const scaledRaise = raise * scale;
  // Derive call as the residual (rather than call * scale) so raise + call <= 0.98
  // holds by construction, immune to floating-point round-trip drift. Floored at
  // 0 defensively in case scaledRaise alone were ever to exceed 0.98.
  return { raise: scaledRaise, call: Math.max(0, Math.min(call * scale, 0.98 - scaledRaise)), wide };
}

export function applyArchetype(
  band: BandFrequencies,
  archetype: PreflopArchetype | undefined,
  facing: 'unopened' | 'limped' | 'raised',
): BandFrequencies {
  if (!archetype || archetype === 'balanced') return band;
  const profile = ARCHETYPE_PREFLOP[archetype];
  const wideFactor = band.wide ? profile.wideScale : 1;
  // `wideScale` is an entry-width lever, not an aggression lever. A loose-passive
  // archetype must never raise marginal hands more often than a balanced one —
  // and the first-in tables author their wide bands at `call: 0`, so the
  // widening would have nowhere to land but the raise leg. Passive archetypes
  // therefore widen only what they call. Tightening (wideScale < 1) still
  // applies to both legs: a nit plays marginal hands less in every way.
  const raiseWideFactor = profile.raiseScale < 1 ? Math.min(wideFactor, 1) : wideFactor;
  const raise = band.raise * profile.raiseScale * raiseWideFactor
    * (facing === 'raised' ? profile.threeBetScale : 1);
  const call = band.call * profile.callScale * wideFactor
    * (facing === 'raised' ? 1 : profile.limpScale);
  return capPair(clampFrequency(raise), clampFrequency(call), band.wide);
}

interface TierPreflopProfile {
  raiseToCallShift: number;
  wideScale: number;
  raiseScale: number;
}

const TIER_PREFLOP: Record<AiDifficulty, TierPreflopProfile> = {
  friendly: { raiseToCallShift: 0.3, wideScale: 1.35, raiseScale: 0.85 },
  club: { raiseToCallShift: 0, wideScale: 1, raiseScale: 1 },
  sharp: { raiseToCallShift: 0, wideScale: 0.8, raiseScale: 1.05 },
  elite: { raiseToCallShift: 0, wideScale: 0.65, raiseScale: 1.08 },
  nemesis: { raiseToCallShift: 0, wideScale: 0.6, raiseScale: 1.1 },
};

export function applyTier(band: BandFrequencies, tier: AiDifficulty | undefined): BandFrequencies {
  if (!tier || tier === 'club') return band;
  const profile = TIER_PREFLOP[tier];
  const wideFactor = band.wide ? profile.wideScale : 1;
  const scaledRaise = band.raise * profile.raiseScale * wideFactor;
  const shifted = scaledRaise * profile.raiseToCallShift;
  return capPair(
    clampFrequency(scaledRaise - shifted),
    clampFrequency(band.call * wideFactor + shifted),
    band.wide,
  );
}

/** Below ~25bb speculative flats lose implied odds; pairs keep most value (jam/call). */
export function applyShortStack(
  band: BandFrequencies,
  key: string,
  stackBand: 'short' | 'medium' | 'deep',
): BandFrequencies {
  if (stackBand !== 'short') return band;
  const pair = key.length === 2;
  const callScale = pair ? 0.8 : band.wide ? 0.35 : 0.6;
  return { raise: band.raise, call: clampFrequency(band.call * callScale), wide: band.wide };
}
