/**
 * Catalog-only draft fixture (review remediation round 2, finding #7).
 *
 * Registers the es-419/pt-BR/ja catalogs synchronously for tests that assert
 * TRANSLATED CONTENT (parity, quality, sample-gate…). It must NOT be imported
 * by tests exercising the lazy loader or the provider's loading path — the
 * global registration masked those behaviors. Production bundles never see
 * this file.
 *
 * This fixture imports the draft modules DIRECTLY and writes through the
 * registry — it does not use draftCatalogs.ts's loader (which resolves through
 * the Metro-redirected generated file, absent in vitest).
 */
import '../localization/registry';
import { registerDraftLearningContent } from '../localization/learningContent';
import { registerDraftScenarioLocalizer } from '../localization/scenarioContent';
import { japaneseLearningContent, japaneseMessages, localizeScenarioContentJapanese, portugueseLearningContent, portugueseMessages, localizeScenarioContentPortuguese, spanishLearningContent, spanishMessages, localizeScenarioContentSpanish } from '../localization/draftTestModules';
import { LOCALES } from '../localization/registry';
import type { ScenarioSpot } from '../domain/learning/types';

// Register all three surfaces (messages, learning, scenarios) directly into
// the registry entries — the same work the preview entrypoint's load()
// functions do.
const drafts: ReadonlyArray<{
  id: 'es-419' | 'pt-BR' | 'ja';
  messages: Record<string, string>;
  learning: typeof spanishLearningContent;
  localize: (scenario: ScenarioSpot) => ScenarioSpot;
}> = [
  { id: 'es-419', messages: spanishMessages, learning: spanishLearningContent, localize: localizeScenarioContentSpanish },
  { id: 'pt-BR', messages: portugueseMessages, learning: portugueseLearningContent, localize: localizeScenarioContentPortuguese },
  { id: 'ja', messages: japaneseMessages, learning: japaneseLearningContent, localize: localizeScenarioContentJapanese },
];

for (const draft of drafts) {
  LOCALES[draft.id].messageCatalog = draft.messages as never;
  // learningContent.ts and scenarioContent.ts expose registration functions —
  // imported statically (no circular import risk: they don't import the
  // fixture).
  registerDraftLearningContent(draft.id, draft.learning);
  registerDraftScenarioLocalizer(draft.id, draft.localize);
}
