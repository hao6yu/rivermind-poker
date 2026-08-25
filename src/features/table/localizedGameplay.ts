import type { ActionRecord, CoachFocusArea, GameState, PlayerAction, PlayerId, Street } from '../../domain/poker/types';
import type { MultiwayHandState } from '../../domain/poker/multiway';
import { multiwayIsWalk, multiwayPlayerAward } from '../../domain/poker/multiwaySession';
import type { MessageKey } from '../../localization/messages';
import type { AppLanguage, TranslationValues } from '../../localization/core';
import type { CoachRequestErrorCode } from '../../services/coachErrors';
import type { LiveCoachRecommendation } from './liveCoach';
import type { HandResultSummary } from './gameplayPresentation';
import type { MultiwayReplayStep, MultiwayResultSummary } from './multiwayGameplayPresentation';
import type { SessionLearningSummary } from '../../domain/poker/sessionLearning';
import { formatChips, formatChipsSigned } from '../../domain/poker/moneyFormat';
import type { SessionLearningVerdict } from './sessionModels';
import { buildLocalizedPokerActionBubblePresentation } from '../multiplayer/multiplayerGamePresentation';

export type GameplayTranslator = (key: MessageKey, values?: TranslationValues) => string;

export interface HeadsUpActionBubblePresentation {
  emphasis: string;
  text: string;
  tone: 'aggressive' | 'all-in' | 'call' | 'check' | 'fold';
}

export function localizedStreet(street: Street, t: GameplayTranslator): string {
  return t(`poker.street.${street}`);
}

export function localizedCoachFocus(focus: CoachFocusArea, t: GameplayTranslator): string {
  const keys: Record<CoachFocusArea, MessageKey> = {
    none: 'focus.none',
    preflop: 'focus.preflop',
    'value-betting': 'focus.valueBetting',
    bluffing: 'focus.bluffing',
    calling: 'focus.calling',
    'bet-sizing': 'focus.betSizing',
    'pot-odds': 'focus.potOdds',
    draws: 'focus.draws',
  };
  return t(keys[focus]);
}

export function localizedSessionLearningVerdict(
  summary: SessionLearningSummary,
  t: GameplayTranslator,
): SessionLearningVerdict {
  if (summary.decisionsGraded === 0) {
    return {
      detail: t('summary.review.noDetail'),
      title: t('summary.review.noTitle'),
      tone: 'empty',
    };
  }
  const detail = t('summary.review.detail', {
    close: summary.grades.close,
    hands: summary.handsGraded,
    mistakes: summary.grades.mistake,
    strong: summary.grades.strong,
  });
  // Never present the whole run as a clean match when any graded decision was a
  // supported alternative, a close spot, or a mistake. The grade count feeds the
  // detail text, but the tone comes from the presentation class.
  if (summary.classification === 'recommended' && summary.grades.mistake === 0 && (summary.strongRate ?? 0) >= 75) {
    return { detail, title: t('summary.review.strongTitle'), tone: 'strong' };
  }
  if ((summary.strongRate ?? 0) >= 55 && summary.grades.mistake <= summary.grades.close + 1) {
    return { detail, title: t('summary.review.solidTitle'), tone: 'solid' };
  }
  return { detail, title: t('summary.review.focusTitle'), tone: 'review' };
}

export function localizedLatestAction(
  action: ActionRecord,
  _bigBlind: number,
  t: GameplayTranslator,
): string {
  const actor = action.player === 'hero' ? t('common.you') : 'Mara';
  const amount = formatChips(action.amount);
  if (action.type === 'raise') {
    return t(action.decisionContext.currentBet === 0 ? 'poker.latest.bet' : 'poker.latest.raise', {
      actor,
      amount,
    });
  }
  if (action.type === 'call') return t('poker.latest.call', { actor, amount });
  return t(action.type === 'check' ? 'poker.latest.check' : 'poker.latest.fold', { actor });
}

export function localizedAiThinking(
  street: Street,
  toCall: number,
  t: GameplayTranslator,
  player = 'Mara',
): string {
  if (toCall > 0) return t('table.aiThinkingPrice', { player });
  if (street === 'river') return t('table.aiThinkingRiver', { player });
  if (street === 'turn') return t('table.aiThinkingTurn', { player });
  return t('table.aiThinking', { player });
}

export function localizedSeatAction(
  type: PlayerAction['type'],
  amount: number,
  _bigBlind: number,
  currentBet: number,
  t: GameplayTranslator,
): string {
  const value = formatChips(amount);
  if (type === 'raise') return t(currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: value });
  if (type === 'call') return t('poker.action.callAmount', { amount: value });
  return t(type === 'check' ? 'poker.action.check' : 'poker.action.fold');
}

