import type { BeginnerTutorialState, BeginnerTutorialStepId, TutorialActionId } from '../../domain/tutorial/beginnerTutorial';
import {
  isInteractiveStep,
  recommendedActionId,
  SEATS_FOCUS_SEQUENCE,
} from '../../domain/tutorial/beginnerTutorial';
import type { MessageKey } from '../../localization/messages';

/** The translation function shape the presenters need (the localization t()). */
export type TutorialTranslator = (key: MessageKey, values?: Record<string, string | number>) => string;

/** Localized retry-hint key per interactive step and declined action. */
const RETRY_KEYS: Partial<Record<BeginnerTutorialStepId, Partial<Record<TutorialActionId, MessageKey>>>> = {
  'preflop-raise': {
    call: 'tutorial.retry.preflopRaise.call',
    fold: 'tutorial.retry.preflopRaise.fold',
  },
  'flop-decision': {
    fold: 'tutorial.retry.flopDecision.fold',
    raise: 'tutorial.retry.flopDecision.raise',
  },
  'turn-check': {
    bet: 'tutorial.retry.turnCheck.bet',
  },
  'river-value-bet': {
    check: 'tutorial.retry.riverValueBet.check',
  },
};

/** The current step's coach message (localized; one teaching point each). */
export function coachMessageFor(
  state: BeginnerTutorialState,
  t: TutorialTranslator,
): string | null {
  switch (state.stepId) {
    case 'welcome':
      return t('tutorial.step.welcome.coach');
    case 'seats-and-blinds': {
      const focus = SEATS_FOCUS_SEQUENCE[state.seatsFocusIndex] ?? 'dealer';
      if (focus === 'dealer') return t('tutorial.step.seats.coachDealer');
      if (focus === 'small-blind') return t('tutorial.step.seats.coachSmallBlind');
      return t('tutorial.step.seats.coachBigBlind');
    }
    case 'hole-cards':
      return t('tutorial.step.holeCards.coach');
    case 'preflop-raise':
      return t('tutorial.step.preflopRaise.coach');
    case 'flop-reveal':
      return t('tutorial.step.flopReveal.coach');
    case 'flop-decision':
      return t('tutorial.step.flopDecision.coach');
    case 'turn-check':
      return t('tutorial.step.turnCheck.coach');
    case 'river-value-bet':
      return t('tutorial.step.riverValueBet.coach');
    case 'showdown':
      return t('tutorial.step.showdown.coach');
    case 'recap':
      return null;
    default:
      return null;
  }
}

/** The guided steps' continue label; interactive steps render the action bar. */
export function ctaLabelFor(
  state: BeginnerTutorialState,
  t: TutorialTranslator,
): string | null {
  if (isInteractiveStep(state.stepId)) return null;
  switch (state.stepId) {
    case 'welcome':
      return t('tutorial.step.welcome.cta');
    case 'seats-and-blinds':
      return state.seatsFocusIndex >= SEATS_FOCUS_SEQUENCE.length - 1
        ? t('tutorial.step.seats.ctaDeal')
        : t('tutorial.step.seats.ctaNext');
    case 'hole-cards':
      return t('tutorial.common.next');
    case 'flop-reveal':
      return t('tutorial.step.flopReveal.cta');
    case 'showdown':
      // Showdown → recap: the reviewer finding (#12) requires a working
      // advance affordance for touch, keyboard, and screen reader.
      return t('tutorial.step.showdown.cta');
    default:
      return null;
  }
}

/** Localized supportive explanation for the declined action, or null. */
export function retryCopyFor(
  state: BeginnerTutorialState,
  t: TutorialTranslator,
): string | null {
  if (!state.declinedActionId) return null;
  const key = RETRY_KEYS[state.stepId]?.[state.declinedActionId];
  return key ? t(key) : null;
}

/** The recommended action the retry hint nudges toward (null when none). */
export function recommendedActionFor(state: BeginnerTutorialState): TutorialActionId | null {
  return recommendedActionId(state.stepId);
}

/** The "Step X of N" label for the current step. */
export function progressLabelFor(
  stepId: BeginnerTutorialStepId,
  stepIndex: number,
  total: number,
  t: TutorialTranslator,
): string {
  return t('tutorial.progress.label', { step: stepIndex + 1, total });
}

/** The math detail's authored values, pinned by the plan's chip script. */
export const FLOP_MATH_VALUES = { call: 2, hearts: 9, percent: 19, pot: 15, price: 13, unseen: 47 } as const;
