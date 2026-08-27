/**
 * Pure, device-free role labeling for a human seat. Kept out of the component so
 * it can be unit tested without loading react-native (which the test runner
 * cannot parse). The label encodes the seat's role explicitly — You / Player /
 * AI opponent, plus host — and the name is always first so the role is never
 * derived from the name: two seats may share a name and still be distinguished.
 *
 * Role strings are localized by the caller; defaults keep English so any caller
 * that omits them still produces a stable, useful label.
 */
export type HumanSeatControl = 'human' | 'ai';

/** Locale role strings, with sensible English defaults for callers that omit them. */
export interface HumanRoleLabels {
  you: string;
  host: string;
  player: string;
  ai: string;
}

export const DEFAULT_HUMAN_ROLE_LABELS: HumanRoleLabels = {
  you: 'You',
  host: 'host',
  player: 'Player',
  ai: 'AI opponent',
};

export interface HumanIdentityInput {
  displayName: string;
  control?: HumanSeatControl;
  isHost?: boolean;
  isYou?: boolean;
  /** Optional locale role strings; defaults are English. */
  roles?: HumanRoleLabels;
}

function rolesFor(input: HumanIdentityInput): HumanRoleLabels {
  return { ...DEFAULT_HUMAN_ROLE_LABELS, ...(input.roles ?? {}) };
}

/**
 * The stable, role-aware label behind a human identity badge:
 * `You` / `Player` / `AI opponent`, plus `host`, plus the display name.
 */
export function humanIdentityAccessibilityLabel(input: HumanIdentityInput): string {
  const { control = 'human', isHost = false, isYou = false, displayName } = input;
  const roles = rolesFor(input);
  let role = '';
  if (isYou) {
    role = roles.you;
  } else if (control === 'ai') {
    role = roles.ai;
  } else {
    role = roles.player;
  }
  if (isHost) role = `${role}, ${roles.host}`;
  return `${displayName}, ${role}`;
}

/**
 * A short, tappable chip label rendered in the seat. "You" is prioritized over
 * "Host" because it is the more informative affordance for the current player.
 */
export function humanSeatChipLabel(input: Pick<HumanIdentityInput, 'isHost' | 'isYou'> & { roles?: HumanRoleLabels }): string | null {
  const { isHost = false, isYou = false } = input;
  if (isYou) return input.roles?.you ?? DEFAULT_HUMAN_ROLE_LABELS.you;
  if (isHost) return input.roles?.host ?? 'Host';
  return null;
}
