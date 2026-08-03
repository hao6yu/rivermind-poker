import { createDeck, shuffle, type RandomSource } from './cards';
import { compareHandValues, describeHand, evaluateBest } from './evaluator';
import type { ActionType, Card, LegalActions, PlayerAction, Street } from './types';

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

export interface MultiwayLegalActions extends LegalActions {
  /** Whether action has reopened for a player who already acted this street. */
  raiseReopened: boolean;
}

export interface MultiwayActionRecord {
  playerId: string;
  type: ActionType;
  /** Actual chips paid for calls; target street contribution for raises. */
  amount: number;
  street: Street;
  potAfter: number;
  /** Public information captured immediately before the action for replay and coaching. */
  decisionContext?: MultiwayDecisionContext;
}

export interface MultiwayDecisionContext {
  board: Card[];
  potBefore: number;
  currentBet: number;
  toCall: number;
  playerStackBefore: number;
  playerStreetBetBefore: number;
  effectiveStack: number;
  legalActions: MultiwayLegalActions;
  opponentCount: number;
  playersBehind: number;
  playerCount: number;
  position?: TablePosition;
  initiative: 'player' | 'opponent' | 'none';
  preflopFacing: 'unopened' | 'limped' | 'raised';
  limperCount: number;
  /** Optional additions keep older persisted hands replayable. */
  preflopRaiseCount?: number;
  preflopRaiserPosition?: TablePosition;
  preflopCallersAfterRaise?: number;
  /** Exact public-range estimate displayed to the player before this action. */
  estimatedEquity?: number;
}

export interface MultiwayActionMetadata {
  estimatedEquity?: number;
}

export interface MultiwayPot {
  amount: number;
  contributionCap: number;
  eligiblePlayerIds: string[];
  kind: 'main' | 'side';
}

export interface MultiwayPotAward extends MultiwayPot {
  shares: Record<string, number>;
  winnerPlayerIds: string[];
}

export interface MultiwayHandOutcome {
  awards: MultiwayPotAward[];
  handDescriptions?: Record<string, string>;
  showdown: boolean;
  totalPot: number;
  winnerPlayerIds: string[];
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
  /** The wager level each player last acted at; null means they have not acted this street. */
  actedAtBet: Record<string, number | null>;
  pending: string[];
  toAct: string | null;
  history: MultiwayActionRecord[];
  outcome?: MultiwayHandOutcome;
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

function commitChips(state: MultiwayHandState, player: MultiwayPlayerState, amount: number): number {
  const paid = Math.min(player.stack, amount);
  player.stack -= paid;
  player.streetBet += paid;
  player.totalCommitted += paid;
  player.allIn = player.stack === 0;
  state.pot += paid;
  return paid;
}

function postBlind(state: MultiwayHandState, playerId: string, amount: number): void {
  commitChips(state, statePlayer(state.players, playerId), amount);
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
    actedAtBet: Object.fromEntries(activeFromButton.map((player) => [player.id, null])),
    pending: [],
    toAct: null,
    history: [],
  };

  postBlind(state, smallBlindPlayer.id, smallBlind);
  postBlind(state, bigBlindPlayer.id, bigBlind);
  state.pending = state.preflopActionOrder.filter((playerId) => !statePlayer(state.players, playerId).allIn);
  prunePending(state);
  state.toAct = state.pending[0] ?? null;
  return state.toAct === null ? advanceBettingRound(state) : state;
}

function cloneOutcome(outcome: MultiwayHandOutcome | undefined): MultiwayHandOutcome | undefined {
  if (!outcome) return undefined;
  return {
    ...outcome,
    awards: outcome.awards.map((award) => ({
      ...award,
      eligiblePlayerIds: [...award.eligiblePlayerIds],
      winnerPlayerIds: [...award.winnerPlayerIds],
      shares: { ...award.shares },
    })),
    handDescriptions: outcome.handDescriptions ? { ...outcome.handDescriptions } : undefined,
    winnerPlayerIds: [...outcome.winnerPlayerIds],
  };
}

