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
