import { cardKey, cardLabel, createDeck, rankLabels, withoutCards } from './cards.ts';
import { describeHand, evaluateBest, type HandValue } from './evaluator.ts';
import type {
  ActionType,
  Card,
  GameState,
  LegalActions,
  Rank,
  Street,
  Suit,
} from './types.ts';

export interface CoachDecisionInput {
  action: ActionType;
  amount: number;
  street: Exclude<Street, 'complete'>;
  board: Card[];
  potBefore: number;
  currentBet: number;
  toCall: number;
  heroStackBefore: number;
  opponentStackBefore: number;
  heroStreetBetBefore: number;
  opponentStreetBetBefore: number;
  legalActions: LegalActions;
}

export interface CoachAnalysisInput {
  version: 1;
  bigBlind: number;
  heroCards: Card[];
  board: Card[];
  decisions: CoachDecisionInput[];
}

export interface BoardTexture {
  cards: string[];
  pairing: 'none' | 'paired' | 'double-paired' | 'trips-or-better';
  suits: 'none' | 'rainbow' | 'two-tone' | 'monotone' | 'four-flush' | 'five-flush';
  connectedness: 'none' | 'disconnected' | 'connected' | 'highly-connected';
  flushPossible: boolean;
  straightPossible: boolean;
  fullHouseOrQuadsPossible: boolean;
}

export interface DrawFact {
  type: 'straight' | 'flush' | 'backdoor-flush';
  label: string;
  outs: number;
  completionCards: string[];
}

export interface MadeHandFact {
  category: string;
  description: string;
}

export interface VerifiedDecisionAnalysis {
  sequence: number;
  street: CoachDecisionInput['street'];
  chosenAction: ActionType;
  chosenAmount: number;
  actionWasLegal: boolean;
  board: string[];
  madeHand: MadeHandFact | null;
  boardTexture: BoardTexture;
  draws: DrawFact[];
  drawCompletionOuts: number;
  chanceToHitCurrentDrawOutsNextCardPct: number | null;
  chanceToHitCurrentDrawOutsByRiverPct: number | null;
  improvementsByCategory: Array<{ category: string; outs: number }>;
  potBeforeAction: number;
  potBeforeLatestWager: number | null;
  contestablePotBeforeCall: number;
  unmatchedWagerExcluded: number;
  amountToCall: number;
  potAfterCall: number;
  requiredEquityPct: number | null;
  effectiveStackBefore: number;
  stackToPotRatio: number | null;
  legalActions: LegalActions;
}

export interface VerifiedHandAnalysis {
  version: 1;
  source: 'deterministic-poker-engine';
  heroCards: string[];
  opponentCards: string[] | null;
  finalBoard: string[];
  finalMadeHand: MadeHandFact | null;
  opponentFinalMadeHand: MadeHandFact | null;
  showdownComparison: 'hero-ahead' | 'opponent-ahead' | 'tie' | null;
  finalBoardTexture: BoardTexture;
  opponentPossibleHandCategories: string[];
  decisions: VerifiedDecisionAnalysis[];
  interpretationLimits: string[];
}

const ranks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const actionTypes: ActionType[] = ['fold', 'check', 'call', 'raise'];
const decisionStreets: Array<CoachDecisionInput['street']> = ['preflop', 'flop', 'turn', 'river'];

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

function parseCardObject(value: unknown): Card | null {
  if (!isRecord(value)) return null;
  const rank = value.rank;
  const suit = value.suit;
  if (!ranks.includes(rank as Rank) || !suits.includes(suit as Suit)) return null;
  return { rank: rank as Rank, suit: suit as Suit };
}

function parseCardArray(value: unknown, minimum: number, maximum: number): Card[] | null {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return null;
  const cards = value.map(parseCardObject);
  return cards.every((card): card is Card => card !== null) ? cards : null;
}

function parseLegalActions(value: unknown): LegalActions | null {
  if (!isRecord(value)) return null;
  const booleans = ['canFold', 'canCheck', 'canCall', 'canRaise'] as const;
  const numbers = ['toCall', 'minRaiseTo', 'maxRaiseTo', 'suggestedRaiseTo'] as const;
  if (!booleans.every((key) => typeof value[key] === 'boolean')) return null;
  if (!numbers.every((key) => isFiniteNumber(value[key]))) return null;
  return {
    canFold: value.canFold as boolean,
    canCheck: value.canCheck as boolean,
    canCall: value.canCall as boolean,
    canRaise: value.canRaise as boolean,
    toCall: value.toCall as number,
    minRaiseTo: value.minRaiseTo as number,
    maxRaiseTo: value.maxRaiseTo as number,
    suggestedRaiseTo: value.suggestedRaiseTo as number,
  };
}

