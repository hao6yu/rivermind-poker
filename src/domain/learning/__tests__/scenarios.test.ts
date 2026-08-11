import { describe, expect, it } from 'vitest';

import { cardKey } from '../../poker/cards';
import { percentageScore } from '../progress';
import {
  buildScenarioSessionRecap,
  focusedScenarioSessionSize,
  generateFocusedScenarioSession,
  generateScenarioSession,
  generateScenarioSessionForPack,
  scenarioChoicePoints,
  scenarioFamilyId,
  scenarioSessionSize,
  scenarioTemplateCount,
  scenarioTemplateCountForPack,
  scenarioTrainer,
  selectFreshestScenarioSession,
} from '../scenarios';
import type { PracticePackId } from '../types';

describe('scenario training', () => {
  it('builds a concise session from a larger decision-template catalog', () => {
    expect(scenarioTemplateCount).toBe(53);
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
      'Facing a three-bet',
      'Early-position discipline',
      'Thin value sizing',
      'Semi-bluff sizing',
      'Straight-draw price',
      'Overpriced draws',
      'Cutoff opening',
      'Button opening',
      'Small-blind opening',
      'Pair opening',
      'Multiple limpers',
      'Selective over-limping',
      'Short-stack opening',
      'Calling in position',
      'Avoiding domination',
      'Set-mining conditions',
      'Blocker re-raise',
      'Value squeezing',
      'Facing a four-bet',
      'Short-stack re-raise',
      'Playable blind defense',
      'Value three-bet versus a late open',
      'Blocker three-bet',
      'Out-of-position three-bet sizing',
      'Calling a three-bet in position',
      'Folding dominated hands to a three-bet',
      'Four-betting for value',
      'Releasing a three-bet bluff',
      'Short-stack three-bet commitment',
      'Dry three-bet-pot range bet',
      'Connected three-bet-pot restraint',
      'Nut-advantage sizing',
      'Multiway range discipline',
      'Equity-driven turn barrel',
      'Turn card favors the caller',
      'Brick-turn value barrel',
      'No-equity turn give-up',
      'Thin river value',
      'Polarized river value',
      'Showdown-value river check',
      'Blocker-led river bluff',
      'Bad river bluff candidate',
      'Bluff catch at a fair price',
      'Fold bluff catcher to an overbet',
      'River raise discipline',
    ]));
  });

  it('builds five-spot sessions containing only the requested practice pack', () => {
    const focusByPack: Record<PracticePackId, string[]> = {
      preflop: ['preflop'],
      'preflop-enter': [],
      'preflop-pressure': [],
      'preflop-three-bet': [],
      betting: ['value-betting', 'bluffing', 'bet-sizing'],
      odds: ['calling', 'pot-odds', 'draws'],
      'postflop-range': [],
      'postflop-river': [],
    };
    const expectedTemplateCounts: Record<PracticePackId, number> = {
      preflop: 20,
      'preflop-enter': 10,
      'preflop-pressure': 10,
      'preflop-three-bet': 8,
      betting: 5,
      odds: 5,
      'postflop-range': 8,
      'postflop-river': 8,
    };

    expect(focusedScenarioSessionSize).toBe(5);
    for (const [packId, focuses] of Object.entries(focusByPack) as Array<[PracticePackId, string[]]>) {
      expect(scenarioTemplateCountForPack(packId)).toBe(expectedTemplateCounts[packId]);
      const packSession = generateScenarioSessionForPack(packId, 12_345);
      expect(packSession).toHaveLength(focusedScenarioSessionSize);
      expect(packSession.every((scenario) => scenario.practicePacks.includes(packId))).toBe(true);
      expect(new Set(packSession.map((scenario) => scenario.focus)).size).toBe(packSession.length);
      for (const focus of focuses) {
        const session = generateFocusedScenarioSession(focus, 12_345);
        expect(session).toHaveLength(focusedScenarioSessionSize);
        expect(session.every((scenario) => scenario.practicePacks.includes(packId))).toBe(true);
        expect(new Set(session.map((scenario) => scenario.focus)).size).toBe(session.length);
      }
    }
  });

  it('keeps the intermediate three-bet pack explicit and diagnostically useful', () => {
    const scenarios = generateScenarioSessionForPack('preflop-three-bet', 9_911, 8);

    expect(scenarios).toHaveLength(8);
    expect(new Set(scenarios.map((scenario) => scenario.focus)).size).toBe(8);
    expect(scenarios.every((scenario) => scenario.difficulty === 'intermediate')).toBe(true);
    expect(scenarios.flatMap((scenario) => scenario.choices)
      .filter((choice) => choice.grade === 'mistake')
      .every((choice) => choice.mistakeCategory !== undefined)).toBe(true);
  });

  it('keeps intermediate range and turn work inside its dedicated practice pack', () => {
    const scenarios = generateScenarioSessionForPack('postflop-range', 7_722, 8);

    expect(scenarios).toHaveLength(8);
    expect(new Set(scenarios.map((scenario) => scenario.focus)).size).toBe(8);
    expect(scenarios.every((scenario) => scenario.difficulty === 'intermediate')).toBe(true);
    expect(scenarios.every((scenario) => scenario.street === 'flop' || scenario.street === 'turn')).toBe(true);
    expect(scenarios.flatMap((scenario) => scenario.choices)
      .filter((choice) => choice.grade === 'mistake')
      .every((choice) => choice.mistakeCategory !== undefined)).toBe(true);
  });

  it('keeps intermediate river decisions explicit, linked, and mathematically checked', () => {
    const scenarios = generateScenarioSessionForPack('postflop-river', 6_622, 8);

    expect(scenarios).toHaveLength(8);
    expect(new Set(scenarios.map((scenario) => scenario.focus)).size).toBe(8);
    expect(scenarios.every((scenario) => scenario.difficulty === 'intermediate')).toBe(true);
    expect(scenarios.every((scenario) => scenario.street === 'river')).toBe(true);
    expect(scenarios.every((scenario) => scenario.lessonId?.startsWith('lesson-postflop-river-'))).toBe(true);
    expect(scenarios.flatMap((scenario) => scenario.choices)
      .filter((choice) => choice.grade === 'mistake')
      .every((choice) => choice.mistakeCategory !== undefined)).toBe(true);
    expect(scenarios.filter((scenario) => scenario.calculation)).toHaveLength(2);
  });

  it('selects the replay candidate with the fewest recently seen scenario families', () => {
    const previous = generateScenarioSessionForPack('postflop-range', 1_001);
    const candidates = [1_002, 1_003, 1_004, 1_005]
      .map((seed) => generateScenarioSessionForPack('postflop-range', seed));
    const recentFamilies = new Set(previous.map((scenario) => scenarioFamilyId(scenario.id)));
    const overlap = (session: typeof previous) => session
      .filter((scenario) => recentFamilies.has(scenarioFamilyId(scenario.id))).length;

    const selected = selectFreshestScenarioSession(candidates, previous);
    expect(overlap(selected)).toBe(Math.min(...candidates.map(overlap)));
  });

  it('keeps focused replays fresh without exposing opponent cards or deck state', () => {
    for (const focus of ['preflop', 'value-betting', 'pot-odds']) {
      const fingerprints = new Set<string>();
      for (let seed = 1; seed <= 30; seed += 1) {
        const session = generateFocusedScenarioSession(focus, seed);
        fingerprints.add(session.map((scenario) => [
          scenario.focus,
          scenario.effectiveStackBb,
          scenario.potBb,
          [...scenario.heroCards, ...scenario.board].map(cardKey).join(','),
        ].join(':')).join('|'));
        for (const scenario of session) {
          expect(scenario).not.toHaveProperty('opponentCards');
          expect(scenario).not.toHaveProperty('deck');
        }
      }
      expect(fingerprints.size).toBeGreaterThan(25);
    }
  });

  it('defines valid cards, streets, choices, and recalculated call prices across 100 sessions', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const session = generateScenarioSession(seed);
      expect(session).toHaveLength(scenarioSessionSize);
      expect(new Set(session.map((scenario) => scenario.focus)).size).toBe(session.length);
      expect(session.filter((scenario) => scenario.street === 'preflop')).toHaveLength(3);
      expect(session.filter((scenario) => scenario.street !== 'preflop')).toHaveLength(3);

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

  it('builds a deterministic recap from observed strengths and the weakest decision', () => {
    expect(buildScenarioSessionRecap([
      { focus: 'Thin value', grade: 'best', lessonId: 'lesson-value' },
      { focus: 'Bluff selection', grade: 'reasonable', lessonId: 'lesson-bluff' },
      { focus: 'Call price', grade: 'mistake', lessonId: 'lesson-price' },
      { focus: 'Polarized sizing', grade: 'best', lessonId: 'lesson-size' },
      { focus: 'Raise discipline', grade: 'reasonable', lessonId: 'lesson-raise' },
    ])).toEqual({
      focus: { label: 'Call price', lessonId: 'lesson-price' },
      strengths: ['Thin value', 'Polarized sizing'],
    });
    expect(buildScenarioSessionRecap([])).toEqual({ focus: null, strengths: [] });
  });
});
