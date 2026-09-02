import { useMemo } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { multiwayAiIdentityForName } from '../domain/poker/multiwayAiProfiles';
import { AI_AVATAR_DOCUMENTED_FALLBACKS } from './aiAvatarIdentity';
import { aiAvatarSources } from './aiAvatarSources';
import { type ThemePalette, useAppTheme } from '../theme';

export function AiAvatar({ name, size = 22 }: { name: string; size?: number }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, size), [palette, size]);
  const identity = multiwayAiIdentityForName(name);
  const avatarKey = identity?.avatarKey;
  const source = avatarKey ? aiAvatarSources[avatarKey as keyof typeof aiAvatarSources] : undefined;

  if (!source) {
    // Documented persona fallbacks own their distinct hue; anything else
    // (an unknown name) keeps the defensive themed fallback.
    const fallbackColor = identity ? AI_AVATAR_DOCUMENTED_FALLBACKS[identity.avatarKey] : undefined;
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.fallback, fallbackColor ? { backgroundColor: fallbackColor } : null]}
      >
        <Text style={styles.initial}>{name.slice(0, 1).toUpperCase()}</Text>
      </View>
    );
  }

  return (
    <Image
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      source={source}
      style={styles.image}
    />
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
    fallback: {
      ...common,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primary,
    },
    initial: { color: '#FFFFFF', fontSize: size * 0.46, fontWeight: '800' },
  });
}
