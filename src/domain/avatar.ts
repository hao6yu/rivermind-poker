/**
 * Shared human-avatar presentation mapping. This is the single display boundary
 * behind `HumanAvatar`; every seat (home, heads-up, local multiway, private
 * lobby/live, results, replay) renders identity through it, so presentation and
 * accessibility semantics stay consistent and never depend on seat origin.
 */
import {
  HUMAN_AVATAR_LABELS,
  type HumanAvatarId,
  type HumanAvatarReference,
} from './playerProfile';

export type AvatarDisplayMode = 'authored' | 'uploaded' | 'initials';

export interface HumanAvatarDisplay {
  mode: AvatarDisplayMode;
  id?: HumanAvatarId;
  avatarId?: string;
  version?: number;
  initials?: string;
}

/** Map a profile avatar reference to what `HumanAvatar` should render. */
export function humanAvatarDisplay(ref: HumanAvatarReference): HumanAvatarDisplay {
  switch (ref.kind) {
    case 'authored':
      return { mode: 'authored', id: ref.id };
    case 'uploaded':
      return { mode: 'uploaded', avatarId: ref.avatarId, version: ref.version };
    case 'initials':
      return { mode: 'initials', initials: ref.initials };
    default:
      return { mode: 'initials' };
  }
}

/** Accessible label for the avatar region, independent of the display name. */
export function humanAvatarAccessibilityLabel(ref: HumanAvatarReference): string {
  switch (ref.kind) {
    case 'authored':
      return `Avatar, ${HUMAN_AVATAR_LABELS[ref.id]}`;
    case 'uploaded':
      return 'Avatar, uploaded image';
    case 'initials':
      return 'Avatar, initials';
    default:
      return 'Avatar, initials';
  }
}

/** A stable human-avatar object identity used for keying and diffing. */
export function humanAvatarObjectKey(ref: HumanAvatarReference): string {
  switch (ref.kind) {
    case 'authored':
      return `authored:${ref.id}`;
    case 'uploaded':
      return `uploaded:${ref.avatarId}:${ref.version}`;
    case 'initials':
      return `initials:${ref.initials}`;
    default:
      return 'initials:';
  }
}

export function avatarsAreEqual(a: HumanAvatarReference, b: HumanAvatarReference): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'authored' && b.kind === 'authored') return a.id === b.id;
  if (a.kind === 'uploaded' && b.kind === 'uploaded') {
    return a.avatarId === b.avatarId && a.version === b.version;
  }
  if (a.kind === 'initials' && b.kind === 'initials') return a.initials === b.initials;
  return false;
}
