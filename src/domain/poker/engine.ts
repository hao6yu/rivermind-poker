import { shuffle, createDeck, type RandomSource } from './cards';
import { compareHandValues, describeHand, evaluateBest } from './evaluator';
import type {
  ActionRecord,
  GameState,
  LegalActions,
  PlayerAction,
  PlayerId,
  PlayerState,
  Street,
} from './types';

export interface NewHandOptions {
  handNumber?: number;
  button?: PlayerId;
  heroStack?: number;
  villainStack?: number;
  smallBlind?: number;
  bigBlind?: number;
  random?: RandomSource;
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 'hero' ? 'villain' : 'hero';
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: {
      hero: { ...state.players.hero, holeCards: [...state.players.hero.holeCards] },
      villain: { ...state.players.villain, holeCards: [...state.players.villain.holeCards] },
    },
    deck: [...state.deck],
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
    outcome: state.outcome ? { ...state.outcome } : undefined,
  };
}

function commitChips(state: GameState, player: PlayerState, amount: number): number {
  const committed = Math.max(0, Math.min(Math.round(amount), player.stack));
  player.stack -= committed;
  player.streetBet += committed;
  player.totalCommitted += committed;
  player.allIn = player.stack === 0;
  state.pot += committed;
  return committed;
}

function postBlind(state: GameState, playerId: PlayerId, blind: number): void {
  commitChips(state, state.players[playerId], blind);
}

function activePlayerIds(state: GameState): PlayerId[] {
  return (['hero', 'villain'] as PlayerId[]).filter((id) => !state.players[id].folded);
}

function prunePending(state: GameState): void {
  state.pending = state.pending.filter((id) => {
    const player = state.players[id];
    const opponent = state.players[otherPlayer(id)];
    if (player.folded || player.allIn) return false;
    if (opponent.allIn && state.currentBet <= player.streetBet) return false;
    return true;
  });
}

function addHistory(
  state: GameState,
  player: PlayerId,
  type: PlayerAction['type'],
  amount: number,
  decisionContext: ActionRecord['decisionContext'],
): void {
  const entry: ActionRecord = {
    player,
    type,
    amount,
    street: state.street,
    potAfter: state.pot,
    decisionContext,
  };
  state.history.push(entry);
}

function dealNextStreet(state: GameState): void {
  const burn = state.deck[0];
  if (burn === undefined) throw new Error('The deck ran out of cards.');
  state.deck = state.deck.slice(1);

  const count = state.street === 'preflop' ? 3 : 1;
  const cards = state.deck.slice(0, count);
  if (cards.length !== count) throw new Error('The deck ran out of board cards.');
  state.deck = state.deck.slice(count);
  state.board.push(...cards);
  state.street = state.street === 'preflop' ? 'flop' : state.street === 'flop' ? 'turn' : 'river';
}

function refundUnmatchedChips(state: GameState): void {
  const hero = state.players.hero;
  const villain = state.players.villain;
  const difference = hero.totalCommitted - villain.totalCommitted;
  if (difference === 0) return;
  const overContributor = difference > 0 ? hero : villain;
  const refund = Math.abs(difference);
  overContributor.totalCommitted -= refund;
  overContributor.stack += refund;
  state.pot -= refund;
}

function resolveShowdown(state: GameState): GameState {
  refundUnmatchedChips(state);
  const heroValue = evaluateBest([...state.players.hero.holeCards, ...state.board]);
  const villainValue = evaluateBest([...state.players.villain.holeCards, ...state.board]);
  const comparison = compareHandValues(heroValue, villainValue);
  const potWon = state.pot;

  if (comparison > 0) {
    state.players.hero.stack += state.pot;
    state.outcome = {
      winner: 'hero',
      message: `You win with ${describeHand(heroValue)}.`,
      potWon,
      showdown: true,
      heroHand: describeHand(heroValue),
      villainHand: describeHand(villainValue),
    };
  } else if (comparison < 0) {
    state.players.villain.stack += state.pot;
    state.outcome = {
      winner: 'villain',
      message: `RiverMind wins with ${describeHand(villainValue)}.`,
      potWon,
      showdown: true,
      heroHand: describeHand(heroValue),
      villainHand: describeHand(villainValue),
    };
  } else {
    const half = Math.floor(state.pot / 2);
    state.players.hero.stack += half;
    state.players.villain.stack += half;
    state.players[state.button].stack += state.pot - half * 2;
    state.outcome = {
      winner: 'tie',
      message: `Split pot — both players have ${describeHand(heroValue)}.`,
      potWon,
      showdown: true,
      heroHand: describeHand(heroValue),
      villainHand: describeHand(villainValue),
    };
  }

  state.pot = 0;
  state.street = 'complete';
  state.toAct = null;
  state.pending = [];
  return state;
}

