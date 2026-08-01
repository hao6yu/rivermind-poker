import { getRandomValues } from 'expo-crypto';

import type { RandomSource } from '../domain/poker/cards';

const uint32Range = 0x1_0000_0000;
const poolSize = 64;
let entropyPool = new Uint32Array(poolSize);
let entropyCursor = poolSize;

/** Native cryptographic entropy for real deals and generated learning sessions. */
export const secureRandom: RandomSource = () => {
  if (entropyCursor >= entropyPool.length) {
    entropyPool = getRandomValues(new Uint32Array(poolSize));
    entropyCursor = 0;
  }
  const value = entropyPool[entropyCursor];
  entropyCursor += 1;
  if (value === undefined) throw new Error('Secure random generation returned no data.');
  return value / uint32Range;
};

export function secureRandomIndex(length: number): number {
  if (!Number.isInteger(length) || length <= 0) throw new Error('A random choice requires at least one option.');
  return Math.floor(secureRandom() * length);
}
