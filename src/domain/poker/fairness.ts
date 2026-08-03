import type { MultiwayHandState } from './multiway';
import type { GameState, PlayerId } from './types';

declare const fairHeadsUpBrand: unique symbol;
declare const fairMultiwayBrand: unique symbol;

/** A decision state containing only the viewer's cards and public table information. */
export type FairHeadsUpDecisionState = GameState & { readonly [fairHeadsUpBrand]: true };
export type FairMultiwayDecisionState = MultiwayHandState & { readonly [fairMultiwayBrand]: true };

export function createFairHeadsUpDecisionState(
  state: GameState,
  viewerId: PlayerId,
): FairHeadsUpDecisionState {
  const otherId: PlayerId = viewerId === 'hero' ? 'villain' : 'hero';
  if (state.players[viewerId].holeCards.length !== 2) {
    throw new Error(`Player ${viewerId} does not have a private two-card hand.`);
  }
  return {
    ...state,
    players: {
      [viewerId]: {
        ...state.players[viewerId],
        holeCards: [...state.players[viewerId].holeCards],
      },
      [otherId]: {
        ...state.players[otherId],
        holeCards: [],
      },
    } as GameState['players'],
    deck: [],
    board: [...state.board],
    pending: [...state.pending],
    history: state.history.map((entry) => ({
      ...entry,
      decisionContext: {
        ...entry.decisionContext,
        board: [...entry.decisionContext.board],
        legalActions: { ...entry.decisionContext.legalActions },
      },
    })),
    outcome: undefined,
  } as unknown as FairHeadsUpDecisionState;
}

export function createFairMultiwayDecisionState(
  state: MultiwayHandState,
  viewerId: string,
): FairMultiwayDecisionState {
  const viewer = state.players[viewerId];
  if (!viewer || viewer.holeCards.length !== 2) {
    throw new Error(`Player ${viewerId} does not have a private two-card hand.`);
  }
  const players = Object.fromEntries(state.tablePlayerIds.map((playerId) => {
    const player = state.players[playerId];
    if (!player) throw new Error(`Player ${playerId} is missing from the hand state.`);
    return [playerId, {
      ...player,
      holeCards: playerId === viewerId ? [...player.holeCards] : [],
    }];
  }));
  return {
    ...state,
    players,
    tablePlayerIds: [...state.tablePlayerIds],
    activePlayerIds: [...state.activePlayerIds],
    dealOrder: [...state.dealOrder],
    preflopActionOrder: [...state.preflopActionOrder],
    postflopActionOrder: [...state.postflopActionOrder],
    deck: [],
    board: [...state.board],
    actedAtBet: { ...state.actedAtBet },
    pending: [...state.pending],
    history: state.history.map((entry) => ({
      ...entry,
      decisionContext: entry.decisionContext ? {
        ...entry.decisionContext,
        board: [...entry.decisionContext.board],
        legalActions: { ...entry.decisionContext.legalActions },
      } : undefined,
    })),
    outcome: undefined,
  } as unknown as FairMultiwayDecisionState;
}
