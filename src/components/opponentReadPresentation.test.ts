import { describe, expect, it } from 'vitest';

import {
  createEmptyOpponentMemory,
  describeOpponentRead,
  type OpponentMemory,
} from '../domain/poker/opponentMemory';
import { translate } from '../localization/core';
import { localizeOpponentRead } from './opponentReadPresentation';

describe('localized opponent-read presentation', () => {
  it('localizes an empty read instead of exposing English domain copy', () => {
    const memory = createEmptyOpponentMemory();
    const localized = localizeOpponentRead(
      describeOpponentRead(memory),
      memory.handsObserved,
      (key, values) => translate('zh-Hans', key, values),
    );

    expect(localized).toEqual({
      confidenceLabel: '学习中',
      detail: '再打几手牌，RiverMind 对手就会根据你的可见行动开始形成谨慎判断。',
      title: '仍在了解你的打法',
    });
  });

  it('localizes an established behavioral read and confidence tier', () => {
    const memory: OpponentMemory = {
      ...createEmptyOpponentMemory(),
      handsObserved: 20,
      actionsObserved: 40,
      preflopOpportunities: 20,
      voluntaryPreflopHands: 10,
      facedBetOpportunities: 12,
      foldsFacingBet: 10,
    };
    const read = describeOpponentRead(memory);
    const localized = localizeOpponentRead(
      read,
      memory.handsObserved,
      (key, values) => translate('zh-Hant', key, values),
    );

    expect(read.pattern).toBe('folds-under-pressure');
    expect(localized.confidenceLabel).toBe('穩定觀察');
    expect(localized.title).toBe('面對壓力時經常棄牌');
    expect(localized.detail).not.toBe(read.detail);
  });
});