/**
 * Keeps a compact, current-street action record beneath each active heads-up
 * seat. Advancing the board clears prior-street copy immediately.
 */
export function localizedHeadsUpSeatAction(
  game: GameState,
  player: PlayerId,
  t: GameplayTranslator,
): string | null {
  if (game.players[player].folded) return null;
  if (game.street === 'complete') return null;
  const street = game.street;
  const action = [...game.history].reverse().find((entry) => (
    entry.player === player && entry.street === street && entry.type !== 'fold'
  ));
  if (!action) return null;
  return localizedSeatAction(
    action.type,
    action.amount,
    game.bigBlind,
    action.decisionContext.currentBet,
    t,
  );
}

/**
 * Returns the player's latest action from the betting street currently on the
 * table. Completing or advancing the street clears the label instead of
 * carrying an old action into a new decision.
 */
export function localizedMultiwaySeatAction(
  game: Pick<MultiwayHandState, 'history' | 'street'>,
  playerId: string,
  t: GameplayTranslator,
): string | null {
  if (game.street === 'complete') return null;
  let actionIndex = -1;
  for (let index = game.history.length - 1; index >= 0; index -= 1) {
    const candidate = game.history[index];
    if (candidate?.playerId === playerId && candidate.street === game.street) {
      actionIndex = index;
      break;
    }
  }
  if (actionIndex < 0) return null;
  const action = game.history[actionIndex];
  if (!action) return null;
  const amount = formatChips(action.amount);
  if (action.type === 'raise') {
    const priorAggression = game.history.slice(0, actionIndex).some((entry) => (
      entry.street === action.street && entry.type === 'raise'
    ));
    return t(
      action.street !== 'preflop' && !priorAggression
        ? 'poker.action.betAmount'
        : 'poker.action.raiseTo',
      { amount },
    );
  }
  if (action.type === 'call') return t('poker.action.callAmount', { amount });
  return t(action.type === 'check' ? 'poker.action.check' : 'poker.action.fold');
}

/**
 * Builds a short, exact action callout for people and a lightly playful one
 * for Mara. Amounts always stay in table chips; no training BB units leak
 * into gameplay copy.
 */
export function localizedHeadsUpActionBubble(
  action: ActionRecord,
  historyIndex: number,
  t: GameplayTranslator,
  handNumber = 0,
): HeadsUpActionBubblePresentation {
  const isBet = action.type === 'raise' && action.decisionContext.currentBet === 0;
  const actionKind = isBet ? 'bet' : action.type;
  const amount = formatChips(action.amount);
  const paid = action.type === 'raise'
    ? Math.max(0, action.amount - action.decisionContext.playerStreetBetBefore)
    : action.amount;
  const allIn = action.type !== 'fold'
    && action.type !== 'check'
    && paid >= action.decisionContext.playerStackBefore;
  const presentation = buildLocalizedPokerActionBubblePresentation(
    actionKind,
    amount,
    t,
    {
      allIn,
      isAi: action.player === 'villain',
      seed: [
        'heads-up-action-bubble-v2',
        handNumber,
        historyIndex,
        action.player,
        action.street,
        action.type,
        action.amount,
        action.potAfter,
      ].join(':'),
    },
  );
  return {
    emphasis: presentation.emphasis,
    text: presentation.text,
    tone: presentation.tone,
  };
}

export function localizedCoachHeadline(
  recommendation: LiveCoachRecommendation,
  currentBet: number,
  maxRaiseTo: number,
  _bigBlind: number,
  toCall: number,
  t: GameplayTranslator,
): string {
  if (recommendation.action === 'Raise' || recommendation.action === 'Bet') {
    if (recommendation.target === maxRaiseTo) return `${t('poker.action.allIn')} · ${formatChips(maxRaiseTo)}`;
    if (recommendation.target) {
      return t(currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', {
        amount: formatChips(recommendation.target),
      });
    }
    return t(currentBet === 0 ? 'poker.action.bet' : 'poker.action.raise');
  }
  if (recommendation.action === 'Call') return t('poker.action.callAmount', { amount: formatChips(toCall) });
  if (recommendation.action === 'Check') return t('poker.action.check');
  if (recommendation.action === 'Fold') return t('poker.action.fold');
  return t('coach.live.waitingHeadline');
}

