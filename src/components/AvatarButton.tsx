import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HumanAvatar } from './HumanAvatar';
import {
  AVATAR_BADGE_OVERLAP,
  AVATAR_BADGE_SIZE,
  AVATAR_BUTTON_AVATAR_SIZE,
  AVATAR_BUTTON_SIDE,
} from '../domain/avatarFraming';
import type { HumanAvatarReference } from '../domain/playerProfile';
import { type ThemePalette, useAppTheme } from '../theme';

/**
 * The one tappable identity boundary: a 44×44-point rounded-square themed
 * button that renders the normalized avatar at its shared visible size with an
 * optional small camera/edit badge. Home, Learn, and Profile headers all press
 * identity through this component, so optical alignment is owned by one
 * geometry instead of per-screen offsets (Slice 3.11A issue 2).
 */
export function AvatarButton({
  accessibilityLabel,
  avatar,
  badge = 'none',
  displayName,
  onPress,
  roomId,
  visibility,
}: {
  /** Localized label announced for the whole button. */
  accessibilityLabel: string;
  avatar: HumanAvatarReference;
  /** `'camera'` marks an editable identity; `'none'` renders a plain entry. */
  badge?: 'camera' | 'none';
  displayName?: string;
  onPress: () => void;
  roomId?: string;
  visibility?: 'show' | 'hide';
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <HumanAvatar
        avatar={avatar}
        displayName={displayName}
        roomId={roomId}
        size={AVATAR_BUTTON_AVATAR_SIZE}
        visibility={visibility}
      />
      {badge === 'camera' ? (
        <View style={styles.badge}>
          <Ionicons color={palette.primaryText} name="camera-outline" size={10} />
        </View>
      ) : null}
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    button: {
      width: AVATAR_BUTTON_SIDE,
      height: AVATAR_BUTTON_SIDE,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.soft,
      borderWidth: 1,
      borderColor: palette.border,
    },
    pressed: { opacity: 0.7 },
    badge: {
      position: 'absolute',
      right: -AVATAR_BADGE_OVERLAP,
      bottom: -AVATAR_BADGE_OVERLAP,
      width: AVATAR_BADGE_SIZE,
      height: AVATAR_BADGE_SIZE,
      borderRadius: AVATAR_BADGE_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primary,
      borderWidth: 1.5,
      borderColor: palette.surface,
    },
  });
}
