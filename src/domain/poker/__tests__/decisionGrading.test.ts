import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { gradeHeadsUpHand, gradeMultiwayHand } from '../decisionGrading';
import { summarizeDecisionReports } from '../sessionLearning';
import { applyAction, createHand, getLegalActions } from '../engine';
import {
  applyMultiwayAction,
  createMultiwayHand,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type TablePlayerConfig,
} from '../multiway';
import type { Card, GameState, PlayerAction } from '../types';

const aces: [Card, Card] = [
  { rank: 14, suit: 'spades' },
  { rank: 14, suit: 'hearts' },
];

const changedOpponentCards: [Card, Card] = [
  { rank: 2, suit: 'clubs' },
  { rank: 7, suit: 'diamonds' },
];

function headsUpWithHeroCards(randomSeed: number): GameState {
  const game = createHand({ button: 'hero', random: seededRandom(randomSeed) });
  return {
    ...game,
    players: {
      ...game.players,
      hero: { ...game.players.hero, holeCards: aces },
    },
  };
}

function players(count: number): TablePlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? 'hero' : `ai-${index}`,
    isHero: index === 0,
    name: index === 0 ? 'You' : `AI ${index}`,
    seat: index,
    stack: 2_000,
  }));
}

function variedAction(
  legal: ReturnType<typeof getLegalActions>,
  roll: number,
): PlayerAction {
  if (legal.canCheck) {
    return legal.canRaise && roll < 0.22
      ? { type: 'raise', amount: legal.suggestedRaiseTo }
      : { type: 'check' };
  }
  if (legal.canFold && roll < 0.13) return { type: 'fold' };
  if (legal.canRaise && roll < 0.31) return { type: 'raise', amount: legal.suggestedRaiseTo };
  return { type: 'call' };
}

function finishVariedHeadsUp(seed: number): GameState {
  const random = seededRandom(seed);
  let game = createHand({ button: random() < 0.5 ? 'hero' : 'villain', random });
  for (let actionCount = 0; !game.outcome && actionCount < 80; actionCount += 1) {
    const playerId = game.toAct;
    if (!playerId) throw new Error('Varied heads-up hand lost the current actor.');
    game = applyAction(game, playerId, variedAction(getLegalActions(game, playerId), random()));
  }
  return game;
}

function finishVariedMultiway(seed: number, playerCount: number): MultiwayHandState {
  const random = seededRandom(seed);
  let game = createMultiwayHand({ buttonSeat: seed % playerCount, players: players(playerCount), random });
  for (let actionCount = 0; !game.outcome && actionCount < 180; actionCount += 1) {
    const playerId = game.toAct;
    if (!playerId) throw new Error('Varied multiway hand lost the current actor.');
    game = applyMultiwayAction(game, playerId, variedAction(getMultiwayLegalActions(game, playerId), random()));
  }
  return game;
}

