/**
 * Per-seat avatar visibility — the viewer-local hide control. A viewer can
 * hide a seat's uploaded avatar so the seat renders initials instead of the
 * image; the image is never fetched or shown while hidden. This is purely a
 * rendering choice on this device: nothing is transmitted, persisted, or
 * reported anywhere (the earlier "report" queue was removed because it only
 * accumulated in memory and could never reach moderation).
 *
 * The store is a plain set of hidden avatar keys driven by a reducer, so it can
 * live in any state container and stay pure and unit tested.
 */
import type { AvatarReference } from '../services/avatarResolver';

/** A hidden avatar is keyed by its (avatarId, version) pair. */
export type AvatarVisibilitySet = ReadonlySet<string>;

function visibilityKey(avatarId: string, version: number): string {
  return JSON.stringify([avatarId, version]);
}

export interface AvatarVisibilityAdd {
  type: 'hide';
  avatarId: string;
  version: number;
}

export interface AvatarVisibilityRemove {
  type: 'show';
  avatarId: string;
  version: number;
}

export type AvatarVisibilityAction = AvatarVisibilityAdd | AvatarVisibilityRemove;

/** Apply a hide/show action, returning a new hidden-key set. */
export function applyAvatarVisibility(
  hidden: AvatarVisibilitySet,
  action: AvatarVisibilityAction,
): AvatarVisibilitySet {
  const next = new Set(hidden);
  if (action.type === 'hide') next.add(visibilityKey(action.avatarId, action.version));
  else next.delete(visibilityKey(action.avatarId, action.version));
  return next;
}

/** Whether the given avatar is hidden by this viewer. */
export function isAvatarHidden(hidden: AvatarVisibilitySet, avatarId: string, version: number): boolean {
  return hidden.has(visibilityKey(avatarId, version));
}

/** Whether a reference should render as an image (visible) or behind initials. */
export function avatarVisibility(
  hidden: AvatarVisibilitySet,
  ref: AvatarReference,
): 'show' | 'hide' {
  return isAvatarHidden(hidden, ref.avatarId, ref.version) ? 'hide' : 'show';
}

/** The set of references that are currently hidden, for display/logging. */
export function hiddenReferences(
  hidden: AvatarVisibilitySet,
  all: AvatarReference[],
): AvatarReference[] {
  return all.filter((ref) => hidden.has(visibilityKey(ref.avatarId, ref.version)));
}
