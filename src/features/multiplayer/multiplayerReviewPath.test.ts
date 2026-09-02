import { describe, expect, it } from 'vitest';

import type { MultiplayerHandArchive } from '../../domain/multiplayer/contracts';
import { parseMultiplayerHandArchive } from '../../domain/multiplayer/archive';
import { gradeMultiwayHand } from '../../domain/poker/decisionGrading';
import {
  applyMultiwayAction,
  createMultiwayHand,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type TablePlayerConfig,
} from '../../domain/poker/multiway';
import type { Card, PlayerAction } from '../../domain/poker/types';
import { sessionReviewableDecisionCount } from '../table/sessionModels';
import {
  buildMultiwayReplaySteps,
} from '../table/multiwayGameplayPresentation';
import {
  localizedMultiwayReplayDescription,
  localizedMultiwayReplayTitle,
} from '../table/localizedGameplay';
import {
  multiplayerArchivesToSessionHands,
  multiplayerArchiveToSessionHand,
} from './multiplayerArchivePresentation';

/**
 * P18-002 / P18-014 / P18-053: the existing private-review route is finished
 * and verified, never duplicated. These fixtures drive the shipped path —
 * worker viewer-relative archive → `parseMultiplayerHandArchive` redaction
 * boundary → `multiplayerArchiveToSessionHand` adapter → `gradeMultiwayHand` —
 * at 3, 6, and 9 seats, and pin the redaction contract from the viewer side.
 */

const SEAT_COUNTS = [3, 6, 9] as const;

function tablePlayers(count: number): TablePlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? 'human:viewer' : `human:p${index}`,
    name: index === 0 ? 'Viewer' : `Player ${index}`,
    seat: index,
    stack: 2_000,
  }));
}

function passive(legal: ReturnType<typeof getMultiwayLegalActions>): PlayerAction {
  if (legal.canCheck) return { type: 'check' };
  if (legal.canCall) return { type: 'call' };
  return { type: 'fold' };
}

/** Plays passively to a completed showdown with every seat dealt in. */
function completedShowdown(playerCount: number): MultiwayHandState {
  let game = createMultiwayHand({
    buttonSeat: 0,
    players: tablePlayers(playerCount),
    random: seededRandomFor(playerCount),
  });
  for (let guard = 0; guard < 400 && !game.outcome; guard += 1) {
    const actor = game.toAct;
    if (!actor) break;
    game = applyMultiwayAction(game, actor, passive(getMultiwayLegalActions(game, actor)));
  }
  if (!game.outcome) throw new Error(`Showdown fixture for ${playerCount} seats did not complete.`);
  if (game.players['human:viewer']!.folded) throw new Error('Fixture viewer folded; expected a showdown participant.');
  return game;
}

