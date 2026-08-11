import { describe, expect, it } from 'vitest';

import { translate } from '../../localization/core';
import type { ActionRecord } from '../../domain/poker/types';
import {
  localizedAiThinking,
  localizedCoachFocus,
  localizedLatestAction,
  localizedSeatAction,
  localizedSessionLearningVerdict,
  localizedStreet,
} from './localizedGameplay';

const zhHans = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => (
  translate('zh-Hans', key, values)
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

  it('localizes learning focus and whole-session verdicts', () => {
    expect(localizedCoachFocus('pot-odds', zhHans)).toBe('底池赔率');
    expect(localizedCoachFocus('value-betting', zhHant)).toBe('價值下注');

    const verdict = localizedSessionLearningVerdict({
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
    expect(verdict.title).toBe('整体决策稳健');
    expect(verdict.detail).toContain('3 个稳健');
  });
});
