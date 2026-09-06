import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AiDifficulty } from '../aiProfiles';
import {
  DEFAULT_LADDER_PAIRS,
  LADDER_SEEDS,
  runAdaptationRows,
  runHeadsUpLadder,
  runSixMaxLadder,
  runSixMaxStyleRows,
} from '../aiLadderBenchmark';

const VALID_TIERS = ['friendly', 'club', 'sharp', 'elite', 'nemesis'] as const;

function ladderPairsFromEnv(): ReadonlyArray<readonly [AiDifficulty, AiDifficulty]> {
  const env = process.env.LADDER_PAIRS;
  if (!env) return DEFAULT_LADDER_PAIRS;

  const pairs: Array<readonly [AiDifficulty, AiDifficulty]> = [];
  for (const pair of env.split(',')) {
    const [higher, lower] = pair.trim().split(':');
    if (!higher || !lower) {
      throw new Error(`Invalid LADDER_PAIRS format: "${pair}"`);
    }
    if (!VALID_TIERS.includes(higher as AiDifficulty)) {
      throw new Error(`Invalid tier name in LADDER_PAIRS: "${higher}"`);
    }
    if (!VALID_TIERS.includes(lower as AiDifficulty)) {
      throw new Error(`Invalid tier name in LADDER_PAIRS: "${lower}"`);
    }
    pairs.push([higher as AiDifficulty, lower as AiDifficulty]);
  }
  return pairs;
}

describe('AI ladder benchmark structure', () => {
  it('plays duplicate deals heads-up and reports a symmetric result shape', () => {
    const [result] = runHeadsUpLadder([['club', 'friendly']], 4, 11);
    expect(result!.hands).toBe(8);
    expect(result!.matchup).toBe('club vs friendly');
    expect(Number.isFinite(result!.bbPer100)).toBe(true);
    expect(result!.plusMinusPer100).toBeGreaterThanOrEqual(0);
    expect(result!.showdownPct).toBeGreaterThanOrEqual(0);
    expect(result!.showdownPct).toBeLessThanOrEqual(100);
  });

  it('cancels card luck: a tier against itself nets exactly zero', () => {
    expect(runHeadsUpLadder([['club', 'club']], 6, 23)[0]!.netBbForHigher).toBeCloseTo(0, 6);
    expect(runSixMaxLadder([['club', 'club']], 2, 23)[0]!.netBbForHigher).toBeCloseTo(0, 6);
  });

  it('plays 6-max with three seats per tier, per personality style', () => {
    const rows = runSixMaxStyleRows([['sharp', 'club']], 1, 31);
    expect(rows.map((row) => row.matchup)).toEqual([
      'sharp vs club [balanced]', 'sharp vs club [patient]', 'sharp vs club [pressure]',
      'sharp vs club [sticky]', 'sharp vs club [deceptive]',
    ]);
    expect(rows[0]!.hands).toBe(2);
  }, 30_000);

  it('reports adaptation as memory-on minus memory-off on identical deals', () => {
    const [row] = runAdaptationRows([['sharp', 'club']], 6, 41);
    expect(row!.hands).toBe(6);
    expect(Number.isFinite(row!.adaptationGainBbPer100)).toBe(true);
  });

  it('keeps the tuning and evaluation corpora disjoint', () => {
    expect(LADDER_SEEDS.tuning.headsUp).not.toBe(LADDER_SEEDS.evaluation.headsUp);
    expect(LADDER_SEEDS.tuning.sixMax).not.toBe(LADDER_SEEDS.evaluation.sixMax);
  });

  it('keeps Elite postflop bluffing within a bounded ratio of Club on a fixed corpus', () => {
    const [result] = runHeadsUpLadder([['elite', 'club']], 100, 5_150);
    const eliteBluffs = result!.postflopRaiseStyles.higher.bluff ?? 0;
    const clubBluffs = result!.postflopRaiseStyles.lower.bluff ?? 0;
    // Before this slice Elite bluffed about six times as often as Club and lost chips doing it.
    expect(eliteBluffs).toBeLessThanOrEqual(Math.max(8, clubBluffs * 2.5));
  }, 120_000);

  it('parses LADDER_PAIRS env filter correctly', () => {
    const prev = process.env.LADDER_PAIRS;
    try {
      process.env.LADDER_PAIRS = 'sharp:club,nemesis:elite';
      expect(ladderPairsFromEnv()).toEqual([['sharp', 'club'], ['nemesis', 'elite']]);

      process.env.LADDER_PAIRS = 'wizard:club';
      expect(() => ladderPairsFromEnv()).toThrow();
    } finally {
      process.env.LADDER_PAIRS = prev;
    }
  });
});

function ladderCorpus(): { name: 'tuning' | 'evaluation'; seeds: { headsUp: number; sixMax: number } } {
  const name = process.env.LADDER_CORPUS === 'evaluation' ? 'evaluation' : 'tuning';
  return { name, seeds: LADDER_SEEDS[name] };
}

function writeLadderOutput(corpusName: string, group: string, rows: unknown): void {
  const dir = process.env.AI_BENCHMARK_OUTPUT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${corpusName}-${group}.json`, JSON.stringify(rows, null, 2));
}

// Opt-in ladder gate. Slow: production sample depth.
describe.skipIf(process.env.RUN_AI_BENCHMARK !== '1')('AI ladder benchmark corpus', () => {
  it('heads-up ladder', () => {
    const { name, seeds } = ladderCorpus();
    const huDeals = Number(process.env.LADDER_HU_DEALS ?? 1_500);
    const pairs = ladderPairsFromEnv();
    const rows = runHeadsUpLadder(pairs, huDeals, seeds.headsUp);
    console.log('AI_LADDER_HEADS_UP', JSON.stringify(rows));
    writeLadderOutput(name, 'headsUp', rows);
    expect(rows.length).toBe(pairs.length);
  }, 3_600_000);

  it('six-max ladder', () => {
    const { name, seeds } = ladderCorpus();
    const mwDeals = Number(process.env.LADDER_MW_DEALS ?? 600);
    const pairs = ladderPairsFromEnv();
    const rows = runSixMaxLadder(pairs, mwDeals, seeds.sixMax);
    console.log('AI_LADDER_SIX_MAX', JSON.stringify(rows));
    writeLadderOutput(name, 'sixMax', rows);
    expect(rows.length).toBe(pairs.length);
  }, 3_600_000);

  it('six-max style rows', () => {
    const { name, seeds } = ladderCorpus();
    const styleDeals = Number(process.env.LADDER_STYLE_DEALS ?? 150);
    const topPairs = ladderPairsFromEnv().filter(([, lower]) => lower === 'club');
    const rows = runSixMaxStyleRows(topPairs, styleDeals, seeds.sixMax + 1);
    console.log('AI_LADDER_SIX_MAX_STYLES', JSON.stringify(rows));
    writeLadderOutput(name, 'sixMaxStyles', rows);
    expect(rows.length).toBe(topPairs.length * 5);
  }, 3_600_000);

  it('adaptation rows', () => {
    const { name, seeds } = ladderCorpus();
    const adaptHands = Number(process.env.LADDER_ADAPT_HANDS ?? 600);
    const topPairs = ladderPairsFromEnv().filter(([, lower]) => lower === 'club');
    const rows = runAdaptationRows(topPairs, adaptHands, seeds.headsUp + 1);
    console.log('AI_LADDER_ADAPTATION', JSON.stringify(rows));
    writeLadderOutput(name, 'adaptation', rows);
    expect(rows.length).toBe(topPairs.length);
  }, 3_600_000);
});