function seededRandomFor(seed: number) {
  // Deterministic PRNG so fixture outcomes are stable.
  let state = 0x2f6e2b1 ^ seed;
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mirrors the worker's viewer-relative redaction for a completed showdown:
 * the viewer and legitimately revealed showdown seats keep cards, everyone
 * else's cards are stripped, opponent decision contexts are stripped, and the
 * deck/pending/toAct are cleared.
 */
function redactForViewer(hand: MultiwayHandState, viewerPlayerId: string): MultiplayerHandArchive {
  const showdown = hand.outcome?.showdown === true;
  return {
    completedAtMs: 2_100_000_000_000,
    completionReason: 'hand-limit',
    hand: {
      ...hand,
      deck: [],
      history: hand.history.map((action) => {
        if (action.playerId === viewerPlayerId) return action;
        // The worker omits opponent decision contexts entirely; an explicit
        // undefined key would (correctly) fail the parse boundary.
        const { decisionContext: _omitted, ...publicAction } = action;
        return publicAction;
      }),
      pending: [],
      players: Object.fromEntries(Object.entries(hand.players).map(([playerId, player]) => [
        playerId,
        {
          ...player,
          holeCards: playerId === viewerPlayerId || (showdown && !player.folded)
            ? [...player.holeCards]
            : [],
        },
      ])),
      toAct: null,
    },
    roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sessionNumber: 4,
    viewerPlayerId,
  };
}

describe('private review redaction boundary (P18-002)', () => {
  it('keeps hero cards, public board and actions, and legitimately revealed showdown cards', () => {
    const rawHand = completedShowdown(6);
    const archive = redactForViewer(rawHand, 'human:viewer');
    const parsed = parseMultiplayerHandArchive(archive);
    expect(parsed).not.toBeNull();

    const viewer = parsed!.hand.players['human:viewer']!;
    expect(viewer.holeCards).toHaveLength(2);
    expect(parsed!.hand.board.length).toBe(5);
    expect(parsed!.hand.history.length).toBe(rawHand.history.length);
    // Every showdown participant that did not fold legitimately revealed cards.
    for (const [playerId, player] of Object.entries(parsed!.hand.players)) {
      if (playerId === 'human:viewer') continue;
      if (player.folded) expect(player.holeCards).toEqual([]);
      else expect(player.holeCards).toHaveLength(2);
    }
    expect(parsed!.hand.deck).toEqual([]);
    // Opponent decision contexts never travel to the viewer.
    expect(parsed!.hand.history.every((action) => (
      action.playerId === 'human:viewer' || !('decisionContext' in action && action.decisionContext !== undefined)
    ))).toBe(true);
  });

  it('rejects an archive that leaks folded opponent cards instead of rendering it', () => {
    const archive = redactForViewer(completedShowdown(6), 'human:viewer');
    // Tampering: a folded seat carrying hole cards is exactly the leak the
    // boundary exists to stop.
    const foldedId = Object.keys(archive.hand.players).find((id) => id !== 'human:viewer')!;
    const leaked = {
      ...archive,
      hand: {
        ...archive.hand,
        players: {
          ...archive.hand.players,
          [foldedId]: { ...archive.hand.players[foldedId]!, folded: true, holeCards: [...archive.hand.players['human:viewer']!.holeCards] },
        },
      },
    };
    expect(parseMultiplayerHandArchive(leaked)).toBeNull();
  });

  it('rejects an archive that reveals opponent cards without a showdown', () => {
    const archive = redactForViewer(completedShowdown(6), 'human:viewer');
    const opponentId = Object.keys(archive.hand.players).find((id) => id !== 'human:viewer')!;
    const keepCards = { ...archive.hand.players[opponentId]!, holeCards: archive.hand.players['human:viewer']!.holeCards };
    const leaked = {
      ...archive,
      hand: {
        ...archive.hand,
        outcome: { ...archive.hand.outcome!, showdown: false },
        players: { ...archive.hand.players, [opponentId]: keepCards },
      },
    };
    expect(parseMultiplayerHandArchive(leaked)).toBeNull();
  });

  it('rejects an archive that carries another player\'s decision context', () => {
    const archive = redactForViewer(completedShowdown(6), 'human:viewer');
    const opponentIndex = archive.hand.history.findIndex((action) => action.playerId !== 'human:viewer');
    const leaked = {
      ...archive,
      hand: {
        ...archive.hand,
        history: archive.hand.history.map((action, index) => (
          index === opponentIndex
            ? { ...action, decisionContext: archive.hand.history[0]?.decisionContext }
            : action
        )),
      },
    };
    expect(parseMultiplayerHandArchive(leaked)).toBeNull();
  });
});

describe('review grading at 3, 6, and 9 seats (P18-002, P18-053)', () => {
  for (const seatCount of SEAT_COUNTS) {
    it(`grades the viewer-relative archive at ${seatCount} seats without saved equity and without throwing`, () => {
      const rawHand = completedShowdown(seatCount);
      // Competitive lanes and older sessions store no live equity; the review
      // grader must still produce a report through the deterministic fallback.
      const stripped: MultiwayHandState = {
        ...rawHand,
        history: rawHand.history.map((action) => (
          action.decisionContext
            ? { ...action, decisionContext: { ...action.decisionContext, estimatedEquity: undefined } }
            : action
        )),
      };
      const archive = redactForViewer(stripped, 'human:viewer');
      const parsed = parseMultiplayerHandArchive(archive);
      expect(parsed).not.toBeNull();

      const record = multiplayerArchiveToSessionHand(parsed!);
      expect(record).not.toBeNull();
      expect(record!.mode).toBe('multiway');
      expect(record!.game.players.hero!.holeCards).toHaveLength(2);
      expect(record!.game.tablePlayerIds).toHaveLength(seatCount);

      const report = gradeMultiwayHand(record!.game);
      expect(report.decisions.length).toBeGreaterThan(0);
      for (const decision of report.decisions) {
        // Deterministic fallback grading: supported decisions grade; anything
        // unsupported is an explicit diagnostic, never a crash or a clamp.
        expect(['strong', 'close', 'mistake', 'ungraded']).toContain(decision.grade);
      }
    });
  }

  it('converts a batch of archives and counts review-worthy decisions for the review entry', () => {
    const hands = multiplayerArchivesToSessionHands(
      SEAT_COUNTS.map((seatCount) => redactForViewer(completedShowdown(seatCount), 'human:viewer')),
    );
    expect(hands).toHaveLength(3);
    const count = sessionReviewableDecisionCount(hands);
    expect(count).toBeGreaterThan(0);
    // The count is the number of decisions a player can review, graded or not.
    const reportDecisions = hands.reduce((total, hand) => (
      total + gradeMultiwayHand(hand.game).decisions.length
    ), 0);
    expect(count).toBe(reportDecisions);
  });

  it('returns no record when an archive is missing the viewer (defensive)', () => {
    const archive = redactForViewer(completedShowdown(3), 'human:viewer');
    const withoutViewer = {
      ...archive,
      hand: {
        ...archive.hand,
        players: Object.fromEntries(
          Object.entries(archive.hand.players).filter(([id]) => id !== 'human:viewer'),
        ),
      },
    } as unknown as MultiplayerHandArchive;
    expect(multiplayerArchiveToSessionHand(withoutViewer)).toBeNull();
  });
});

describe('multiway review copy audit (P18-014)', () => {
  // Language that would misrepresent a multiway record: heads-up-only phrasing
  // or the heads-up replay's fixed opponent name.
  const headsUpOnlyPhrases = ['heads-up', 'heads up', 'Mara', 'villain'];

  it('keeps every multiway review string factual — no heads-up narrative on multiway records', () => {
    const rawHand = completedShowdown(6);
    const archive = redactForViewer(rawHand, 'human:viewer');
    const record = multiplayerArchiveToSessionHand(archive)!;
    const report = gradeMultiwayHand(record.game);

    const strings: string[] = [
      report.summary,
      ...report.decisions.flatMap((decision) => [decision.summary, decision.detail]),
      record.game.outcome?.handDescriptions?.hero ?? '',
    ];
    for (const value of strings) {
      for (const phrase of headsUpOnlyPhrases) {
        expect(value.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    }
  });

  it('names replay actors by seat name, never by the heads-up opponent persona', () => {
    const archive = redactForViewer(completedShowdown(3), 'human:viewer');
    const record = multiplayerArchiveToSessionHand(archive)!;
    for (const step of buildMultiwayReplaySteps(record.game)) {
      const title = localizedMultiwayReplayTitle(step, record.game, (key, values) => key + JSON.stringify(values ?? {}));
      const description = localizedMultiwayReplayDescription(step, record.game, (key, values) => key + JSON.stringify(values ?? {}));
      for (const value of [title, description]) {
        for (const phrase of headsUpOnlyPhrases) {
          expect(value).not.toContain(phrase);
        }
      }
    }
  });
});
