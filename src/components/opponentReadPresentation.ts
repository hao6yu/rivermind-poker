import type {
  OpponentRead,
  OpponentReadConfidenceTier,
  OpponentReadPattern,
} from '../domain/poker/opponentMemory';
import type { TranslationValues } from '../localization/core';
import type { MessageKey } from '../localization/messages';

type Translator = (key: MessageKey, values?: TranslationValues) => string;

const confidenceKeys: Record<OpponentReadConfidenceTier, MessageKey> = {
  learning: 'opponentRead.confidence.learning',
  early: 'opponentRead.confidence.early',
  developing: 'opponentRead.confidence.developing',
  established: 'opponentRead.confidence.established',
};

const titleKeys: Record<OpponentReadPattern, MessageKey> = {
  learning: 'opponentRead.learning.title',
  'folds-under-pressure': 'opponentRead.foldsUnderPressure.title',
  'calls-pressure': 'opponentRead.callsPressure.title',
  'aggressive-entry': 'opponentRead.aggressiveEntry.title',
  'position-aware': 'opponentRead.positionAware.title',
  'wide-range': 'opponentRead.wideRange.title',
  'selective-range': 'opponentRead.selectiveRange.title',
  'postflop-pressure': 'opponentRead.postflopPressure.title',
  balanced: 'opponentRead.balanced.title',
};

const detailKeys: Record<Exclude<OpponentReadPattern, 'learning'>, MessageKey> = {
  'folds-under-pressure': 'opponentRead.foldsUnderPressure.detail',
  'calls-pressure': 'opponentRead.callsPressure.detail',
  'aggressive-entry': 'opponentRead.aggressiveEntry.detail',
  'position-aware': 'opponentRead.positionAware.detail',
  'wide-range': 'opponentRead.wideRange.detail',
  'selective-range': 'opponentRead.selectiveRange.detail',
  'postflop-pressure': 'opponentRead.postflopPressure.detail',
  balanced: 'opponentRead.balanced.detail',
};

export interface LocalizedOpponentRead {
  confidenceLabel: string;
  detail: string;
  title: string;
}

export function localizeOpponentRead(
  read: OpponentRead,
  handsObserved: number,
  t: Translator,
): LocalizedOpponentRead {
  const detail = read.pattern === 'learning'
    ? t(handsObserved === 0 ? 'opponentRead.learning.emptyDetail' : 'opponentRead.learning.limitedDetail', {
      count: handsObserved,
    })
    : t(detailKeys[read.pattern]);

  return {
    confidenceLabel: t(confidenceKeys[read.confidenceTier]),
    detail,
    title: t(titleKeys[read.pattern]),
  };
}
