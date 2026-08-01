import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../multiway';
import { decideSessionAiAction, seededMultiwayDecisionRandom } from '../multiwaySession';
import {
  createNextSitAndGoHand,
  createSitAndGo,
  createSitAndGoCheckpoint,
  isSitAndGoCheckpoint,
  resumeSitAndGo,
  sitAndGoBlindLevel,
  sitAndGoCompletion,
  sitAndGoHeroPlace,
  sitAndGoLivePlayerIds,
} from '../tournament';
import type { PlayerAction } from '../types';

function finishHand(state: MultiwayHandState): MultiwayHandState {
  let current = state;
  for (let guard = 0; !current.outcome && guard < 180; guard += 1) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('Tournament hand has no player to act.');
    let action: PlayerAction;
    if (playerId === 'hero') {
      const legal = getMultiwayLegalActions(current, playerId);
      action = legal.canCheck ? { type: 'check' } : { type: 'call' };
    } else {
      action = decideSessionAiAction(
        current,
        playerId,
        'club',
        seededMultiwayDecisionRandom(current, playerId),
      ).action;
    }
    current = applyMultiwayAction(current, playerId, action);
  }
  if (!current.outcome) throw new Error('Tournament hand did not finish.');
  return current;
}

describe('three-player Sit & Go', () => {
  it('uses a clear four-hand blind schedule', () => {
    expect(sitAndGoBlindLevel(1)).toMatchObject({ level: 1, smallBlind: 10, bigBlind: 20 });
    expect(sitAndGoBlindLevel(4).level).toBe(1);
    expect(sitAndGoBlindLevel(5)).toMatchObject({ level: 2, smallBlind: 15, bigBlind: 30 });
    expect(sitAndGoBlindLevel(9)).toMatchObject({ level: 3, smallBlind: 20, bigBlind: 40 });
  });

  it('randomizes the opening dealer, then rotates dealer, small blind, and big blind', () => {
    const openingButtons = [0.05, 0.45, 0.85].map((firstValue, index) => {
      let first = true;
      const later = seededRandom(90 + index);
      const game = createSitAndGo(() => {
        if (first) {
          first = false;
          return firstValue;
        }
        return later();
      });
      return game.buttonSeat;
    });
    expect(new Set(openingButtons).size).toBe(3);

    const completed = finishHand(createSitAndGo(seededRandom(1_201)));
    const next = createNextSitAndGoHand(completed, seededRandom(1_202));
    expect(next.buttonPlayerId).not.toBe(completed.buttonPlayerId);
    expect(new Set([next.buttonPlayerId, next.smallBlindPlayerId, next.bigBlindPlayerId]).size).toBe(3);
  });

  it('saves only stacks and table position between completed hands', () => {
    const completed = finishHand(createSitAndGo(seededRandom(2_201)));
    const checkpoint = createSitAndGoCheckpoint(completed, 'sharp');
    const serialized = JSON.stringify(checkpoint);
    expect(serialized).not.toMatch(/holeCards|deck|board|history|outcome/);

    const resumed = resumeSitAndGo(checkpoint, seededRandom(2_202));
    expect(resumed.handNumber).toBe(completed.handNumber + 1);
    expect(resumed.buttonPlayerId).not.toBe(completed.buttonPlayerId);
    expect(sitAndGoLivePlayerIds(resumed).length).toBeGreaterThanOrEqual(2);
    expect(resumed.players.hero?.holeCards).not.toEqual(completed.players.hero?.holeCards);
    expect(resumed.deck).not.toEqual(completed.deck);
  });
});

describe('six-player Sit & Go', () => {
  it('starts six equal 60 BB stacks and preserves all six seats in a public checkpoint', () => {
    const game = createSitAndGo(seededRandom(3_001), 6);
    expect(game.tablePlayerIds).toHaveLength(6);
    expect(game.tablePlayerIds.map((playerId) => {
      const player = game.players[playerId];
      if (!player) throw new Error(`Missing tournament player ${playerId}.`);
      return player.stack + player.totalCommitted;
    })).toEqual([
      1_200,
      1_200,
      1_200,
      1_200,
      1_200,
      1_200,
    ]);

    const completed = finishHand(game);
    const checkpoint = createSitAndGoCheckpoint(completed, 'club');
    expect(checkpoint.players).toHaveLength(6);
    expect(isSitAndGoCheckpoint(checkpoint)).toBe(true);
    expect(JSON.stringify(checkpoint)).not.toMatch(/holeCards|deck|board|history|outcome/);

    const resumed = resumeSitAndGo(checkpoint, seededRandom(3_002));
    expect(resumed.tablePlayerIds).toHaveLength(6);
    expect(resumed.handNumber).toBe(2);
    expect(new Set([resumed.buttonPlayerId, resumed.smallBlindPlayerId, resumed.bigBlindPlayerId]).size).toBe(3);
  });

  it('plays a complete deterministic six-player tournament and reports a valid place', () => {
    let game = createSitAndGo(seededRandom(3_101), 6);
    for (let guard = 0; guard < 120 && !sitAndGoCompletion(game); guard += 1) {
      game = finishHand(game);
      if (!sitAndGoCompletion(game)) {
        game = createNextSitAndGoHand(game, seededRandom(3_102 + game.handNumber));
      }
    }

    expect(sitAndGoCompletion(game)).not.toBeNull();
    expect(sitAndGoHeroPlace(game)).toBeGreaterThanOrEqual(1);
    expect(sitAndGoHeroPlace(game)).toBeLessThanOrEqual(6);
  }, 15_000);
});