function cloneState(state: MultiwayHandState): MultiwayHandState {
  const players: Record<string, MultiwayPlayerState> = {};
  Object.entries(state.players).forEach(([playerId, player]) => {
    players[playerId] = { ...player, holeCards: [...player.holeCards] };
  });

  return {
    ...state,
    players,
    tablePlayerIds: [...state.tablePlayerIds],
    activePlayerIds: [...state.activePlayerIds],
    dealOrder: [...state.dealOrder],
    preflopActionOrder: [...state.preflopActionOrder],
    postflopActionOrder: [...state.postflopActionOrder],
    deck: [...state.deck],
    board: [...state.board],
    actedAtBet: { ...state.actedAtBet },
    pending: [...state.pending],
    history: state.history.map((record) => ({
      ...record,
      decisionContext: record.decisionContext ? {
        ...record.decisionContext,
        board: [...record.decisionContext.board],
        legalActions: { ...record.decisionContext.legalActions },
      } : undefined,
    })),
    outcome: cloneOutcome(state.outcome),
  };
}

function handPlayerIdsClockwiseAfter(state: MultiwayHandState, startSeat: number): string[] {
  return state.activePlayerIds
    .map((playerId) => statePlayer(state.players, playerId))
    .filter((player) => player.seat !== startSeat)
    .sort((left, right) => distanceAfterSeat(left.seat, startSeat) - distanceAfterSeat(right.seat, startSeat))
    .map((player) => player.id);
}

function nonFoldedPlayerIds(state: MultiwayHandState): string[] {
  return state.activePlayerIds.filter((playerId) => !statePlayer(state.players, playerId).folded);
}

function actionCapablePlayerIds(state: MultiwayHandState): string[] {
  return nonFoldedPlayerIds(state).filter((playerId) => !statePlayer(state.players, playerId).allIn);
}

function playerStillNeedsAction(state: MultiwayHandState, playerId: string): boolean {
  const player = statePlayer(state.players, playerId);
  if (player.folded || player.allIn) return false;
  const owesChips = state.currentBet > player.streetBet;
  const opponentCanAct = nonFoldedPlayerIds(state).some((opponentId) => (
    opponentId !== playerId && !statePlayer(state.players, opponentId).allIn
  ));
  return owesChips || opponentCanAct;
}

function prunePending(state: MultiwayHandState): void {
  state.pending = state.pending.filter((playerId) => playerStillNeedsAction(state, playerId));
}

function addHistory(
  state: MultiwayHandState,
  playerId: string,
  type: ActionType,
  amount: number,
  decisionContext: MultiwayDecisionContext,
): void {
  state.history.push({ playerId, type, amount, street: state.street, potAfter: state.pot, decisionContext });
}

function multiwayDecisionContext(
  state: MultiwayHandState,
  playerId: string,
  legal: MultiwayLegalActions,
  metadata?: MultiwayActionMetadata,
): MultiwayDecisionContext {
  const player = statePlayer(state.players, playerId);
  const opponentIds = state.activePlayerIds.filter((opponentId) => (
    opponentId !== playerId && !statePlayer(state.players, opponentId).folded
  ));
  const deepestOpponentStack = Math.max(
    state.bigBlind,
    ...opponentIds.map((opponentId) => statePlayer(state.players, opponentId).stack),
  );
  const actorIndex = state.pending.indexOf(playerId);
  const playersBehind = actorIndex < 0 ? 0 : state.pending.slice(actorIndex + 1).filter((pendingId) => {
    const pendingPlayer = statePlayer(state.players, pendingId);
    return !pendingPlayer.folded && !pendingPlayer.allIn;
  }).length;
  const lastAggressor = [...state.history].reverse().find((record) => record.type === 'raise');
  const initiative = state.currentBet > player.streetBet
    ? 'opponent'
    : lastAggressor?.playerId === playerId ? 'player' : lastAggressor ? 'opponent' : 'none';
  const limperCount = state.history.filter((record) => (
    record.street === 'preflop' && record.type === 'call'
  )).length;
  const preflopRaises = state.history.filter((record) => (
    record.street === 'preflop' && record.type === 'raise'
  ));
  const latestPreflopRaise = preflopRaises.at(-1);
  const latestPreflopRaiseIndex = latestPreflopRaise ? state.history.lastIndexOf(latestPreflopRaise) : -1;
  const preflopCallersAfterRaise = latestPreflopRaiseIndex < 0 ? 0 : state.history.slice(latestPreflopRaiseIndex + 1)
    .filter((record) => record.street === 'preflop' && record.type === 'call').length;
  const preflopFacing = state.currentBet > state.bigBlind
    ? 'raised'
    : limperCount > 0 ? 'limped' : 'unopened';

  return {
    board: [...state.board],
    potBefore: state.pot,
    currentBet: state.currentBet,
    toCall: legal.toCall,
    playerStackBefore: player.stack,
    playerStreetBetBefore: player.streetBet,
    effectiveStack: Math.min(player.stack, deepestOpponentStack),
    legalActions: { ...legal },
    opponentCount: opponentIds.length,
    playersBehind,
    playerCount: state.activePlayerIds.length,
    position: player.position,
    initiative,
    preflopFacing,
    limperCount,
    preflopRaiseCount: preflopRaises.length,
    preflopRaiserPosition: latestPreflopRaise
      ? statePlayer(state.players, latestPreflopRaise.playerId).position
      : undefined,
    preflopCallersAfterRaise,
    estimatedEquity: Number.isFinite(metadata?.estimatedEquity) ? metadata?.estimatedEquity : undefined,
  };
}

