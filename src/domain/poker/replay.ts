import type { ActionRecord, Card, GameState, PlayerId, Street } from './types';

export interface ReplayStep {
  sequence: number;
  kind: 'start' | 'deal' | 'action' | 'outcome';
  street: Street;
  actor: PlayerId | null;
  action: ActionRecord['type'] | null;
  amount: number;
  currentBetBefore: number;
  board: Card[];
  pot: number;
  heroStack: number;
  villainStack: number;
  heroDecisionSequence: number | null;
  revealVillain: boolean;
}

function stacksBefore(record: ActionRecord): { hero: number; villain: number } {
  return record.player === 'hero'
    ? {
        hero: record.decisionContext.playerStackBefore,
        villain: record.decisionContext.opponentStackBefore,
      }
    : {
        hero: record.decisionContext.opponentStackBefore,
        villain: record.decisionContext.playerStackBefore,
      };
}

function sameBoard(left: readonly Card[], right: readonly Card[]): boolean {
  return left.length === right.length
    && left.every((card, index) => {
      const other = right[index];
      return other !== undefined && card.rank === other.rank && card.suit === other.suit;
    });
}

function streetForBoard(board: readonly Card[]): Street {
  if (board.length >= 5) return 'river';
  if (board.length === 4) return 'turn';
  if (board.length >= 3) return 'flop';
  return 'preflop';
}

export function buildReplaySteps(game: GameState): ReplayStep[] {
  const firstRecord = game.history[0];
  const firstStacks = firstRecord
    ? stacksBefore(firstRecord)
    : { hero: game.players.hero.stack, villain: game.players.villain.stack };
  const firstBoard = firstRecord?.decisionContext.board ?? [];
  const initialPot = firstRecord?.decisionContext.potBefore ?? game.outcome?.potWon ?? game.pot;
  const steps: ReplayStep[] = [{
    sequence: 0,
    kind: 'start',
    street: streetForBoard(firstBoard),
    actor: null,
    action: null,
    amount: 0,
    currentBetBefore: firstRecord?.decisionContext.currentBet ?? 0,
    board: [...firstBoard],
    pot: initialPot,
    heroStack: firstStacks.hero,
    villainStack: firstStacks.villain,
    heroDecisionSequence: null,
    revealVillain: false,
  }];

  let previousBoard = [...firstBoard];
  let currentPot = initialPot;
  let currentHeroStack = firstStacks.hero;
  let currentVillainStack = firstStacks.villain;
  let heroDecisionSequence = 0;

  for (const record of game.history) {
    const before = stacksBefore(record);
    if (!sameBoard(previousBoard, record.decisionContext.board)) {
      previousBoard = [...record.decisionContext.board];
      currentPot = record.decisionContext.potBefore;
      currentHeroStack = before.hero;
      currentVillainStack = before.villain;
      steps.push({
        sequence: steps.length,
        kind: 'deal',
        street: record.street,
        actor: null,
        action: null,
        amount: 0,
        currentBetBefore: 0,
        board: [...previousBoard],
        pot: currentPot,
        heroStack: currentHeroStack,
        villainStack: currentVillainStack,
        heroDecisionSequence: null,
        revealVillain: false,
      });
    }

    const chipsPaid = Math.max(0, record.potAfter - record.decisionContext.potBefore);
    currentHeroStack = before.hero - (record.player === 'hero' ? chipsPaid : 0);
    currentVillainStack = before.villain - (record.player === 'villain' ? chipsPaid : 0);
    currentPot = record.potAfter;
    if (record.player === 'hero') heroDecisionSequence += 1;
    steps.push({
      sequence: steps.length,
      kind: 'action',
      street: record.street,
      actor: record.player,
      action: record.type,
      amount: record.amount,
      currentBetBefore: record.decisionContext.currentBet,
      board: [...record.decisionContext.board],
      pot: currentPot,
      heroStack: currentHeroStack,
      villainStack: currentVillainStack,
      heroDecisionSequence: record.player === 'hero' ? heroDecisionSequence : null,
      revealVillain: false,
    });
  }

  if (!sameBoard(previousBoard, game.board)) {
    previousBoard = [...game.board];
    steps.push({
      sequence: steps.length,
      kind: 'deal',
      street: streetForBoard(previousBoard),
      actor: null,
      action: null,
      amount: 0,
      currentBetBefore: 0,
      board: [...previousBoard],
      pot: game.outcome?.potWon ?? currentPot,
      heroStack: currentHeroStack,
      villainStack: currentVillainStack,
      heroDecisionSequence: null,
      revealVillain: false,
    });
  }

  if (game.outcome) {
    steps.push({
      sequence: steps.length,
      kind: 'outcome',
      street: 'complete',
      actor: game.outcome.winner === 'tie' ? null : game.outcome.winner,
      action: null,
      amount: 0,
      currentBetBefore: 0,
      board: [...game.board],
      pot: game.outcome.potWon,
      heroStack: game.players.hero.stack,
      villainStack: game.players.villain.stack,
      heroDecisionSequence: null,
      revealVillain: game.outcome.showdown,
    });
  }

  return steps;
}

export function replayStepForHeroDecision(steps: readonly ReplayStep[], decisionSequence: number): number {
  if (decisionSequence <= 0) return Math.max(0, steps.length - 1);
  const index = steps.findIndex((step) => step.heroDecisionSequence === decisionSequence);
  return index >= 0 ? index : Math.max(0, steps.length - 1);
}
