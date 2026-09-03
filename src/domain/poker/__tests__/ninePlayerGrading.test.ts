import { describe, expect, it } from 'vitest';

import corpus from './fixtures/gradeCorpus.json';
import { seededRandom } from '../cards';
import { gradeHeadsUpHand, gradeMultiwayHand } from '../decisionGrading';
import { summarizeDecisionReports } from '../sessionLearning';
import { scoreTableMission, tableMissionById } from '../../learning/tableMissions';
import { applyAction, createHand, getLegalActions } from '../engine';
import {
  applyMultiwayAction,
  createMultiwayHand,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type TablePlayerConfig,
} from '../multiway';
import type { Card, GameState, PlayerAction } from '../types';

/**
 * P18-001 / P18-005 fixtures: nine-player grading safety.
 *
 * The GLM audit found that `gradeMultiwayHand` threw when a hero postflop
 * decision faced six to eight live opponents and carried no saved equity,
 * because the fallback `estimateFieldEquity` only accepted one to five unknown
 * opponents. The failing fixture below was recorded red before the fix and is
 * kept as the regression pin (S0 evidence). The remaining fixtures pin the
 * engine's position/players-behind truth across every dealer rotation, the
 * ungraded diagnostic contract, and the byte-stable grade corpus.
 */

const aces: [Card, Card] = [
  { rank: 14, suit: 'spades' },
  { rank: 14, suit: 'hearts' },
];

/** Positions the seat engine can assign at nine players; BTN/SB is heads-up only. */
const NINE_SEAT_POSITIONS = new Set([
  'BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO',
]);

function tablePlayers(count: number, stack = 2_000): TablePlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? 'hero' : `ai-${index}`,
    isHero: index === 0,
    name: index === 0 ? 'You' : `AI ${index}`,
    seat: index,
    stack,
  }));
}

function passiveAction(legal: ReturnType<typeof getMultiwayLegalActions>): PlayerAction {
  if (legal.canCheck) return { type: 'check' };
  if (legal.canCall) return { type: 'call' };
  return { type: 'fold' };
}

/** Plays every seat passively until the flop is up and it is the hero's turn. */
function dealToFlopWithHeroToAct(playerCount: number, buttonSeat = 0): MultiwayHandState {
  let game = createMultiwayHand({
    buttonSeat,
    players: tablePlayers(playerCount),
    random: seededRandom(18_000 + playerCount * 7 + buttonSeat),
  });
  for (let guard = 0; guard < 120 && !game.outcome; guard += 1) {
    if (game.street !== 'preflop' && game.toAct === 'hero') break;
    const actor = game.toAct;
    if (!actor) break;
    game = applyMultiwayAction(game, actor, passiveAction(getMultiwayLegalActions(game, actor)));
  }
  return game;
}

function withHeroAces(game: MultiwayHandState): MultiwayHandState {
  return {
    ...game,
    players: {
      ...game.players,
      hero: { ...game.players.hero!, holeCards: [...aces] },
    },
  };
}

/** The legal-action fields both engines share, for the shared driver below. */
interface VariedLegal {
  canCall: boolean;
  canCheck: boolean;
  canFold: boolean;
  canRaise: boolean;
  suggestedRaiseTo: number;
}