function dealNextStreet(state: MultiwayHandState): void {
  const burn = state.deck[0];
  if (!burn) throw new Error('The deck ran out before the burn card.');
  state.deck = state.deck.slice(1);

  const cardCount = state.street === 'preflop' ? 3 : 1;
  const cards = state.deck.slice(0, cardCount);
  if (cards.length !== cardCount) throw new Error('The deck ran out while dealing the board.');
  state.deck = state.deck.slice(cardCount);
  state.board.push(...cards);
  state.street = state.street === 'preflop' ? 'flop' : state.street === 'flop' ? 'turn' : 'river';
}

function resetStreetState(state: MultiwayHandState): void {
  state.activePlayerIds.forEach((playerId) => {
    statePlayer(state.players, playerId).streetBet = 0;
    state.actedAtBet[playerId] = null;
  });
  state.currentBet = 0;
  state.lastFullRaise = state.bigBlind;
}

/** Builds contribution layers. Folded chips remain in pots but folded players are never eligible. */
export function buildMultiwayPots(state: MultiwayHandState): MultiwayPot[] {
  const contributionLevels = [...new Set(state.activePlayerIds
    .map((playerId) => statePlayer(state.players, playerId).totalCommitted)
    .filter((amount) => amount > 0))]
    .sort((left, right) => left - right);
  const pots: MultiwayPot[] = [];
  let previousLevel = 0;

  contributionLevels.forEach((level) => {
    const contributorIds = state.activePlayerIds.filter(
      (playerId) => statePlayer(state.players, playerId).totalCommitted >= level,
    );
    const amount = (level - previousLevel) * contributorIds.length;
    const eligiblePlayerIds = contributorIds.filter(
      (playerId) => !statePlayer(state.players, playerId).folded,
    );
    if (amount > 0) {
      if (eligiblePlayerIds.length === 0) throw new Error('A pot has no eligible player.');
      pots.push({
        amount,
        contributionCap: level,
        eligiblePlayerIds,
        kind: pots.length === 0 ? 'main' : 'side',
      });
    }
    previousLevel = level;
  });

  return pots;
}

function oddChipOrder(state: MultiwayHandState, winnerPlayerIds: string[]): string[] {
  const winners = new Set(winnerPlayerIds);
  const clockwise = handPlayerIdsClockwiseAfter(state, state.buttonSeat);
  if (state.activePlayerIds.includes(state.buttonPlayerId)) clockwise.push(state.buttonPlayerId);
  return clockwise.filter((playerId) => winners.has(playerId));
}

function awardShowdownPot(
  state: MultiwayHandState,
  pot: MultiwayPot,
  handValues: Record<string, ReturnType<typeof evaluateBest>>,
): MultiwayPotAward {
  const firstEligible = pot.eligiblePlayerIds[0];
  if (!firstEligible) throw new Error('A showdown pot has no eligible player.');
  let winnerPlayerIds = [firstEligible];

  pot.eligiblePlayerIds.slice(1).forEach((playerId) => {
    const candidate = handValues[playerId];
    const currentBest = handValues[winnerPlayerIds[0] ?? ''];
    if (!candidate || !currentBest) throw new Error('A showdown hand could not be evaluated.');
    const comparison = compareHandValues(candidate, currentBest);
    if (comparison > 0) winnerPlayerIds = [playerId];
    else if (comparison === 0) winnerPlayerIds.push(playerId);
  });

  const shares: Record<string, number> = {};
  const baseShare = Math.floor(pot.amount / winnerPlayerIds.length);
  winnerPlayerIds.forEach((playerId) => {
    shares[playerId] = baseShare;
  });

  let oddChips = pot.amount - baseShare * winnerPlayerIds.length;
  const priority = oddChipOrder(state, winnerPlayerIds);
  for (let index = 0; oddChips > 0; index += 1) {
    const playerId = priority[index % priority.length];
    if (!playerId) throw new Error('An odd chip could not be assigned.');
    shares[playerId] = (shares[playerId] ?? 0) + 1;
    oddChips -= 1;
  }

  Object.entries(shares).forEach(([playerId, amount]) => {
    statePlayer(state.players, playerId).stack += amount;
  });

  return { ...pot, shares, winnerPlayerIds };
}

