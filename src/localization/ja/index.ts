import type { MessageKey } from '../messages';
import { createScenarioLocalizer } from '../scenarioCatalog';
import { baseJapaneseMessages } from './messages';
import {
  phase12JapaneseMessages,
  phase14JapaneseMessages,
  phase16JapaneseMessages,
  phase7JapaneseMessages,
  phase8JapaneseMessages,
  phase9JapaneseMessages,
} from './phaseMessages';
import { japaneseLearningContent } from './learningContent';
import { japaneseScenarioTemplates, japaneseScenarioVocab } from './scenarioContent';

export { japaneseLearningContent };

/**
 * The resolved ja catalog: the inline base surface plus every phase map,
 * spread in the same order as `englishMessages`. The generated modules below
 * carry the exact-key parity guarantee (see catalogParity.test.ts), so this
 * composition needs no runtime fallback for missing keys.
 */
export const japaneseMessages: Record<MessageKey, string> = {
  ...baseJapaneseMessages,
  ...phase7JapaneseMessages,
  ...phase8JapaneseMessages,
  ...phase9JapaneseMessages,
  ...phase12JapaneseMessages,
  ...phase14JapaneseMessages,
  ...phase16JapaneseMessages,
};

export const localizeScenarioContentJapanese = createScenarioLocalizer(
  japaneseScenarioTemplates,
  japaneseScenarioVocab,
);
