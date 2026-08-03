import type { Card, Street } from '../../domain/poker/types';
import {
  multiwayLatestActionLabel,
  multiwayIsWalk,
  multiwayOutcomeMessage,
  multiwayPlayerAward,
  type MultiwayTablePlayerCount,
} from '../../domain/poker/multiwaySession';
import type {
  MultiwayActionRecord,
  MultiwayHandState,
  MultiwayPlayerState,
} from '../../domain/poker/multiway';

export type MultiwaySeatAnchor = 'top-left' | 'top-center' | 'top-right' | 'mid-left' | 'mid-right' | 'hero';

export interface MultiwaySeatPlacement {
  anchor: MultiwaySeatAnchor;
  playerId: string;
}

export interface MultiwayResultSummary {
  detail: string;
  heroDelta: string;
  heroStack: string;
  pot: string;
  title: string;
  tone: 'win' | 'loss' | 'tie';
}

export interface MultiwayReplayStep {
  action: MultiwayActionRecord | null;
  board: Card[];
  foldedPlayerIds: string[];
  kind: 'start' | 'deal' | 'action' | 'outcome';
  heroDecisionSequence: number | null;
  pot: number;
  revealOpponentCards: boolean;
  sequence: number;
  stacks: Record<string, number>;
  street: Street;
}

export function visibleMultiwayAiThinking(
  trackedPlayerId: string | null,
  currentActorId: string | null,
): string | null {
  return trackedPlayerId && trackedPlayerId === currentActorId && trackedPlayerId !== 'hero'
    ? trackedPlayerId
    : null;
}

export function multiwaySeatPlacements(
  playerCount: MultiwayTablePlayerCount,
  playerIds: readonly string[],
): MultiwaySeatPlacement[] {
  const heroPresent = playerIds.includes('hero');
  if (!heroPresent || playerIds.length !== playerCount) {
    throw new Error('Seat placement requires the hero and every configured table player.');
  }
  const opponents = playerIds.filter((playerId) => playerId !== 'hero');
  const opponentAnchors: MultiwaySeatAnchor[] = playerCount === 3
    ? ['top-left', 'top-right']
    : ['mid-left', 'top-left', 'top-center', 'top-right', 'mid-right'];
  return [
    ...opponents.map((playerId, index) => ({
      anchor: opponentAnchors[index] as MultiwaySeatAnchor,
      playerId,
    })),
    { anchor: 'hero', playerId: 'hero' },
  ];
}

export function multiwayHeroStackBeforeHand(game: MultiwayHandState): number {
  const hero = game.players.hero;
  return hero ? hero.stack + hero.totalCommitted : 0;
}

/**
 * Keeps the current betting round understandable when several opponents act
 * back-to-back. Each label is derived from only the public history available
 * at that moment, so the first postflop wager remains a bet rather than a
 * raise when later aggression is present.
 */
export function multiwayRecentActionLabels(
  game: MultiwayHandState,
  limit = 3,
): string[] {
  if (limit <= 0 || game.history.length === 0) return [];
  const latestStreet = game.street === 'complete'
    ? game.history.at(-1)?.street
    : game.street;
  if (!latestStreet) return [];

  return game.history
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action.street === latestStreet)
    .slice(-limit)
    .map(({ index }) => multiwayLatestActionLabel({
      ...game,
      history: game.history.slice(0, index + 1),
    }));
}

function formatBb(chips: number, bigBlind: number): string {
  const value = Math.round((chips / bigBlind) * 10) / 10;
  return `${value} BB`;
}