function expectedBoardLength(street: CoachDecisionInput['street']): number {
  return street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
}

function parseDecision(value: unknown): CoachDecisionInput | null {
  if (!isRecord(value)) return null;
  const action = value.action;
  const street = value.street;
  if (!actionTypes.includes(action as ActionType) || !decisionStreets.includes(street as CoachDecisionInput['street'])) {
    return null;
  }
  const board = parseCardArray(value.board, expectedBoardLength(street as CoachDecisionInput['street']), expectedBoardLength(street as CoachDecisionInput['street']));
  const legalActions = parseLegalActions(value.legalActions);
  const numericFields = [
    'amount',
    'potBefore',
    'currentBet',
    'toCall',
    'heroStackBefore',
    'opponentStackBefore',
    'heroStreetBetBefore',
    'opponentStreetBetBefore',
  ] as const;
  if (!board || !legalActions || !numericFields.every((key) => isFiniteNumber(value[key]))) return null;
  if (value.toCall !== legalActions.toCall) return null;
  return {
    action: action as ActionType,
    amount: value.amount as number,
    street: street as CoachDecisionInput['street'],
    board,
    potBefore: value.potBefore as number,
    currentBet: value.currentBet as number,
    toCall: value.toCall as number,
    heroStackBefore: value.heroStackBefore as number,
    opponentStackBefore: value.opponentStackBefore as number,
    heroStreetBetBefore: value.heroStreetBetBefore as number,
    opponentStreetBetBefore: value.opponentStreetBetBefore as number,
    legalActions,
  };
}

function cardsAreUnique(cards: readonly Card[]): boolean {
  return new Set(cards.map(cardKey)).size === cards.length;
}

function boardIsPrefix(decisionBoard: readonly Card[], finalBoard: readonly Card[]): boolean {
  return decisionBoard.length <= finalBoard.length
    && decisionBoard.every((card, index) => {
      const finalCard = finalBoard[index];
      return finalCard !== undefined && cardKey(card) === cardKey(finalCard);
    });
}

export function parseCoachAnalysisInput(value: unknown): CoachAnalysisInput | null {
  if (!isRecord(value) || value.version !== 1 || !isFiniteNumber(value.bigBlind, Number.EPSILON)) return null;
  const heroCards = parseCardArray(value.heroCards, 2, 2);
  const board = parseCardArray(value.board, 0, 5);
  if (value.opponentCards !== undefined) return null;
  if (!heroCards || !board) return null;
  if (!Array.isArray(value.decisions) || value.decisions.length > 40) return null;
  const decisions = value.decisions.map(parseDecision);
  if (!decisions.every((decision): decision is CoachDecisionInput => decision !== null)) return null;
  const knownCards = [...heroCards, ...board];
  if (!cardsAreUnique(knownCards)) return null;
  if (!decisions.every((decision) => (
    cardsAreUnique([...heroCards, ...decision.board])
    && boardIsPrefix(decision.board, board)
  ))) return null;
  return {
    version: 1,
    bigBlind: value.bigBlind,
    heroCards,
    board,
    decisions,
  };
}

export function parseCardLabel(value: string): Card | null {
  const match = value.trim().match(/^(10|[2-9TJQKA])([CDHS♣♦♥♠])$/i);
  if (!match) return null;
  const rankToken = match[1]?.toUpperCase();
  const suitToken = match[2];
  const rankMap: Record<string, Rank> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
  const suitMap: Record<string, Suit> = {
    c: 'clubs', C: 'clubs', '♣': 'clubs',
    d: 'diamonds', D: 'diamonds', '♦': 'diamonds',
    h: 'hearts', H: 'hearts', '♥': 'hearts',
    s: 'spades', S: 'spades', '♠': 'spades',
  };
  const numericRank = Number(rankToken);
  const rank = Number.isInteger(numericRank) ? numericRank as Rank : rankMap[rankToken ?? ''];
  const suit = suitMap[suitToken ?? ''];
  return rank && suit ? { rank, suit } : null;
}

