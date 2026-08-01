export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type PlayerId = 'hero' | 'villain';
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'complete';
export type ActionType = 'fold' | 'check' | 'call' | 'raise';

export interface PlayerAction {
  type: ActionType;
  /** Target street contribution for raises, not the number of chips added. */
  amount?: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  stack: number;
  holeCards: Card[];
  streetBet: number;
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
}

export interface ActionRecord {
  player: PlayerId;
  type: ActionType;
  amount: number;
  street: Street;
  potAfter: number;
  decisionContext: DecisionContext;
}

export interface DecisionContext {
  board: Card[];
  potBefore: number;
  currentBet: number;
  toCall: number;
  playerStackBefore: number;
  opponentStackBefore: number;
  playerStreetBetBefore: number;
  opponentStreetBetBefore: number;
  legalActions: LegalActions;
}

export interface HandOutcome {
  winner: PlayerId | 'tie';
  message: string;
  potWon: number;
  showdown: boolean;
  heroHand?: string;
  villainHand?: string;
}

export interface GameState {
  handNumber: number;
  button: PlayerId;
  smallBlind: number;
  bigBlind: number;
  players: Record<PlayerId, PlayerState>;
  deck: Card[];
  board: Card[];
  street: Street;
  pot: number;
  currentBet: number;
  lastFullRaise: number;
  pending: PlayerId[];
  toAct: PlayerId | null;
  history: ActionRecord[];
  outcome?: HandOutcome;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  toCall: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  suggestedRaiseTo: number;
}

export interface AiDecision {
  action: PlayerAction;
  estimatedEquity: number;
  potOdds: number;
  style: 'value' | 'pressure' | 'bluff' | 'control' | 'defense';
  rationale: string;
}

export interface CoachReview {
  summary: string;
  bestDecision: string;
  keyConcept: string;
  practiceTip: string;
  confidence: number;
  handGrade: CoachHandGrade;
  focusDecisionSequence: number;
  focusArea: CoachFocusArea;
}

export type CoachHandGrade = 'strong' | 'close' | 'mistake';

export type CoachFocusArea =
  | 'none'
  | 'preflop'
  | 'value-betting'
  | 'bluffing'
  | 'calling'
  | 'bet-sizing'
  | 'pot-odds'
  | 'draws';
