import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AiAvatar } from './AiAvatar';
import type { MultiwayAiIdentity } from '../domain/poker/multiwayAiProfiles';
import { type ThemePalette, useAppTheme } from '../theme';

/**
 * An opponent at a size you can actually read them at. The table plaque has to
 * fit six of these around a phone screen; this is the same person with room to
 * breathe, so the roster and the tap-a-seat sheet can share one presentation.
 *
 * Deliberately shows only what a player is entitled to know about an opponent
 * before they have played them: who they are, not how they play.
 */
export function AiPlayerProfile({
  identity,
  size = 'large',
}: {
  identity: MultiwayAiIdentity;
  size?: 'large' | 'row';
}) {
  const { palette } = useAppTheme();
  const large = size === 'large';
  const styles = useMemo(() => createStyles(palette, large), [large, palette]);

  return (
    <View style={styles.container}>
      <AiAvatar name={identity.name} size={large ? 104 : 46} />
      <View style={styles.copy}>
        <Text accessibilityRole={large ? 'header' : undefined} style={styles.name}>{identity.name}</Text>
        {identity.title ? <Text style={styles.title}>{identity.title}</Text> : null}
      </View>
    </View>
  );
}

function createStyles(palette: ThemePalette, large: boolean) {
  return StyleSheet.create({
    container: large
      ? { alignItems: 'center', gap: 14, paddingVertical: 8 }
      : { alignItems: 'center', flexDirection: 'row', gap: 14 },
    copy: large ? { alignItems: 'center', gap: 4 } : { flex: 1, gap: 2 },
    name: {
      color: palette.text,
      fontSize: large ? 26 : 16,
      fontWeight: '800',
      textAlign: large ? 'center' : 'left',
    },
    title: {
      color: palette.muted,
      fontSize: large ? 15 : 13,
      fontWeight: '600',
      textAlign: large ? 'center' : 'left',
    },
  });
}