export function buildMultiwayResultSummary(
  game: MultiwayHandState,
  startingHeroStack: number,
): MultiwayResultSummary | null {
  if (!game.outcome) return null;
  const heroAward = multiwayPlayerAward(game, 'hero');
  const heroWon = heroAward > 0;
  const heroIsWinner = game.outcome.winnerPlayerIds.includes('hero');
  const split = game.outcome.winnerPlayerIds.length > 1;
  const heroDelta = (game.players.hero?.stack ?? 0) - startingHeroStack;
  return {
    detail: multiwayOutcomeMessage(game),
    heroDelta: `${heroDelta > 0 ? '+' : ''}${formatBb(heroDelta, game.bigBlind)}`,
    heroStack: formatBb(game.players.hero?.stack ?? 0, game.bigBlind),
    pot: formatBb(game.outcome.totalPot, game.bigBlind),
    title: heroIsWinner
      ? split ? 'You share the pot' : multiwayIsWalk(game) ? 'You get a walk' : 'You win the hand'
      : heroWon ? 'You recover part of the pot' : `${game.players[game.outcome.winnerPlayerIds[0] ?? '']?.name ?? 'Opponent'} wins`,
    tone: heroIsWinner ? split ? 'tie' : 'win' : 'loss',
  };
}

function boardForStreet(game: MultiwayHandState, street: Street): Card[] {
  if (street === 'preflop') return [];
  if (street === 'flop') return game.board.slice(0, 3);
  if (street === 'turn') return game.board.slice(0, 4);
  return game.board.slice(0, 5);
}

function streetOrder(street: Street): number {
  return ['preflop', 'flop', 'turn', 'river', 'complete'].indexOf(street);
}

function initialStacks(game: MultiwayHandState): Record<string, number> {
  return Object.fromEntries(game.tablePlayerIds.map((playerId) => {
    const player = game.players[playerId];
    if (!player) throw new Error(`Replay player ${playerId} is missing.`);
    const award = multiwayPlayerAward(game, playerId);
    return [playerId, player.stack + player.totalCommitted - award];
  }));
}

function copyStacks(stacks: Record<string, number>): Record<string, number> {
  return { ...stacks };
}

export function buildMultiwayReplaySteps(game: MultiwayHandState): MultiwayReplayStep[] {
  if (!game.outcome) return [];
  const outcome = game.outcome;
  const stacks = initialStacks(game);
  const smallBlindPlayer = game.players[game.smallBlindPlayerId];
  const bigBlindPlayer = game.players[game.bigBlindPlayerId];
  const smallBlindPaid = Math.min(stacks[game.smallBlindPlayerId] ?? 0, game.smallBlind);
  const bigBlindPaid = Math.min(stacks[game.bigBlindPlayerId] ?? 0, game.bigBlind);
  if (!smallBlindPlayer || !bigBlindPlayer) throw new Error('Replay blinds are missing.');
  stacks[game.smallBlindPlayerId] = (stacks[game.smallBlindPlayerId] ?? 0) - smallBlindPaid;
  stacks[game.bigBlindPlayerId] = (stacks[game.bigBlindPlayerId] ?? 0) - bigBlindPaid;
  let pot = smallBlindPaid + bigBlindPaid;
  let street: Street = 'preflop';
  const folded = new Set<string>();
  const steps: MultiwayReplayStep[] = [{
    action: null,
    board: [],
    foldedPlayerIds: [],
    kind: 'start',
    heroDecisionSequence: null,
    pot,
    revealOpponentCards: false,
    sequence: 0,
    stacks: copyStacks(stacks),
    street,
  }];

  let heroDecisionSequence = 0;
  game.history.forEach((action) => {
    if (streetOrder(action.street) > streetOrder(street)) {
      street = action.street;
      steps.push({
        action: null,
        board: boardForStreet(game, street),
        foldedPlayerIds: [...folded],
        kind: 'deal',
        heroDecisionSequence: null,
        pot,
        revealOpponentCards: false,
        sequence: steps.length,
        stacks: copyStacks(stacks),
        street,
      });
    }
    const paid = Math.max(0, action.potAfter - pot);
    stacks[action.playerId] = Math.max(0, (stacks[action.playerId] ?? 0) - paid);
    pot = action.potAfter;
    if (action.type === 'fold') folded.add(action.playerId);
    if (action.playerId === 'hero') heroDecisionSequence += 1;
    steps.push({
      action,
      board: boardForStreet(game, action.street),
      foldedPlayerIds: [...folded],
      kind: 'action',
      heroDecisionSequence: action.playerId === 'hero' ? heroDecisionSequence : null,
      pot,
      revealOpponentCards: false,
      sequence: steps.length,
      stacks: copyStacks(stacks),
      street: action.street,
    });
  });

  let lastBoardLength = steps.at(-1)?.board.length ?? 0;
  const remainingDeals: Array<{ count: number; street: Street }> = [
    { count: 3, street: 'flop' },
    { count: 4, street: 'turn' },
    { count: 5, street: 'river' },
  ];
  remainingDeals.forEach(({ count, street: dealtStreet }) => {
    if (count <= lastBoardLength || count > game.board.length) return;
    steps.push({
      action: null,
      board: game.board.slice(0, count),
      foldedPlayerIds: [...folded],
      kind: 'deal',
      heroDecisionSequence: null,
      pot: outcome.totalPot,
      revealOpponentCards: false,
      sequence: steps.length,
      stacks: copyStacks(stacks),
      street: dealtStreet,
    });
    lastBoardLength = count;
  });
  steps.push({
    action: null,
    board: [...game.board],
    foldedPlayerIds: [...folded],
    kind: 'outcome',
    heroDecisionSequence: null,
    pot: game.outcome.totalPot,
    revealOpponentCards: game.outcome.showdown,
    sequence: steps.length,
    stacks: Object.fromEntries(game.tablePlayerIds.map((playerId) => [playerId, game.players[playerId]?.stack ?? 0])),
    street: 'complete',
  });
  return steps;
}

