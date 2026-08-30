import type { MultiwayAiStyle } from '../domain/poker/multiwayAiProfiles';
import type { MessageKey } from './messages';

/**
 * The localized personality label and short authored description keys for one
 * AI behavior profile (scope 3.11E). Presentation resolves them through the
 * typed catalog; the stable style ids stay untranslated.
 */
export function personaLabelKey(style: MultiwayAiStyle): MessageKey {
  return `persona.${style}.label` as MessageKey;
}

export function personaDescriptionKey(style: MultiwayAiStyle): MessageKey {
  return `persona.${style}.description` as MessageKey;
}
