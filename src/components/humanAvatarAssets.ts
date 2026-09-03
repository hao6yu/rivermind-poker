import type { HumanAvatarId } from '../domain/playerProfile';

/**
 * D11 preset identity colors (P18-021): the shipped preset files are one
 * shared silhouette, not six distinct authored marks, so presets render as
 * their initials on these distinct hues until approved art lands. The hues
 * mirror the light palette's identity tones and stay white-legible in both
 * schemes; they are identity chrome, not surface tokens.
 */
export const humanAvatarPresetColors: Record<HumanAvatarId, string> = {
  'human-ash': '#4A53D2',
  'human-bay': '#188080',
  'human-cove': '#7A4BA8',
  'human-dawn': '#B85C38',
  'human-ember': '#BD4052',
  'human-fern': '#3E7A5E',
};
