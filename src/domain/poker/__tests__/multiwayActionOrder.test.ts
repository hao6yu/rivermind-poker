import { describe, expect, it } from 'vitest';

import {
  activePlayersClockwiseAfter,
  applyMultiwayAction,
  createMultiwayHand,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type TablePlayerConfig,
} from '../multiway';
import { createSitAndGoCheckpoint, resumeSitAndGo } from '../tournament';
import { multiwaySeatPlacements, multiwaySeatRoleBadge } from '../../../features/table/multiwayGameplayPresentation';
import type { PlayerAction } from '../types';

/**
 * The canonical clockwise ring (scope 3.11E): starting at the button, visible
 * and semantic order is Dealer → Small Blind → Big Blind → remaining seats →
 * Dealer. The named Aya/Bruce/Zane fixture pins the reported screen so a true
 * order defect can never hide behind the legal Bruce-before-Zane turn example.
 */

function player(id: string, name: string, seat: number, stack = 2_000): TablePlayerConfig {
  return { id, name, seat, stack };
}

const SIX_SEATED: TablePlayerConfig[] = [
  player('aya', 'Aya', 0),
  player('bruce', 'Bruce', 1),
  player('zane', 'Zane', 2),
  player('mara', 'Mara', 3),
  player('kai', 'Kai', 4),
  player('iris', 'Iris', 5),
];

function sixHand(buttonSeat = 0, seated: TablePlayerConfig[] = SIX_SEATED): MultiwayHandState {
  return createMultiwayHand({
    players: seated,
    handNumber: 4,
    buttonSeat,
    smallBlind: 10,
    bigBlind: 20,
  });
}

/** Folds, checks, or calls every pending decision until the street advances. */
function playThroughStreet(state: MultiwayHandState, guard = 24): MultiwayHandState {
  let current = state;
  const startStreet = current.street;
  for (let index = 0; current.street === startStreet && index < guard; index += 1) {
    const playerId = current.toAct;
    if (!playerId) break;
    const legal = getMultiwayLegalActions(current, playerId);
    const action: PlayerAction = legal.canCheck
      ? { type: 'check' }
      : legal.canCall
        ? { type: 'call' }
        : { type: 'fold' };
    current = applyMultiwayAction(current, playerId, action);
  }
  return current;
}

function playToTurn(state: MultiwayHandState): MultiwayHandState {
  const flop = playThroughStreet(state);
  expect(flop.street).toBe('flop');
  return playThroughStreet(flop);
}