export function cardsMatch(left: readonly Card[], right: readonly Card[]): boolean {
  return left.length === right.length && left.every((card, index) => cardKey(card) === cardKey(right[index] as Card));
}

function straightHigh(values: readonly number[]): number | null {
  const unique = [...new Set(values)].sort((left, right) => right - left);
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    const high = unique[index];
    if (high !== undefined && unique.slice(index, index + 5).every((rank, offset) => rank === high - offset)) {
      return high;
    }
  }
  return null;
}

function madeHand(heroCards: readonly Card[], board: readonly Card[]): MadeHandFact | null {
  if (board.length < 3) return null;
  const value = evaluateBest([...heroCards, ...board]);
  return { category: value.name, description: describeHand(value) };
}

function startingHandDescription(heroCards: readonly Card[]): string {
  const first = heroCards[0];
  const second = heroCards[1];
  if (!first || !second) return 'Unknown starting hand';
  if (first.rank === second.rank) return `Pocket ${rankLabels[first.rank]}s`;
  const ordered = [first.rank, second.rank].sort((left, right) => right - left) as Rank[];
  return `${rankLabels[ordered[0] as Rank]}-${rankLabels[ordered[1] as Rank]} ${first.suit === second.suit ? 'suited' : 'offsuit'}`;
}

function isStraightPossibleWithTwoCards(board: readonly Card[]): boolean {
  if (board.length < 3) return false;
  const boardRanks = board.map((card) => card.rank);
  for (const first of ranks) {
    for (const second of ranks) {
      if (straightHigh([...boardRanks, first, second]) !== null) return true;
    }
  }
  return false;
}

export function analyzeBoardTexture(board: readonly Card[]): BoardTexture {
  const rankCounts = new Map<Rank, number>();
  const suitCounts = new Map<Suit, number>();
  for (const card of board) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  }
  const pairCounts = [...rankCounts.values()].filter((count) => count === 2).length;
  const maximumRankCount = Math.max(0, ...rankCounts.values());
  const maximumSuitCount = Math.max(0, ...suitCounts.values());
  const pairing: BoardTexture['pairing'] = maximumRankCount >= 3
    ? 'trips-or-better'
    : pairCounts >= 2
      ? 'double-paired'
      : pairCounts === 1
        ? 'paired'
        : 'none';
  const suitTexture: BoardTexture['suits'] = board.length === 0
    ? 'none'
    : maximumSuitCount >= 5
      ? 'five-flush'
      : maximumSuitCount === 4
        ? 'four-flush'
        : maximumSuitCount === 3
          ? 'monotone'
          : maximumSuitCount === 2
            ? 'two-tone'
            : 'rainbow';
  const uniqueRanks = [...new Set(board.map((card) => card.rank))];
  const straightWindows = [
    [14, 5, 4, 3, 2],
    ...Array.from({ length: 9 }, (_, index) => {
      const high = 14 - index;
      return [high, high - 1, high - 2, high - 3, high - 4];
    }),
  ];
  const maximumConnected = Math.max(
    0,
    ...straightWindows.map((window) => window.filter((rank) => uniqueRanks.includes(rank as Rank)).length),
  );
  const connectedness: BoardTexture['connectedness'] = board.length === 0
    ? 'none'
    : maximumConnected >= 4
      ? 'highly-connected'
      : maximumConnected >= 3
        ? 'connected'
        : 'disconnected';
  return {
    cards: board.map(cardLabel),
    pairing,
    suits: suitTexture,
    connectedness,
    flushPossible: maximumSuitCount >= 3,
    straightPossible: isStraightPossibleWithTwoCards(board),
    fullHouseOrQuadsPossible: maximumRankCount >= 2,
  };
}

function availableCards(heroCards: readonly Card[], board: readonly Card[]): Card[] {
  return withoutCards(createDeck(), [...heroCards, ...board]);
}

