import { describe, expect, it } from 'vitest';

import { cardKey } from '../../poker/cards';
import { percentageScore } from '../progress';
import {
  generateScenarioSession,
  scenarioChoicePoints,
  scenarioSessionSize,
  scenarioTemplateCount,
  scenarioTrainer,
} from '../scenarios';

describe('scenario training', () => {
  it('builds a concise session from a larger decision-template catalog', () => {
    expect(scenarioTemplateCount).toBe(8);
    expect(scenarioSessionSize).toBe(6);
    expect(scenarioTrainer.scenarios).toHaveLength(scenarioSessionSize);

    const allTemplates = generateScenarioSession(42, scenarioTemplateCount);
    expect(new Set(allTemplates.map((scenario) => scenario.focus))).toEqual(new Set([
      'Preflop value',
      'Blind defense',
      'Draws and pot odds',
      'Value betting',
      'Bluff catching',
      'Bluff selection',
      'Showdown value',
      'Isolation and position',
    ]));
  });

  it('defines valid cards, streets, choices, and recalculated call prices across 100 sessions', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const session = generateScenarioSession(seed);
      expect(session).toHaveLength(scenarioSessionSize);
      expect(new Set(session.map((scenario) => scenario.focus)).size).toBe(session.length);

      for (const scenario of session) {
        const knownCards = [...scenario.heroCards, ...scenario.board];
        expect(scenario.heroCards).toHaveLength(2);
        expect(scenario.position.length).toBeGreaterThan(0);
        expect(scenario.opponentPosition.length).toBeGreaterThan(0);
        expect(new Set(knownCards.map(cardKey)).size).toBe(knownCards.length);
        expect(scenario.board).toHaveLength(
          scenario.street === 'preflop' ? 0 : scenario.street === 'flop' ? 3 : scenario.street === 'turn' ? 4 : 5,
        );
        expect(scenario.choices.filter((choice) => choice.grade === 'best')).toHaveLength(1);
        expect(scenario.choices.find((choice) => choice.id === scenario.bestChoiceId)?.grade).toBe('best');
        expect(scenario.choices.every((choice) => choice.feedback.length > 25)).toBe(true);

        if (scenario.calculation) {
          const required = Math.round((scenario.calculation.callAmountBb / scenario.calculation.finalPotBb) * 100);
          expect(scenario.calculation.requiredEquityPercent).toBe(required);
          expect(scenario.calculation.finalPotBb).toBeGreaterThan(scenario.calculation.callAmountBb);
        }
      }
    }
  });

  it('produces meaningfully varied cards and table states instead of cosmetic question order', () => {
    const snapshotsByFocus = new Map<string, Set<string>>();
    const sessionFingerprints = new Set<string>();

    for (let seed = 100; seed < 180; seed += 1) {
      const session = generateScenarioSession(seed, scenarioTemplateCount);
      sessionFingerprints.add(session.map((scenario) => [
        scenario.focus,
        scenario.effectiveStackBb,
        scenario.potBb,
        [...scenario.heroCards, ...scenario.board].map(cardKey).join(','),
      ].join(':')).join('|'));

      for (const scenario of session) {
        const snapshots = snapshotsByFocus.get(scenario.focus) ?? new Set<string>();
        snapshots.add([...scenario.heroCards, ...scenario.board].map(cardKey).join(','));
        snapshotsByFocus.set(scenario.focus, snapshots);
      }
    }

    expect(sessionFingerprints.size).toBeGreaterThan(70);
    for (const snapshots of snapshotsByFocus.values()) {
      expect(snapshots.size).toBeGreaterThan(8);
    }
  });

  it('awards full, partial, and zero credit without outcome bias', () => {
    expect(scenarioChoicePoints({ id: 'best', label: 'Best', grade: 'best', feedback: 'x' })).toBe(1);
    expect(scenarioChoicePoints({ id: 'mix', label: 'Mix', grade: 'reasonable', feedback: 'x' })).toBe(0.5);
    expect(scenarioChoicePoints({ id: 'error', label: 'Error', grade: 'mistake', feedback: 'x' })).toBe(0);
    expect(percentageScore(4.5, 6)).toBe(75);
  });
});