describe('canonical clockwise ring — the named Aya/Bruce/Zane fixture (3.11E)', () => {
  it('attaches the role badges to their canonical players on the reported screen', () => {
    const game = sixHand();
    expect(game.buttonPlayerId).toBe('aya');
    expect(game.smallBlindPlayerId).toBe('bruce');
    expect(game.bigBlindPlayerId).toBe('zane');
    expect(multiwaySeatRoleBadge(game, 'aya')).toBe('D');
    expect(multiwaySeatRoleBadge(game, 'bruce')).toBe('SB');
    expect(multiwaySeatRoleBadge(game, 'zane')).toBe('BB');
  });

  it('starts preflop with the first live seat after the big blind and ends through Aya, Bruce, Zane', () => {
    const game = sixHand();
    // Ring: Aya (D) → Bruce (SB) → Zane (BB) → Mara → Kai → Iris. Preflop
    // traversal starts after the big blind and reaches the blinds last.
    expect(game.preflopActionOrder).toEqual(['mara', 'kai', 'iris', 'aya', 'bruce', 'zane']);
  });

  it('starts every post-flop street with the first live seat after the dealer: Bruce precedes Zane', () => {
    const game = sixHand();
    expect(game.postflopActionOrder).toEqual(['bruce', 'zane', 'mara', 'kai', 'iris', 'aya']);
    const turn = playToTurn(game);
    // The reported screen is legal: on the turn the first eligible seat
    // clockwise after Aya is Bruce, then Zane, then the rest, ending at Aya.
    expect(turn.street).toBe('turn');
    expect(turn.toAct).toBe('bruce');
    expect(turn.postflopActionOrder.indexOf('bruce')).toBeLessThan(turn.postflopActionOrder.indexOf('zane'));
  });

  it('skips folded seats and keeps the clockwise order intact', () => {
    let game = playThroughStreet(sixHand());
    expect(game.street).toBe('flop');
    // Bruce opens the betting; Zane calls, and the seats between the raiser
    // and the dealer fold in ring order.
    const legal = getMultiwayLegalActions(game, 'bruce');
    game = applyMultiwayAction(game, 'bruce', { type: 'raise', amount: legal.maxRaiseTo < 60 ? legal.maxRaiseTo : 60 });
    game = applyMultiwayAction(game, 'zane', { type: 'call' });
    game = applyMultiwayAction(game, 'mara', { type: 'fold' });
    game = applyMultiwayAction(game, 'kai', { type: 'fold' });
    game = applyMultiwayAction(game, 'iris', { type: 'fold' });
    game = applyMultiwayAction(game, 'aya', { type: 'call' });
    expect(game.street).toBe('turn');
    // The next street skips the folded seats entirely: Bruce still precedes
    // Zane, and neither Mara nor Kai can re-enter the ordering.
    expect(game.pending).toEqual(['bruce', 'zane', 'aya']);
    expect(game.pending.indexOf('bruce')).toBeLessThan(game.pending.indexOf('zane'));
  });

  it('reopens action clockwise immediately after a raiser and gives the blinds their response', () => {
    let game = playThroughStreet(sixHand());
    expect(game.street).toBe('flop');
    const legal = getMultiwayLegalActions(game, 'bruce');
    expect(legal.canRaise).toBe(true);
    game = applyMultiwayAction(game, 'bruce', { type: 'raise', amount: legal.maxRaiseTo < 120 ? legal.maxRaiseTo : 120 });
    // The next actor is the first eligible seat clockwise after the raiser.
    expect(game.toAct).toBe('zane');
    expect(game.pending).toContain('aya');
  });

  it('heads-up keeps the dealer first preflop and the big blind first post-flop', () => {
    const headsUp = createMultiwayHand({
      players: [player('aya', 'Aya', 0), player('bruce', 'Bruce', 1)],
      handNumber: 1,
      buttonSeat: 0,
      smallBlind: 10,
      bigBlind: 20,
    });
    expect(headsUp.preflopActionOrder).toEqual(['aya', 'bruce']);
    expect(headsUp.postflopActionOrder).toEqual(['bruce', 'aya']);
  });

  it('rotating the viewer to the hero seat never reverses the engine ring', () => {
    const seated = [player('hero', 'You', 0, 2_000), player('bruce', 'Bruce', 1), player('zane', 'Zane', 2), player('mara', 'Mara', 3), player('kai', 'Kai', 4), player('iris', 'Iris', 5)];
    const game = createMultiwayHand({
      players: seated.map((p) => ({ ...p, isHero: p.id === 'hero' })),
      handNumber: 4,
      buttonSeat: 0,
      smallBlind: 10,
      bigBlind: 20,
    });
    const placements = multiwaySeatPlacements(6, game.tablePlayerIds);
    // The placement map is a pure rotation of the canonical seat ring: each
    // anchor holds the next clockwise seat after the viewer — never a
    // reversal or scramble of the felt direction.
    const anchorRing = ['mid-left', 'top-left', 'top-center', 'top-right', 'mid-right'];
    expect(placements.map((placement) => placement.anchor)).toEqual([...anchorRing, 'hero']);
    expect(placements.at(-1)!.playerId).toBe('hero');
    // The clockwise seat order maps onto the clockwise anchor order.
    const seatOrder = game.tablePlayerIds.filter((playerId) => playerId !== 'hero');
    expect(placements.filter((placement) => placement.playerId !== 'hero').map((placement) => placement.playerId)).toEqual(seatOrder);
  });

  it('rotates the nine-seat map clockwise without reversing the ring', () => {
    const seated = [
      player('hero', 'You', 0),
      ...Array.from({ length: 8 }, (_, index) => player(`ai-${index + 1}`, `Seat ${index + 1}`, index + 1)),
    ];
    const game = createMultiwayHand({
      players: seated.map((p) => ({ ...p, isHero: p.id === 'hero' })),
      handNumber: 4,
      buttonSeat: 0,
      smallBlind: 10,
      bigBlind: 20,
    });
    const placements = multiwaySeatPlacements(9, game.tablePlayerIds);
    // The anchor list follows the clockwise screen sweep from the viewer: up
    // the left flank, across the top, down the right flank — never a zig-zag.
    const anchorRing = [
      'bottom-left', 'lower-left', 'upper-left', 'top-left',
      'top-right', 'upper-right', 'lower-right', 'bottom-right',
    ];
    expect(placements.filter((placement) => placement.playerId !== 'hero').map((placement) => placement.anchor))
      .toEqual(anchorRing);
    expect(placements.at(-1)!.playerId).toBe('hero');
  });

  it('a resumed (reconnected) tournament hand follows the same ring from its new button', () => {
    // The reconnect path: a completed HAND with the viewer still seated is
    // checkpointed, and the resumed hand must re-derive both orders from the
    // button that moved clockwise.
    const seated = [
      player('hero', 'You', 0),
      player('bruce', 'Bruce', 1),
      player('zane', 'Zane', 2),
      player('mara', 'Mara', 3),
      player('kai', 'Kai', 4),
      player('iris', 'Iris', 5),
    ];
    let current = createMultiwayHand({
      players: seated.map((p) => ({ ...p, isHero: p.id === 'hero' })),
      handNumber: 4,
      buttonSeat: 0,
      smallBlind: 10,
      bigBlind: 20,
    });
    for (let guard = 0; !current.outcome && guard < 30; guard += 1) {
      const playerId = current.toAct;
      if (!playerId) break;
      const legal = getMultiwayLegalActions(current, playerId);
      current = applyMultiwayAction(
        current,
        playerId,
        legal.canCheck ? { type: 'check' } : { type: 'fold' },
      );
    }
    expect(current.outcome).not.toBeNull();
    const checkpoint = createSitAndGoCheckpoint(current, 'club', 'standard');
    const resumed = resumeSitAndGo(checkpoint, Math.random, 'standard');
    // The button moved clockwise from the hero's seat; both orders restart
    // from that seat and keep Dealer → SB → BB → remaining → Dealer.
    expect(resumed.buttonPlayerId).toBe(seated[1]!.id);
    const expectedPostflop = [
      ...activePlayersClockwiseAfter(seated, resumed.buttonSeat).map((p) => p.id),
      resumed.buttonPlayerId,
    ];
    expect(resumed.postflopActionOrder).toEqual(expectedPostflop);
    const bigBlindSeat = seated.find((p) => p.id === resumed.bigBlindPlayerId)!.seat;
    // Preflop runs clockwise from the first live seat after the big blind and
    // closes on the big blind itself.
    const expectedPreflop = [
      ...activePlayersClockwiseAfter(seated, bigBlindSeat).map((p) => p.id),
      resumed.bigBlindPlayerId,
    ];
    expect(resumed.preflopActionOrder).toEqual(expectedPreflop);
  });
});