function advanceRound(state: GameState): GameState {
  state.players.hero.streetBet = 0;
  state.players.villain.streetBet = 0;
  state.currentBet = 0;
  state.lastFullRaise = state.bigBlind;

  if (state.street === 'river') return resolveShowdown(state);

  dealNextStreet(state);
  const someoneAllIn = activePlayerIds(state).some((id) => state.players[id].allIn);
  if (someoneAllIn) {
    while (state.board.length < 5) dealNextStreet(state);
    return resolveShowdown(state);
  }

  const firstPostflop = otherPlayer(state.button);
  state.pending = [firstPostflop, state.button].filter(
    (id) => !state.players[id].folded && !state.players[id].allIn,
  );
  state.toAct = state.pending[0] ?? null;
  return state;
}

function settleFold(state: GameState, folder: PlayerId): GameState {
  const winner = otherPlayer(folder);
  const potWon = state.pot;
  state.players[winner].stack += state.pot;
  state.pot = 0;
  state.players[folder].folded = true;
  state.street = 'complete';
  state.toAct = null;
  state.pending = [];
  state.outcome = {
    winner,
    message: winner === 'hero' ? 'RiverMind folds. You take the pot.' : 'You fold. RiverMind takes the pot.',
    potWon,
    showdown: false,
  };
  return state;
}

function normalizeRaiseTarget(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Raise amount must be a finite number.');
  return Math.max(0, Math.round(value));
}

export function getLegalActions(state: GameState, playerId: PlayerId): LegalActions {
  const unavailable: LegalActions = {
    canFold: false,
    canCheck: false,
    canCall: false,
    canRaise: false,
    toCall: 0,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    suggestedRaiseTo: 0,
  };
  if (state.street === 'complete' || state.toAct !== playerId) return unavailable;

  const player = state.players[playerId];
  const opponent = state.players[otherPlayer(playerId)];
  const toCall = Math.max(0, state.currentBet - player.streetBet);
  const maxRaiseTo = player.streetBet + player.stack;
  const minFullRaiseTo = state.currentBet + state.lastFullRaise;
  const minRaiseTo = Math.min(maxRaiseTo, minFullRaiseTo);
  const canRaise = player.stack > toCall && !opponent.allIn && maxRaiseTo > state.currentBet;
  const baseSuggestion = state.currentBet === 0
    ? Math.max(state.bigBlind, Math.round(state.pot * 0.66))
    : Math.round(Math.max(minFullRaiseTo, state.currentBet * (state.street === 'preflop' ? 2.5 : 2.2)));
  const suggestedRaiseTo = canRaise
    ? Math.max(minRaiseTo, Math.min(maxRaiseTo, baseSuggestion))
    : 0;

  return {
    canFold: toCall > 0,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    canRaise,
    toCall: Math.min(toCall, player.stack),
    minRaiseTo,
    maxRaiseTo,
    suggestedRaiseTo,
  };
}

export function createHand(options: NewHandOptions = {}): GameState {
  const random = options.random ?? Math.random;
  const button = options.button ?? 'hero';
  const smallBlind = options.smallBlind ?? 10;
  const bigBlind = options.bigBlind ?? 20;
  const shuffled = shuffle(createDeck(), random);
  const order: PlayerId[] = [button, otherPlayer(button)];
  const holeCards: Record<PlayerId, GameState['board']> = { hero: [], villain: [] };
  let cursor = 0;
  for (let round = 0; round < 2; round += 1) {
    for (const id of order) {
      const card = shuffled[cursor];
      if (card === undefined) throw new Error('The deck ran out while dealing.');
      holeCards[id].push(card);
      cursor += 1;
    }
  }

  const state: GameState = {
    handNumber: options.handNumber ?? 1,
    button,
    smallBlind,
    bigBlind,
    players: {
      hero: {
        id: 'hero',
        name: 'You',
        stack: options.heroStack ?? 1_000,
        holeCards: holeCards.hero,
        streetBet: 0,
        totalCommitted: 0,
        folded: false,
        allIn: false,
      },
      villain: {
        id: 'villain',
        name: 'RiverMind',
        stack: options.villainStack ?? 1_000,
        holeCards: holeCards.villain,
        streetBet: 0,
        totalCommitted: 0,
        folded: false,
        allIn: false,
      },
    },
    deck: shuffled.slice(cursor),
    board: [],
    street: 'preflop',
    pot: 0,
    currentBet: bigBlind,
    lastFullRaise: bigBlind,
    pending: [],
    toAct: null,
    history: [],
  };

  postBlind(state, button, smallBlind);
  postBlind(state, otherPlayer(button), bigBlind);
  state.pending = [button, otherPlayer(button)].filter((id) => !state.players[id].allIn);
  prunePending(state);
  state.toAct = state.pending[0] ?? null;
  return state.toAct === null ? advanceRound(state) : state;
}

