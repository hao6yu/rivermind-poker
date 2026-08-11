import { formatChips } from './moneyFormat';
import { cardKey, seededRandom } from './cards';
import { estimateFieldEquity } from './equity';
import type { MultiwayActionRecord, MultiwayHandState, TablePosition } from './multiway';
import {
  buildPreflopPlan,
  preferredPreflopRaiseTo,
  preflopFacingFromPublicAction,
  type PreflopFrequencies,
  type PreflopPlanAction,
} from './preflopStrategy';
import {
  buildPostflopPlan,
  type PostflopCandidate,
  type PostflopInitiative,
  type PostflopPlan,
} from './postflopStrategy';
import type {
  ActionRecord,
  ActionType,
  Card,
  CoachFocusArea,
  CoachHandGrade,
  GameState,
  LegalActions,
  Street,
} from './types';

export interface DecisionLine {
  action: ActionType;
  /**
   * Chips the label quotes: the raise target for a raise, the amount owed for a
   * call, undefined for check/fold. Carried as a number so views can format it
   * themselves instead of parsing the English label back apart.
   */
  amountChips?: number;
  label: string;
}

export interface DecisionComparison {
  alternative: DecisionLine | null;
  baseline: DecisionLine;
  chosen: DecisionLine;
  detail: string;
  focusArea: CoachFocusArea;
  grade: CoachHandGrade;
  /** Postflop initiative at the moment of this decision; omitted preflop. */
  initiative?: PostflopInitiative;
  relativeScoreGap: number;
  sequence: number;
  street: Exclude<Street, 'complete'>;
  summary: string;
}

export interface HandDecisionReport {
  decisions: DecisionComparison[];
  focusArea: CoachFocusArea;
  focusDecisionSequence: number;
  handGrade: CoachHandGrade;
  summary: string;
}

interface PreflopDecisionInput {
  action: ActionType;
  amount: number;
  bigBlind: number;
  cards: readonly Card[];
  callersAfterRaise?: number;
  currentBet: number;
  effectiveStackBb: number;
  history: readonly { street: string; type: string }[];
  legal: LegalActions;
  limperCount: number;
  playerCount: number;
  playerStreetBet: number;
  position: TablePosition;
  raiseCount?: number;
  raiserPosition?: TablePosition;
  sequence: number;
  tournamentPressureLabel?: string;
  tournamentRiskPremium?: number;
}

interface PostflopDecisionInput {
  action: ActionType;
  amount: number;
  bigBlind: number;
  board: readonly Card[];
  cards: readonly Card[];
  currentBet: number;
  effectiveStack: number;
  equity?: number;
  initiative: PostflopInitiative;
  legal: LegalActions;
  opponentCount: number;
  playerStreetBet: number;
  playersBehind: number;
  pot: number;
  sequence: number;
  street: 'flop' | 'turn' | 'river';
  tournamentPressureLabel?: string;
  tournamentRiskPremium?: number;
}

const gradeWeight: Record<CoachHandGrade, number> = { strong: 0, close: 1, mistake: 2 };

