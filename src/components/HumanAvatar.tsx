import { useMemo } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle } from 'react-native';

import { getRenderableUploadedAvatar } from '../services/avatarStorage';
import { humanAvatarAccessibilityLabel, humanAvatarDisplay } from '../domain/avatar';
import { authoredAvatarTransform } from '../domain/avatarFraming';
import {
  HUMAN_AVATAR_INITIALS,
  initialsFromName,
  type HumanAvatarId,
  type HumanAvatarReference,
} from '../domain/playerProfile';
import { humanAvatarPresetColors } from './humanAvatarAssets';
import { recordAppDiagnostic } from '../services/betaFeedback';
import { type ThemePalette, useAppTheme } from '../theme';

export interface HumanAvatarProps {
  /** The avatar reference carried by the profile or the multiplayer seat. */
  avatar: HumanAvatarReference;
  /** Diameter, in logical pixels. */
  size?: number;
  /** The seat's display name. Used only to derive initials when the avatar is
   * an uploaded image that fell back, or the initials fallback itself, so the
   * initials stay tied to the person, not the image. */
  displayName?: string;
  /**
   * Viewer privacy choice. When `'hide'`, the seat is rendered behind initials
   * even if the underlying avatar is an image — the image is never fetched or
   * shown. Defaults to showing the avatar.
   */
  visibility?: 'show' | 'hide';
  /**
   * The multiplayer room this seat renders in. Required for a foreign
   * (room-resolved) uploaded avatar: its cached image is authorized to render
   * only inside the room it was resolved under, so a cache entry learned in
   * another room falls back to initials here. The device's own avatar renders
   * without a room.
   */
  roomId?: string;
  /** Optional explicit label; defaults to the authored/uploaded/initials label. */
  accessibilityLabel?: string;
}

/**
 * The single rendering boundary for human identity. Every seat (home, heads-up,
 * local multiway, private lobby/live, results, replay) renders through it, so
 * presentation and accessibility never depend on the seat's origin.
 *
 *  - authored: a stable authored asset, always available;
 *  - uploaded: a cached image from the local registry, resolved by the bounded
 *    `avatarId` + `version` and authorized for this context — the device's own
 *    avatar renders anywhere, while a foreign avatar renders only inside the
 *    room it was resolved under (`roomId`); a missing, stale, unauthorized, or
 *    failed image falls back to initials without changing seat geometry;
 *  - hide: the viewer asked to see nothing but initials, so an authored or
 *    uploaded avatar renders as initials regardless of the underlying image;
 *  - initials: the stable initials fallback.
 */
export function HumanAvatar({
  avatar,
  size = 40,
  displayName,
  visibility = 'show',
  roomId,
  accessibilityLabel,
}: HumanAvatarProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, size), [palette, size]);

  const display = humanAvatarDisplay(avatar);
  const label = accessibilityLabel ?? humanAvatarAccessibilityLabel(avatar);
  const fallback = resolveFallbackInitials(display, displayName);

  // Authored presets render as the preset's initials on its distinct color
  // (D11): the shipped placeholder files are one shared silhouette, not six
  // distinct authored marks, so the initials presentation is the honest
  // identity until real art lands (recorded in the Phase 18.5 ledger). A
  // hidden seat renders behind initials, never an image.
  if (visibility !== 'hide' && display.mode === 'authored' && display.id) {
    const presetId = display.id as HumanAvatarId;
    return (
      <View
        accessibilityLabel={label}
        style={[styles.framingContainer, { backgroundColor: humanAvatarPresetColors[presetId] }]}
      >
        <Text maxFontSizeMultiplier={1} style={styles.presetInitials}>
          {HUMAN_AVATAR_INITIALS[presetId]}
        </Text>
      </View>
    );
  }

  if (visibility !== 'hide' && display.mode === 'uploaded') {
    // The registry entry is rendered ONLY when it is authorized in this
    // context: the device's own avatar anywhere, or a foreign avatar inside
    // the room it was resolved under. A stale entry learned in another room —
    // even one whose version matches — is not authorized here and falls back
    // to initials; the worker's denial is respected at render time.
    const resolved = display.avatarId ? getRenderableUploadedAvatar(display.avatarId, roomId) : null;
    const matches = resolved?.version === display.version;
    if (!matches || !resolved?.uri) {
      // Best-effort by design (P18-032): a missing, stale, or unauthorized
      // cache entry degrades to initials without changing seat geometry —
      // the worker's denial is respected at render time. The fallback is
      // recorded as a stable local diagnostic token (no id, path, or room);
      // the visual state the player sees is the initials plaque, which is
      // already the documented recovery presentation.
      recordAppDiagnostic({ code: 'avatar-resolve-fallback', retryable: true, source: 'avatar-render' });
      return <Initials initials={fallback} label={label} size={size} styles={styles} />;
    }
    return (
      <Image
        accessibilityLabel={label}
        source={{ uri: resolved.uri }}
        style={styles.image}
        testID="human-avatar-uploaded"
      />
    );
  }

  return <Initials initials={fallback} label={label} size={size} styles={styles} />;
}

/**
 * Derive the initials shown when a non-authored avatar is unavailable: the
 * display name's initials, else the authored avatar's initials, else '?'.
 */
function resolveFallbackInitials(
  display: ReturnType<typeof humanAvatarDisplay>,
  displayName?: string,
): string {
  if (display.initials) return display.initials;
  if (displayName) {
    const derived = initialsFromName(displayName);
    if (derived) return derived;
  }
  if (display.id) return (display.id.slice('human-'.length).charAt(0).toUpperCase());
  return '?';
}

function Initials({
  initials,
  label,
  size,
  styles,
}: {
  initials: string;
  label: string;
  size: number;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View accessibilityLabel={label} importantForAccessibility="no-hide-descendants" style={styles.fallback}>
      <Text style={styles.initial}>{initials}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette, size: number) {
  const common = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 1,
    borderColor: palette.tableLine,
  } as const;
  return StyleSheet.create({
    image: common,
    // Owns the rendered diameter, circular clip, and border; the preset
    // initials inside are clipped to exactly this box.
    framingContainer: { ...common, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    // White-on-hue stays legible on every preset color in both schemes.
    presetInitials: { color: '#FFFFFF', fontSize: size * 0.38, fontWeight: '800' },
    fallback: {
      ...common,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primary,
    },
    initial: { color: palette.primaryText, fontSize: size * 0.46, fontWeight: '800' },
  });
}
