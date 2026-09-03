import { DecorativeIcon } from '../../components/DecorativeIcon';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';

export function MultiplayerEntryCard({
  onCreate,
  onJoin,
  onResume,
}: {
  onCreate: () => void;
  onJoin: () => void;
  onResume?: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    // P18-034: stable automation IDs on the 1.2 critical path so the release
    // smoke flow no longer selects English copy.
    <View style={styles.section} testID="play.multiplayer.entry">
      <Text accessibilityRole="header" style={styles.sectionTitle}>{t('multiplayer.play.section')}</Text>
      <View style={styles.card}>
        <View style={styles.copy}>
          <Text style={styles.title}>{t('multiplayer.play.title')}</Text>
          <Text style={styles.description}>{t('multiplayer.play.description')}</Text>
        </View>

        {onResume ? (
          <Pressable
            accessibilityLabel={`${t('multiplayer.play.resume')}. ${t('multiplayer.play.resumeDescription')}`}
            accessibilityRole="button"
            onPress={onResume}
            testID="play.multiplayer.resume"
            style={({ pressed }) => [styles.resumeAction, pressed && styles.pressed]}
          >
            <View style={styles.resumeIcon}>
              <DecorativeIcon color={palette.primary} name="sync" size={18} />
            </View>
            <View style={styles.resumeCopy}>
              <Text style={styles.resumeTitle}>{t('multiplayer.play.resume')}</Text>
              <Text numberOfLines={2} style={styles.resumeDescription}>{t('multiplayer.play.resumeDescription')}</Text>
            </View>
            <DecorativeIcon color={palette.muted} name="arrow-forward" size={17} />
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={t('multiplayer.play.create')}
            accessibilityRole="button"
            onPress={onCreate}
            testID="play.multiplayer.create"
            style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          >
            <DecorativeIcon color={palette.primaryText} name="add" size={18} />
            <Text style={styles.primaryActionText}>{t('multiplayer.play.create')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('multiplayer.play.join')}
            accessibilityRole="button"
            onPress={onJoin}
            testID="play.multiplayer.join"
            style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
          >
            <DecorativeIcon color={palette.primary} name="enter-outline" size={17} />
            <Text style={styles.secondaryActionText}>{t('multiplayer.play.join')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    section: { gap: 8 },
    sectionTitle: { color: palette.text, fontSize: 14, fontWeight: '800', paddingHorizontal: 2 },
    card: { gap: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised },
    copy: { gap: 4 },
    title: { color: palette.text, fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.35 },
    description: { maxWidth: 470, color: palette.muted, fontSize: 12.5, lineHeight: 18 },
    resumeAction: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    resumeIcon: { width: 34, height: 34, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.soft },
    resumeCopy: { flex: 1, minWidth: 0, gap: 2 },
    resumeTitle: { color: palette.text, fontSize: 12.5, fontWeight: '900' },
    resumeDescription: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    actions: { flexDirection: 'row', gap: 9 },
    primaryAction: { flex: 1, minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 13, backgroundColor: palette.primary },
    primaryActionText: { color: palette.primaryText, fontSize: 12.5, fontWeight: '800' },
    secondaryAction: { flex: 1, minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    secondaryActionText: { color: palette.primary, fontSize: 12.5, fontWeight: '800' },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
