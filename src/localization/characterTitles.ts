import type { MultiwayAiIdentity } from '../domain/poker/multiwayAiProfiles';
import type { MessageKey } from './messages';
import type { TranslationValues } from './core';

type Translator = (key: MessageKey, values?: TranslationValues) => string;

/**
 * The named characters' titles are jokes, so they are rewritten per language
 * rather than translated word for word — "Deadpan and Card-Dead" only works in
 * English. The roster keeps the English title as its own data (and as the flag
 * that marks a character named), and this maps it onto the localized copy.
 */
const titleKeys: Record<string, MessageKey> = {
  'yoyo-patient': 'character.title.yoyo-patient',
  'auntie-chi-sticky': 'character.title.auntie-chi-sticky',
  'lulu-patient': 'character.title.lulu-patient',
  'steve-patient': 'character.title.steve-patient',
  'hao-patient': 'character.title.hao-patient',
  'uncle-tu-patient': 'character.title.uncle-tu-patient',
  'vivian-sticky': 'character.title.vivian-sticky',
  'mary-patient': 'character.title.mary-patient',
  'bruce-pressure': 'character.title.bruce-pressure',
  'gary-pressure': 'character.title.gary-pressure',
  'mr-chi-sticky': 'character.title.mr-chi-sticky',
  'zhou-pressure': 'character.title.zhou-pressure',
};

/** The character's title in the reader's language, or null if they have none. */
export function localizedCharacterTitle(
  identity: MultiwayAiIdentity,
  t: Translator,
): string | null {
  const key = titleKeys[identity.id];
  if (key) return t(key);
  // An identity with a title but no key would silently show English, so fall
  // back to the authored text rather than dropping it.
  return identity.title ?? null;
}