export function applyAction(state: GameState, playerId: PlayerId, action: PlayerAction): GameState {
  if (state.toAct !== playerId) throw new Error(`It is not ${playerId}'s turn.`);
  const legal = getLegalActions(state, playerId);
  const next = cloneState(state);
  const player = next.players[playerId];
  const opponentId = otherPlayer(playerId);
  const opponent = next.players[opponentId];
  const decisionContext: ActionRecord['decisionContext'] = {
    board: [...next.board],
    potBefore: next.pot,
    currentBet: next.currentBet,
    toCall: legal.toCall,
    playerStackBefore: player.stack,
    opponentStackBefore: opponent.stack,
    playerStreetBetBefore: player.streetBet,
    opponentStreetBetBefore: opponent.streetBet,
    legalActions: { ...legal },
  };

  if (action.type === 'fold') {
    if (!legal.canFold) throw new Error('Folding is not legal when checking is available.');
    addHistory(next, playerId, 'fold', 0, decisionContext);
    return settleFold(next, playerId);
  }

  if (action.type === 'check') {
    if (!legal.canCheck) throw new Error('Checking is not available while facing a bet.');
    addHistory(next, playerId, 'check', 0, decisionContext);
    next.pending = next.pending.filter((id) => id !== playerId);
  } else if (action.type === 'call') {
    if (!legal.canCall) throw new Error('There is no bet to call.');
    const paid = commitChips(next, player, legal.toCall);
    addHistory(next, playerId, 'call', paid, decisionContext);
    next.pending = next.pending.filter((id) => id !== playerId);
  } else if (action.type === 'raise') {
    if (!legal.canRaise) throw new Error('Raising is not available.');
    const target = normalizeRaiseTarget(action.amount ?? legal.suggestedRaiseTo);
    if (target <= next.currentBet || target > legal.maxRaiseTo) throw new Error('Raise target is outside the legal range.');
    if (target < legal.minRaiseTo && target !== legal.maxRaiseTo) throw new Error('Raise target is below the minimum raise.');
    const raiseIncrement = target - next.currentBet;
    commitChips(next, player, target - player.streetBet);
    if (raiseIncrement >= next.lastFullRaise) next.lastFullRaise = raiseIncrement;
    next.currentBet = target;
    addHistory(next, playerId, 'raise', target, decisionContext);
    next.pending = next.players[opponentId].folded || next.players[opponentId].allIn ? [] : [opponentId];
  }

  prunePending(next);
  if (next.pending.length === 0) return advanceRound(next);
  next.toAct = next.pending[0] ?? null;
  return next;
}

export function createNextHand(state: GameState, random: RandomSource = Math.random): GameState {
  const shouldReload = state.players.hero.stack < state.bigBlind || state.players.villain.stack < state.bigBlind;
  return createHand({
    handNumber: state.handNumber + 1,
    button: otherPlayer(state.button),
    heroStack: shouldReload ? 1_000 : state.players.hero.stack,
    villainStack: shouldReload ? 1_000 : state.players.villain.stack,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    random,
  });
}

export function formatAction(record: ActionRecord): string {
  const actor = record.player === 'hero' ? 'You' : 'RiverMind';
  if (record.type === 'raise') return `${actor} raised to ${record.amount}`;
  if (record.type === 'call') return `${actor} called ${record.amount}`;
  return `${actor} ${record.type === 'check' ? 'checked' : 'folded'}`;
}

export function streetLabel(street: Street): string {
  return street === 'complete' ? 'Hand complete' : street[0]?.toUpperCase() + street.slice(1);
}