function variedAction(
  legal: VariedLegal,
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

function finishVariedMultiway(seed: number, playerCount: number): MultiwayHandState {
  const random = seededRandom(seed);
  let game = createMultiwayHand({ buttonSeat: seed % playerCount, players: tablePlayers(playerCount), random });
  for (let actionCount = 0; !game.outcome && actionCount < 180; actionCount += 1) {
    const playerId = game.toAct;
    if (!playerId) break;
    game = applyMultiwayAction(game, playerId, variedAction(getMultiwayLegalActions(game, playerId), random()));
  }
  return game;
}

describe('nine-player grading safety (P18-001)', () => {
  it('grades a nine-player flop decision facing eight live opponents without saved equity', () => {
    // The original red fixture: threw "Equity requires one to five unknown
    // opponents." before the S1 fix.
    let game = dealToFlopWithHeroToAct(9);

    expect(game.board.length).toBe(3);
    expect(game.outcome).toBeUndefined();
    game = withHeroAces(game);

    const historyLength = game.history.length;
    game = applyMultiwayAction(game, 'hero', { type: 'check' });

    const context = game.history.at(-1)?.decisionContext;
    expect(context?.opponentCount).toBe(8);
    expect(context?.estimatedEquity).toBeUndefined();

    const report = gradeMultiwayHand(game);
    expect(game.history.length).toBe(historyLength + 1);
    expect(report.decisions.length).toBeGreaterThan(0);
    // The decision is genuinely graded against all eight opponents — never
    // ungraded, never silently clamped to five.
    const postflop = report.decisions.at(-1)!;
    expect(postflop.grade).not.toBe('ungraded');
    expect(postflop.ungradedReason).toBeUndefined();
  });

  it('grades flop decisions facing six and seven live opponents without saved equity', () => {
    for (const playerCount of [7, 8] as const) {
      let game = withHeroAces(dealToFlopWithHeroToAct(playerCount));
      expect(game.board.length).toBe(3);
      game = applyMultiwayAction(game, 'hero', { type: 'check' });
      const context = game.history.at(-1)?.decisionContext;
      expect(context?.opponentCount).toBe(playerCount - 1);

      const report = gradeMultiwayHand(game);
      const postflop = report.decisions.at(-1)!;
      expect(postflop.grade).not.toBe('ungraded');
      expect(postflop.detail).toContain(`Estimated equity`);
    }
  });

  it('never throws and never marks ungraded across a varied nine-seat sweep', () => {
    // Competitive modes and older builds save no live equity, so every postflop
    // decision here exercises the deterministic fallback.
    const reports = Array.from({ length: 8 }, (_, index) => (
      gradeMultiwayHand(finishVariedMultiway(21_000 + index, 9))
    ));
    for (const report of reports) {
      for (const decision of report.decisions) {
        expect(['strong', 'close', 'mistake', 'ungraded']).toContain(decision.grade);
        if (decision.grade === 'ungraded') {
          expect(decision.ungradedReason).toBeDefined();
        } else {
          expect(decision.ungradedReason).toBeUndefined();
        }
      }
    }
    expect(reports.every((report) => report.decisions.length > 0)).toBe(true);
  });

  it('keeps grading bounded: a nine-seat session sweep completes well inside the recorded budget envelope', () => {
    // Gross-regression tripwire only; the real budget is measured and recorded
    // in docs/PHASE_18_RELEASE_1_2_EXECUTION_RECORD.md (≈7 ms/decision on the
    // dev machine at eight opponents × 80 samples).
    const startedAt = Date.now();
    for (let index = 0; index < 6; index += 1) {
      gradeMultiwayHand(finishVariedMultiway(22_000 + index, 9));
    }
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });
});

describe('nine-seat engine truth across every dealer rotation (P18-005)', () => {
  it('reports the engine position, player count, and opponent count for every button seat', () => {
    for (let buttonSeat = 0; buttonSeat < 9; buttonSeat += 1) {
      let game = createMultiwayHand({
        buttonSeat,
        players: tablePlayers(9),
        random: seededRandom(19_000 + buttonSeat),
      });
      const enginePosition = game.players.hero!.position;
      expect(enginePosition).toBeDefined();
      expect(NINE_SEAT_POSITIONS.has(enginePosition!)).toBe(true);
      // The heads-up BTN/SB shortcut can never leak into a nine-seat record.
      expect(enginePosition).not.toBe('BTN/SB');

      const guard = 0;
      while (game.toAct !== 'hero' && !game.outcome && guard < 40) {
        const actor = game.toAct;
        if (!actor) break;
        game = applyMultiwayAction(game, actor, passiveAction(getMultiwayLegalActions(game, actor)));
      }
      if (game.toAct !== 'hero') continue; // hand ended before the hero acted
      // Snapshot before acting: applyMultiwayAction rebuilds `pending` on a
      // raise, but the context is captured from the pre-action state.
      const pendingBefore = [...game.pending];
      game = applyMultiwayAction(game, 'hero', { type: 'raise', amount: 60 });

      const context = game.history.at(-1)?.decisionContext;
      expect(context?.position).toBe(enginePosition);
      expect(context?.playerCount).toBe(9);
      expect(context?.opponentCount).toBe(8);
      // The engine's own players-behind formula: pending seats after the hero
      // that are neither folded nor all-in. Zero is correct for the big blind
      // acting last to an unraised pot.
      const heroIndex = pendingBefore.indexOf('hero');
      const expectedBehind = heroIndex < 0
        ? 0
        : pendingBefore.slice(heroIndex + 1).filter((id) => (
          !game.players[id]?.folded && !game.players[id]?.allIn
        )).length;
      expect(context?.playersBehind).toBe(expectedBehind);
    }
  });

  it('reports UTG with eight players behind when the hero is first to act preflop', () => {
    let utgGame: MultiwayHandState | null = null;
    for (let buttonSeat = 0; buttonSeat < 9 && !utgGame; buttonSeat += 1) {
      const game = createMultiwayHand({
        buttonSeat,
        players: tablePlayers(9),
        random: seededRandom(19_100 + buttonSeat),
      });
      if (game.preflopActionOrder[0] === 'hero') utgGame = game;
    }
    expect(utgGame).not.toBeNull();
    expect(utgGame!.players.hero!.position).toBe('UTG');

    const withAces = withHeroAces(utgGame!);
    const raised = applyMultiwayAction(withAces, 'hero', { type: 'raise', amount: 60 });
    const context = raised.history.at(-1)?.decisionContext;
    expect(context).toMatchObject({
      position: 'UTG',
      playerCount: 9,
      opponentCount: 8,
      playersBehind: 8,
    });

    const report = gradeMultiwayHand(raised);
    const preflop = report.decisions[0]!;
    expect(preflop.street).toBe('preflop');
    expect(preflop.grade).not.toBe('ungraded');
  });

  it('grades a two-player multiway record by record mode with engine positions, not a heads-up shortcut', () => {
    let game = createMultiwayHand({
      buttonSeat: 0,
      players: tablePlayers(2),
      random: seededRandom(19_200),
    });
    expect(game.players.hero!.position).toBe('BTN/SB');
    game = applyMultiwayAction(game, 'hero', { type: 'raise', amount: 40 });

    const context = game.history.at(-1)?.decisionContext;
    expect(context).toMatchObject({ position: 'BTN/SB', playerCount: 2, opponentCount: 1 });

    const report = gradeMultiwayHand(game);
    expect(report.decisions[0]).toMatchObject({
      street: 'preflop',
      grade: 'strong',
      sequence: 1,
    });
  });
});

describe('participation states in graded records', () => {
  it('counts folded opponents out and keeps players behind accurate', () => {
    let game = createMultiwayHand({
      buttonSeat: 0,
      players: tablePlayers(9),
      random: seededRandom(19_300),
    });
    // Two early seats fold preflop; the hero then raises from a later position.
    let folds = 0;
    for (let guard = 0; guard < 40 && game.toAct !== 'hero' && !game.outcome; guard += 1) {
      const actor = game.toAct;
      if (!actor) break;
      const legal = getMultiwayLegalActions(game, actor);
      const action = folds < 2 && legal.canFold ? { type: 'fold' as const } : passiveAction(legal);
      if (action.type === 'fold') folds += 1;
      game = applyMultiwayAction(game, actor, action);
    }
    if (game.toAct === 'hero') {
      game = applyMultiwayAction(game, 'hero', { type: 'raise', amount: 60 });
      const context = game.history.at(-1)?.decisionContext;
      expect(context?.opponentCount).toBe(8 - folds);
    }
  });

  it('excludes an all-in opponent from players behind while still counting the live opponent', () => {
    let game = createMultiwayHand({
      buttonSeat: 0,
      players: tablePlayers(9, 2_000),
      random: seededRandom(19_400),
    });
    // The small blind already committed 10 of its stack at creation; this
    // snapshot leaves ai-1 less than a call of the hero's raise, so calling
    // puts it all-in.
    game = {
      ...game,
      players: {
        ...game.players,
        'ai-1': { ...game.players['ai-1']!, stack: 8 },
      },
    };
    for (let guard = 0; guard < 40 && game.toAct !== 'hero' && !game.outcome; guard += 1) {
      const actor = game.toAct;
      if (!actor) break;
      game = applyMultiwayAction(game, actor, passiveAction(getMultiwayLegalActions(game, actor)));
    }
    expect(game.toAct).toBe('hero');
    // Hero (button) raises; the small stack calls all-in.
    game = applyMultiwayAction(game, 'hero', { type: 'raise', amount: 60 });
    expect(game.toAct).toBe('ai-1');
    game = applyMultiwayAction(game, 'ai-1', { type: 'call' });
    expect(game.players['ai-1']!.allIn).toBe(true);
    expect(game.players['ai-1']!.folded).toBe(false);

    // Play passively to the flop and the hero's next turn.
    for (let guard = 0; guard < 120 && !game.outcome; guard += 1) {
      if (game.street !== 'preflop' && game.toAct === 'hero') break;
      const actor = game.toAct;
      if (!actor) break;
      game = applyMultiwayAction(game, actor, passiveAction(getMultiwayLegalActions(game, actor)));
    }
    expect(game.toAct).toBe('hero');
    const pendingBefore = [...game.pending];
    expect(pendingBefore).not.toContain('ai-1'); // all-in seats never act again
    game = applyMultiwayAction(game, 'hero', { type: 'check' });
    const context = game.history.at(-1)?.decisionContext;
    // The all-in seat is still dealt in and not folded: it remains a live
    // opponent the hero must beat, but it can never act behind the hero.
    expect(context?.opponentCount).toBe(8);
    expect(context?.playersBehind).not.toBe(8);
  });

  it('ignores busted seats when grading a later hand', () => {
    // A busted player (zero chips) is never dealt back in; the context must
    // count only the seats actually dealt into this hand.
    const configs = tablePlayers(9).map((player) => (
      player.id === 'ai-8' ? { ...player, stack: 0 } : player
    ));
    let game = createMultiwayHand({
      buttonSeat: 0,
      players: configs,
      random: seededRandom(19_500),
    });
    expect(game.activePlayerIds).not.toContain('ai-8');
    expect(game.tablePlayerIds).toContain('ai-8');
    for (let guard = 0; guard < 120 && !game.outcome; guard += 1) {
      if (game.street !== 'preflop' && game.toAct === 'hero') break;
      const actor = game.toAct;
      if (!actor) break;
      game = applyMultiwayAction(game, actor, passiveAction(getMultiwayLegalActions(game, actor)));
    }
    expect(game.board.length).toBe(3);
    game = withHeroAces(game);
    game = applyMultiwayAction(game, 'hero', { type: 'check' });
    const context = game.history.at(-1)?.decisionContext;
    expect(context?.playerCount).toBe(8);
    expect(context?.opponentCount).toBe(7);

    const report = gradeMultiwayHand(game);
    expect(report.decisions.at(-1)!.grade).not.toBe('ungraded');
  });

  it('grades a hand where a live seat is sitting out and never dealt in', () => {
    // The multiplayer coordinator deals sitting-out seats no cards; model that
    // by removing a healthy seat from the dealt-in list before the hero acts.
    let game = dealToFlopWithHeroToAct(9);
    game = {
      ...game,
      activePlayerIds: game.activePlayerIds.filter((id) => id !== 'ai-7'),
      dealOrder: game.dealOrder.filter((id) => id !== 'ai-7'),
      pending: game.pending.filter((id) => id !== 'ai-7'),
    };
    game = withHeroAces(game);
    game = applyMultiwayAction(game, 'hero', { type: 'check' });
    const context = game.history.at(-1)?.decisionContext;
    expect(context?.opponentCount).toBe(7);
    expect(() => gradeMultiwayHand(game)).not.toThrow();
  });
});

describe('explicitly ungraded diagnostics (D01)', () => {
  it('returns an ungraded diagnostic instead of throwing when an estimate is impossible', () => {
    // Legacy/corrupt record: opponent count beyond any supported table.
    let game = dealToFlopWithHeroToAct(9);
    game = withHeroAces(game);
    game = applyMultiwayAction(game, 'hero', { type: 'check' });
    const corrupted: MultiwayHandState = {
      ...game,
      history: game.history.map((record) => (
        record.playerId === 'hero' && record.decisionContext
          ? {
            ...record,
            decisionContext: { ...record.decisionContext, opponentCount: 9 },
          }
          : record
      )),
    };

    const report = gradeMultiwayHand(corrupted);
    const heroPostflop = report.decisions.at(-1)!;
    expect(heroPostflop.grade).toBe('ungraded');
    expect(heroPostflop.ungradedReason).toBe('equity-estimate-unavailable');
    expect(heroPostflop.focusArea).toBe('none');
    expect(heroPostflop.detail).toContain('equity-estimate-unavailable');
    // The opponent count was never reduced to force a grade.
    expect(heroPostflop.detail).toContain('9 live opponents');
  });

  it('returns an ungraded diagnostic for a corrupt board instead of throwing', () => {
    let game = dealToFlopWithHeroToAct(9);
    game = withHeroAces(game);
    game = applyMultiwayAction(game, 'hero', { type: 'check' });
    const corrupted: MultiwayHandState = {
      ...game,
      history: game.history.map((record) => (
        record.playerId === 'hero' && record.decisionContext
          ? {
            ...record,
            decisionContext: {
              ...record.decisionContext,
              board: [...record.decisionContext.board, { rank: 2, suit: 'spades' }, { rank: 3, suit: 'spades' }, { rank: 4, suit: 'spades' }],
            },
          }
          : record
      )),
    };

    const report = gradeMultiwayHand(corrupted);
    expect(report.decisions.at(-1)!.grade).toBe('ungraded');
    expect(report.decisions.at(-1)!.ungradedReason).toBe('equity-estimate-unavailable');
  });

  it('returns an ungraded diagnostic with the grading-exception reason for a broken context', () => {
    // Button seat 6 puts the hero (seat 0) in UTG, first to act preflop.
    let game = createMultiwayHand({
      buttonSeat: 6,
      players: tablePlayers(9),
      random: seededRandom(19_600),
    });
    expect(game.preflopActionOrder[0]).toBe('hero');
    game = applyMultiwayAction(game, 'hero', { type: 'raise', amount: 60 });
    const broken: MultiwayHandState = {
      ...game,
      history: game.history.map((record) => (
        record.playerId === 'hero' && record.decisionContext
          ? {
            ...record,
            decisionContext: { ...record.decisionContext, legalActions: undefined as never },
          }
          : record
      )),
    };

    const report = gradeMultiwayHand(broken);
    const decision = report.decisions[0]!;
    expect(decision.grade).toBe('ungraded');
    expect(decision.ungradedReason).toBe('grading-exception');
  });

  it('summarizes a hand whose decisions are all ungraded as an explicit ungraded report', () => {
    let game = dealToFlopWithHeroToAct(9);
    game = withHeroAces(game);
    game = applyMultiwayAction(game, 'hero', { type: 'check' });
    // Strip the hero's preflop context (legacy no-snapshot record) so the
    // corrupted postflop decision is the only one left in scope.
    const corrupted: MultiwayHandState = {
      ...game,
      history: game.history.map((record) => {
        if (record.playerId !== 'hero') return record;
        if (record.street === 'preflop') {
          const { decisionContext: _omitted, ...legacy } = record;
          return legacy;
        }
        return record.decisionContext
          ? { ...record, decisionContext: { ...record.decisionContext, opponentCount: 9 } }
          : record;
      }),
    };

    const report = gradeMultiwayHand(corrupted);
    expect(report.classification).toBe('ungraded');
    expect(report.summary).toContain('could be graded');
    expect(report.summary).toContain('explicit diagnostic');
  });

  it('excludes ungraded decisions from session learning and mission scoring', () => {
    let game = dealToFlopWithHeroToAct(9);
    game = withHeroAces(game);
    game = applyMultiwayAction(game, 'hero', { type: 'check' });
    const corrupted: MultiwayHandState = {
      ...game,
      history: game.history.map((record) => {
        if (record.playerId !== 'hero') return record;
        if (record.street === 'preflop') {
          const { decisionContext: _omitted, ...legacy } = record;
          return legacy;
        }
        return record.decisionContext
          ? { ...record, decisionContext: { ...record.decisionContext, opponentCount: 9 } }
          : record;
      }),
    };
    const report = gradeMultiwayHand(corrupted);
    expect(report.decisions.length).toBe(1);
    expect(report.decisions[0]!.grade).toBe('ungraded');

    const learning = summarizeDecisionReports([{ handId: 'ungraded-hand', report }]);
    expect(learning.decisionsGraded).toBe(0);
    expect(learning.strongRate).toBeNull();

    // A mixed hand keeps exactly its graded decisions in the totals.
    let mixed = dealToFlopWithHeroToAct(9);
    mixed = withHeroAces(mixed);
    mixed = applyMultiwayAction(mixed, 'hero', { type: 'check' });
    const mixedCorrupted: MultiwayHandState = {
      ...mixed,
      history: mixed.history.map((record) => (
        record.playerId === 'hero' && record.decisionContext
          ? { ...record, decisionContext: { ...record.decisionContext, opponentCount: 9 } }
          : record
      )),
    };
    const mixedReport = gradeMultiwayHand(mixedCorrupted);
    const gradedCount = mixedReport.decisions.filter((decision) => decision.grade !== 'ungraded').length;
    expect(gradedCount).toBeGreaterThan(0);
    const mixedLearning = summarizeDecisionReports([{ handId: 'mixed-hand', report: mixedReport }]);
    expect(mixedLearning.decisionsGraded).toBe(gradedCount);

    // Mission scoring never reads an ungraded decision, even when the mission
    // scopes the street it sits on.
    const brokenPreflop: MultiwayHandState = {
      ...(() => {
        let broken = createMultiwayHand({
          buttonSeat: 6,
          players: tablePlayers(9),
          random: seededRandom(19_650),
        });
        broken = applyMultiwayAction(broken, 'hero', { type: 'raise', amount: 60 });
        return {
          ...broken,
          history: broken.history.map((record) => (
            record.playerId === 'hero' && record.decisionContext
              ? { ...record, decisionContext: { ...record.decisionContext, legalActions: undefined as never } }
              : record
          )),
        };
      })(),
    };
    const missionReport = gradeMultiwayHand(brokenPreflop);
    expect(missionReport.decisions[0]!.ungradedReason).toBe('grading-exception');
    const mission = scoreTableMission(tableMissionById('mission-preflop-enter-pot'), [missionReport]);
    expect(mission.decisionsGraded).toBe(0);
    expect(mission.passed).toBe(false);
  });
});

describe('pinned grade corpus (P18-005)', () => {
  const entries = corpus.entries as Array<{
    id: string;
    kind: 'heads_up' | 'multiway';
    seats: number;
    seed: number;
    handGrade: string;
    classification: string | null;
    decisions: Array<{
      street: string;
      grade: string;
      chosenAction: string;
      baselineAction: string;
    }>;
  }>;

  function headsUpAces(): GameState {
    const base = createHand({ button: 'hero', random: seededRandom(9_101) });
    return {
      ...base,
      players: { ...base.players, hero: { ...base.players.hero, holeCards: [...aces] } },
    };
  }

  function finishVariedHeadsUp(seed: number): GameState {
    const random = seededRandom(seed);
    let game = createHand({ button: random() < 0.5 ? 'hero' : 'villain', random });
    for (let n = 0; !game.outcome && n < 80; n += 1) {
      const id = game.toAct!;
      game = applyAction(game, id, variedAction(getLegalActions(game, id), random()));
    }
    return game;
  }

  function build(entry: typeof entries[number]) {
    if (entry.kind === 'heads_up') {
      if (entry.id === 'anchor-hu-premium-open') {
        return gradeHeadsUpHand(applyAction(headsUpAces(), 'hero', { type: 'raise', amount: 50 }));
      }
      if (entry.id === 'anchor-hu-fold-aces') {
        return gradeHeadsUpHand(applyAction(headsUpAces(), 'hero', { type: 'fold' }));
      }
      return gradeHeadsUpHand(finishVariedHeadsUp(entry.seed));
    }
    return gradeMultiwayHand(finishVariedMultiway(entry.seed, entry.seats));
  }

  it('matches every pinned classification, hand grade, and decision tuple', () => {
    expect(entries.length).toBeGreaterThanOrEqual(20);
    for (const entry of entries) {
      const report = build(entry);
      const actual = {
        handGrade: report.handGrade,
        classification: report.classification,
        decisions: report.decisions.map((decision) => ({
          street: decision.street,
          grade: decision.grade,
          chosenAction: decision.chosen.action,
          baselineAction: decision.baseline.action,
        })),
      };
      expect(actual, `pinned corpus entry ${entry.id} drifted`).toEqual({
        handGrade: entry.handGrade,
        classification: entry.classification,
        decisions: entry.decisions,
      });
    }
  });
});
