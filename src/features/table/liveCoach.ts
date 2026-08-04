import type { TablePosition } from '../../domain/poker/multiway';
import {
  buildPreflopPlan,
  preferredPreflopRaiseTo,
  type PreflopFacing,
} from '../../domain/poker/preflopStrategy';
import { buildPostflopPlan, type PostflopInitiative } from '../../domain/poker/postflopStrategy';
import type { Card, LegalActions, Street } from '../../domain/poker/types';
import { formatChips } from '../../domain/poker/moneyFormat';

export interface LiveCoachRecommendation {
  action: 'Bet' | 'Call' | 'Check' | 'Fold' | 'Raise' | 'Wait';
  alternative?: {
    detail: string;
    headline: string;
  };
  basis?: string;
  detail: string;
  headline: string;
  target?: number;
}

interface LiveCoachInput {
  bigBlind: number;
  board: readonly Card[];
  cards: readonly Card[];
  currentBet: number;
  effectiveStack: number;
  equity: number | null;
  initiative: PostflopInitiative;
  legal: LegalActions;
  opponentCount: number;
  playerStreetBet: number;
  playersBehind: number;
  pot: number;
  preflop?: {
    cards: readonly Card[];
    callersAfterRaise?: number;
    effectiveStackBb: number;
    facing: PreflopFacing;
    limperCount?: number;
    playerCount: number;
    position: TablePosition;
    raiseCount?: number;
    raiseSizeBb?: number;
    raiserPosition?: TablePosition;
  };
  street: Street;
  tournamentPressureLabel?: string | null;
  tournamentRiskPremium?: number;
}

/**
 * A deliberately conservative, public-information-only learning baseline.
 * It is not represented as solver output and never reads an opponent's cards.
 */
export function buildLiveCoachRecommendation(input: LiveCoachInput): LiveCoachRecommendation {
  const {
    bigBlind,
    currentBet,
    equity,
    legal,
    opponentCount,
    playerStreetBet,
    playersBehind,
    pot,
    street,
  } = input;

  if (street === 'preflop' && input.preflop) {
    const plan = buildPreflopPlan({
      ...input.preflop,
      canCheck: legal.canCheck,
      tournamentMode: Boolean(input.tournamentPressureLabel),
      tournamentRiskPremium: input.tournamentRiskPremium,
    });
    const mixDetail = plan.category === 'mix'
      ? ` This is a mixed spot: raise ${Math.round(plan.frequencies.raise * 100)}%, call ${Math.round(plan.frequencies.call * 100)}%, check ${Math.round(plan.frequencies.check * 100)}%, fold ${Math.round(plan.frequencies.fold * 100)}%.`
      : '';
    if (plan.primaryAction === 'raise' && legal.canRaise) {
      const target = preferredPreflopRaiseTo({
        bigBlind,
        currentBet,
        facing: input.preflop.facing,
        legal,
        limperCount: input.preflop.limperCount,
        playerStreetBet,
        position: input.preflop.position,
        stackBand: plan.stackBand,
        jamPreferred: plan.jamPreferred,
      });
      return {
        action: 'Raise',
        basis: input.tournamentPressureLabel ?? undefined,
        headline: plan.jamPreferred
          ? `Move all-in · ${formatChips(target)}`
          : `Raise to ${formatChips(target)}`,
        detail: `${plan.explanation}${mixDetail}`,
        target,
      };
    }
    if (plan.primaryAction === 'call' && legal.canCall) {
      return {
        action: 'Call',
        basis: input.tournamentPressureLabel ?? undefined,
        headline: `Call ${formatChips(legal.toCall)}`,
        detail: `${plan.explanation}${mixDetail}`,
      };
    }
    if ((plan.primaryAction === 'check' || legal.canCheck) && legal.canCheck) {
      return {
        action: 'Check',
        basis: input.tournamentPressureLabel ?? undefined,
        headline: 'Check',
        detail: `${plan.explanation}${mixDetail}`,
      };
    }
    return {
      action: 'Fold',
      basis: input.tournamentPressureLabel ?? undefined,
      headline: 'Fold',
      detail: `${plan.explanation}${mixDetail}`,
    };
  }

  if (equity === null) {
    return {
      action: 'Wait',
      headline: 'Reading the table…',
      detail: 'The coach is estimating the live ranges from public information.',
    };
  }

  if (street === 'complete' || street === 'preflop') {
    return { action: 'Wait', detail: 'No postflop decision is available.', headline: 'Reading the table…' };
  }

  const plan = buildPostflopPlan({
    bigBlind,
    board: input.board,
    cards: input.cards,
    currentBet,
    effectiveStack: input.effectiveStack,
    equity,
    initiative: input.initiative,
    legal,
    opponentCount,
    playerStreetBet,
    playersBehind,
    pot,
    requireDirectPriceEdge: true,
    street,
    tournamentRiskPremium: input.tournamentRiskPremium,
  });
  const primary = plan.primary;
  const alternative = plan.alternatives.find((candidate) => candidate.action.type !== primary.action.type)
    ?? plan.alternatives[0];
  const action = primary.action.type === 'raise'
    ? currentBet === 0 ? 'Bet' : 'Raise'
    : primary.action.type === 'call' ? 'Call'
      : primary.action.type === 'fold' ? 'Fold' : 'Check';
  const priceContext = legal.toCall > 0
    ? `Your estimate is ${Math.round(equity * 100)}%; the call price is ${Math.round(plan.requiredEquity * 100)}%.`
    : `Your estimate is ${Math.round(equity * 100)}% against ${opponentCount} live range${opponentCount === 1 ? '' : 's'}.`;
  return {
    action,
    alternative: alternative ? { detail: alternative.detail, headline: alternative.headline } : undefined,
    basis: [
      input.tournamentPressureLabel,
      `${plan.handLabel} · ${plan.textureLabel} · SPR ${Math.round(plan.stackToPotRatio * 10) / 10}`,
    ].filter(Boolean).join(' · '),
    detail: `${priceContext} ${primary.detail}`,
    headline: primary.headline,
    target: primary.action.type === 'raise' ? primary.action.amount : undefined,
  };
}
