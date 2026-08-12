import type {
  MultiwayActionRecord,
  MultiwayHandState,
} from '../../domain/poker/multiway';
import { formatChips } from '../../domain/poker/moneyFormat';
import type { MessageKey } from '../../localization';
import type { TranslationValues } from '../../localization/core';

type Translator = (key: MessageKey, values?: TranslationValues) => string;

export interface MultiplayerResultPayout {
  amount: number;
  label: string;
  playerId: string;
}

export interface MultiplayerResultPresentation {
  detail: string;
  payouts: MultiplayerResultPayout[];
  showdown: boolean;
  title: string;
  tone: 'loss' | 'split' | 'win';
  totalPot: number;
}

function playerLabel(
  hand: MultiwayHandState,
  playerId: string,
  viewerPlayerId: string,
  t: Translator,
): string {
  return playerId === viewerPlayerId
    ? t('common.you')
    : hand.players[playerId]?.name ?? t('common.opponent');
}

function actionLabelAt(
  hand: MultiwayHandState,
  action: MultiwayActionRecord,
  index: number,
  viewerPlayerId: string,
  t: Translator,
): string {
  const actor = playerLabel(hand, action.playerId, viewerPlayerId, t);
  const amount = formatChips(action.amount);
  if (action.type === 'raise') {
    const priorAggression = hand.history.slice(0, index).some(
      (entry) => entry.street === action.street && entry.type === 'raise',
    );
    return t(action.street !== 'preflop' && !priorAggression ? 'poker.latest.bet' : 'poker.latest.raise', {
      actor,
      amount,
    });
  }
  if (action.type === 'call') return t('poker.latest.call', { actor, amount });
  return t(action.type === 'check' ? 'poker.latest.check' : 'poker.latest.fold', { actor });
}

export function multiplayerActionLabel(
  hand: MultiwayHandState,
  action: MultiwayActionRecord,
  viewerPlayerId: string,
  t: Translator,
  historyIndex?: number,
): string {
  const index = historyIndex ?? hand.history.indexOf(action);
  return actionLabelAt(hand, action, Math.max(0, index), viewerPlayerId, t);
}

export function multiplayerSeatActionLabel(
  hand: MultiwayHandState,
  playerId: string,
  t: Translator,
): string | null {
  const currentStreetHasActions = hand.history.some((action) => action.street === hand.street);
  const latestStreet = hand.street === 'complete' || !currentStreetHasActions
    ? hand.history.at(-1)?.street
    : hand.street;
  if (!latestStreet) return null;
  const indexed = hand.history
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action.playerId === playerId && action.street === latestStreet)
    .at(-1);
  if (!indexed) return null;
  const { action, index } = indexed;
  const amount = formatChips(action.amount);
  if (action.type === 'raise') {
    const priorAggression = hand.history.slice(0, index).some(
      (entry) => entry.street === action.street && entry.type === 'raise',
    );
    return t(action.street !== 'preflop' && !priorAggression ? 'poker.action.betAmount' : 'poker.action.raiseTo', {
      amount,
    });
  }
  if (action.type === 'call') return t('poker.action.callAmount', { amount });
  return t(action.type === 'check' ? 'poker.action.check' : 'poker.action.fold');
}

export function buildMultiplayerResultPresentation(
  hand: MultiwayHandState,
  viewerPlayerId: string,
  t: Translator,
): MultiplayerResultPresentation | null {
  const outcome = hand.outcome;
  if (!outcome) return null;

  const winnerLabels = outcome.winnerPlayerIds.map((playerId) => (
    playerLabel(hand, playerId, viewerPlayerId, t)
  ));
  const viewerWon = outcome.winnerPlayerIds.includes(viewerPlayerId);
  const split = outcome.winnerPlayerIds.length > 1;
  const joinedWinners = winnerLabels.join(' / ');
  const title = split
    ? t('multiplayer.result.splitTitle', { players: joinedWinners })
    : viewerWon
      ? t('multiplayer.result.youWin')
      : t('multiplayer.result.playerWins', { player: winnerLabels[0] ?? t('common.opponent') });

  const mainWinnerId = outcome.winnerPlayerIds[0];
  const winningHand = mainWinnerId ? outcome.handDescriptions?.[mainWinnerId] : undefined;
  const detail = outcome.showdown
    ? winningHand
      ? t('multiplayer.result.showdownHand', { hand: winningHand, players: joinedWinners })
      : t('multiplayer.result.showdown')
    : t('multiplayer.result.everyoneFolded', { player: winnerLabels[0] ?? t('common.opponent') });

  const payouts = hand.tablePlayerIds
    .map((playerId) => ({
      amount: outcome.awards.reduce((total, award) => total + (award.shares[playerId] ?? 0), 0),
      label: playerLabel(hand, playerId, viewerPlayerId, t),
      playerId,
    }))
    .filter((payout) => payout.amount > 0)
    .sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label));

  return {
    detail,
    payouts,
    showdown: outcome.showdown,
    title,
    tone: viewerWon ? split ? 'split' : 'win' : 'loss',
    totalPot: outcome.totalPot,
  };
}
