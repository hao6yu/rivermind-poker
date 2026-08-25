import { describe, expect, it } from 'vitest';

import { translate } from '../../localization/core';
import type { ActionRecord } from '../../domain/poker/types';
import { seededRandom } from '../../domain/poker/cards';
import { applyAction, createHand } from '../../domain/poker/engine';
import type { MultiwayHandState } from '../../domain/poker/multiway';
import {
  localizedAiThinking,
  localizedCoachFocus,
  localizedHeadsUpActionBubble,
  localizedHeadsUpSeatAction,
  localizedLatestAction,
  localizedMultiwaySeatAction,
  localizedSeatAction,
  localizedSessionLearningVerdict,
  localizedStreet,
} from './localizedGameplay';

const zhHans = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => (
  translate('zh-Hans', key, values)
);
const en = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => (
  translate('en', key, values)
);
const zhHant = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => (
  translate('zh-Hant', key, values)
);

describe('localized gameplay copy', () => {
  it('localizes streets and AI thinking states in both Chinese scripts', () => {
    expect(localizedStreet('turn', zhHans)).toBe('转牌');
    expect(localizedStreet('turn', zhHant)).toBe('轉牌');
    expect(localizedAiThinking('river', 0, zhHant)).toBe('Mara 正在分析河牌…');
  });

  it('localizes visible actions without changing chip amounts', () => {
    const action: ActionRecord = {
      amount: 60,
      decisionContext: {
        board: [],
        currentBet: 20,
        legalActions: {
          canCall: false,
          canCheck: false,
          canFold: true,
          canRaise: true,
          maxRaiseTo: 2_000,
          minRaiseTo: 60,
          suggestedRaiseTo: 60,
          toCall: 20,
        },
        opponentStackBefore: 1_980,
        opponentStreetBetBefore: 20,
        playerStackBefore: 1_980,
        playerStreetBetBefore: 0,
        potBefore: 30,
        toCall: 20,
      },
      player: 'hero',
      potAfter: 90,
      street: 'preflop',
      type: 'raise',
    };
    expect(localizedLatestAction(action, 20, zhHans)).toBe('你 加注至 60');
    expect(localizedSeatAction('call', 40, 20, 60, zhHant)).toBe('跟注 40');
  });

  it('keeps active-seat actions visible only for the current betting street', () => {
    let game = createHand({ button: 'hero', random: seededRandom(808) });
    expect(localizedHeadsUpSeatAction(game, 'hero', en)).toBeNull();

    game = applyAction(game, 'hero', { type: 'call' });
    expect(localizedHeadsUpSeatAction(game, 'hero', en)).toBe('Call 10');
    expect(localizedHeadsUpSeatAction(game, 'villain', en)).toBeNull();

    game = applyAction(game, 'villain', { type: 'check' });
    expect(game.street).toBe('flop');
    expect(localizedHeadsUpSeatAction(game, 'hero', en)).toBeNull();
    expect(localizedHeadsUpSeatAction(game, 'villain', en)).toBeNull();

    game = applyAction(game, 'villain', { type: 'check' });
    expect(localizedHeadsUpSeatAction(game, 'villain', en)).toBe('Check');
    expect(localizedHeadsUpSeatAction({ ...game, street: 'complete' }, 'villain', en)).toBeNull();
  });

  it('keeps exact multiway seat actions on only the current betting street', () => {
    const flop = {
      street: 'flop',
      history: [
        { amount: 60, playerId: 'hero', potAfter: 90, street: 'preflop', type: 'raise' },
        { amount: 0, playerId: 'ai-1', potAfter: 90, street: 'flop', type: 'check' },
        { amount: 40, playerId: 'ai-2', potAfter: 130, street: 'flop', type: 'raise' },
        { amount: 40, playerId: 'hero', potAfter: 170, street: 'flop', type: 'call' },
        { amount: 120, playerId: 'ai-1', potAfter: 290, street: 'flop', type: 'raise' },
      ],
    } as Pick<MultiwayHandState, 'history' | 'street'>;

    expect(localizedMultiwaySeatAction(flop, 'ai-2', en)).toBe('Bet 40');
    expect(localizedMultiwaySeatAction(flop, 'hero', en)).toBe('Call 40');
    expect(localizedMultiwaySeatAction(flop, 'ai-1', en)).toBe('Raise to 120');
    expect(localizedMultiwaySeatAction(flop, 'ai-1', zhHans)).toBe('加注至 120');
    expect(localizedMultiwaySeatAction({ ...flop, street: 'turn' }, 'hero', en)).toBeNull();
    expect(localizedMultiwaySeatAction({ ...flop, street: 'complete' }, 'hero', en)).toBeNull();
  });

  it('keeps player bubbles exact and gives Mara concise, deterministic personality', () => {
    const action: ActionRecord = {
      amount: 60,
      decisionContext: {
        board: [],
        currentBet: 20,
        legalActions: {
          canCall: false,
          canCheck: false,
          canFold: true,
          canRaise: true,
          maxRaiseTo: 2_000,
          minRaiseTo: 60,
          suggestedRaiseTo: 60,
          toCall: 20,
        },
        opponentStackBefore: 1_980,
        opponentStreetBetBefore: 20,
        playerStackBefore: 1_980,
        playerStreetBetBefore: 0,
        potBefore: 30,
        toCall: 20,
      },
      player: 'hero',
      potAfter: 90,
      street: 'preflop',
      type: 'raise',
    };

    const heroBubble = localizedHeadsUpActionBubble(action, 0, en);
    expect(heroBubble).toMatchObject({ emphasis: 'Raise', tone: 'aggressive' });
    expect(heroBubble.text).toContain('Raise to 60');
    expect(localizedHeadsUpActionBubble(action, 0, en)).toEqual(heroBubble);
    expect(new Set(Array.from({ length: 12 }, (_, handNumber) => (
      localizedHeadsUpActionBubble(action, 0, en, handNumber).text
    ))).size).toBeGreaterThan(1);

    const maraBubble = localizedHeadsUpActionBubble({
      ...action,
      decisionContext: { ...action.decisionContext, currentBet: 0 },
      player: 'villain',
      street: 'flop',
    }, 1, en);
    expect(maraBubble).toMatchObject({ emphasis: 'Bet', tone: 'aggressive' });
    expect(maraBubble.text).toContain('Bet 60');
  });

  it('calls out all-ins without converting chip amounts to big blinds', () => {
    const action: ActionRecord = {
      amount: 240,
      decisionContext: {
        board: [],
        currentBet: 80,
        legalActions: {
          canCall: true,
          canCheck: false,
          canFold: true,
          canRaise: true,
          maxRaiseTo: 240,
          minRaiseTo: 240,
          suggestedRaiseTo: 240,
          toCall: 60,
        },
        opponentStackBefore: 1_900,
        opponentStreetBetBefore: 80,
        playerStackBefore: 220,
        playerStreetBetBefore: 20,
        potBefore: 100,
        toCall: 60,
      },
      player: 'villain',
      potAfter: 340,
      street: 'turn',
      type: 'raise',
    };

    const bubble = localizedHeadsUpActionBubble(action, 0, en);
    expect(bubble).toMatchObject({ emphasis: 'Raise', tone: 'all-in' });
    expect(bubble.text).toContain('Raise to 240');
    expect(bubble.text).toContain('All-in');
    expect(bubble.text).not.toContain('BB');
  });

  it('localizes learning focus and whole-session verdicts', () => {
    expect(localizedCoachFocus('pot-odds', zhHans)).toBe('底池赔率');
    expect(localizedCoachFocus('value-betting', zhHant)).toBe('價值下注');

    const verdict = localizedSessionLearningVerdict({
      classification: 'closeDecision',
      decisionsGraded: 4,
      focusDecisionSequence: null,
      focusHandId: null,
      grades: { close: 1, mistake: 0, strong: 3 },
      handsGraded: 2,
      repeatedWeakness: false,
      reviewSpots: 1,
      strongRate: 75,
      strengths: [],
      topFocusArea: null,
      topFocusHandCount: 0,
      topFocusSpotCount: 0,
    }, zhHans);
    expect(verdict.title).toBe(zhHans('summary.review.solidTitle'));
    expect(verdict.detail).toContain('3 个稳健');
  });
  it('presents the whole run by its classification, not by the grade count', () => {
    const base = {
      decisionsGraded: 4,
      focusDecisionSequence: null,
      focusHandId: null,
      grades: { close: 1, mistake: 0, strong: 3 },
      handsGraded: 2,
      repeatedWeakness: false,
      reviewSpots: 1,
      strongRate: 75,
      strengths: [],
      topFocusArea: null,
      topFocusHandCount: 0,
      topFocusSpotCount: 0,
    };
    // Same grade profile; only the hand classification drives the tone.
    const strong = localizedSessionLearningVerdict({ ...base, classification: 'recommended' }, en);
    expect(strong.tone).toBe('strong');
    expect(strong.title).toBe(en('summary.review.strongTitle'));
    const mixed = localizedSessionLearningVerdict({ ...base, classification: 'acceptableAlternative' }, en);
    expect(mixed.tone).toBe('solid');
    expect(mixed.title).toBe(en('summary.review.solidTitle'));
  });
});
