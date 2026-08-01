import { describe, expect, it } from 'vitest';

import { cardKey } from '../../poker/cards';
import { percentageScore } from '../progress';
import { scenarioChoicePoints, scenarioTrainer } from '../scenarios';

describe('scenario training', () => {
  it('covers the Phase 1 decision categories with a concise session', () => {
    expect(scenarioTrainer.scenarios).toHaveLength(6);
    expect(new Set(scenarioTrainer.scenarios.map((scenario) => scenario.focus))).toEqual(new Set([
      'Preflop value',
      'Blind defense',
      'Draws and pot odds',
      'Value betting',
      'Bluff catching',
      'Bluff selection',
    ]));
  });

  it('defines valid card snapshots and one preferred action per scenario', () => {
    for (const scenario of scenarioTrainer.scenarios) {
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
    }
  });

  it('shows the correct heads-up seats in the blind-defense spot', () => {
    const defense = scenarioTrainer.scenarios.find((scenario) => scenario.id === 'large-open-trash-defense');
    expect(defense).toMatchObject({
      position: 'Big blind',
      opponentPosition: 'Button · Small blind',
    });
  });

  it('awards full, partial, and zero credit without outcome bias', () => {
    expect(scenarioChoicePoints({ id: 'best', label: 'Best', grade: 'best', feedback: 'x' })).toBe(1);
    expect(scenarioChoicePoints({ id: 'mix', label: 'Mix', grade: 'reasonable', feedback: 'x' })).toBe(0.5);
    expect(scenarioChoicePoints({ id: 'error', label: 'Error', grade: 'mistake', feedback: 'x' })).toBe(0);
    expect(percentageScore(4.5, 6)).toBe(75);
  });
});
