import { createDeck, shuffle, type RandomSource } from './cards';
import type { Card, Street } from './types';

export const MIN_TABLE_PLAYERS = 2;
export const MAX_TABLE_PLAYERS = 6;
export const MAX_TABLE_SEATS = 6;

export type TablePosition = 'BTN/SB' | 'BTN' | 'SB' | 'BB' | 'UTG' | 'HJ' | 'CO';

export interface TablePlayerConfig {
  id: string;
  name: string;
  seat: number;
  stack: number;
  isHero?: boolean;
}

export interface MultiwayPlayerState extends TablePlayerConfig {
  holeCards: Card[];
  streetBet: number;
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
  position?: TablePosition;
}

export interface MultiwayHandState {
  handNumber: number;
  buttonSeat: number;
  buttonPlayerId: string;
  smallBlindPlayerId: string;
  bigBlindPlayerId: string;
  smallBlind: number;
  bigBlind: number;
  players: Record<string, MultiwayPlayerState>;
  /** Every occupied seat, including players who have no chips. */
  tablePlayerIds: string[];
  /** Players dealt into this hand, ordered clockwise from the button. */
  activePlayerIds: string[];
  /** Card recipients, beginning with the small blind. */
  dealOrder: string[];
  /** Initial action order, beginning after the big blind (the button heads-up). */
  preflopActionOrder: string[];
  /** Initial action order for every postflop street, beginning left of the button. */
  postflopActionOrder: string[];
  deck: Card[];
  board: Card[];
  street: Street;
  pot: number;
  currentBet: number;
  lastFullRaise: number;
  pending: string[];
  toAct: string | null;
}

export interface NewMultiwayHandOptions {
  players: TablePlayerConfig[];
  handNumber?: number;
  buttonSeat?: number;
  smallBlind?: number;
  bigBlind?: number;
  random?: RandomSource;
}

