import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { simulateAiDifficulty } from '../aiSimulation';

// Opt-in fixed-opponent diagnostic, not a noisy win-rate CI threshold.
describe.skipIf(process.env.RUN_AI_BENCHMARK !== '1')('AI fixed-opponent benchmark', () => {
  it('completes identical deals against three public-action policies', () => {
    const rows = [];
    for (const opponent of ['regular', 'passive', 'pressure'] as const) {
      for (const difficulty of ['club', 'elite', 'nemesis'] as const) {
        const result = simulateAiDifficulty(difficulty, 80, 20260905, undefined, opponent);
        expect(result.completedHands).toBe(80);
        rows.push({ opponent, difficulty, netBB: result.netBigBlinds,
          freeCheckFolds: result.freeCheckFolds, flopRate: result.flopRate,
          aggression: result.aggressionRate });
      }
    }
    console.log('AI_BENCHMARK', JSON.stringify(rows));
    if (process.env.AI_BENCHMARK_OUTPUT) writeFileSync(process.env.AI_BENCHMARK_OUTPUT, JSON.stringify(rows, null, 2));
  }, 300_000);
});
