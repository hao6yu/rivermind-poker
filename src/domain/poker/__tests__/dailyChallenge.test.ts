import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../multiway';
import { decideSessionAiAction, multiwayIdentityMap } from '../multiwaySession';
import type { PlayerAction } from '../types';
import { createSitAndGo, createSitAndGoCheckpoint, sitAndGoCompletion } from '../tournament';
import {
  createDailyChallenge,
  createDailyChallengeCheckpoint,
  createNextDailyChallengeHand,
  dailyChallengeDate,
  dailyChallengeDecisionRandom,
  dailyChallengeResult,
  dailyChallengeStreak,
  isDailyChallengeCheckpoint,
  resumeDailyChallenge,
} from '../dailyChallenge';

function finishHand(challengeDate: string, state: MultiwayHandState): MultiwayHandState {
  let current = state;
  for (let guard = 0; !current.outcome && guard < 180; guard += 1) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('Daily hand is missing an actor.');
    let action: PlayerAction;
    if (playerId === 'hero') {
      const legal = getMultiwayLegalActions(current, playerId);
      action = legal.canCheck ? { type: 'check' } : legal.canCall ? { type: 'call' } : { type: 'fold' };
    } else {
      action = decideSessionAiAction(
        current,
        playerId,
        'club',
        dailyChallengeDecisionRandom(challengeDate, current, playerId),
      ).action;
    }
    current = applyMultiwayAction(current, playerId, action);
  }
  if (!current.outcome) throw new Error('Daily hand did not finish.');
  return current;
}

function finishChallenge(challengeDate: string): MultiwayHandState {
  let current = createDailyChallenge(challengeDate);
  for (let guard = 0; guard < 120; guard += 1) {
    current = finishHand(challengeDate, current);
    if (sitAndGoCompletion(current)) return current;
    current = createNextDailyChallengeHand(challengeDate, current);
  }
  throw new Error('Daily Challenge did not finish.');
}

function openingHandEndsBeforeHeroDecision(challengeDate: string): boolean {
  let current = createDailyChallenge(challengeDate);
  for (let guard = 0; !current.outcome && current.toAct !== 'hero' && guard < 3; guard += 1) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('Daily opening hand is missing an actor.');
    const action = decideSessionAiAction(
      current,
      playerId,
      'club',
      dailyChallengeDecisionRandom(challengeDate, current, playerId),
    ).action;
    current = applyMultiwayAction(current, playerId, action);
  }
  return Boolean(current.outcome)
    && !current.history.some((action) => action.playerId === 'hero');
}

describe('Daily Challenge', () => {
  it('uses one reproducible table per UTC date and a different table the next day', () => {
    const first = createDailyChallenge('2026-08-01');
    const replay = createDailyChallenge('2026-08-01');
    const tomorrow = createDailyChallenge('2026-08-02');

    expect(replay).toEqual(first);
    expect(tomorrow.deck).not.toEqual(first.deck);
    expect(tomorrow.players.hero?.holeCards).not.toEqual(first.players.hero?.holeCards);
  });

  it('resumes the next deterministic hand from a public-only checkpoint', () => {
    const date = '2026-08-01';
    const completed = finishHand(date, createDailyChallenge(date));
    const checkpoint = createDailyChallengeCheckpoint(date, completed);
    const direct = createNextDailyChallengeHand(date, completed);
    const resumed = resumeDailyChallenge(checkpoint);

    expect(resumed).toEqual(direct);
    expect(JSON.stringify(checkpoint)).not.toMatch(/holeCards|deck|board|history|outcome/);
  });

  it('keeps the Daily event at three players when Sit & Go supports larger tables', () => {
    const sixPlayerHand = finishHand('2026-08-01', createSitAndGo(seededRandom(9_001), 6));
    const sixPlayerCheckpoint = createSitAndGoCheckpoint(sixPlayerHand, 'club');

    expect(isDailyChallengeCheckpoint({
      version: 2,
      challengeDate: '2026-08-01',
      tournament: sixPlayerCheckpoint,
    })).toBe(false);
  });

  it('starts every Daily with an immediate player decision', () => {
    const dates = Array.from({ length: 90 }, (_, day) => (
      new Date(Date.UTC(2026, 0, day + 1)).toISOString().slice(0, 10)
    ));
    const noDecisionOpeners = dates.filter(openingHandEndsBeforeHeroDecision).length;

    expect(noDecisionOpeners).toBe(0);
    expect(dates.every((date) => createDailyChallenge(date).toAct === 'hero')).toBe(true);
    expect(Object.keys(multiwayIdentityMap(createDailyChallenge(dates[0]!), 'club'))).toEqual([
      'ai-1',
      'ai-2',
    ]);
  }, 15_000);

  it('scores placement plainly and counts a current UTC streak', () => {
    const game = createDailyChallenge('2026-08-01');
    const completed = {
      ...game,
      players: {
        ...game.players,
        hero: { ...game.players.hero!, stack: 0 },
        'ai-1': { ...game.players['ai-1']!, stack: 0 },
      },
      outcome: {
        awards: [],
        showdown: false,
        totalPot: 0,
        winnerPlayerIds: ['ai-2'],
      },
    } satisfies MultiwayHandState;

    expect(dailyChallengeResult('2026-08-01', completed, '2026-08-01T12:00:00.000Z')).toMatchObject({
      challengeVersion: 2,
      place: 2,
      score: 70,
    });
    expect(dailyChallengeStreak(['2026-07-30', '2026-07-31', '2026-08-01'], '2026-08-01')).toBe(3);
    expect(dailyChallengeStreak(['2026-07-30', '2026-07-31'], '2026-08-01')).toBe(2);
    expect(dailyChallengeDate(new Date('2026-08-01T23:59:59.000-05:00'))).toBe('2026-08-02');
  });

  it('finishes the full event reproducibly and produces a scored result', () => {
    const first = finishChallenge('2026-08-01');
    const replay = finishChallenge('2026-08-01');

    expect(replay).toEqual(first);
    expect(sitAndGoCompletion(first)).not.toBeNull();
    expect(dailyChallengeResult('2026-08-01', first)).toMatchObject({
      challengeDate: '2026-08-01',
      challengeVersion: 2,
      score: expect.any(Number),
      handsPlayed: first.handNumber,
    });
  }, 15_000);
});
