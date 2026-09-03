import type { MessageKey } from '../messages';
import { createScenarioLocalizer } from '../scenarioCatalog';
import { basePortugueseMessages } from './messages';
import {
  phase12PortugueseMessages,
  phase14PortugueseMessages,
  phase16PortugueseMessages,
  phase7PortugueseMessages,
  phase8PortugueseMessages,
  phase9PortugueseMessages,
} from './phaseMessages';
import { portugueseLearningContent } from './learningContent';
import { portugueseScenarioTemplates, portugueseScenarioVocab } from './scenarioContent';

export { portugueseLearningContent };

/**
 * The resolved pt-BR catalog: the inline base surface plus every phase map,
 * spread in the same order as `englishMessages`. The generated modules below
 * carry the exact-key parity guarantee (see catalogParity.test.ts), so this
 * composition needs no runtime fallback for missing keys.
 */
export const portugueseMessages: Record<MessageKey, string> = {
  ...basePortugueseMessages,
  ...phase7PortugueseMessages,
  ...phase8PortugueseMessages,
  ...phase9PortugueseMessages,
  ...phase12PortugueseMessages,
  ...phase14PortugueseMessages,
  ...phase16PortugueseMessages,
};

export const localizeScenarioContentPortuguese = createScenarioLocalizer(
  portugueseScenarioTemplates,
  portugueseScenarioVocab,
);
