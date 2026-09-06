/**
 * Whole-corpus liveness limit, not a per-decision performance allowance.
 * The September 6 hosted runner took 212s for the unchanged all-AI corpus
 * (about 60s locally), and 6.8–6.9s for fixtures with Vitest's 5s default.
 * Give hosted simulation jobs 3x their existing local limits. Corpus sizes,
 * seeds, behavioral thresholds, and explicit 1s decision assertions stay fixed.
 */
export function aiSimulationTimeout(localMs: number): number {
  return localMs * (process.env.CI === 'true' || process.env.CI === '1' ? 3 : 1);
}
