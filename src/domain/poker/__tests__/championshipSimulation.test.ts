import { aiSimulationTimeout } from '../../../test/aiSimulationBudget';
import { describe, expect, it, vi } from 'vitest';

import {
  championshipEvent,
  CHAMPIONSHIP_INVITATIONAL_EVENT,
} from '../championship';
import { simulateChampionshipCorpus, simulateChampionshipTournament } from '../championshipSimulation';
import type { ChampionshipHeroStrategy } from '../championshipSimulation';
import type { AiDifficulty } from '../aiProfiles';
import { multiwayAiRoster } from '../multiwayAiProfiles';
import { getMultiwayLegalActions } from '../multiway';

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
    // 80-run calibration path (via PRINT_CHAMPIONSHIP_METRICS) needs 900s for range-based equity on Elite/Nemesis EV paths; default corpus fits 120s CI budget
  }, process.env.PRINT_CHAMPIONSHIP_METRICS === '1' ? 900_000 : aiSimulationTimeout(120_000));

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
    // 20-run style matrix (via PRINT_CHAMPIONSHIP_STYLE_METRICS) or 80-run calibration needs 900s for range-based equity; default corpus fits 180s CI budget
  }, process.env.PRINT_CHAMPIONSHIP_STYLE_METRICS === '1' || process.env.PRINT_CHAMPIONSHIP_METRICS === '1' ? 900_000 : aiSimulationTimeout(180_000));

  it('measures the event roster in production-parity mode, not the Club default', async () => {
    // C2 parity gate (v1.3 review): parity mode must construct the initial
    // Sit & Go from the event's authored difficulty, exactly like the live
    // table. `decideSessionAiAction` resolves named identities before its
    // difficulty fallback, so a Club-default roster would measure Club
    // personas at an Elite event. The session decision is stubbed to an
    // immediate fold so the run is cheap while still flowing through the real
    // construction and dispatch wiring.
    const sessionModule = await import('../multiwaySession');
    const seenOpponentNames = new Set<string>();
    const seenDifficulties = new Set<AiDifficulty>();
    const spy = vi.spyOn(sessionModule, 'decideSessionAiAction').mockImplementation((state, _playerId, difficulty) => {
      seenDifficulties.add(difficulty);
      for (const playerId of state.tablePlayerIds) {
        if (playerId !== 'hero') seenOpponentNames.add(state.players[playerId]!.name);
      }
      // The cheapest always-legal reply: check when checking is available.
      const legal = getMultiwayLegalActions(state, _playerId);
      return { action: legal.canCheck ? { type: 'check' } : { type: 'fold' }, estimatedEquity: 0 } as never;
    });
    try {
      const result = simulateChampionshipTournament(championshipEvent('masters_6'), {
        productionParity: true,
        heroStrategy: 'shove_bot',
        samplesPerDecision: 1,
        maxHands: 600,
        seed: 424_242,
      });
      expect(result.productionParity).toBe(true);
      expect(result.decisionsByDifficulty.club).toBe(0);
      expect(result.decisionsByDifficulty.elite).toBeGreaterThan(0);
      expect(seenDifficulties.has('club')).toBe(false);
      expect(seenOpponentNames.size).toBeGreaterThan(0);
      const eliteNames = new Set(multiwayAiRoster('elite').map((identity) => identity.name));
      const clubNames = new Set(multiwayAiRoster('club').map((identity) => identity.name));
      for (const name of seenOpponentNames) {
        expect(eliteNames.has(name), `${name} must come from the Elite roster`).toBe(true);
        expect(clubNames.has(name), `${name} must not be a Club persona`).toBe(false);
      }
    } finally {
      spy.mockRestore();
    }
  }, aiSimulationTimeout(120_000));
});