function roundScore(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function actionLabel(
  action: ActionType,
  amountChips: number | undefined,
  currentBet: number,
): string {
  if (action === 'raise') {
    return `${currentBet === 0 ? 'Bet' : 'Raise'} to ${formatChips(amountChips ?? 0)}`;
  }
  if (action === 'call') return `Call ${formatChips(amountChips ?? 0)}`;
  return action === 'check' ? 'Check' : 'Fold';
}

function line(
  action: ActionType,
  amount: number | undefined,
  currentBet: number,
  legal: LegalActions,
): DecisionLine {
  const amountChips = action === 'raise' ? amount : action === 'call' ? legal.toCall : undefined;
  return {
    action,
    amountChips,
    label: actionLabel(action, amountChips, currentBet),
  };
}

function deterministicSeed(
  cards: readonly Card[],
  board: readonly Card[],
  sequence: number,
  opponentCount: number,
): number {
  const source = [...cards, ...board].map(cardKey).join('|') + `|${sequence}|${opponentCount}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function legalPreflopActions(frequencies: PreflopFrequencies, legal: LegalActions): Array<[PreflopPlanAction, number]> {
  return ([
    ['raise', frequencies.raise],
    ['call', frequencies.call],
    ['check', frequencies.check],
    ['fold', frequencies.fold],
  ] as Array<[PreflopPlanAction, number]>).filter(([action]) => (
    action === 'raise' ? legal.canRaise
      : action === 'call' ? legal.canCall
        : action === 'check' ? legal.canCheck : legal.canFold
  ));
}

function decisionSummary(grade: CoachHandGrade, chosen: string, baseline: string): string {
  if (grade === 'strong') return `Good match: ${chosen} follows the RiverMind baseline.`;
  if (grade === 'close') return `Close choice: ${chosen} is reasonable; the baseline slightly prefers ${baseline}.`;
  return `Review this spot: you chose ${chosen}; the baseline prefers ${baseline}.`;
}

function gradePreflopDecision(input: PreflopDecisionInput): DecisionComparison {
  const facing = preflopFacingFromPublicAction(input.currentBet, input.bigBlind, input.history);
  const plan = buildPreflopPlan({
    canCheck: input.legal.canCheck,
    cards: input.cards,
    callersAfterRaise: input.callersAfterRaise,
    effectiveStackBb: input.effectiveStackBb,
    facing,
    limperCount: input.limperCount,
    playerCount: input.playerCount,
    position: input.position,
    raiseCount: input.raiseCount,
    raiseSizeBb: facing === 'raised' ? input.currentBet / input.bigBlind : undefined,
    raiserPosition: input.raiserPosition,
    tournamentMode: Boolean(input.tournamentPressureLabel),
    tournamentRiskPremium: input.tournamentRiskPremium,
  });
  const actions = legalPreflopActions(plan.frequencies, input.legal)
    .sort((left, right) => right[1] - left[1]);
  const best = actions[0] ?? [input.legal.canCheck ? 'check' : 'fold', 1];
  const chosenFrequency = actions.find(([action]) => action === input.action)?.[1] ?? 0;
  const bestFrequency = best[1];
  const baselineTarget = best[0] === 'raise' ? preferredPreflopRaiseTo({
    bigBlind: input.bigBlind,
    currentBet: input.currentBet,
    facing,
    legal: input.legal,
    limperCount: input.limperCount,
    playerStreetBet: input.playerStreetBet,
    position: input.position,
    stackBand: plan.stackBand,
    jamPreferred: plan.jamPreferred,
  }) : undefined;
  const chosenRaiseDeviation = input.action === 'raise' && baselineTarget
    ? Math.abs(input.amount - baselineTarget) / Math.max(input.bigBlind, baselineTarget)
    : 0;
  const relativeScoreGap = Math.max(0, bestFrequency - chosenFrequency) + chosenRaiseDeviation * 0.28;
  // A leg the range table deliberately authors is an action the model itself
  // takes, so it is never worse than 'close' however low its frequency.
  // Residual fold/check mass is not authored, so folding a hand the tables
  // never fold still grades 'mistake' even at a higher frequency than the
  // authored leg above it.
  const authoredLeg = chosenFrequency > 0 && plan.mixedLegs.includes(input.action);
  const grade: CoachHandGrade = relativeScoreGap <= 0.12
    ? 'strong'
    : relativeScoreGap <= 0.34 || chosenFrequency >= 0.18 || authoredLeg ? 'close' : 'mistake';
  const chosen = line(input.action, input.amount, input.currentBet, input.legal);
  const baseline = line(best[0], baselineTarget, input.currentBet, input.legal);
  const alternativeEntry = actions.find(([action]) => action !== best[0]);
  const alternative = alternativeEntry
    ? line(
      alternativeEntry[0],
      alternativeEntry[0] === 'raise' ? preferredPreflopRaiseTo({
        bigBlind: input.bigBlind,
        currentBet: input.currentBet,
        facing,
        legal: input.legal,
        limperCount: input.limperCount,
        playerStreetBet: input.playerStreetBet,
        position: input.position,
        stackBand: plan.stackBand,
        jamPreferred: plan.jamPreferred,
      }) : undefined,
      input.currentBet,
      input.legal,
    ) : null;
  const sizingNote = chosenRaiseDeviation > 0.2
    ? ` Your raise was ${formatChips(input.amount)} chips versus the baseline size of ${formatChips(baselineTarget ?? input.amount)} chips.`
    : '';

  return {
    alternative,
    baseline,
    chosen,
    detail: `${input.tournamentPressureLabel ? `${input.tournamentPressureLabel}. ` : ''}${plan.explanation}${sizingNote}`,
    focusArea: chosenRaiseDeviation > 0.2 ? 'bet-sizing' : 'preflop',
    grade,
    relativeScoreGap: roundScore(relativeScoreGap),
    sequence: input.sequence,
    street: 'preflop',
    summary: decisionSummary(grade, chosen.label, baseline.label),
  };
}

function closestCandidate(
  plan: PostflopPlan,
  action: ActionType,
  amount: number,
): PostflopCandidate | undefined {
  const candidates = plan.candidates.filter((candidate) => candidate.action.type === action);
  if (action !== 'raise') return candidates[0];
  return candidates.sort((left, right) => (
    Math.abs((left.action.amount ?? 0) - amount) - Math.abs((right.action.amount ?? 0) - amount)
  ))[0];
}

function postflopFocusArea(
  plan: PostflopPlan,
  chosen: PostflopCandidate | undefined,
  input: PostflopDecisionInput,
  sizeDeviation: number,
): CoachFocusArea {
  if (sizeDeviation > 0.22) return 'bet-sizing';
  const candidate = chosen ?? plan.primary;
  if (candidate.role === 'bluff') return 'bluffing';
  if (candidate.role === 'value' || candidate.role === 'protection') return 'value-betting';
  if (candidate.role === 'draw') return 'draws';
  if (input.legal.toCall > 0) return input.action === 'call' ? 'calling' : 'pot-odds';
  return 'none';
}

function gradePostflopDecision(input: PostflopDecisionInput): DecisionComparison {
  const equity = Number.isFinite(input.equity)
    ? Math.max(0, Math.min(1, input.equity!))
    : estimateFieldEquity(
      input.cards,
      input.board,
      input.opponentCount,
      input.opponentCount >= 4 ? 120 : 180,
      seededRandom(deterministicSeed(input.cards, input.board, input.sequence, input.opponentCount)),
    );
  const plan = buildPostflopPlan({
    ...input,
    equity,
    requireDirectPriceEdge: true,
  });
  const selected = closestCandidate(plan, input.action, input.amount);
  const primaryAmount = plan.primary.action.type === 'raise' ? plan.primary.action.amount ?? 0 : 0;
  const sizeDeviation = input.action === 'raise' && plan.primary.action.type === 'raise'
    ? Math.abs(input.amount - primaryAmount) / Math.max(input.bigBlind, primaryAmount)
    : 0;
  const selectedScore = selected?.score ?? plan.primary.score - 0.42;
  const actionGap = Math.max(0, plan.primary.score - selectedScore);
  const relativeScoreGap = actionGap + sizeDeviation * 0.25;
  const grade: CoachHandGrade = relativeScoreGap <= 0.06
    ? 'strong'
    : relativeScoreGap <= 0.18 ? 'close' : 'mistake';
  const chosen = line(input.action, input.amount, input.currentBet, input.legal);
  const baseline = line(
    plan.primary.action.type,
    plan.primary.action.amount,
    input.currentBet,
    input.legal,
  );
  const alternativeCandidate = plan.alternatives.find((candidate) => (
    candidate.action.type !== plan.primary.action.type
  )) ?? plan.alternatives[0];
  const alternative = alternativeCandidate ? line(
    alternativeCandidate.action.type,
    alternativeCandidate.action.amount,
    input.currentBet,
    input.legal,
  ) : null;
  const equityText = `Estimated equity ${Math.round(equity * 100)}%${input.legal.toCall > 0 ? ` versus a ${Math.round(plan.requiredEquity * 100)}% call price` : ''}.`;

  return {
    alternative,
    baseline,
    chosen,
    detail: `${input.tournamentPressureLabel ? `${input.tournamentPressureLabel}. ` : ''}${equityText} ${plan.handLabel} on a ${plan.textureLabel}; SPR ${Math.round(plan.stackToPotRatio * 10) / 10}. ${plan.primary.detail}`,
    focusArea: postflopFocusArea(plan, selected, input, sizeDeviation),
    grade,
    initiative: input.initiative,
    relativeScoreGap: roundScore(relativeScoreGap),
    sequence: input.sequence,
    street: input.street,
    summary: decisionSummary(grade, chosen.label, baseline.label),
  };
}

function buildReport(decisions: DecisionComparison[]): HandDecisionReport {
  const focus = [...decisions].sort((left, right) => (
    gradeWeight[right.grade] - gradeWeight[left.grade]
      || right.relativeScoreGap - left.relativeScoreGap
      || left.sequence - right.sequence
  ))[0];
  const handGrade: CoachHandGrade = decisions.some((decision) => decision.grade === 'mistake')
    ? 'mistake'
    : decisions.some((decision) => decision.grade === 'close') ? 'close' : 'strong';
  const strongCount = decisions.filter((decision) => decision.grade === 'strong').length;
  const summary = decisions.length === 0
    ? 'No player decision was available to grade in this hand.'
    : handGrade === 'strong'
      ? `Strong baseline match across ${decisions.length} decision${decisions.length === 1 ? '' : 's'}.`
      : `${strongCount} of ${decisions.length} decisions matched strongly. Start with decision ${focus?.sequence ?? 1}.`;
  return {
    decisions,
    focusArea: focus?.focusArea ?? 'none',
    focusDecisionSequence: focus?.sequence ?? 0,
    handGrade,
    summary,
  };
}

function headsUpInitiative(
  history: readonly ActionRecord[],
  recordIndex: number,
  record: ActionRecord,
): PostflopInitiative {
  if (record.decisionContext.currentBet > record.decisionContext.playerStreetBetBefore) return 'opponent';
  const lastAggressor = [...history.slice(0, recordIndex)].reverse().find((action) => action.type === 'raise');
  return lastAggressor?.player === 'hero' ? 'player' : lastAggressor ? 'opponent' : 'none';
}

/** Grades every hero decision using only hero cards and public information. */
export function gradeHeadsUpHand(game: GameState): HandDecisionReport {
  let sequence = 0;
  const decisions: DecisionComparison[] = [];
  game.history.forEach((record, recordIndex) => {
    if (record.player !== 'hero' || record.street === 'complete') return;
    const context = record.decisionContext;
    // Saved hands from builds before decision snapshots remain replayable.
    if (!context) return;
    sequence += 1;
    const publicHistory = game.history.slice(0, recordIndex);
    if (record.street === 'preflop') {
      decisions.push(gradePreflopDecision({
        action: record.type,
        amount: record.amount,
        bigBlind: game.bigBlind,
        cards: game.players.hero.holeCards,
        currentBet: context.currentBet,
        effectiveStackBb: Math.min(
          context.playerStackBefore + context.playerStreetBetBefore,
          context.opponentStackBefore + context.opponentStreetBetBefore,
        ) / game.bigBlind,
        history: publicHistory,
        legal: context.legalActions,
        limperCount: publicHistory.filter((action) => action.street === 'preflop' && action.type === 'call').length,
        playerCount: 2,
        playerStreetBet: context.playerStreetBetBefore,
        position: game.button === 'hero' ? 'BTN/SB' : 'BB',
        raiseCount: publicHistory.filter((action) => action.street === 'preflop' && action.type === 'raise').length,
        sequence,
      }));
      return;
    }
    decisions.push(gradePostflopDecision({
      action: record.type,
      amount: record.amount,
      bigBlind: game.bigBlind,
      board: context.board,
      cards: game.players.hero.holeCards,
      currentBet: context.currentBet,
      effectiveStack: Math.min(context.playerStackBefore, context.opponentStackBefore),
      initiative: headsUpInitiative(game.history, recordIndex, record),
      legal: context.legalActions,
      opponentCount: 1,
      playerStreetBet: context.playerStreetBetBefore,
      playersBehind: game.button !== 'hero' && context.opponentStackBefore > 0 ? 1 : 0,
      pot: context.potBefore,
      sequence,
      street: record.street,
    }));
  });
  return buildReport(decisions);
}

function multiwayDecision(
  game: MultiwayHandState,
  record: MultiwayActionRecord,
  recordIndex: number,
  sequence: number,
): DecisionComparison | null {
  const context = record.decisionContext;
  const hero = game.players.hero;
  if (!context || !hero?.position || record.street === 'complete') return null;
  if (record.street === 'preflop') {
    return gradePreflopDecision({
      action: record.type,
      amount: record.amount,
      bigBlind: game.bigBlind,
      cards: hero.holeCards,
      callersAfterRaise: context.preflopCallersAfterRaise,
      currentBet: context.currentBet,
      effectiveStackBb: (context.effectiveStack + context.playerStreetBetBefore) / game.bigBlind,
      history: game.history.slice(0, recordIndex),
      legal: context.legalActions,
      limperCount: context.limperCount,
      playerCount: context.playerCount,
      playerStreetBet: context.playerStreetBetBefore,
      position: context.position ?? hero.position,
      raiseCount: context.preflopRaiseCount,
      raiserPosition: context.preflopRaiserPosition,
      sequence,
      tournamentPressureLabel: context.tournamentPressureLabel,
      tournamentRiskPremium: context.tournamentRiskPremium,
    });
  }
  return gradePostflopDecision({
    action: record.type,
    amount: record.amount,
    bigBlind: game.bigBlind,
    board: context.board,
    cards: hero.holeCards,
    currentBet: context.currentBet,
    effectiveStack: context.effectiveStack,
    equity: context.estimatedEquity,
    initiative: context.initiative,
    legal: context.legalActions,
    opponentCount: Math.max(1, context.opponentCount),
    playerStreetBet: context.playerStreetBetBefore,
    playersBehind: context.playersBehind,
    pot: context.potBefore,
    sequence,
    street: record.street,
    tournamentPressureLabel: context.tournamentPressureLabel,
    tournamentRiskPremium: context.tournamentRiskPremium,
  });
}

/** Grades 3–6 player hands recorded by the public decision-snapshot engine. */
export function gradeMultiwayHand(game: MultiwayHandState): HandDecisionReport {
  let sequence = 0;
  const decisions: DecisionComparison[] = [];
  game.history.forEach((record, recordIndex) => {
    if (record.playerId !== 'hero') return;
    sequence += 1;
    const decision = multiwayDecision(game, record, recordIndex, sequence);
    if (decision) decisions.push(decision);
  });
  return buildReport(decisions);
}