describe('decision grading', () => {
  it('grades a standard premium opening as a strong baseline match', () => {
    let game = headsUpWithHeroCards(9_101);
    game = applyAction(game, 'hero', { type: 'raise', amount: 50 });

    const report = gradeHeadsUpHand(game);

    expect(report.decisions).toHaveLength(1);
    expect(report.decisions[0]).toMatchObject({
      grade: 'strong',
      sequence: 1,
      street: 'preflop',
      chosen: { action: 'raise', amountChips: 50, label: 'Raise to 50' },
      baseline: { action: 'raise', amountChips: 46, label: 'Raise to 46' },
    });
    expect(report.handGrade).toBe('strong');
  });

  it('identifies folding a premium unopened hand as the focus decision', () => {
    const game = applyAction(headsUpWithHeroCards(9_102), 'hero', { type: 'fold' });

    const report = gradeHeadsUpHand(game);

    expect(report.handGrade).toBe('mistake');
    expect(report.focusDecisionSequence).toBe(1);
    expect(report.focusArea).toBe('preflop');
    expect(report.decisions[0]?.summary).toContain('baseline prefers Raise');
  });

  it('grades a deliberate low-frequency leg as close, not a mistake', () => {
    // The tables author K9o in the big blind as a 2% three-bet / 70% call
    // defense. Taking the 2% leg is an action the model itself plays, so a
    // player following the chart must not be told it was a mistake purely
    // because the leg is rare.
    const base = createHand({ button: 'villain', random: seededRandom(9_104) });
    let game: GameState = {
      ...base,
      players: {
        ...base.players,
        hero: {
          ...base.players.hero,
          holeCards: [{ rank: 13, suit: 'spades' }, { rank: 9, suit: 'hearts' }],
        },
      },
    };
    game = applyAction(game, 'villain', { type: 'raise', amount: 50 });
    game = applyAction(game, 'hero', { type: 'raise', amount: 150 });

    const report = gradeHeadsUpHand(game);

    const raiseDecision = report.decisions.find((decision) => (
      decision.street === 'preflop' && decision.chosen.action === 'raise'
    ));
    expect(raiseDecision?.baseline.action).toBe('call');
    expect(raiseDecision?.grade).toBe('close');
  });

  it('still grades folding a hand the tables never fold as a mistake', () => {
    // The guard against over-correcting: residual fold mass is not an authored
    // leg, so folding aces stays a mistake even though its 3% frequency is
    // higher than the authored 2% three-bet leg above.
    const game = applyAction(headsUpWithHeroCards(9_105), 'hero', { type: 'fold' });

    expect(gradeHeadsUpHand(game).decisions[0]?.grade).toBe('mistake');
  });

  it('does not punish folding to a 3-bet the re-raise range mostly folds', () => {
    // Hero opens AQo on the button, villain 3-bets to 9 BB, hero folds. The
    // designed vs-3-bet range folds AQo ~72%, so the baseline must be Fold —
    // without the raise count the grader prices the spot from the cold-defense
    // table (where AQo never folds) and calls the fold a mistake.
    const base = createHand({ button: 'hero', random: seededRandom(9_103) });
    let game: GameState = {
      ...base,
      players: {
        ...base.players,
        hero: {
          ...base.players.hero,
          holeCards: [
            { rank: 14, suit: 'spades' },
            { rank: 12, suit: 'hearts' },
          ],
        },
      },
    };
    game = applyAction(game, 'hero', { type: 'raise', amount: 50 });
    game = applyAction(game, 'villain', { type: 'raise', amount: 180 });
    game = applyAction(game, 'hero', { type: 'fold' });

    const report = gradeHeadsUpHand(game);

    const foldDecision = report.decisions.find((decision) => (
      decision.street === 'preflop' && decision.chosen.action === 'fold'
    ));
    expect(foldDecision?.baseline.action).toBe('fold');
    expect(foldDecision?.grade).not.toBe('mistake');
  });

  it('is deterministic and never changes when revealed opponent cards change', () => {
    let game = headsUpWithHeroCards(9_103);
    game = applyAction(game, 'hero', { type: 'call' });
    game = applyAction(game, 'villain', { type: 'check' });
    game = applyAction(game, 'villain', { type: 'check' });
    game = applyAction(game, 'hero', { type: 'check' });
    const changed: GameState = {
      ...game,
      players: {
        ...game.players,
        villain: { ...game.players.villain, holeCards: changedOpponentCards },
      },
    };

    expect(gradeHeadsUpHand(game)).toEqual(gradeHeadsUpHand(game));
    expect(gradeHeadsUpHand(changed)).toEqual(gradeHeadsUpHand(game));
  });

  it('records a public-only context for every new multiway action', () => {
    const initial = createMultiwayHand({
      buttonSeat: 0,
      players: players(3),
      random: seededRandom(9_104),
    });
    const next = applyMultiwayAction(initial, 'hero', { type: 'raise', amount: 50 });
    const context = next.history[0]?.decisionContext;

    expect(context).toMatchObject({
      board: [],
      currentBet: 20,
      opponentCount: 2,
      playerCount: 3,
      position: 'BTN',
      preflopFacing: 'unopened',
    });
    expect(context && 'holeCards' in context).toBe(false);
    expect(context && 'deck' in context).toBe(false);
  });

  it('reuses the exact live range equity in the final multiway grade', () => {
    let game = createMultiwayHand({
      buttonSeat: 0,
      players: players(3),
      random: seededRandom(9_104_1),
    });
    game = applyMultiwayAction(game, 'hero', { type: 'call' });
    game = applyMultiwayAction(game, 'ai-1', { type: 'call' });
    game = applyMultiwayAction(game, 'ai-2', { type: 'check' });
    game = applyMultiwayAction(game, 'ai-1', { type: 'check' });
    game = applyMultiwayAction(game, 'ai-2', { type: 'check' });
    game = applyMultiwayAction(game, 'hero', { type: 'check' }, { estimatedEquity: 0.47 });

    const flop = gradeMultiwayHand(game).decisions.find((decision) => decision.street === 'flop');
    expect(flop?.detail).toContain('Estimated equity 47%');
    expect(flop?.initiative).toBe(game.history.at(-1)?.decisionContext?.initiative);
    expect(game.history.at(-1)?.decisionContext?.estimatedEquity).toBe(0.47);
  });

  it('keeps the final review aligned with the beginner coach below the direct call price', () => {
    let game = createMultiwayHand({
      buttonSeat: 0,
      players: players(3),
      random: seededRandom(9_104_2),
    });
    game = applyMultiwayAction(game, 'hero', { type: 'call' });
    game = applyMultiwayAction(game, 'ai-1', { type: 'call' });
    game = applyMultiwayAction(game, 'ai-2', { type: 'check' });
    game = applyMultiwayAction(game, 'ai-1', { type: 'raise', amount: 20 });
    game = applyMultiwayAction(game, 'ai-2', { type: 'fold' });
    game = applyMultiwayAction(game, 'hero', { type: 'call' }, { estimatedEquity: 0.18 });

    const flop = gradeMultiwayHand(game).decisions.find((decision) => decision.street === 'flop');
    expect(flop).toMatchObject({
      baseline: { action: 'fold' },
      chosen: { action: 'call' },
    });
    expect(flop?.detail).toContain('Estimated equity 18% versus a 20% call price');
  });

  it('grades multiway decisions without reading any opponent hole cards', () => {
    const initial = createMultiwayHand({
      buttonSeat: 0,
      players: players(3),
      random: seededRandom(9_105),
    });
    const withAces = {
      ...initial,
      players: {
        ...initial.players,
        hero: { ...initial.players.hero!, holeCards: aces },
      },
    };
    const game = applyMultiwayAction(withAces, 'hero', { type: 'raise', amount: 50 });
    const changed = {
      ...game,
      players: {
        ...game.players,
        'ai-1': { ...game.players['ai-1']!, holeCards: changedOpponentCards },
      },
    };

    expect(gradeMultiwayHand(game)).toEqual(gradeMultiwayHand(changed));
    expect(gradeMultiwayHand(game).decisions[0]).toMatchObject({
      grade: 'strong',
      sequence: 1,
      street: 'preflop',
    });
  });

  it('keeps older multiway history records replayable when no context exists', () => {
    const initial = createMultiwayHand({
      buttonSeat: 0,
      players: players(3),
      random: seededRandom(9_106),
    });
    const game = applyMultiwayAction(initial, 'hero', { type: 'fold' });
    const legacy = {
      ...game,
      history: game.history.map(({ decisionContext: _decisionContext, ...record }) => record),
    };

    expect(gradeMultiwayHand(legacy).decisions).toEqual([]);
  });

  it('keeps older heads-up history records replayable when no context exists', () => {
    const game = applyAction(headsUpWithHeroCards(9_107), 'hero', { type: 'fold' });
    const legacy = {
      ...game,
      history: game.history.map(({ decisionContext: _decisionContext, ...record }) => record),
    } as GameState;

    expect(gradeHeadsUpHand(legacy).decisions).toEqual([]);
  });

  it('grades 24 varied heads-up and multiway hands with bounded, legal comparisons', () => {
    const reports = [
      ...Array.from({ length: 12 }, (_, index) => gradeHeadsUpHand(finishVariedHeadsUp(12_000 + index))),
      ...Array.from({ length: 12 }, (_, index) => gradeMultiwayHand(finishVariedMultiway(
        13_000 + index,
        index % 2 === 0 ? 3 : 6,
      ))),
    ];

    expect(reports).toHaveLength(24);
    expect(reports.every((report) => report.decisions.length > 0)).toBe(true);
    reports.flatMap((report) => report.decisions).forEach((decision) => {
      expect(Number.isFinite(decision.relativeScoreGap)).toBe(true);
      expect(decision.relativeScoreGap).toBeGreaterThanOrEqual(0);
      expect(['fold', 'check', 'call', 'raise']).toContain(decision.baseline.action);
      expect(decision.summary.length).toBeGreaterThan(20);
      // Chips are the only money unit, and the review card reads the wager as a
      // number, so every line that quotes one must carry it as a field instead
      // of hiding it in the label text.
      [decision.chosen, decision.baseline].forEach((line) => {
        expect(line.label).not.toContain('BB');
        if (line.action === 'raise' || line.action === 'call') {
          expect(typeof line.amountChips).toBe('number');
        }
      });
    });
    const learning = summarizeDecisionReports(reports.map((report, index) => ({
      handId: `varied-${index}`,
      report,
    })));
    expect(learning.handsGraded).toBe(24);
    expect(learning.decisionsGraded).toBeGreaterThanOrEqual(24);
    expect(learning.strongRate).not.toBeNull();
  });
});
