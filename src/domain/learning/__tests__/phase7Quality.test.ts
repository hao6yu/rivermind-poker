import { describe, expect, it } from 'vitest';

import {
  advancedMathCheatSheet,
  advancedMathLessons,
  opponentReadLessons,
  tournamentBubbleLessons,
} from '../content';
import {
  advancedMathScenarioFactories,
  opponentAdjustmentScenarioFactories,
  tournamentBubbleScenarioFactories,
} from '../phase7Scenarios';

const random = () => 0.24;

describe('Phase 7 content quality', () => {
  it('gives every concept a complete teachable lesson sequence', () => {
    const lessonGroups = [tournamentBubbleLessons, opponentReadLessons, advancedMathLessons];
    expect(lessonGroups.every((group) => group.length === 3)).toBe(true);

    for (const lesson of lessonGroups.flat()) {
      expect(lesson.difficulty).toBe('intermediate');
      expect(lesson.estimatedMinutes).toBeGreaterThanOrEqual(5);
      expect(lesson.description.length).toBeGreaterThan(35);
      expect(lesson.sections).toHaveLength(3);
      expect(lesson.sections.filter((section) => section.takeaway).length).toBeGreaterThanOrEqual(2);
      for (const section of lesson.sections) {
        expect(section.heading.length).toBeGreaterThan(18);
        expect(section.body.length).toBeGreaterThan(120);
      }
    }
  });

  it('keeps the quick reference decision-oriented and explicit about assumptions', () => {
    expect(advancedMathCheatSheet.groups).toHaveLength(2);
    expect(advancedMathCheatSheet.groups.every((group) => group.rows.length === 3)).toBe(true);
    expect(advancedMathCheatSheet.note).toMatch(/zero equity|future action/i);
  });

  it('names every table style while keeping adjustments evidence-led', () => {
    const opponentCopy = JSON.stringify(opponentReadLessons).toLowerCase();
    for (const style of ['patient', 'balanced', 'sticky', 'pressure', 'deceptive']) {
      expect(opponentCopy).toContain(style);
    }
    expect(opponentCopy).toMatch(/sample|evidence/);
  });

  it('connects each lesson family to six complete practice decisions', () => {
    const families = [
      tournamentBubbleScenarioFactories,
      opponentAdjustmentScenarioFactories,
      advancedMathScenarioFactories,
    ];
    expect(families.every((family) => family.length === 6)).toBe(true);

    for (const scenario of families.flat().map((factory, index) => factory(random, index))) {
      expect(scenario.difficulty).toBe('intermediate');
      expect(scenario.lessonId).toMatch(/^lesson-/);
      expect(scenario.practicePacks).toHaveLength(1);
      expect(scenario.prompt.length).toBeGreaterThan(35);
      expect(scenario.reasoning.length).toBeGreaterThan(110);
      expect(scenario.takeaway.length).toBeGreaterThan(45);
      expect(new Set(scenario.choices.map((choice) => choice.id)).size).toBe(scenario.choices.length);
      expect(scenario.choices.some((choice) => choice.id === scenario.bestChoiceId)).toBe(true);
      expect(scenario.choices.some((choice) => choice.grade === 'best')).toBe(true);
    }
  });

  it('states tournament and opponent evidence instead of hiding key assumptions', () => {
    const bubble = tournamentBubbleScenarioFactories.map((factory, index) => factory(random, index));
    expect(bubble.every((scenario) => /Two places advance/i.test(scenario.opponentAction))).toBe(true);
    expect(bubble.every((scenario) => scenario.position.includes('three players'))).toBe(true);
    expect(bubble.every((scenario) => scenario.effectiveStackBb > 0)).toBe(true);

    const opponents = opponentAdjustmentScenarioFactories.map((factory, index) => factory(random, index));
    expect(opponents.every((scenario) => /\b(two|1[4-8]|20)\b/i.test(scenario.opponentAction))).toBe(true);
    expect(opponents[0]?.opponentAction).toMatch(/only two observed hands/i);
    expect(opponents[0]?.bestChoiceId).toBe('check');
  });

  it('keeps displayed decision math internally consistent', () => {
    const scenarios = advancedMathScenarioFactories.map((factory, index) => factory(random, index));
    for (const scenario of scenarios) {
      const calculation = scenario.calculation;
      if (!calculation) continue;
      if (calculation.kind === 'bluff') {
        expect(calculation.requiredFoldPercent).toBe(Math.round(
          (calculation.riskBb / (calculation.riskBb + calculation.rewardBb)) * 100,
        ));
      } else if (calculation.kind === 'implied-odds') {
        expect(calculation.directRequiredEquityPercent).toBe(Math.round(
          (calculation.callAmountBb / calculation.finalPotBb) * 100,
        ));
        expect(calculation.minimumFutureWinBb).toBeGreaterThan(calculation.callAmountBb);
      } else {
        expect(calculation.requiredEquityPercent).toBe(Math.round(
          (calculation.callAmountBb / calculation.finalPotBb) * 100,
        ));
      }
    }
  });
});