const positionsByPlayerCount: Record<number, TablePosition[]> = {
  2: ['BTN/SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
};

function assertInteger(value: number, label: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}.`);
  }
}

function validatePlayers(players: TablePlayerConfig[]): void {
  if (players.length < MIN_TABLE_PLAYERS || players.length > MAX_TABLE_PLAYERS) {
    throw new Error(`A RiverMind table must have ${MIN_TABLE_PLAYERS}–${MAX_TABLE_PLAYERS} occupied seats.`);
  }

  const ids = new Set<string>();
  const seats = new Set<number>();
  let activePlayers = 0;

  players.forEach((player) => {
    if (player.id.trim().length === 0) throw new Error('Every table player needs an id.');
    if (player.name.trim().length === 0) throw new Error('Every table player needs a name.');
    if (ids.has(player.id)) throw new Error(`Player id ${player.id} is duplicated.`);
    assertInteger(player.seat, 'Seat', 0);
    if (player.seat >= MAX_TABLE_SEATS) {
      throw new Error(`Seat ${player.seat} is outside the 0–${MAX_TABLE_SEATS - 1} table range.`);
    }
    if (seats.has(player.seat)) throw new Error(`Seat ${player.seat} is occupied twice.`);
    assertInteger(player.stack, 'Stack', 0);

    ids.add(player.id);
    seats.add(player.seat);
    if (player.stack > 0) activePlayers += 1;
  });

  if (activePlayers < MIN_TABLE_PLAYERS) {
    throw new Error('At least two players with chips are required to begin a hand.');
  }
}

function validateBlinds(smallBlind: number, bigBlind: number): void {
  assertInteger(smallBlind, 'Small blind', 1);
  assertInteger(bigBlind, 'Big blind', 1);
  if (smallBlind > bigBlind) throw new Error('The small blind cannot exceed the big blind.');
}

function bySeat(left: TablePlayerConfig, right: TablePlayerConfig): number {
  return left.seat - right.seat;
}

function distanceAfterSeat(seat: number, startSeat: number): number {
  const distance = (seat - startSeat + MAX_TABLE_SEATS) % MAX_TABLE_SEATS;
  return distance === 0 ? MAX_TABLE_SEATS : distance;
}

/** Returns dealt-in players clockwise after a seat, skipping empty and busted seats. */
export function activePlayersClockwiseAfter(
  players: TablePlayerConfig[],
  startSeat: number,
): TablePlayerConfig[] {
  return players
    .filter((player) => player.stack > 0 && player.seat !== startSeat)
    .sort((left, right) => distanceAfterSeat(left.seat, startSeat) - distanceAfterSeat(right.seat, startSeat));
}

function activePlayersFromButton(players: TablePlayerConfig[], buttonSeat: number): TablePlayerConfig[] {
  const button = players.find((player) => player.seat === buttonSeat && player.stack > 0);
  if (!button) throw new Error('The button must be assigned to a player with chips.');
  return [button, ...activePlayersClockwiseAfter(players, buttonSeat)];
}

function rotateToPlayer(players: TablePlayerConfig[], playerId: string): TablePlayerConfig[] {
  const index = players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new Error(`Player ${playerId} is not seated at this table.`);
  return [...players.slice(index), ...players.slice(0, index)];
}

function statePlayer(players: Record<string, MultiwayPlayerState>, playerId: string): MultiwayPlayerState {
  const player = players[playerId];
  if (!player) throw new Error(`Player ${playerId} is missing from the hand state.`);
  return player;
}

function postBlind(state: MultiwayHandState, playerId: string, amount: number): void {
  const player = statePlayer(state.players, playerId);
  const paid = Math.min(player.stack, amount);
  player.stack -= paid;
  player.streetBet += paid;
  player.totalCommitted += paid;
  player.allIn = player.stack === 0;
  state.pot += paid;
}

/** Finds the next live button without allowing a busted or empty seat to retain it. */
export function nextButtonSeat(players: TablePlayerConfig[], currentButtonSeat: number): number {
  validatePlayers(players);
  const next = activePlayersClockwiseAfter(players, currentButtonSeat)[0];
  if (!next) throw new Error('A next button could not be assigned.');
  return next.seat;
}

export function createMultiwayHand(options: NewMultiwayHandOptions): MultiwayHandState {
  validatePlayers(options.players);

  const smallBlind = options.smallBlind ?? 10;
  const bigBlind = options.bigBlind ?? 20;
  validateBlinds(smallBlind, bigBlind);

  const tablePlayers = [...options.players].sort(bySeat);
  const defaultButton = tablePlayers.find((player) => player.stack > 0);
  if (!defaultButton) throw new Error('A live button could not be assigned.');
  const buttonSeat = options.buttonSeat ?? defaultButton.seat;
  assertInteger(buttonSeat, 'Button seat', 0);
  if (buttonSeat >= MAX_TABLE_SEATS) {
    throw new Error(`Button seat ${buttonSeat} is outside the table range.`);
  }

  const activeFromButton = activePlayersFromButton(tablePlayers, buttonSeat);
  const buttonPlayer = activeFromButton[0];
  if (!buttonPlayer) throw new Error('A live button could not be assigned.');

  const smallBlindPlayer = activeFromButton.length === 2 ? buttonPlayer : activeFromButton[1];
  const bigBlindPlayer = activeFromButton.length === 2 ? activeFromButton[1] : activeFromButton[2];
  if (!smallBlindPlayer || !bigBlindPlayer) throw new Error('The blinds could not be assigned.');

  const positions = positionsByPlayerCount[activeFromButton.length];
  if (!positions) throw new Error('The table size does not have a position map.');

  const shuffled = shuffle(createDeck(), options.random ?? Math.random);
  const dealOrder = rotateToPlayer(activeFromButton, smallBlindPlayer.id);
  const holeCards = new Map<string, Card[]>(tablePlayers.map((player) => [player.id, []]));
  let cursor = 0;

  for (let round = 0; round < 2; round += 1) {
    dealOrder.forEach((player) => {
      const card = shuffled[cursor];
      const cards = holeCards.get(player.id);
      if (!card || !cards) throw new Error('The deck ran out while dealing hole cards.');
      cards.push(card);
      cursor += 1;
    });
  }

  const players: Record<string, MultiwayPlayerState> = {};
  tablePlayers.forEach((player) => {
    const activeIndex = activeFromButton.findIndex((activePlayer) => activePlayer.id === player.id);
    players[player.id] = {
      ...player,
      holeCards: [...(holeCards.get(player.id) ?? [])],
      streetBet: 0,
      totalCommitted: 0,
      folded: player.stack === 0,
      allIn: false,
      position: activeIndex >= 0 ? positions[activeIndex] : undefined,
    };
  });

  const preflopStart = activeFromButton.length === 2
    ? buttonPlayer.id
    : activePlayersClockwiseAfter(tablePlayers, bigBlindPlayer.seat)[0]?.id;
  if (!preflopStart) throw new Error('The first preflop player could not be assigned.');
  const preflopOrder = rotateToPlayer(activeFromButton, preflopStart);
  const postflopOrder = [...activePlayersClockwiseAfter(tablePlayers, buttonSeat), buttonPlayer];

  const state: MultiwayHandState = {
    handNumber: options.handNumber ?? 1,
    buttonSeat,
    buttonPlayerId: buttonPlayer.id,
    smallBlindPlayerId: smallBlindPlayer.id,
    bigBlindPlayerId: bigBlindPlayer.id,
    smallBlind,
    bigBlind,
    players,
    tablePlayerIds: tablePlayers.map((player) => player.id),
    activePlayerIds: activeFromButton.map((player) => player.id),
    dealOrder: dealOrder.map((player) => player.id),
    preflopActionOrder: preflopOrder.map((player) => player.id),
    postflopActionOrder: postflopOrder.map((player) => player.id),
    deck: shuffled.slice(cursor),
    board: [],
    street: 'preflop',
    pot: 0,
    currentBet: bigBlind,
    lastFullRaise: bigBlind,
    pending: [],
    toAct: null,
  };

  postBlind(state, smallBlindPlayer.id, smallBlind);
  postBlind(state, bigBlindPlayer.id, bigBlind);
  state.pending = state.preflopActionOrder.filter((playerId) => !statePlayer(state.players, playerId).allIn);
  state.toAct = state.pending[0] ?? null;
  return state;
}
