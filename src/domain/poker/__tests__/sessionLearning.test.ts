import { describe, expect, it } from 'vitest';

import type { DecisionComparison, HandDecisionReport } from '../decisionGrading';
import { summarizeDecisionReports } from '../sessionLearning';
import type { CoachFocusArea, CoachHandGrade } from '../types';

function decision(
  sequence: number,
  grade: CoachHandGrade,
  focusArea: CoachFocusArea,
  relativeScoreGap = grade === 'mistake' ? 0.4 : grade === 'close' ? 0.15 : 0,
): DecisionComparison {
  return {
    alternative: null,
    baseline: { action: 'check', label: 'Check' },
    chosen: { action: 'check', label: 'Check' },
    detail: 'Deterministic test detail.',
    focusArea,
    grade,
    // Same action chosen and baseline, so it is the primary line, not a mixed leg.
    authoredMixedAction: false,
    relativeScoreGap,
    sequence,
    street: 'flop',
    summary: 'Deterministic test summary.',
  };
}

function report(...decisions: DecisionComparison[]): HandDecisionReport {
  return {
    decisions,
    focusArea: decisions[0]?.focusArea ?? 'none',
    focusDecisionSequence: decisions[0]?.sequence ?? 0,
    handGrade: decisions.some((item) => item.grade === 'mistake')
      ? 'mistake'
      : decisions.some((item) => item.grade === 'close') ? 'close' : 'strong',
    summary: 'Test report.',
  };
}

describe('session learning summary', () => {
  it('returns a safe empty state when saved hands have no compatible decisions', () => {
    expect(summarizeDecisionReports([
      { handId: 'legacy-1', report: report() },
    ])).toEqual({
      decisionsGraded: 0,
      focusDecisionSequence: null,
      focusHandId: null,
      grades: { strong: 0, close: 0, mistake: 0 },
      handsGraded: 0,
      repeatedWeakness: false,
      reviewSpots: 0,
      strongRate: null,
      strengths: [],
      topFocusArea: null,
      topFocusHandCount: 0,
      topFocusSpotCount: 0,
    });
  });

  it('counts decision grades and detects the same leak across separate hands', () => {
    const summary = summarizeDecisionReports([
      { handId: 'hand-1', report: report(
        decision(1, 'strong', 'preflop'),
        decision(2, 'close', 'bet-sizing'),
      ) },
      { handId: 'hand-2', report: report(
        decision(1, 'mistake', 'bet-sizing', 0.55),
        decision(2, 'strong', 'none'),
      ) },
    ]);

    expect(summary).toMatchObject({
      decisionsGraded: 4,
      focusDecisionSequence: 1,
      focusHandId: 'hand-2',
      grades: { strong: 2, close: 1, mistake: 1 },
      handsGraded: 2,
      repeatedWeakness: true,
      reviewSpots: 2,
      strongRate: 50,
      strengths: [{ area: 'preflop', handCount: 1, spotCount: 1 }],
      topFocusArea: 'bet-sizing',
      topFocusHandCount: 2,
      topFocusSpotCount: 2,
    });
  });

  it('does not call repeated spots from one unusual hand a session pattern', () => {
    const summary = summarizeDecisionReports([
      { handId: 'hand-1', report: report(
        decision(1, 'close', 'calling'),
        decision(2, 'mistake', 'calling'),
      ) },
    ]);

    expect(summary.topFocusArea).toBe('calling');
    expect(summary.topFocusSpotCount).toBe(2);
    expect(summary.topFocusHandCount).toBe(1);
    expect(summary.repeatedWeakness).toBe(false);
  });

  it('prioritizes a recurring close pattern over a one-off severe mistake', () => {
    const summary = summarizeDecisionReports([
      { handId: 'hand-1', report: report(
        decision(1, 'mistake', 'bluffing', 0.9),
        decision(2, 'close', 'pot-odds'),
      ) },
      { handId: 'hand-2', report: report(decision(1, 'close', 'pot-odds')) },
    ]);

    expect(summary.topFocusArea).toBe('pot-odds');
    expect(summary.repeatedWeakness).toBe(true);
  });

  it('does not turn strong decisions into recommended leaks', () => {
    const summary = summarizeDecisionReports([
      { handId: 'hand-1', report: report(
        decision(1, 'strong', 'preflop'),
        decision(2, 'strong', 'value-betting'),
      ) },
    ]);

    expect(summary.strongRate).toBe(100);
    expect(summary.reviewSpots).toBe(0);
    expect(summary.strengths).toEqual([
      { area: 'preflop', handCount: 1, spotCount: 1 },
      { area: 'value-betting', handCount: 1, spotCount: 1 },
    ]);
    expect(summary.topFocusArea).toBeNull();
  });

  it('ranks two observed strengths by repeated evidence and keeps the leak distinct', () => {
    const summary = summarizeDecisionReports([
      { handId: 'hand-1', report: report(
        decision(1, 'strong', 'preflop'),
        decision(2, 'strong', 'value-betting'),
        decision(3, 'close', 'calling'),
      ) },
      { handId: 'hand-2', report: report(
        decision(1, 'strong', 'preflop'),
        decision(2, 'strong', 'bet-sizing'),
        decision(3, 'mistake', 'calling'),
        decision(4, 'strong', 'calling'),
      ) },
    ]);

    expect(summary.topFocusArea).toBe('calling');
    expect(summary.strengths).toEqual([
      { area: 'preflop', handCount: 2, spotCount: 2 },
      { area: 'value-betting', handCount: 1, spotCount: 1 },
    ]);
  });
});
