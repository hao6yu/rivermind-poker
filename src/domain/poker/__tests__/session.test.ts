import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyAction, createHand, createNextHand } from '../engine';
import {
  QUICK_PLAY_SESSION_CONFIG,
  coachFocusLabel,
  practiceSessionOpeningButton,
  sessionCompletionReason,
  sessionHandTargetLabel,
  sessionStartingChips,
  summarizeCoachSession,
  summarizePracticeSession,
  type PracticeSessionConfig,
} from '../session';
import type { CoachReview, GameState } from '../types';

function review(overrides: Partial<CoachReview> = {}): CoachReview {
  return {
    summary: 'Summary',
    bestDecision: 'Call.',
    keyConcept: 'Pot odds.',
    practiceTip: 'Review the price.',
    confidence: 0.8,
    handGrade: 'close',
    focusDecisionSequence: 1,
    focusArea: 'pot-odds',
    ...overrides,
  };
}

describe('coach session summary', () => {
  it('counts grades and surfaces the most frequent learning focus', () => {
    const stats = summarizeCoachSession([
      review({ handGrade: 'mistake', focusArea: 'calling' }),
      review({ handGrade: 'strong', focusArea: 'calling' }),
      review({ handGrade: 'close', focusArea: 'bet-sizing' }),
    ]);
    expect(stats.reviewedHands).toBe(3);
    expect(stats.grades).toEqual({ strong: 1, close: 1, mistake: 1 });
    expect(stats.topFocusArea).toBe('calling');
    expect(coachFocusLabel(stats.topFocusArea ?? 'none')).toBe('Calling decisions');
  });

  it('ignores the no-leak label when selecting a session focus', () => {
    const stats = summarizeCoachSession([review({ handGrade: 'strong', focusArea: 'none' })]);
    expect(stats.topFocusArea).toBeNull();
  });
});

describe('practice session lifecycle', () => {
  const fiveHands: PracticeSessionConfig = { startingStackBb: 100, handTarget: 5 };

  it('converts labeled stack depth into exact engine chips', () => {
    expect(sessionStartingChips({ startingStackBb: 40, handTarget: 1 }, 20)).toBe(800);
    expect(sessionStartingChips(fiveHands, 20)).toBe(2_000);
    expect(sessionStartingChips({ startingStackBb: 200, handTarget: 'open' }, 20)).toBe(4_000);
  });

  it('uses a fair two-hand Quick Play orbit and survives an opening AI walk', () => {
    let first = createHand({ button: 'villain', random: seededRandom(4_201) });
    expect(first.toAct).toBe('villain');
    first = applyAction(first, 'villain', { type: 'fold' });

    expect(QUICK_PLAY_SESSION_CONFIG.handTarget).toBe(2);
    expect(sessionCompletionReason(first, QUICK_PLAY_SESSION_CONFIG)).toBeNull();

    const second = createNextHand(first, seededRandom(4_202));
    expect(second.button).toBe('hero');
    expect(second.toAct).toBe('hero');
  });

  it('opens Quick Play with player agency while custom sessions keep a random button', () => {
    expect(practiceSessionOpeningButton(QUICK_PLAY_SESSION_CONFIG, () => 0.99)).toBe('hero');
    expect(practiceSessionOpeningButton(fiveHands, () => 0.1)).toBe('hero');
    expect(practiceSessionOpeningButton(fiveHands, () => 0.9)).toBe('villain');
  });

  it('reloads the configured stack and deals the opposite button after a Quick Play hand-one bust', () => {
    const startingChips = sessionStartingChips(QUICK_PLAY_SESSION_CONFIG, 20);
    let first = createHand({
      bigBlind: 20,
      button: 'hero',
      heroStack: startingChips,
      random: seededRandom(4_203),
      villainStack: startingChips,
    });
    first = applyAction(first, 'hero', { type: 'raise', amount: startingChips });
    first = applyAction(first, 'villain', { type: 'call' });

    expect(first.outcome).toBeDefined();
    expect(
      first.players.hero.stack < first.bigBlind
      || first.players.villain.stack < first.bigBlind,
    ).toBe(true);
    expect(sessionCompletionReason(first, QUICK_PLAY_SESSION_CONFIG)).toBeNull();

    const second = createNextHand(first, seededRandom(4_204), startingChips);
    expect(second.handNumber).toBe(2);
    expect(second.button).toBe('villain');
    expect(second.players.hero.stack + second.players.hero.totalCommitted).toBe(startingChips);
    expect(second.players.villain.stack + second.players.villain.totalCommitted).toBe(startingChips);
  });

  it('formats finite and open-ended hand targets', () => {
    expect(sessionHandTargetLabel(1)).toBe('1 hand');
    expect(sessionHandTargetLabel(10)).toBe('10 hands');
    expect(sessionHandTargetLabel('open')).toBe('Open-ended');
  });

  it('ends at the configured hand target', () => {
    let game = createHand({ handNumber: 5, random: seededRandom(44) });
    game = applyAction(game, 'hero', { type: 'fold' });
    expect(sessionCompletionReason(game, fiveHands)).toBe('target');
  });

  it('ends an open session when a player cannot post a big blind', () => {
    let game = createHand({ heroStack: 20, villainStack: 1_980, random: seededRandom(45) });
    game = applyAction(game, 'hero', { type: 'fold' });
    expect(sessionCompletionReason(game, { startingStackBb: 100, handTarget: 'open' })).toBe('hero_bust');
  });

  it('summarizes results, actual net chips, and coaching focus', () => {
    const games = [
      {
        outcome: { winner: 'hero' },
        players: { hero: { stack: 2_100 } },
      },
      {
        outcome: { winner: 'villain' },
        players: { hero: { stack: 1_940 } },
      },
      {
        outcome: { winner: 'tie' },
        players: { hero: { stack: 1_940 } },
      },
    ] as GameState[];
    const summary = summarizePracticeSession(
      games,
      [review({ focusArea: 'bet-sizing' }), review({ focusArea: 'bet-sizing' })],
      fiveHands,
      20,
    );

    expect(summary).toEqual({
      handsPlayed: 3,
      heroWins: 1,
      villainWins: 1,
      ties: 1,
      reviewedHands: 2,
      netBb: -3,
      topFocusArea: 'bet-sizing',
    });
  });
});