export function multiwayReplayStepForHeroDecision(
  steps: readonly MultiwayReplayStep[],
  decisionSequence: number,
): number {
  if (decisionSequence <= 0) return Math.max(0, steps.length - 1);
  const index = steps.findIndex((step) => step.heroDecisionSequence === decisionSequence);
  return index >= 0 ? index : Math.max(0, steps.length - 1);
}

export function multiwayReplayStepTitle(step: MultiwayReplayStep, game: MultiwayHandState): string {
  if (step.kind === 'start') return 'Cards dealt';
  if (step.kind === 'deal') return `${step.street[0]?.toUpperCase()}${step.street.slice(1)} dealt`;
  if (step.kind === 'outcome') return 'Hand complete';
  const actor = step.action ? game.players[step.action.playerId]?.name ?? step.action.playerId : 'Player';
  return step.action?.playerId === 'hero' ? 'Your action' : `${actor}’s action`;
}

export function multiwayReplayStepDescription(
  step: MultiwayReplayStep,
  game: MultiwayHandState,
): string {
  if (step.kind === 'start') return 'Blinds are posted and the action begins.';
  if (step.kind === 'deal') return `${step.street[0]?.toUpperCase()}${step.street.slice(1)} cards are on the board.`;
  if (step.kind === 'outcome') return multiwayOutcomeMessage(game);
  const action = step.action;
  if (!action) return '';
  const actor = action.playerId === 'hero' ? 'You' : game.players[action.playerId]?.name ?? action.playerId;
  if (action.type === 'raise') return `${actor} raises to ${formatBb(action.amount, game.bigBlind)}.`;
  if (action.type === 'call') return `${actor} calls ${formatBb(action.amount, game.bigBlind)}.`;
  return `${actor} ${action.type === 'check' ? 'checks' : 'folds'}.`;
}

export function replayVisibleCards(
  player: MultiwayPlayerState,
  step: MultiwayReplayStep,
): Card[] {
  if (player.id === 'hero') return player.holeCards;
  if (!step.revealOpponentCards || player.folded || step.foldedPlayerIds.includes(player.id)) return [];
  return player.holeCards;
}
