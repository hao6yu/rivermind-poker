/**
 * Internal-preview draft-catalog graph (review remediation round 3, findings
 * #1 and #5).
 *
 * This file is committed and immutable. It carries STATIC imports of all
 * three draft modules (by design — the internal-preview bundle works offline)
 * and its `load()` functions register EVERY surface: messages, learning
 * content (lessons/trainers/sheets), and scenario localizers. The Metro
 * resolver redirects `draftCatalogs.generated` to this file when
 * `EXPO_PUBLIC_RM_LOCALE_PROFILE=internal-preview`.
 *
 * Production resolves to `draftCatalogs.production.ts` (empty map, zero draft
 * imports) instead.
 */

import { registerDraftLearningContent } from './learningContent';
import { registerDraftScenarioLocalizer } from './scenarioContent';
import type { ScenarioSpot } from '../domain/learning/types';
import {
  japaneseLearningContent,
  japaneseMessages,
  localizeScenarioContentJapanese,
  portugueseLearningContent,
  portugueseMessages,
  localizeScenarioContentPortuguese,
  spanishLearningContent,
  spanishMessages,
  localizeScenarioContentSpanish,
} from './draftTestModules';
import type { AppLanguage } from './registry';
import type { MessageKey } from './messages';

export type DraftLoaderEntry = {
  load: () => Promise<Record<MessageKey, string>>;
};

export const DRAFT_LOADERS: Partial<Record<AppLanguage, DraftLoaderEntry>> = {
  'es-419': {
    load: async () => {
      registerDraftLearningContent('es-419', spanishLearningContent);
      registerDraftScenarioLocalizer(
        'es-419',
        localizeScenarioContentSpanish as (scenario: ScenarioSpot) => ScenarioSpot,
      );
      return spanishMessages;
    },
  },
  'pt-BR': {
    load: async () => {
      registerDraftLearningContent('pt-BR', portugueseLearningContent);
      registerDraftScenarioLocalizer(
        'pt-BR',
        localizeScenarioContentPortuguese as (scenario: ScenarioSpot) => ScenarioSpot,
      );
      return portugueseMessages;
    },
  },
  ja: {
    load: async () => {
      registerDraftLearningContent('ja', japaneseLearningContent);
      registerDraftScenarioLocalizer(
        'ja',
        localizeScenarioContentJapanese as (scenario: ScenarioSpot) => ScenarioSpot,
      );
      return japaneseMessages;
    },
  },
};
