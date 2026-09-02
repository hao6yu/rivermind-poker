import type {
  MultiwayActionRecord,
  MultiwayHandState,
} from '../../domain/poker/multiway';
import { formatChips } from '../../domain/poker/moneyFormat';
import type { MessageKey } from '../../localization';
import type { TranslationValues } from '../../localization/core';

export type MultiplayerActionBubbleTranslator = (
  key: MessageKey,
  values?: TranslationValues,
) => string;

type Translator = MultiplayerActionBubbleTranslator;

export type MultiplayerActionBubbleAction = 'bet' | 'call' | 'check' | 'fold' | 'raise';

export type MultiplayerActionBubbleTone =
  | 'aggressive'
  | 'all-in'
  | 'call'
  | 'check'
  | 'fold';

export interface MultiplayerActionBubbleOptions {
  /** The caller knows whether this action emptied the actor's stack. */
  allIn?: boolean;
  /** Human and viewer actions deliberately stay factual instead of speaking for them. */
  isAi?: boolean;
  /** Reuses the authoritative history position for bet detection and stable copy rotation. */
  historyIndex?: number;
  /** Optional deterministic override for previews and visual tests. */
  variant?: number;
}

export interface MultiplayerActionBubblePresentation {
  action: MultiplayerActionBubbleAction;
  /** Localized action verb that the UI can emphasize inside `text`. */
  emphasis: string;
  text: string;
  tone: MultiplayerActionBubbleTone;
}

export interface LocalizedPokerActionBubbleOptions {
  /** Whether the canonical action also emptied the actor's stack. */
  allIn?: boolean;
  /** AI copy can be playful; human copy remains varied but strictly factual. */
  isAi?: boolean;
  /** Stable authoritative identity used for deterministic copy selection. */
  seed: number | string;
  /** Optional deterministic override for previews and visual tests. */
  variant?: number;
}

const ACTION_BATCH_BUDGET_MS = 7_800;
const MAX_ACTION_HOLD_MS = 1_600;
const MIN_ACTION_HOLD_MS = 1_100;
const MAX_PRESENTED_ACTIONS_PER_TRANSITION = 8;

/**
 * A human all-in can let the server resolve several AI-only streets in one
 * response. Preserve every ordinary table round, but compact an exceptional
 * runout to the initiating action plus the final decisions so presentation
 * never trails the settled hand for tens of seconds.
 */
export function multiplayerActionPresentationIndexes(batchSize: number): number[] {
  const safeSize = Math.max(0, Math.floor(batchSize));
  if (safeSize <= MAX_PRESENTED_ACTIONS_PER_TRANSITION) {
    return Array.from({ length: safeSize }, (_, index) => index);
  }
  const tailStart = safeSize - (MAX_PRESENTED_ACTIONS_PER_TRANSITION - 1);
  return [
    0,
    ...Array.from(
      { length: MAX_PRESENTED_ACTIONS_PER_TRANSITION - 1 },
      (_, index) => tailStart + index,
    ),
  ];
}

/** Keep one action readable without letting a full AI round trail the live table. */
export function multiplayerActionDurationMs(batchSize: number): number {
  const safeSize = Math.max(1, Math.floor(batchSize));
  return Math.max(
    MIN_ACTION_HOLD_MS,
    Math.min(MAX_ACTION_HOLD_MS, Math.floor(ACTION_BATCH_BUDGET_MS / safeSize)),
  );
}

export interface MultiplayerResultPayout {
  amount: number;
  label: string;
  playerId: string;
}

export interface MultiplayerResultPresentation {
  detail: string;
  /**
   * Amount owned by the headline subject. Multiple-recipient results omit it
   * unless the viewer is one of those recipients; `totalPot` remains context.
   */
  headlineAmount: number | null;
  payouts: MultiplayerResultPayout[];
  showdown: boolean;
  title: string;
  tone: 'loss' | 'split' | 'win';
  totalPot: number;
}

export type MultiplayerSeatRole = 'D' | 'SB' | 'BB' | null;

/**
 * A transient seat bubble already narrates the live action, while a completed
 * hand owns the result panel. The center lane is reserved for turn context
 * only when neither of those stronger messages is present.
 */
export function multiplayerShowsCenterTurnStatus(input: {
  actionPresented: boolean;
  handResultVisible: boolean;
  /**
   * P18-043/D09: one turn indicator. The acting seat's plaque owns the turn
   * state; the center pill exists only while that plaque is not rendered
   * (for example a seat absent from the ring).
   */
  actorPlaqueVisible: boolean;
}): boolean {
  return !input.actionPresented && !input.handResultVisible && !input.actorPlaqueVisible;
}

