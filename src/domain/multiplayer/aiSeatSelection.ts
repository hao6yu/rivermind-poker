import type { RandomSource } from '../poker/cards.ts';
import type { MultiwayAiIdentity } from '../poker/multiwayAiProfiles.ts';
import { normalizePlayerDisplayName } from '../playerProfile.ts';

/**
 * Shared randomized AI seat selection.
 *
 * Adding an AI to a private table never maps a seat index to one fixed
 * profile. This pure selector chooses from the authored roster for the room
 * difficulty using injected randomness, so domain tests are deterministic and
 * a live room uses coordinator-owned randomness.
 *
 * Eligibility:
 * - excludes AI profiles already seated (which also prevents duplicates);
 * - excludes any profile whose normalized, case-insensitive display name
 *   collides with a human display name (the same normalization boundary used
 *   by the identity contract; seat kind is still explicit metadata);
 * - avoids the AI profile most recently removed from that seat whenever
 *   another eligible profile exists, so remove-and-re-add is a lightweight
 *   reroll;
 * - terminates with an explicit exhausted result when no candidate remains —
 *   it never loops, duplicates a profile, or silently accepts a collision.
 *
 * This module is shared by the domain coordinator and enforced again by the
 * multiplayer-room Edge Function, which revalidates the choice against the
 * latest authoritative room state before committing.
 */

export type AiSeatSelectionFailure = 'roster-exhausted';

export interface AiSeatSelectionInput {
  /** Every AI profile id currently seated in the room. */
  seatedAiProfileIds: readonly string[];
  /** Every human display name in the room, already normalized. */
  humanDisplayNames: readonly string[];
  /** The profile id most recently removed from this seat, or null. */
  mostRecentlyRemovedForSeat: string | null;
  /** The authored roster eligible for the room's difficulty. */
  roster: readonly MultiwayAiIdentity[];
  random: RandomSource;
}

export type AiSeatSelectionResult =
  | { ok: true; identity: MultiwayAiIdentity }
  | { ok: false; reason: AiSeatSelectionFailure };

/**
 * The normalization boundary for human/AI name collisions: collapse whitespace
 * and trim (matching `normalizePlayerDisplayName`) then case-fold. AI names are
 * authored and already normalized; human names are normalized before they
 * reach room state, so folding both sides is the only comparison needed.
 */
export function foldAiNameForComparison(value: string): string {
  return normalizePlayerDisplayName(value).toLocaleLowerCase();
}

export function selectAiSeatIdentity(input: AiSeatSelectionInput): AiSeatSelectionResult {
  const humanNames = new Set(input.humanDisplayNames.map(foldAiNameForComparison));
  const seated = new Set(input.seatedAiProfileIds);
  const candidates = input.roster.filter((identity) => {
    if (seated.has(identity.id)) return false;
    return !humanNames.has(foldAiNameForComparison(identity.name));
  });
  if (candidates.length === 0) return { ok: false, reason: 'roster-exhausted' };

  let available = candidates;
  const removed = input.mostRecentlyRemovedForSeat;
  if (removed !== null && candidates.length > 1) {
    const withoutRemoved = candidates.filter((identity) => identity.id !== removed);
    if (withoutRemoved.length > 0) available = withoutRemoved;
  }

  const index = Math.min(
    available.length - 1,
    Math.max(0, Math.floor(input.random() * available.length)),
  );
  const identity = available[index];
  if (!identity) return { ok: false, reason: 'roster-exhausted' };
  return { ok: true, identity };
}