function resolveShowdown(state: MultiwayHandState): MultiwayHandState {
  if (state.board.length !== 5) throw new Error('A showdown requires five community cards.');
  const contenderIds = nonFoldedPlayerIds(state);
  if (contenderIds.length < 2) throw new Error('A showdown requires at least two players.');

  const handValues: Record<string, ReturnType<typeof evaluateBest>> = {};
  const handDescriptions: Record<string, string> = {};
  contenderIds.forEach((playerId) => {
    const value = evaluateBest([...statePlayer(state.players, playerId).holeCards, ...state.board]);
    handValues[playerId] = value;
    handDescriptions[playerId] = describeHand(value);
  });

  const pots = buildMultiwayPots(state);
  const contributionTotal = pots.reduce((total, pot) => total + pot.amount, 0);
  if (contributionTotal !== state.pot) {
    throw new Error(`Pot contributions (${contributionTotal}) do not match the table pot (${state.pot}).`);
  }

  const totalPot = state.pot;
  const awards = pots.map((pot) => awardShowdownPot(state, pot, handValues));
  const winnerPlayerIds = [...new Set(awards.flatMap((award) => award.winnerPlayerIds))];
  state.pot = 0;
  state.street = 'complete';
  state.pending = [];
  state.toAct = null;
  state.outcome = { awards, handDescriptions, showdown: true, totalPot, winnerPlayerIds };
  return state;
}

function settleFold(state: MultiwayHandState): MultiwayHandState {
  const winnerPlayerIds = nonFoldedPlayerIds(state);
  const winnerPlayerId = winnerPlayerIds[0];
  if (winnerPlayerIds.length !== 1 || !winnerPlayerId) {
    throw new Error('A folded hand must leave exactly one winner.');
  }

  const totalPot = state.pot;
  statePlayer(state.players, winnerPlayerId).stack += totalPot;
  const contributionCap = Math.max(
    ...state.activePlayerIds.map((playerId) => statePlayer(state.players, playerId).totalCommitted),
  );
  const award: MultiwayPotAward = {
    amount: totalPot,
    contributionCap,
    eligiblePlayerIds: [winnerPlayerId],
    kind: 'main',
    shares: { [winnerPlayerId]: totalPot },
    winnerPlayerIds: [winnerPlayerId],
  };
  state.pot = 0;
  state.street = 'complete';
  state.pending = [];
  state.toAct = null;
  state.outcome = { awards: [award], showdown: false, totalPot, winnerPlayerIds };
  return state;
}

function advanceBettingRound(state: MultiwayHandState): MultiwayHandState {
  resetStreetState(state);
  if (state.street === 'river') return resolveShowdown(state);

  dealNextStreet(state);
  if (actionCapablePlayerIds(state).length <= 1) {
    while (state.board.length < 5) dealNextStreet(state);
    return resolveShowdown(state);
  }

  state.pending = state.postflopActionOrder.filter((playerId) => {
    const player = statePlayer(state.players, playerId);
    return !player.folded && !player.allIn;
  });
  prunePending(state);
  state.toAct = state.pending[0] ?? null;
  if (state.toAct === null) {
    while (state.board.length < 5) dealNextStreet(state);
    return resolveShowdown(state);
  }
  return state;
}

function unavailableMultiwayActions(): MultiwayLegalActions {
  return {
    canFold: false,
    canCheck: false,
    canCall: false,
    canRaise: false,
    toCall: 0,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    suggestedRaiseTo: 0,
    raiseReopened: false,
  };
}