/**
 * Keep only the three roles a player must identify at a glance. The button
 * wins in heads-up play (where it is also the small blind) so a seat never
 * carries two competing badges.
 */
export function multiplayerSeatRole(
  hand: MultiwayHandState,
  playerId: string,
): MultiplayerSeatRole {
  if (hand.buttonPlayerId === playerId) return 'D';
  if (hand.smallBlindPlayerId === playerId) return 'SB';
  if (hand.bigBlindPlayerId === playerId) return 'BB';
  return null;
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

function isOpeningPostflopBet(
  hand: MultiwayHandState,
  action: MultiwayActionRecord,
  index: number,
): boolean {
  return action.type === 'raise'
    && action.street !== 'preflop'
    && !hand.history.slice(0, index).some(
      (entry) => entry.street === action.street && entry.type === 'raise',
    );
}

function bubbleActionAt(
  hand: MultiwayHandState,
  action: MultiwayActionRecord,
  index: number,
): MultiplayerActionBubbleAction {
  return isOpeningPostflopBet(hand, action, index) ? 'bet' : action.type;
}

function neutralBubbleActionLabel(
  action: MultiplayerActionBubbleAction,
  amount: string,
  t: Translator,
): string {
  if (action === 'call') return t('poker.action.callAmount', { amount });
  if (action === 'bet') return t('poker.action.betAmount', { amount });
  if (action === 'raise') return t('poker.action.raiseTo', { amount });
  return t(action === 'check' ? 'poker.action.check' : 'poker.action.fold');
}

type AiBubbleKeyPool = readonly [MessageKey, MessageKey, MessageKey, MessageKey];
type HumanBubbleKeyPool = readonly [MessageKey, MessageKey, MessageKey];

const aiBubbleKeys: Record<MultiplayerActionBubbleAction, AiBubbleKeyPool> = {
  bet: [
    'multiplayer.actionBubble.ai.bet.lead',
    'multiplayer.actionBubble.ai.bet.build',
    'multiplayer.actionBubble.ai.bet.price',
    'multiplayer.actionBubble.ai.bet.waters',
  ],
  call: [
    'multiplayer.actionBubble.ai.call.along',
    'multiplayer.actionBubble.ai.call.showMe',
    'multiplayer.actionBubble.ai.call.keepGoing',
    'multiplayer.actionBubble.ai.call.stillHere',
  ],
  check: [
    'multiplayer.actionBubble.ai.check.freeLook',
    'multiplayer.actionBubble.ai.check.another',
    'multiplayer.actionBubble.ai.check.noRush',
    'multiplayer.actionBubble.ai.check.yourMove',
  ],
  fold: [
    'multiplayer.actionBubble.ai.fold.out',
    'multiplayer.actionBubble.ai.fold.notThisOne',
    'multiplayer.actionBubble.ai.fold.notMySpot',
    'multiplayer.actionBubble.ai.fold.yours',
  ],
  raise: [
    'multiplayer.actionBubble.ai.raise.pressure',
    'multiplayer.actionBubble.ai.raise.heat',
    'multiplayer.actionBubble.ai.raise.interesting',
    'multiplayer.actionBubble.ai.raise.morePressure',
  ],
};

const humanBubbleKeys: Record<MultiplayerActionBubbleAction, HumanBubbleKeyPool> = {
  bet: [
    'multiplayer.actionBubble.human.bet.opens',
    'multiplayer.actionBubble.human.bet.price',
    'multiplayer.actionBubble.human.bet.committed',
  ],
  call: [
    'multiplayer.actionBubble.human.call.matched',
    'multiplayer.actionBubble.human.call.committed',
    'multiplayer.actionBubble.human.call.staysIn',
  ],
  check: [
    'multiplayer.actionBubble.human.check.noChips',
    'multiplayer.actionBubble.human.check.movesOn',
    'multiplayer.actionBubble.human.check.potUnchanged',
  ],
  fold: [
    'multiplayer.actionBubble.human.fold.released',
    'multiplayer.actionBubble.human.fold.stepsOut',
    'multiplayer.actionBubble.human.fold.surrendered',
  ],
  raise: [
    'multiplayer.actionBubble.human.raise.increased',
    'multiplayer.actionBubble.human.raise.newTotal',
    'multiplayer.actionBubble.human.raise.committed',
  ],
};

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/**
 * Small deterministic hash for presentation-only copy rotation. It must not use
 * `Math.random()`: every client should render the same authoritative action with
 * the same words, and a re-render must never make a speech bubble flicker.
 */
function stableCopyIndex(seed: number | string, poolSize: number): number {
  const input = String(seed);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return (hash >>> 0) % poolSize;
}

function actionEmphasis(
  action: MultiplayerActionBubbleAction,
  t: Translator,
): string {
  const keys: Record<MultiplayerActionBubbleAction, MessageKey> = {
    bet: 'poker.action.bet',
    call: 'poker.action.call',
    check: 'poker.action.check',
    fold: 'poker.action.fold',
    raise: 'poker.action.raise',
  };
  return t(keys[action]);
}

/**
 * Shared localized copy builder for multiplayer and heads-up tables. `amount`
 * is already formatted by the owning game so this layer never changes units or
 * precision. The canonical action is injected into every variant, guaranteeing
 * that playful copy cannot hide or alter what happened.
 */
export function buildLocalizedPokerActionBubblePresentation(
  action: MultiplayerActionBubbleAction,
  amount: string,
  t: Translator,
  options: LocalizedPokerActionBubbleOptions,
): MultiplayerActionBubblePresentation {
  const canonicalAction = neutralBubbleActionLabel(action, amount, t);
  const pool = options.isAi ? aiBubbleKeys[action] : humanBubbleKeys[action];
  const variant = options.variant === undefined
    ? stableCopyIndex(options.seed, pool.length)
    : positiveModulo(Math.floor(options.variant), pool.length);
  const selectedKey = pool[variant] ?? pool[0];
  let text = t(selectedKey, { action: canonicalAction });
  if (options.allIn && (action === 'bet' || action === 'call' || action === 'raise')) {
    text = `${text} · ${t('poker.action.allIn')}`;
  }

  return {
    action,
    emphasis: actionEmphasis(action, t),
    text,
    tone: options.allIn && (action === 'bet' || action === 'call' || action === 'raise')
      ? 'all-in'
      : action === 'bet' || action === 'raise'
        ? 'aggressive'
        : action,
  };
}

/**
 * Builds the short-lived copy shown beside an acting seat. AI seats get a
 * little personality; people always get exact, neutral copy so RiverMind
 * never invents dialogue on their behalf.
 */
export function buildMultiplayerActionBubblePresentation(
  hand: MultiwayHandState,
  actionRecord: MultiwayActionRecord,
  t: Translator,
  options: MultiplayerActionBubbleOptions = {},
): MultiplayerActionBubblePresentation {
  const discoveredIndex = hand.history.indexOf(actionRecord);
  const historyIndex = options.historyIndex ?? (discoveredIndex >= 0 ? discoveredIndex : hand.history.length);
  const action = bubbleActionAt(hand, actionRecord, Math.max(0, historyIndex));
  const amount = formatChips(actionRecord.amount);
  const canBeAllIn = action === 'bet' || action === 'call' || action === 'raise';
  const allIn = options.allIn === true && canBeAllIn;
  const stableSeed = [
    'action-bubble-v2',
    hand.handNumber,
    historyIndex,
    actionRecord.playerId,
    actionRecord.street,
    actionRecord.type,
    actionRecord.amount,
    actionRecord.potAfter,
  ].join(':');

  return buildLocalizedPokerActionBubblePresentation(action, amount, t, {
    allIn,
    isAi: options.isAi,
    seed: stableSeed,
    variant: options.variant,
  });
}

function normalizedRankLabel(value: string): string {
  const labels: Record<string, string> = {
    ace: 'A',
    Aces: 'A',
    Jacks: 'J',
    Kings: 'K',
    Queens: 'Q',
  };
  return labels[value] ?? value.replace(/s$/, '');
}

export function localizedMultiplayerHandDescription(
  description: string,
  t: Translator,
): string {
  const categories: Record<string, MessageKey> = {
    'Four of a kind': 'multiplayer.result.hand.fourOfAKind',
    'Full house': 'multiplayer.result.hand.fullHouse',
    Flush: 'multiplayer.result.hand.flush',
    Straight: 'multiplayer.result.hand.straight',
    'Straight flush': 'multiplayer.result.hand.straightFlush',
    'Three of a kind': 'multiplayer.result.hand.threeOfAKind',
    'Two pair': 'multiplayer.result.hand.twoPair',
  };
  const category = categories[description];
  if (category) return t(category);
  if (description.startsWith('Pair of ')) {
    return t('multiplayer.result.hand.onePair', {
      rank: normalizedRankLabel(description.slice('Pair of '.length)),
    });
  }
  const highCard = /^High card, (.+)-high$/.exec(description);
  if (highCard?.[1]) {
    return t('multiplayer.result.hand.highCard', {
      rank: normalizedRankLabel(highCard[1]),
    });
  }
  return description;
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
  // A seat action is live context, not hand history. Clearing it immediately
  // when the street advances prevents a preflop call/check from looking like
  // the player's flop action before they have actually made one.
  if (hand.street === 'complete') return null;
  const indexed = hand.history
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action.playerId === playerId && action.street === hand.street)
    .at(-1);
  if (!indexed) return null;
  const { action, index } = indexed;
  return multiplayerActionSeatLabel(hand, action, t, index);
}