function findDraws(heroCards: readonly Card[], board: readonly Card[]): { draws: DrawFact[]; completionKeys: Set<string> } {
  if (board.length < 3 || board.length >= 5) return { draws: [], completionKeys: new Set() };
  const known = [...heroCards, ...board];
  const available = availableCards(heroCards, board);
  const completionKeys = new Set<string>();
  const draws: DrawFact[] = [];
  const current = evaluateBest(known);

  if (current.category < 4) {
    const currentRanks = known.map((card) => card.rank);
    const completionRanks = ranks.filter((rank) => (
      !currentRanks.includes(rank) && straightHigh([...currentRanks, rank]) !== null
    ));
    const completionCards = available.filter((card) => completionRanks.includes(card.rank));
    if (completionCards.length > 0) {
      for (const card of completionCards) completionKeys.add(cardKey(card));
      const label = completionRanks.length >= 2
        ? 'Open-ended or double-gutshot straight draw'
        : 'Gutshot straight draw';
      draws.push({
        type: 'straight',
        label,
        outs: completionCards.length,
        completionCards: completionCards.map(cardLabel),
      });
    }
  }

  const suitCounts = new Map<Suit, number>();
  for (const card of known) suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  for (const suit of suits) {
    const count = suitCounts.get(suit) ?? 0;
    if (count === 4) {
      const completionCards = available.filter((card) => card.suit === suit);
      for (const card of completionCards) completionKeys.add(cardKey(card));
      draws.push({
        type: 'flush',
        label: 'Flush draw',
        outs: completionCards.length,
        completionCards: completionCards.map(cardLabel),
      });
    } else if (board.length === 3 && count === 3) {
      draws.push({
        type: 'backdoor-flush',
        label: 'Backdoor flush draw (needs two cards)',
        outs: 0,
        completionCards: [],
      });
    }
  }

  return { draws, completionKeys };
}

function improvementGroups(heroCards: readonly Card[], board: readonly Card[]): Array<{ category: string; outs: number }> {
  if (board.length < 3 || board.length >= 5) return [];
  const current = evaluateBest([...heroCards, ...board]);
  const groups = new Map<string, number>();
  for (const card of availableCards(heroCards, board)) {
    const next = evaluateBest([...heroCards, ...board, card]);
    if (next.category > current.category) groups.set(next.name, (groups.get(next.name) ?? 0) + 1);
  }
  return [...groups.entries()]
    .map(([category, outs]) => ({ category, outs }))
    .sort((left, right) => right.outs - left.outs || left.category.localeCompare(right.category));
}

function currentOutChance(outs: number, unseenCards: number, boardLength: number): { next: number | null; river: number | null } {
  if (outs <= 0 || unseenCards <= 0 || boardLength >= 5) return { next: null, river: null };
  const next = round((outs / unseenCards) * 100, 1);
  if (boardLength === 4) return { next, river: next };
  const missNext = (unseenCards - outs) / unseenCards;
  const missRiver = (unseenCards - outs - 1) / (unseenCards - 1);
  return { next, river: round((1 - missNext * missRiver) * 100, 1) };
}

function actionWasLegal(decision: CoachDecisionInput): boolean {
  if (decision.action === 'fold') return decision.legalActions.canFold;
  if (decision.action === 'check') return decision.legalActions.canCheck;
  if (decision.action === 'call') return decision.legalActions.canCall;
  if (!decision.legalActions.canRaise) return false;
  return decision.amount > decision.currentBet
    && decision.amount <= decision.legalActions.maxRaiseTo
    && (decision.amount >= decision.legalActions.minRaiseTo || decision.amount === decision.legalActions.maxRaiseTo);
}

function analyzeDecision(
  decision: CoachDecisionInput,
  heroCards: readonly Card[],
  sequence: number,
): VerifiedDecisionAnalysis {
  const { draws, completionKeys } = findDraws(heroCards, decision.board);
  const unseenCards = 52 - new Set([...heroCards, ...decision.board].map(cardKey)).size;
  const chance = currentOutChance(completionKeys.size, unseenCards, decision.board.length);
  const effectiveStack = Math.min(decision.heroStackBefore, decision.opponentStackBefore);
  const maximumMatchableStreetBet = decision.heroStreetBetBefore + decision.heroStackBefore;
  const unmatchedWager = Math.max(0, decision.opponentStreetBetBefore - maximumMatchableStreetBet);
  const contestablePotBeforeCall = Math.max(0, decision.potBefore - unmatchedWager);
  const potAfterCall = contestablePotBeforeCall + decision.toCall;
  return {
    sequence,
    street: decision.street,
    chosenAction: decision.action,
    chosenAmount: decision.amount,
    actionWasLegal: actionWasLegal(decision),
    board: decision.board.map(cardLabel),
    madeHand: madeHand(heroCards, decision.board),
    boardTexture: analyzeBoardTexture(decision.board),
    draws,
    drawCompletionOuts: completionKeys.size,
    chanceToHitCurrentDrawOutsNextCardPct: chance.next,
    chanceToHitCurrentDrawOutsByRiverPct: chance.river,
    improvementsByCategory: improvementGroups(heroCards, decision.board),
    potBeforeAction: decision.potBefore,
    potBeforeLatestWager: decision.toCall > 0
      ? Math.max(0, contestablePotBeforeCall - decision.toCall)
      : null,
    contestablePotBeforeCall,
    unmatchedWagerExcluded: unmatchedWager,
    amountToCall: decision.toCall,
    potAfterCall,
    requiredEquityPct: decision.toCall > 0
      ? round((decision.toCall / potAfterCall) * 100, 1)
      : null,
    effectiveStackBefore: effectiveStack,
    stackToPotRatio: contestablePotBeforeCall > 0 ? round(effectiveStack / contestablePotBeforeCall, 2) : null,
    legalActions: { ...decision.legalActions },
  };
}