export function getMultiwayLegalActions(
  state: MultiwayHandState,
  playerId: string,
): MultiwayLegalActions {
  if (state.street === 'complete' || state.toAct !== playerId) return unavailableMultiwayActions();
  const player = state.players[playerId];
  if (!player || player.folded || player.allIn) return unavailableMultiwayActions();

  const fullAmountToCall = Math.max(0, state.currentBet - player.streetBet);
  const maxRaiseTo = player.streetBet + player.stack;
  const minimumFullRaiseTo = state.currentBet === 0
    ? state.bigBlind
    : state.currentBet < state.bigBlind
      ? state.bigBlind
      : state.currentBet + state.lastFullRaise;
  const minRaiseTo = Math.min(maxRaiseTo, minimumFullRaiseTo);
  const lastActedAt = state.actedAtBet[playerId] ?? null;
  const raiseReopened = lastActedAt === null
    || (lastActedAt === 0 && state.currentBet > 0)
    || state.currentBet - lastActedAt >= state.lastFullRaise;
  const opponentCanAct = nonFoldedPlayerIds(state).some((opponentId) => (
    opponentId !== playerId && !statePlayer(state.players, opponentId).allIn
  ));
  const canRaise = raiseReopened
    && opponentCanAct
    && player.stack > fullAmountToCall
    && maxRaiseTo > state.currentBet;
  const baseSuggestion = state.currentBet === 0
    ? Math.max(state.bigBlind, Math.round(state.pot * 0.66))
    : Math.round(Math.max(minimumFullRaiseTo, state.currentBet * (state.street === 'preflop' ? 2.5 : 2.2)));
  const suggestedRaiseTo = canRaise
    ? Math.max(minRaiseTo, Math.min(maxRaiseTo, baseSuggestion))
    : 0;

  return {
    canFold: fullAmountToCall > 0,
    canCheck: fullAmountToCall === 0,
    canCall: fullAmountToCall > 0 && player.stack > 0,
    canRaise,
    toCall: Math.min(fullAmountToCall, player.stack),
    minRaiseTo,
    maxRaiseTo,
    suggestedRaiseTo,
    raiseReopened,
  };
}

function normalizeRaiseTarget(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Raise amount must be a finite number.');
  return Math.max(0, Math.round(value));
}

function finishAction(state: MultiwayHandState): MultiwayHandState {
  if (nonFoldedPlayerIds(state).length === 1) return settleFold(state);
  prunePending(state);
  if (state.pending.length === 0) return advanceBettingRound(state);
  state.toAct = state.pending[0] ?? null;
  return state;
}

export function applyMultiwayAction(
  state: MultiwayHandState,
  playerId: string,
  action: PlayerAction,
  metadata?: MultiwayActionMetadata,
): MultiwayHandState {
  if (state.toAct !== playerId) throw new Error(`It is not ${playerId}'s turn.`);
  const legal = getMultiwayLegalActions(state, playerId);
  const decisionContext = multiwayDecisionContext(state, playerId, legal, metadata);
  const next = cloneState(state);
  const player = statePlayer(next.players, playerId);

  if (action.type === 'fold') {
    if (!legal.canFold) throw new Error('Folding is not legal when checking is available.');
    player.folded = true;
    next.actedAtBet[playerId] = player.streetBet;
    next.pending = next.pending.filter((pendingId) => pendingId !== playerId);
    addHistory(next, playerId, 'fold', 0, decisionContext);
    return finishAction(next);
  }

  if (action.type === 'check') {
    if (!legal.canCheck) throw new Error('Checking is not available while facing a bet.');
    next.actedAtBet[playerId] = player.streetBet;
    next.pending = next.pending.filter((pendingId) => pendingId !== playerId);
    addHistory(next, playerId, 'check', 0, decisionContext);
    return finishAction(next);
  }

  if (action.type === 'call') {
    if (!legal.canCall) throw new Error('There is no wager to call.');
    const paid = commitChips(next, player, legal.toCall);
    next.actedAtBet[playerId] = player.streetBet;
    next.pending = next.pending.filter((pendingId) => pendingId !== playerId);
    addHistory(next, playerId, 'call', paid, decisionContext);
    return finishAction(next);
  }

  if (!legal.canRaise) throw new Error('Raising is not available.');
  const target = normalizeRaiseTarget(action.amount ?? legal.suggestedRaiseTo);
  if (target <= next.currentBet || target > legal.maxRaiseTo) {
    throw new Error('Raise target is outside the legal range.');
  }
  if (target < legal.minRaiseTo && target !== legal.maxRaiseTo) {
    throw new Error('Raise target is below the minimum raise.');
  }

  const raiseIncrement = target - next.currentBet;
  commitChips(next, player, target - player.streetBet);
  if (raiseIncrement >= next.lastFullRaise) next.lastFullRaise = raiseIncrement;
  next.currentBet = target;
  next.actedAtBet[playerId] = target;
  addHistory(next, playerId, 'raise', target, decisionContext);
  next.pending = handPlayerIdsClockwiseAfter(next, player.seat).filter((pendingId) => {
    const pendingPlayer = statePlayer(next.players, pendingId);
    return !pendingPlayer.folded && !pendingPlayer.allIn;
  });
  return finishAction(next);
}
