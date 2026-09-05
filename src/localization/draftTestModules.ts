/**
 * Test-only re-export of the draft catalog modules for the vitest setup file.
 * Lives outside the production import graph (nothing in app code imports it);
 * the setup file itself is excluded from production bundles.
 */
export { spanishMessages } from './es419';
export { portugueseMessages } from './ptbr';
export { japaneseMessages } from './ja';

export { spanishLearningContent } from './es419';
export { portugueseLearningContent } from './ptbr';
export { japaneseLearningContent } from './ja';
export { spanishScenarioTemplates, spanishScenarioVocab } from './es419/scenarioContent';
export { portugueseScenarioTemplates, portugueseScenarioVocab } from './ptbr/scenarioContent';
export { japaneseScenarioTemplates, japaneseScenarioVocab } from './ja/scenarioContent';
export { localizeScenarioContentSpanish } from './es419';
export { localizeScenarioContentPortuguese } from './ptbr';
export { localizeScenarioContentJapanese } from './ja';
