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
import { resolveMeasuredTableLayout } from '../../../features/table/multiwayTableLayout';
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

/** A nine-seat table with the hero rotated to `heroSeat`, button at `buttonSeat`. */
function nineSeatHand(heroSeat: number, buttonSeat: number): MultiwayHandState {
  const seated = Array.from({ length: 9 }, (_, seat) =>
    player(seat === heroSeat ? 'hero' : `seat-${seat}`, `Seat ${seat}`, seat),
  );
  return createMultiwayHand({
    players: seated.map((p) => ({ ...p, isHero: p.id === 'hero' })),
    handNumber: 4,
    buttonSeat,
    smallBlind: 10,
    bigBlind: 20,
  });
}

/** The clockwise ring of anchors ordered from the viewer's (bottom-center) seat. */
function clockwiseRing(seatCount: number): string[] {
  const opponents = seatCount === 3
    ? ['top-left', 'top-right']
    : seatCount === 6
      ? ['mid-left', 'top-left', 'top-center', 'top-right', 'mid-right']
      : ['bottom-left', 'lower-left', 'upper-left', 'top-left', 'top-right', 'upper-right', 'lower-right', 'bottom-right'];
  return ['hero', ...opponents];
}

/** Normalized clockwise angle of a point around a centre (screen y-down). */
function clockAngle(x: number, y: number, centreX: number, centreY: number): number {
  const dx = x - centreX;
  const dy = y - centreY;
  return (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
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

  // DT-05: the reported screen must project Dealer → SB → BB clockwise. The
  // engine ring is correct, so these fixtures prove the VIEWER-RELATIVE
  // rotation and presentation mapping never scramble or reverse it, including
  // when the hero is NOT the first table seat (a rotated hero seat).
  it('projects Dealer → SB → BB clockwise from a rotated hero seat on nine seats (DT-05)', () => {
    // Hero at seat 4: the seat-sorted table order no longer starts clockwise
    // from the viewer, so a naive mapping would reverse the felt direction.
    // The button (seat 5) is the first seat clockwise after the hero; SB (6)
    // and BB (7) follow in turn.
    const game = nineSeatHand(4, 5);
    expect(game.buttonPlayerId).toBe('seat-5');
    expect(game.smallBlindPlayerId).toBe('seat-6');
    expect(game.bigBlindPlayerId).toBe('seat-7');

    const placements = multiwaySeatPlacements(9, game.tablePlayerIds);
    const ring = clockwiseRing(9);
    const indexByPlayer = Object.fromEntries(placements.map((p) => [p.playerId, ring.indexOf(p.anchor)]));
    const dealer = indexByPlayer[game.buttonPlayerId]!;
    const small = indexByPlayer[game.smallBlindPlayerId]!;
    const big = indexByPlayer[game.bigBlindPlayerId]!;
    // D → SB → BB occupy consecutive clockwise ring slots (never a reversal).
    expect(small).toBe((dealer + 1) % 9);
    expect(big).toBe((small + 1) % 9);
    // The first clockwise seat after the hero holds the player the engine also
    // places first clockwise after the hero's seat.
    expect(placements.find((p) => p.anchor === 'bottom-left')!.playerId).toBe('seat-5');
    // Both street orders traverse the ring clockwise and close on the blinds.
    expect(game.preflopActionOrder).toEqual([
      'seat-8', 'seat-0', 'seat-1', 'seat-2', 'seat-3', 'hero', 'seat-5', 'seat-6', 'seat-7',
    ]);
    expect(game.postflopActionOrder).toEqual([
      'seat-6', 'seat-7', 'seat-8', 'seat-0', 'seat-1', 'seat-2', 'seat-3', 'hero', 'seat-5',
    ]);
  });

  it('keeps Dealer → SB → BB clockwise as the dealer rotates through every seat (DT-05)', () => {
    for (let buttonSeat = 0; buttonSeat < 9; buttonSeat += 1) {
      const game = nineSeatHand(4, buttonSeat);
      const placements = multiwaySeatPlacements(9, game.tablePlayerIds);
      const ring = clockwiseRing(9);
      const indexByPlayer = Object.fromEntries(placements.map((p) => [p.playerId, ring.indexOf(p.anchor)]));
      const dealer = indexByPlayer[game.buttonPlayerId]!;
      const small = indexByPlayer[game.smallBlindPlayerId]!;
      const big = indexByPlayer[game.bigBlindPlayerId]!;
      // Wraparound: the three forced roles stay consecutive clockwise even when
      // the button crosses the hero or the seat zero boundary.
      expect(small, `button ${buttonSeat}`).toBe((dealer + 1) % 9);
      expect(big, `button ${buttonSeat}`).toBe((small + 1) % 9);
    }
  });

  it('runs the same clockwise contract on three-, six- and heads-up tables (DT-05)', () => {
    // Six seats, hero rotated to seat 2, button at seat 3.
    const sixSeated = Array.from({ length: 6 }, (_, seat) =>
      player(seat === 2 ? 'hero' : `seat-${seat}`, `Seat ${seat}`, seat),
    );
    const six = createMultiwayHand({
      players: sixSeated.map((p) => ({ ...p, isHero: p.id === 'hero' })),
      handNumber: 4,
      buttonSeat: 3,
      smallBlind: 10,
      bigBlind: 20,
    });
    const sixRing = clockwiseRing(6);
    const sixPlacements = multiwaySeatPlacements(6, six.tablePlayerIds);
    const sixIndex = Object.fromEntries(sixPlacements.map((p) => [p.playerId, sixRing.indexOf(p.anchor)]));
    expect(sixIndex[six.smallBlindPlayerId]).toBe((sixIndex[six.buttonPlayerId]! + 1) % 6);
    expect(sixIndex[six.bigBlindPlayerId]).toBe((sixIndex[six.smallBlindPlayerId]! + 1) % 6);

    // Three seats, hero rotated to seat 1, button at seat 2.
    const threeSeated = Array.from({ length: 3 }, (_, seat) =>
      player(seat === 1 ? 'hero' : `seat-${seat}`, `Seat ${seat}`, seat),
    );
    const three = createMultiwayHand({
      players: threeSeated.map((p) => ({ ...p, isHero: p.id === 'hero' })),
      handNumber: 4,
      buttonSeat: 2,
      smallBlind: 10,
      bigBlind: 20,
    });
    const threeRing = clockwiseRing(3);
    const threePlacements = multiwaySeatPlacements(3, three.tablePlayerIds);
    const threeIndex = Object.fromEntries(threePlacements.map((p) => [p.playerId, threeRing.indexOf(p.anchor)]));
    expect(threeIndex[three.smallBlindPlayerId]).toBe((threeIndex[three.buttonPlayerId]! + 1) % 3);
    expect(threeIndex[three.bigBlindPlayerId]).toBe((threeIndex[three.smallBlindPlayerId]! + 1) % 3);

    // Heads-up keeps dealer-first preflop and big-blind-first post-flop.
    const headsUp = createMultiwayHand({
      players: [
        player('hero', 'You', 0, 2_000),
        player('aaron', 'Aaron', 1, 2_000),
      ].map((p) => ({ ...p, isHero: p.id === 'hero' })),
      handNumber: 1,
      buttonSeat: 0,
      smallBlind: 10,
      bigBlind: 20,
    });
    expect(headsUp.preflopActionOrder).toEqual(['hero', 'aaron']);
    expect(headsUp.postflopActionOrder).toEqual(['aaron', 'hero']);
    expect(multiwaySeatRoleBadge(headsUp, 'hero')).toBe('D');
  });

  it('renders the role plaques in clockwise screen order, not just an array (DT-05)', () => {
    // Place the plaques using the measured resolver, then assert that the
    // Dealer / SB / BB plaques sweep clockwise around the felt pane in actual
    // screen coordinates — not merely that an array is named "clockwise".
    const game = nineSeatHand(4, 5);
    const layout = resolveMeasuredTableLayout({
      activityFeedMode: 'inline',
      contentHeight: 852,
      contentWidth: 393,
      insets: { bottom: 34, left: 0, right: 0, top: 59 },
      orientation: 'portrait',
      seatCount: 9,
      surface: 'live',
      textScale: 1,
    });
    const placements = multiwaySeatPlacements(9, game.tablePlayerIds);
    const board = layout.boardRect!;
    const centreX = (board.left + board.right) / 2;
    const centreY = (board.top + board.bottom) / 2;
    const plaqueRect: Record<string, { left: number; right: number; top: number; bottom: number }> = {};
    for (const placement of placements) {
      const seat = layout.seats.find((candidate) => candidate.anchor === placement.anchor)!;
      plaqueRect[placement.playerId] = {
        left: seat.x,
        right: seat.x + seat.width,
        top: seat.y,
        bottom: seat.y + seat.height,
      };
    }
    // Sort every plaque by its swept clockwise angle around the felt centre.
    const swept = placements
      .map((placement) => {
        const rect = plaqueRect[placement.playerId]!;
        return {
          playerId: placement.playerId,
          angle: clockAngle((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2, centreX, centreY),
        };
      })
      .sort((left, right) => left.angle - right.angle);
    // Rotate the sweep so it starts at the hero (bottom-centre), then assert it
    // matches the placement map's clockwise ring exactly. A scrambled or
    // reversed engine/render link would fail this screen-coordinate sweep even
    // though the array is called "clockwise".
    const heroIndex = swept.findIndex((entry) => entry.playerId === 'hero');
    const sweptFromHero = [...swept.slice(heroIndex), ...swept.slice(0, heroIndex)].map((entry) => entry.playerId);
    // The engine's authoritative clockwise-from-hero order, keyed by real seat.
    const heroSeat = game.players['hero']!.seat;
    const seatToId = Object.fromEntries(game.tablePlayerIds.map((id) => [game.players[id]!.seat, id]));
    const engineFromHero = [
      'hero',
      ...Array.from({ length: 9 - 1 }, (_, offset) => seatToId[(heroSeat + 1 + offset) % 9]!),
    ];
    expect(sweptFromHero).toEqual(engineFromHero);
  });
});
