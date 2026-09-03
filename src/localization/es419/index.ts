import type { MessageKey } from '../messages';
import { createScenarioLocalizer } from '../scenarioCatalog';
import { baseSpanishMessages } from './messages';
import {
  phase12SpanishMessages,
  phase14SpanishMessages,
  phase16SpanishMessages,
  phase7SpanishMessages,
  phase8SpanishMessages,
  phase9SpanishMessages,
} from './phaseMessages';
import { spanishLearningContent } from './learningContent';
import { spanishScenarioTemplates, spanishScenarioVocab } from './scenarioContent';

export { spanishLearningContent };

/**
 * The resolved es-419 catalog: the inline base surface plus every phase map,
 * spread in the same order as `englishMessages`. The generated modules below
 * carry the exact-key parity guarantee (see catalogParity.test.ts), so this
 * composition needs no runtime fallback for missing keys.
 */
export const spanishMessages: Record<MessageKey, string> = {
  ...baseSpanishMessages,
  ...phase7SpanishMessages,
  ...phase8SpanishMessages,
  ...phase9SpanishMessages,
  ...phase12SpanishMessages,
  ...phase14SpanishMessages,
  ...phase16SpanishMessages,
};

export const localizeScenarioContentSpanish = createScenarioLocalizer(
  spanishScenarioTemplates,
  spanishScenarioVocab,
);
