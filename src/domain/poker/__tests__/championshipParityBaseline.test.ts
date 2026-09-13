import { describe, expect, it } from 'vitest';

import {
  championshipEvent,
  championshipQualifies,
  CHAMPIONSHIP_INVITATIONAL_EVENT,
} from '../championship';
import {
  simulateChampionshipCorpus,
  type ChampionshipHeroStrategy,
} from '../championshipSimulation';

/**
 * C2 production-parity baseline (scope draft: measure all three endgame events).
 * Env-gated: RUN_CHAMPIONSHIP_PARITY=1 enables it; CI and the default suite
 * never pay for it. Evaluation seeds are disjoint from the tuning corpus, and
 * every cohort reports a clear rate with a Wilson band so the owner can ratify
 * numeric targets before any C3 tuning.
 *
 * Usage:
 *   RUN_CHAMPIONSHIP_PARITY=1 PARITY_RUNS=20 pnpm vitest run \
 *     src/domain/poker/__tests__/championshipParityBaseline.test.ts
 */

const enabled = process.env.RUN_CHAMPIONSHIP_PARITY === '1';
const runsPerCohort = Math.max(1, Math.round(Number(process.env.PARITY_RUNS ?? 20)));
const sharpAiRuns = Math.max(1, Math.round(Number(process.env.PARITY_SHARP_RUNS ?? 8)));

const events = [
  { id: 'championship_final', label: 'RiverMind Final' },
  { id: 'river_below', label: 'The River Below' },
  { id: 'the_undertow', label: 'The Undertow' },
] as const;

const strategies: ChampionshipHeroStrategy[] = [
  'tag',
  'calling_station',
  'periodic_stealer',
  'maniac',
  'shove_bot',
];

/** Wilson score interval at ~95%, for small-sample clear rates. */
function wilsonBand(wins: number, total: number): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = wins / total;
  const denominator = 1 + z * z / total;
  const centre = p + z * z / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);
  return {
    low: Math.max(0, (centre - spread) / denominator),
    high: Math.min(1, (centre + spread) / denominator),
  };
}

describe.skipIf(!enabled)('Championship production-parity baseline (C2)', () => {
  it('measures clear rates for all three endgame events across scripted cohorts', () => {
    const rows: Record<string, string | number>[] = [];
    let cohortSeed = 970_001;
    for (const event of events) {
      const definition = event.id === 'river_below'
        ? CHAMPIONSHIP_INVITATIONAL_EVENT
        : championshipEvent(event.id);
      for (const heroStrategy of strategies) {
        const results = simulateChampionshipCorpus(definition, runsPerCohort, {
          heroStrategy,
          maxHands: 500,
          samplesPerDecision: 8,
          seed: cohortSeed,
          productionParity: true,
        });
        cohortSeed += 100_000;
        const clears = results.filter((result) => championshipQualifies(definition, result.place)).length;
        const wins = results.filter((result) => result.won).length;
        const band = wilsonBand(clears, runsPerCohort);
        for (const result of results) {
          expect(result.place).toBeGreaterThanOrEqual(1);
          expect(result.place).toBeLessThanOrEqual(definition.playerCount);
          expect(result.handsPlayed).toBeGreaterThan(0);
          expect(result.productionParity).toBe(true);
        }
        rows.push({
          aiFallbacks: results.reduce((sum, result) => sum + result.aiFallbacks, 0),
          avgHands: Number((results.reduce((sum, result) => sum + result.handsPlayed, 0) / runsPerCohort).toFixed(1)),
          avgPlace: Number((results.reduce((sum, result) => sum + result.place, 0) / runsPerCohort).toFixed(1)),
          clearRate: Number((clears / runsPerCohort).toFixed(3)),
          clearRateBand: `${band.low.toFixed(2)}–${band.high.toFixed(2)}`,
          cohort: heroStrategy,
          event: event.label,
          runs: runsPerCohort,
          winRate: Number((wins / runsPerCohort).toFixed(3)),
        });
      }
      // The Sharp AI proxy: a repeatable competent-aggressive stand-in for a
      // skilled returning human. It is a proxy, never a measured human rate.
      const sharpResults = simulateChampionshipCorpus(definition, sharpAiRuns, {
        heroDifficulty: 'sharp',
        heroStrategy: 'ai',
        maxHands: 500,
        samplesPerDecision: 8,
        seed: cohortSeed,
        productionParity: true,
      });
      cohortSeed += 100_000;
      const sharpClears = sharpResults.filter((result) => championshipQualifies(definition, result.place)).length;
      const sharpBand = wilsonBand(sharpClears, sharpAiRuns);
      rows.push({
        avgHands: Number((sharpResults.reduce((sum, result) => sum + result.handsPlayed, 0) / sharpAiRuns).toFixed(1)),
        avgPlace: Number((sharpResults.reduce((sum, result) => sum + result.place, 0) / sharpAiRuns).toFixed(1)),
        clearRate: Number((sharpClears / sharpAiRuns).toFixed(3)),
        clearRateBand: `${sharpBand.low.toFixed(2)}–${sharpBand.high.toFixed(2)}`,
        cohort: 'sharp_ai_proxy',
        event: event.label,
        runs: sharpAiRuns,
        winRate: Number((sharpResults.filter((result) => result.won).length / sharpAiRuns).toFixed(3)),
      });
    }
    console.table(rows);
    console.log('PARITY_BASELINE_JSON', JSON.stringify(rows));
    expect(rows.length).toBe(events.length * (strategies.length + 1));
  }, enabled ? 3_600_000 : 60_000);
});
