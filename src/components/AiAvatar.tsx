import { useMemo } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { multiwayAiIdentityForName } from '../domain/poker/multiwayAiProfiles';
import { type ThemePalette, useAppTheme } from '../theme';

const avatarSources: Record<string, ImageSourcePropType> = {
  'mara-balanced': require('../../assets/ai-players/mara-balanced.png'),
  'theo-patient': require('../../assets/ai-players/theo-patient.png'),
  'nova-pressure': require('../../assets/ai-players/nova-pressure.png'),
  'june-sticky': require('../../assets/ai-players/june-sticky.png'),
  'sol-deceptive': require('../../assets/ai-players/sol-deceptive.png'),
  'kai-balanced': require('../../assets/ai-players/kai-balanced.png'),
  'iris-patient': require('../../assets/ai-players/iris-patient.png'),
  'dex-pressure': require('../../assets/ai-players/dex-pressure.png'),
  'lena-sticky': require('../../assets/ai-players/lena-sticky.png'),
  'amir-deceptive': require('../../assets/ai-players/amir-deceptive.png'),
  'rowan-balanced': require('../../assets/ai-players/rowan-balanced.png'),
  'priya-patient': require('../../assets/ai-players/priya-patient.png'),
  'zane-pressure': require('../../assets/ai-players/zane-pressure.png'),
  'aya-sticky': require('../../assets/ai-players/aya-sticky.png'),
  'victor-deceptive': require('../../assets/ai-players/victor-deceptive.png'),
  'vivian-sticky': require('../../assets/ai-players/vivian-sticky.png'),
  'mary-patient': require('../../assets/ai-players/mary-patient.png'),
  'bruce-pressure': require('../../assets/ai-players/bruce-pressure.png'),
  'lulu-patient': require('../../assets/ai-players/lulu-patient.png'),
  'steve-patient': require('../../assets/ai-players/steve-patient.png'),
  'yoyo-patient': require('../../assets/ai-players/yoyo-patient.png'),
  'hao-patient': require('../../assets/ai-players/hao-patient.png'),
  'uncle-tu-patient': require('../../assets/ai-players/uncle-tu-patient.png'),
  'gary-pressure': require('../../assets/ai-players/gary-pressure.png'),
  'mr-chi-sticky': require('../../assets/ai-players/mr-chi-sticky.png'),
  'auntie-chi-sticky': require('../../assets/ai-players/auntie-chi-sticky.png'),
  'zhou-pressure': require('../../assets/ai-players/zhou-pressure.png'),
};

export function AiAvatar({ name, size = 22 }: { name: string; size?: number }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, size), [palette, size]);
  const identity = multiwayAiIdentityForName(name);
  const source = identity ? avatarSources[identity.avatarKey] : undefined;

  if (!source) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.fallback}>
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
    initial: { color: palette.primaryText, fontSize: size * 0.46, fontWeight: '800' },
  });
}
