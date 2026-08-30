import { isValidPlayerDisplayName } from '../../domain/playerProfile';
import { defaultMultiplayerDraft } from './multiplayerUx';

/** Only the two fields a title needs, so callers can pass lobby or table seats. */
type OwnerSeat = { displayName: string | null; isHost?: boolean };
import type { MessageKey } from '../../localization/messages';

type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * The identity a private table runs on: whoever the player saved in their
 * profile. Setup input never reaches this, and nothing here writes a name
 * anywhere, so opening, editing, or abandoning setup cannot change who the
 * account is called. Anything the table would refuse — blank, or a value left
 * over from before the shared name rules existed — falls back to the same
 * default the rest of the app uses rather than inventing a nickname or leaving
 * the player staring at a Continue button that can never light up.
 */
export function privateTableDisplayName(
  savedDisplayName: string | null | undefined,
): string {
  const trimmed = savedDisplayName?.trim() ?? '';
  return isValidPlayerDisplayName(trimmed) ? trimmed : defaultMultiplayerDraft.playerName;
}

/**
 * The title a private table is given. The room carries the owner's seat and its
 * name; the possessive is assembled here, per language, at render time, so an
 * English apostrophe is never stored or transported for Chinese to inherit. A
 * room whose owner seat is not visible yet falls back to the untitled lobby
 * heading instead of naming the wrong person.
 */
export function privateTableTitle(
  seats: readonly OwnerSeat[],
  t: Translator,
): string {
  const hostName = seats.find((seat) => seat.isHost)?.displayName?.trim() ?? '';
  return hostName.length > 0
    ? t('multiplayer.table.ownerTitle', { player: hostName })
    : t('multiplayer.lobby.title');
}
