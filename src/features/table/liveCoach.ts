import type { TablePosition } from '../../domain/poker/multiway';
import {
  buildPreflopPlan,
  preferredPreflopRaiseTo,
  type PreflopFacing,
} from '../../domain/poker/preflopStrategy';
import type { Card, LegalActions, Street } from '../../domain/poker/types';

export interface LiveCoachRecommendation {
  action: 'Bet' | 'Call' | 'Check' | 'Fold' | 'Raise' | 'Wait';
  detail: string;
  headline: string;
  target?: number;
}

interface LiveCoachInput {
  bigBlind: number;
  currentBet: number;
  equity: number | null;
  legal: LegalActions;
  opponentCount: number;
  playerStreetBet: number;
  playersBehind: number;
  pot: number;
  preflop?: {
    cards: readonly Card[];
    effectiveStackBb: number;
    facing: PreflopFacing;
    limperCount?: number;
    playerCount: number;
    position: TablePosition;
    raiseSizeBb?: number;
  };
  street: Street;
}

function clampTarget(target: number, legal: LegalActions): number {
  if (legal.maxRaiseTo <= legal.minRaiseTo) return legal.maxRaiseTo;
  return Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(target)));
}

function formatBb(chips: number, bigBlind: number): string {
  return `${Math.round((chips / bigBlind) * 10) / 10} BB`;
}

function betSizeLabel(target: number, playerStreetBet: number, pot: number): string {
  const fraction = (target - playerStreetBet) / Math.max(1, pot);
  if (fraction <= 0.42) return '⅓ pot';
  if (fraction <= 0.62) return '½ pot';
  if (fraction <= 0.88) return '¾ pot';
  return 'pot';
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
      });
      return {
        action: 'Raise',
        headline: `Raise to ${formatBb(target, bigBlind)}`,
        detail: `${plan.explanation}${mixDetail}`,
        target,
      };
    }
    if (plan.primaryAction === 'call' && legal.canCall) {
      return {
        action: 'Call',
        headline: `Call ${formatBb(legal.toCall, bigBlind)}`,
        detail: `${plan.explanation}${mixDetail}`,
      };
    }
    if ((plan.primaryAction === 'check' || legal.canCheck) && legal.canCheck) {
      return {
        action: 'Check',
        headline: 'Check',
        detail: `${plan.explanation}${mixDetail}`,
      };
    }
    return {
      action: 'Fold',
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

  const requiredEquity = legal.toCall > 0
    ? legal.toCall / Math.max(1, pot + legal.toCall)
    : 0;
  const margin = equity - requiredEquity;
  const fairShare = 1 / Math.max(2, opponentCount + 1);
  const strongEquity = Math.min(0.68, fairShare + (opponentCount > 1 ? 0.15 : 0.12));

  if (legal.toCall > 0) {
    if (legal.canRaise && margin >= 0.12 && equity >= strongEquity) {
      const target = clampTarget(legal.suggestedRaiseTo, legal);
      return {
        action: 'Raise',
        headline: `Raise to ${formatBb(target, bigBlind)}`,
        detail: `You are about ${Math.round(margin * 100)} points above the call price. A value raise is the clearest beginner baseline.`,
        target,
      };
    }
    if (legal.canCall && margin >= 0) {
      return {
        action: 'Call',
        headline: `Call ${formatBb(legal.toCall, bigBlind)}`,
        detail: margin < 0.04
          ? 'Your estimate only just clears the price, so treat this as a close call rather than an automatic one.'
          : `Your estimate is about ${Math.round(margin * 100)} points above the break-even price.`,
      };
    }
    if (legal.canFold) {
      return {
        action: 'Fold',
        headline: 'Fold',
        detail: `The call needs ${Math.round(requiredEquity * 100)}% equity; your current estimate is ${Math.round(equity * 100)}%.`,
      };
    }
  }

  if (legal.canRaise && equity >= strongEquity) {
    const rawTarget = street === 'preflop' || currentBet > 0
      ? legal.suggestedRaiseTo
      : playerStreetBet + pot * (equity >= strongEquity + 0.14 ? 0.75 : 0.5);
    const target = clampTarget(rawTarget, legal);
    const action = currentBet === 0 ? 'Bet' : 'Raise';
    const size = street === 'preflop' || currentBet > 0
      ? formatBb(target, bigBlind)
      : `${betSizeLabel(target, playerStreetBet, pot)} · ${formatBb(target, bigBlind)}`;
    return {
      action,
      headline: `${action} ${action === 'Raise' ? 'to ' : ''}${size}`,
      detail: playersBehind > 0
        ? `Your equity is strong for this field. This controlled size leaves room if one of the ${playersBehind} player${playersBehind === 1 ? '' : 's'} behind continues.`
        : 'Your equity is strong for this field and action closes with you, so a value bet is a clear baseline.',
      target,
    };
  }

  return {
    action: 'Check',
    headline: 'Check',
    detail: legal.canCheck
      ? 'You can see the next action for free. Keep the pot manageable with a hand that is not clearly ahead.'
      : 'No aggressive action is recommended from the available options.',
  };
}