/**
 * A compact, factual label for one authoritative history frame. Unlike
 * `multiplayerSeatActionLabel`, this intentionally does not require the
 * action to belong to the hand's latest street. It lets a queued transient
 * bubble and the text under its actor describe the same moment even when a
 * server transition contains several AI actions or crosses a street.
 */
export function multiplayerActionSeatLabel(
  hand: MultiwayHandState,
  action: MultiwayActionRecord,
  t: Translator,
  historyIndex = hand.history.indexOf(action),
): string | null {
  const index = Math.max(0, historyIndex);
  const amount = formatChips(action.amount);
  if (action.type === 'raise') {
    // Settlement can fully refund an uncontested final-street bet. The result
    // explains the win; "Bet 0" is not a meaningful persistent seat status.
    if (action.amount <= 0) return null;
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

  // `winnerPlayerIds` intentionally describes only the main pot. Side-pot
  // recipients must come from every award or the UI can call a paid viewer a
  // loser and place the entire pot beside the wrong player's name.
  const payoutAmounts = outcome.awards.reduce((amounts, award) => {
    Object.entries(award.shares).forEach(([playerId, amount]) => {
      if (amount <= 0) return;
      amounts.set(playerId, (amounts.get(playerId) ?? 0) + amount);
    });
    return amounts;
  }, new Map<string, number>());
  const payoutPlayerIds = [
    ...hand.tablePlayerIds.filter((playerId) => payoutAmounts.has(playerId)),
    ...[...payoutAmounts.keys()].filter((playerId) => !hand.tablePlayerIds.includes(playerId)),
  ];
  const payouts = payoutPlayerIds
    .map((playerId) => ({
      amount: payoutAmounts.get(playerId) ?? 0,
      label: playerLabel(hand, playerId, viewerPlayerId, t),
      playerId,
    }))
    .filter((payout) => payout.amount > 0)
    .sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label));

  const multipleRecipients = payouts.length > 1;
  const viewerPayout = payouts.find((payout) => payout.playerId === viewerPlayerId);
  const fallbackWinnerId = outcome.winnerPlayerIds[0];
  const soleRecipient = payouts.length === 1 ? payouts[0] : undefined;
  const resultPlayerId = soleRecipient?.playerId ?? fallbackWinnerId;
  const resultPlayerLabel = resultPlayerId
    ? playerLabel(hand, resultPlayerId, viewerPlayerId, t)
    : t('common.opponent');
  const payoutLabels = payouts.map((payout) => payout.label).join(' / ');
  const title = multipleRecipients
    ? viewerPayout
      ? t('multiplayer.result.youWinShare')
      : t('multiplayer.result.playersWinShares', { players: payoutLabels })
    : resultPlayerId === viewerPlayerId
      ? t('multiplayer.result.youWin')
      : t('multiplayer.result.playerWins', { player: resultPlayerLabel });

  // A main-pot hand description does not explain a different side-pot award.
  // Keep multi-recipient showdown copy neutral and let the complete payout list
  // state exactly who collected how much.
  const winningHand = resultPlayerId ? outcome.handDescriptions?.[resultPlayerId] : undefined;
  const detail = outcome.showdown
    ? !multipleRecipients && winningHand
      ? resultPlayerId === viewerPlayerId
        // P18-008: second person and third person conjugate differently in
        // English, and exactly one winner reaches this line, so the viewer
        // and a named winner take separate localized strings.
        ? t('multiplayer.result.showdownHandYou', {
          hand: localizedMultiplayerHandDescription(winningHand, t),
        })
        : t('multiplayer.result.showdownHand', {
          hand: localizedMultiplayerHandDescription(winningHand, t),
          winner: resultPlayerLabel,
        })
      : t('multiplayer.result.showdown')
    : t('multiplayer.result.everyoneFolded', { player: resultPlayerLabel });

  const viewerWonWithoutAwardData = payouts.length === 0
    && outcome.winnerPlayerIds.includes(viewerPlayerId);

  return {
    detail,
    headlineAmount: multipleRecipients
      ? viewerPayout?.amount ?? null
      : soleRecipient?.amount ?? null,
    payouts,
    showdown: outcome.showdown,
    title,
    tone: viewerPayout
      ? multipleRecipients ? 'split' : 'win'
      : viewerWonWithoutAwardData ? 'win' : 'loss',
    totalPot: outcome.totalPot,
  };
}
