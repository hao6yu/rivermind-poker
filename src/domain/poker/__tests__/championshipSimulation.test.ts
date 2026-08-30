import { describe, expect, it } from 'vitest';

import {
  championshipEvent,
  CHAMPIONSHIP_INVITATIONAL_EVENT,
} from '../championship';
import { simulateChampionshipCorpus } from '../championshipSimulation';
import type { ChampionshipHeroStrategy } from '../championshipSimulation';

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

describe('Championship tournament calibration', () => {
  it('completes repeatable Final and Hell-mode corpora against a Sharp AI hero proxy', () => {
    const runs = process.env.PRINT_CHAMPIONSHIP_METRICS === '1' ? 80 : 12;
    const finalResults = simulateChampionshipCorpus(championshipEvent('championship_final'), runs, {
      heroDifficulty: 'sharp',
      samplesPerDecision: 8,
      seed: 910_001,
    });
    const invitationResults = simulateChampionshipCorpus(CHAMPIONSHIP_INVITATIONAL_EVENT, runs, {
      heroDifficulty: 'sharp',
      samplesPerDecision: 8,
      seed: 920_001,
    });

    for (const result of [...finalResults, ...invitationResults]) {
      expect(result.place).toBeGreaterThanOrEqual(1);
      expect(result.place).toBeLessThanOrEqual(9);
      expect(result.handsPlayed).toBeGreaterThan(0);
      expect(result.decisions).toBeGreaterThan(0);
    }
    expect(finalResults.some((result) => !result.won)).toBe(true);
    expect(invitationResults.some((result) => !result.won)).toBe(true);
    if (runs >= 40) {
      expect(finalResults.some((result) => result.won)).toBe(true);
      expect(invitationResults.some((result) => result.won)).toBe(true);
    }

    if (process.env.PRINT_CHAMPIONSHIP_METRICS === '1') {
      console.table([
        { event: 'RiverMind Final', runs, heroWinRate: rate(finalResults.filter((result) => result.won).length, runs), averageHands: finalResults.reduce((sum, result) => sum + result.handsPlayed, 0) / runs },
        { event: 'The River Below', runs, heroWinRate: rate(invitationResults.filter((result) => result.won).length, runs), averageHands: invitationResults.reduce((sum, result) => sum + result.handsPlayed, 0) / runs },
      ]);
    }
  }, 120_000);

  it('completes a matrix of independent exploit and population-style bots', () => {
    const runs = process.env.PRINT_CHAMPIONSHIP_STYLE_METRICS === '1' ? 20 : 3;
    const strategies: ChampionshipHeroStrategy[] = [
      'periodic_stealer',
      'tag',
      'calling_station',
      'maniac',
      'shove_bot',
    ];
    const metrics: Record<string, string | number>[] = [];
    for (const [index, heroStrategy] of strategies.entries()) {
      const finalResults = simulateChampionshipCorpus(championshipEvent('championship_final'), runs, {
        heroStrategy,
        maxHands: 500,
        samplesPerDecision: 6,
        seed: 930_001 + index * 10_000,
      });
      const invitationResults = simulateChampionshipCorpus(CHAMPIONSHIP_INVITATIONAL_EVENT, runs, {
        heroStrategy,
        maxHands: 500,
        samplesPerDecision: 6,
        seed: 940_001 + index * 10_000,
      });
      for (const result of [...finalResults, ...invitationResults]) {
        expect(result.heroStrategy).toBe(heroStrategy);
        expect(result.place).toBeGreaterThanOrEqual(1);
        expect(result.place).toBeLessThanOrEqual(9);
        expect(result.decisions).toBeGreaterThan(0);
      }
      if (heroStrategy === 'periodic_stealer') {
        expect([...finalResults, ...invitationResults].some((result) => result.heroPreflopRaises > 0)).toBe(true);
      }
      for (const [event, results] of [
        ['RiverMind Final', finalResults] as const,
        ['The River Below', invitationResults] as const,
      ]) {
        metrics.push({
          averageHands: Number((results.reduce((sum, result) => sum + result.handsPlayed, 0) / runs).toFixed(1)),
          averagePreflopRaises: Number((results.reduce((sum, result) => sum + result.heroPreflopRaises, 0) / runs).toFixed(1)),
          averageUncontestedWins: Number((results.reduce((sum, result) => sum + result.heroUncontestedWins, 0) / runs).toFixed(1)),
          event,
          heroStrategy,
          runs,
          winRate: rate(results.filter((result) => result.won).length, runs),
        });
      }
    }
    if (process.env.PRINT_CHAMPIONSHIP_STYLE_METRICS === '1') {
      console.table(metrics);
    }
  }, 180_000);
});