export function localizedCoachDetail(
  recommendation: LiveCoachRecommendation,
  language: AppLanguage,
  street: Street,
  equity: number | null,
  requiredEquity: number,
  opponentCount: number,
  t: GameplayTranslator,
): string {
  if (language === 'en') return recommendation.detail;
  if (recommendation.action === 'Wait' || equity === null) return t('coach.live.waiting');
  if (street === 'preflop') return t('coach.live.preflop');
  return t(requiredEquity > 0 ? 'coach.live.postflopPrice' : 'coach.live.postflopFree', {
    count: opponentCount,
    equity: Math.round(equity * 100),
    required: Math.round(requiredEquity * 100),
  });
}

export function localizedCoachAlternativeDetail(
  recommendation: LiveCoachRecommendation,
  language: AppLanguage,
  t: GameplayTranslator,
): string | null {
  if (!recommendation.alternative) return null;
  return language === 'en' ? recommendation.alternative.detail : t('coach.live.alternative');
}

export function localizedCoachAlternativeHeadline(
  recommendation: LiveCoachRecommendation,
  language: AppLanguage,
  t: GameplayTranslator,
): string | null {
  if (!recommendation.alternative) return null;
  return language === 'en' ? recommendation.alternative.headline : t('coach.live.alternativeTitle');
}

export function localizedCoachError(code: CoachRequestErrorCode, t: GameplayTranslator): string {
  return t(`coach.error.${code}`);
}

export function buildLocalizedHandResultSummary(
  game: GameState,
  startingHeroStack: number,
  t: GameplayTranslator,
): HandResultSummary | null {
  const outcome = game.outcome;
  if (!outcome) return null;

  const heroDelta = game.players.hero.stack - startingHeroStack;
  const winningHand = outcome.winner === 'hero'
    ? outcome.heroHand
    : outcome.winner === 'villain'
      ? outcome.villainHand
      : outcome.heroHand;
  const tone = outcome.winner === 'hero' ? 'win' : outcome.winner === 'villain' ? 'loss' : 'tie';
  const title = outcome.winner === 'hero'
    ? t('table.result.heroWins')
    : outcome.winner === 'villain'
      ? t('table.result.opponentWins', { player: 'Mara' })
      : t('table.result.split');
  const detail = winningHand
    ? t(outcome.winner === 'tie' ? 'table.result.bothHands' : 'table.result.winningHand', { hand: capitalize(winningHand) })
    : outcome.winner === 'hero'
      ? t('table.result.opponentFolded', { player: 'Mara' })
      : outcome.winner === 'villain'
        ? t('table.result.heroFolded')
        : outcome.message;

  return {
    detail,
    heroDelta: formatChipsSigned(heroDelta),
    heroStack: formatChips(game.players.hero.stack),
    pot: formatChips(outcome.potWon),
    title,
    tone,
    villainStack: formatChips(game.players.villain.stack),
  };
}

export function localizedMultiwayLatestAction(
  game: MultiwayHandState,
  t: GameplayTranslator,
): string {
  const action = game.history.at(-1);
  if (!action) {
    const dealer = game.buttonPlayerId === 'hero' ? t('common.you') : game.players[game.buttonPlayerId]?.name ?? t('common.opponent');
    const smallBlind = game.smallBlindPlayerId === 'hero' ? t('common.you') : game.players[game.smallBlindPlayerId]?.name ?? t('common.opponent');
    const bigBlind = game.bigBlindPlayerId === 'hero' ? t('common.you') : game.players[game.bigBlindPlayerId]?.name ?? t('common.opponent');
    return `D ${dealer} · SB ${smallBlind} · BB ${bigBlind}`;
  }
  return localizedMultiwayActionAt(game, game.history.length - 1, t);
}

export function localizedMultiwayRecentActions(
  game: MultiwayHandState,
  t: GameplayTranslator,
  limit = 3,
): string[] {
  if (limit <= 0 || game.history.length === 0) return [];
  const latestStreet = game.street === 'complete' ? game.history.at(-1)?.street : game.street;
  if (!latestStreet) return [];
  return game.history
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action.street === latestStreet)
    .slice(-limit)
    .map(({ index }) => localizedMultiwayActionAt(game, index, t));
}

export function localizedMultiwayOutcome(
  game: MultiwayHandState,
  t: GameplayTranslator,
): string {
  if (!game.outcome) return t('multiway.outcome.progress');
  const winners = game.outcome.winnerPlayerIds.map((playerId) => game.players[playerId]?.name ?? playerId);
  const heroWon = game.outcome.winnerPlayerIds.includes('hero');
  if (game.outcome.winnerPlayerIds.length > 1) return t('multiway.outcome.split', { players: winners.join(' / ') });
  if (multiwayIsWalk(game)) {
    const subject = game.history.length === 1
      ? t('multiway.outcome.otherPlayerFolds')
      : t('multiway.outcome.allOpponentsFold', { count: game.history.length });
    return heroWon
      ? t('multiway.outcome.walkHero', { subject })
      : t('multiway.outcome.walkOpponent', { player: winners[0] ?? t('common.opponent'), subject });
  }
  if (heroWon) {
    const hand = game.outcome.handDescriptions?.hero;
    return hand ? t('multiway.outcome.heroHand', { hand }) : t('multiway.outcome.heroFoldWin');
  }
  const winner = winners[0] ?? t('common.opponent');
  const winnerId = game.outcome.winnerPlayerIds[0];
  const hand = winnerId ? game.outcome.handDescriptions?.[winnerId] : undefined;
  return hand
    ? t('multiway.outcome.opponentHand', { hand, player: winner })
    : t('multiway.outcome.opponentPot', { player: winner });
}