function opponentPossibleCategories(heroCards: readonly Card[], board: readonly Card[]): string[] {
  if (board.length < 3) return [];
  const available = availableCards(heroCards, board);
  const categories = new Map<number, string>();
  for (let first = 0; first < available.length - 1; first += 1) {
    for (let second = first + 1; second < available.length; second += 1) {
      const firstCard = available[first];
      const secondCard = available[second];
      if (!firstCard || !secondCard) continue;
      const value = evaluateBest([firstCard, secondCard, ...board]);
      categories.set(value.category, value.name);
    }
  }
  return [...categories.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, name]) => name);
}

export function analyzeCoachHand(input: CoachAnalysisInput): VerifiedHandAnalysis {
  const parsed = parseCoachAnalysisInput(input);
  if (!parsed) throw new Error('Coach analysis input is invalid.');
  return {
    version: 1,
    source: 'deterministic-poker-engine',
    heroCards: parsed.heroCards.map(cardLabel),
    opponentCards: null,
    finalBoard: parsed.board.map(cardLabel),
    finalMadeHand: parsed.board.length >= 3
      ? madeHand(parsed.heroCards, parsed.board)
      : { category: 'Preflop', description: startingHandDescription(parsed.heroCards) },
    opponentFinalMadeHand: null,
    showdownComparison: null,
    finalBoardTexture: analyzeBoardTexture(parsed.board),
    opponentPossibleHandCategories: opponentPossibleCategories(parsed.heroCards, parsed.board),
    decisions: parsed.decisions.map((decision, index) => analyzeDecision(decision, parsed.heroCards, index + 1)),
    interpretationLimits: [
      'Draw outs are cards that complete the named draw; they are not guaranteed winning outs against every opponent holding.',
      'Category-improvement outs show that the hand category improves on the next card; they do not prove the hero will win.',
      'potBeforeAction includes the wager currently faced; potBeforeLatestWager is the pot immediately before that wager in this heads-up hand.',
      'Opponent range frequencies and expected value remain range-dependent unless an opponent model is supplied.',
    ],
  };
}

export function buildCoachAnalysisInput(game: GameState): CoachAnalysisInput {
  const decisions: CoachDecisionInput[] = game.history
    .filter((record) => record.player === 'hero')
    .map((record) => ({
      action: record.type,
      amount: record.amount,
      street: record.street as CoachDecisionInput['street'],
      board: [...record.decisionContext.board],
      potBefore: record.decisionContext.potBefore,
      currentBet: record.decisionContext.currentBet,
      toCall: record.decisionContext.toCall,
      heroStackBefore: record.decisionContext.playerStackBefore,
      opponentStackBefore: record.decisionContext.opponentStackBefore,
      heroStreetBetBefore: record.decisionContext.playerStreetBetBefore,
      opponentStreetBetBefore: record.decisionContext.opponentStreetBetBefore,
      legalActions: { ...record.decisionContext.legalActions },
    }));
  return {
    version: 1,
    bigBlind: game.bigBlind,
    heroCards: [...game.players.hero.holeCards],
    board: [...game.board],
    decisions,
  };
}

export function handValueForCards(heroCards: readonly Card[], board: readonly Card[]): HandValue | null {
  return board.length >= 3 ? evaluateBest([...heroCards, ...board]) : null;
}
