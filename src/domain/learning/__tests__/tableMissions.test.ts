import { describe, expect, it } from 'vitest';

import type { DecisionComparison, HandDecisionReport } from '../../poker/decisionGrading';
import type { PostflopInitiative } from '../../poker/postflopStrategy';
import {
  opponentTableMissions,
  postflopTableMissions,
  preflopTableMissions,
  scoreTableMission,
  tableMissions,
  tournamentTableMissions,
} from '../tableMissions';

function decision(
  street: DecisionComparison['street'],
  grade: DecisionComparison['grade'],
  initiative?: PostflopInitiative,
): DecisionComparison {
  return {
    alternative: null,
    baseline: { action: 'fold', label: 'Fold' },
    chosen: { action: 'fold', label: 'Fold' },
    detail: 'A complete decision explanation for mission scoring.',
    focusArea: street === 'preflop' ? 'preflop' : 'value-betting',
    grade,
    // Chosen and baseline share the family here, so the action is the primary,
    // not an authored mixed leg.
    authoredMixedAction: false,
    initiative,
    relativeScoreGap: grade === 'strong' ? 0 : grade === 'close' ? 0.2 : 0.6,
    sequence: 1,
    street,
    summary: 'Decision summary',
  };
}

function report(...decisions: DecisionComparison[]): HandDecisionReport {
  return {
    decisions,
    focusArea: decisions[0]?.focusArea ?? 'none',
    focusDecisionSequence: decisions[0]?.sequence ?? 0,
    handGrade: decisions.some((item) => item.grade === 'mistake') ? 'mistake' : 'strong',
    summary: 'Hand summary',
  };
}

describe('learning table missions', () => {
  it('defines focused missions across the complete applied curriculum', () => {
    expect(tableMissions.map((mission) => mission.id)).toEqual([
      'mission-preflop-enter-pot',
      'mission-preflop-pressure',
      'mission-postflop-cbet',
      'mission-postflop-river',
      'mission-tournament-bubble',
      'mission-opponent-adjustments',
    ]);
    expect(preflopTableMissions).toHaveLength(2);
    expect(postflopTableMissions).toHaveLength(2);
    expect(tournamentTableMissions).toHaveLength(1);
    expect(opponentTableMissions).toHaveLength(1);
    for (const mission of tableMissions) {
      expect(mission.masteryThreshold).toBe(70);
      expect(mission.prerequisiteIds).toHaveLength(2);
    }
    expect(tournamentTableMissions[0]).toMatchObject({
      playerCount: 3,
      tournamentContext: { enabled: true, qualifyingPlace: 2 },
    });
    expect(opponentTableMissions[0]?.playerCount).toBe(6);
    expect(preflopTableMissions.every((mission) => mission.sessionConfig.handTarget === 5)).toBe(true);
    expect(postflopTableMissions.every((mission) => mission.sessionConfig.handTarget === 10)).toBe(true);
  });

  it('scores only preflop decisions and gives close choices partial credit', () => {
    const mission = tableMissions[0]!;
    const reports = [
      report(decision('preflop', 'strong'), decision('flop', 'mistake')),
      report(decision('preflop', 'strong'), decision('turn', 'mistake')),
      report(decision('preflop', 'close'), decision('river', 'mistake')),
      report(decision('preflop', 'mistake')),
      report(decision('preflop', 'strong')),
    ];
    const result = scoreTableMission(mission, reports);
    expect(result).toMatchObject({
      completed: true,
      decisionsGraded: 5,
      grades: { strong: 3, close: 1, mistake: 1 },
      passed: true,
      score: 70,
    });
  });

  it('does not mark an interrupted run complete', () => {
    const result = scoreTableMission(tableMissions[1]!, [
      report(decision('preflop', 'strong')),
      report(decision('preflop', 'strong')),
      report(decision('preflop', 'strong')),
      report(decision('preflop', 'strong')),
    ]);
    expect(result.completed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('grades only flop decisions where the learner retained betting initiative', () => {
    const mission = postflopTableMissions[0]!;
    const reports = [
      report(
        decision('preflop', 'mistake'),
        decision('flop', 'strong', 'player'),
        decision('flop', 'mistake', 'opponent'),
        decision('river', 'mistake', 'player'),
      ),
      report(decision('flop', 'close', 'player')),
      ...Array.from({ length: 8 }, () => report()),
    ];
    expect(scoreTableMission(mission, reports)).toMatchObject({
      completed: true,
      decisionsGraded: 2,
      grades: { strong: 1, close: 1, mistake: 0 },
      passed: true,
      score: 75,
    });
  });

  it('grades river decisions without letting earlier streets affect the score', () => {
    const mission = postflopTableMissions[1]!;
    const reports = [
      report(decision('flop', 'mistake', 'player'), decision('river', 'strong', 'opponent')),
      report(decision('turn', 'mistake', 'player'), decision('river', 'close', 'player')),
      ...Array.from({ length: 8 }, () => report()),
    ];
    expect(scoreTableMission(mission, reports)).toMatchObject({
      completed: true,
      decisionsGraded: 2,
      grades: { strong: 1, close: 1, mistake: 0 },
      passed: true,
      score: 75,
    });
  });

  it('requires enough eligible postflop decisions before passing', () => {
    const reports = [
      report(decision('river', 'strong', 'player')),
      ...Array.from({ length: 9 }, () => report()),
    ];
    const result = scoreTableMission(postflopTableMissions[1]!, reports);
    expect(result).toMatchObject({ completed: true, decisionsGraded: 1, passed: false, score: 100 });
  });

  it('grades only value, bluff, and calling decisions in the opponent mission', () => {
    const valueDecision = { ...decision('river', 'strong'), focusArea: 'value-betting' as const };
    const bluffDecision = { ...decision('turn', 'close'), focusArea: 'bluffing' as const };
    const excludedOddsDecision = { ...decision('flop', 'mistake'), focusArea: 'pot-odds' as const };
    const reports = [
      report(valueDecision, excludedOddsDecision),
      report(bluffDecision),
      ...Array.from({ length: 8 }, () => report()),
    ];

    expect(scoreTableMission(opponentTableMissions[0]!, reports)).toMatchObject({
      completed: true,
      decisionsGraded: 2,
      grades: { strong: 1, close: 1, mistake: 0 },
      passed: true,
      score: 75,
    });
  });
});