export function buildLocalizedMultiwayResultSummary(
  game: MultiwayHandState,
  startingHeroStack: number,
  t: GameplayTranslator,
): MultiwayResultSummary | null {
  if (!game.outcome) return null;
  const heroAward = multiwayPlayerAward(game, 'hero');
  const heroWon = heroAward > 0;
  const heroIsWinner = game.outcome.winnerPlayerIds.includes('hero');
  const split = game.outcome.winnerPlayerIds.length > 1;
  const heroDelta = (game.players.hero?.stack ?? 0) - startingHeroStack;
  const heroDeltaLabel = formatChipsSigned(heroDelta);
  const winner = game.players[game.outcome.winnerPlayerIds[0] ?? '']?.name ?? t('common.opponent');
  return {
    detail: localizedMultiwayOutcome(game, t),
    headlineAmount: heroIsWinner || heroWon
      ? heroDeltaLabel
      : formatChips(multiwayPlayerAward(game, game.outcome.winnerPlayerIds[0] ?? '')),
    heroDelta: heroDeltaLabel,
    heroStack: formatChips(game.players.hero?.stack ?? 0),
    pot: formatChips(game.outcome.totalPot),
    title: heroIsWinner
      ? split ? t('multiway.result.sharePot') : multiwayIsWalk(game) ? t('multiway.result.walk') : t('table.result.heroWins')
      : heroWon ? t('multiway.result.recover') : t('multiway.result.opponentWins', { player: winner }),
    tone: heroIsWinner ? split ? 'tie' : 'win' : 'loss',
  };
}

export function localizedMultiwayReplayTitle(
  step: MultiwayReplayStep,
  game: MultiwayHandState,
  t: GameplayTranslator,
): string {
  if (step.kind === 'start') return t('replay.cardsDealt');
  if (step.kind === 'deal') return t('replay.streetDealt', { street: localizedStreet(step.street, t) });
  if (step.kind === 'outcome') return t('table.handComplete');
  const actor = step.action ? game.players[step.action.playerId]?.name ?? step.action.playerId : t('common.opponent');
  return step.action?.playerId === 'hero'
    ? t('replay.heroAction')
    : t('replay.playerAction', { player: actor });
}

export function localizedMultiwayReplayDescription(
  step: MultiwayReplayStep,
  game: MultiwayHandState,
  t: GameplayTranslator,
): string {
  if (step.kind === 'start') return t('replay.startDescription');
  if (step.kind === 'deal') return t('replay.boardDescription', { street: localizedStreet(step.street, t) });
  if (step.kind === 'outcome') return localizedMultiwayOutcome(game, t);
  const action = step.action;
  if (!action) return '';
  const actor = action.playerId === 'hero' ? t('common.you') : game.players[action.playerId]?.name ?? action.playerId;
  const amount = formatChips(action.amount);
  if (action.type === 'raise') return t('poker.latest.raise', { actor, amount });
  if (action.type === 'call') return t('poker.latest.call', { actor, amount });
  return t(action.type === 'check' ? 'poker.latest.check' : 'poker.latest.fold', { actor });
}

function localizedMultiwayActionAt(
  game: MultiwayHandState,
  index: number,
  t: GameplayTranslator,
): string {
  const action = game.history[index];
  if (!action) return '';
  const actor = action.playerId === 'hero' ? t('common.you') : game.players[action.playerId]?.name ?? action.playerId;
  const amount = formatChips(action.amount);
  if (action.type === 'raise') {
    const priorAggression = game.history.slice(0, index).some(
      (entry) => entry.street === action.street && entry.type === 'raise',
    );
    return t(action.street !== 'preflop' && !priorAggression ? 'poker.latest.bet' : 'poker.latest.raise', { actor, amount });
  }
  if (action.type === 'call') return t('poker.latest.call', { actor, amount });
  return t(action.type === 'check' ? 'poker.latest.check' : 'poker.latest.fold', { actor });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
