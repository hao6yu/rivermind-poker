import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';

export function MultiplayerEntryCard({
  onCreate,
  onJoin,
}: {
  onCreate: () => void;
  onJoin: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{t('multiplayer.play.section')}</Text>
      <View style={styles.card}>
        <View pointerEvents="none" style={styles.glow} />
        <View style={styles.headerRow}>
          <View style={styles.avatarStack}>
            <View style={[styles.avatar, styles.avatarPrimary]}>
              <Ionicons color={palette.primaryText} name="person" size={15} />
            </View>
            <View style={[styles.avatar, styles.avatarFriend]}>
              <Ionicons color={palette.aquaText} name="person" size={15} />
            </View>
            <View style={[styles.avatar, styles.avatarAi]}>
              <Ionicons color={palette.primary} name="hardware-chip" size={14} />
            </View>
          </View>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>{t('multiplayer.play.badge')}</Text>
          </View>
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>{t('multiplayer.play.title')}</Text>
          <Text style={styles.description}>{t('multiplayer.play.description')}</Text>
        </View>

        <View style={styles.metaRow}>
          <MetaPill icon="key-outline" label={t('multiplayer.play.privateCode')} />
          <MetaPill icon="people-outline" label={t('multiplayer.play.mixedSeats')} />
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={t('multiplayer.play.create')}
            accessibilityRole="button"
            onPress={onCreate}
            style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          >
            <Ionicons color={palette.primaryText} name="add" size={18} />
            <Text style={styles.primaryActionText}>{t('multiplayer.play.create')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('multiplayer.play.join')}
            accessibilityRole="button"
            onPress={onJoin}
            style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
          >
            <Ionicons color={palette.primary} name="enter-outline" size={17} />
            <Text style={styles.secondaryActionText}>{t('multiplayer.play.join')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MetaPill({ icon, label }: { icon: 'key-outline' | 'people-outline'; label: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.metaPill}>
      <Ionicons color={palette.muted} name={icon} size={13} />
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    section: { gap: 8 },
    sectionTitle: { color: palette.text, fontSize: 14, fontWeight: '800', paddingHorizontal: 2 },
    card: { gap: 14, padding: 16, overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 20, elevation: 2 },
    glow: { position: 'absolute', right: -42, top: -65, width: 170, height: 170, borderRadius: 85, backgroundColor: palette.aquaSoft },
    headerRow: { minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    avatarStack: { width: 96, height: 35, flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, borderWidth: 2, borderColor: palette.surfaceRaised },
    avatarPrimary: { zIndex: 3, backgroundColor: palette.primary },
    avatarFriend: { zIndex: 2, marginLeft: -7, backgroundColor: palette.aquaSoft },
    avatarAi: { zIndex: 1, marginLeft: -7, backgroundColor: palette.accentSoft },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: palette.aquaSoft },
    badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.aqua },
    badgeText: { color: palette.aquaText, fontSize: 10, fontWeight: '800' },
    copy: { gap: 4 },
    title: { color: palette.text, fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.35 },
    description: { maxWidth: 470, color: palette.muted, fontSize: 12.5, lineHeight: 18 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    metaPill: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderRadius: 9, backgroundColor: palette.soft },
    metaText: { color: palette.muted, fontSize: 10.5, fontWeight: '700' },
    actions: { flexDirection: 'row', gap: 9 },
    primaryAction: { flex: 1, minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 13, backgroundColor: palette.primary },
    primaryActionText: { color: palette.primaryText, fontSize: 12.5, fontWeight: '800' },
    secondaryAction: { flex: 1, minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    secondaryActionText: { color: palette.primary, fontSize: 12.5, fontWeight: '800' },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
