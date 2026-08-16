import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppLanguage } from '../../localization';
import { aiCoachConsentCopy } from '../../localization/aiCoachConsentMessages';
import { type ThemePalette, useAppTheme } from '../../theme';

interface AiCoachConsentPanelProps {
  language: AppLanguage;
  onAllow: () => void;
  onCancel: () => void;
  onDecline: () => void;
}

export function AiCoachConsentPanel({
  language,
  onAllow,
  onCancel,
  onDecline,
}: AiCoachConsentPanelProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const copy = aiCoachConsentCopy(language);

  return (
    <View accessibilityLabel={copy.title} style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons color={palette.primary} name="shield-checkmark-outline" size={22} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
          <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
        </View>
        <Pressable
          accessibilityLabel={copy.cancel}
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.closeButton}
        >
          <Ionicons color={palette.text} name="close" size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <Text style={styles.introduction}>{copy.introduction}</Text>

        <View style={styles.dataCard}>
          <Text style={styles.sectionTitle}>{copy.sentHeading}</Text>
          {copy.sentItems.map((item) => (
            <View key={item} style={styles.listItem}>
              <View style={styles.bullet} />
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.providerCard}>
          <Ionicons color={palette.primary} name="swap-horizontal-outline" size={19} />
          <Text style={styles.providerText}>{copy.providers}</Text>
        </View>

        <View style={styles.privacyCard}>
          <Ionicons color={palette.aquaText} name="lock-closed-outline" size={18} />
          <Text style={styles.privacyText}>{copy.notSent}</Text>
        </View>

        <Text style={styles.localReview}>{copy.localReview}</Text>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onAllow} style={styles.allowButton}>
          <Text style={styles.allowButtonText}>{copy.allow}</Text>
        </Pressable>
        <View style={styles.secondaryActions}>
          <Pressable accessibilityRole="button" onPress={onDecline} style={styles.declineButton}>
            <Text style={styles.declineButtonText}>{copy.decline}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>{copy.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    panel: { width: '100%', flexShrink: 1, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    icon: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: palette.accentSoft,
    },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: {
      color: palette.primary,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    title: { color: palette.text, fontSize: 19, lineHeight: 24, fontWeight: '700', marginTop: 2 },
    closeButton: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surfaceRaised,
    },
    scroll: { flexShrink: 1 },
    content: { gap: 12, paddingBottom: 2 },
    introduction: { color: palette.text, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    dataCard: {
      gap: 9,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surfaceRaised,
    },
    sectionTitle: {
      color: palette.text,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    bullet: { width: 6, height: 6, marginTop: 6, borderRadius: 3, backgroundColor: palette.primary },
    listText: { flex: 1, color: palette.text, fontSize: 11, lineHeight: 17 },
    providerCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 13,
      borderRadius: 15,
      backgroundColor: palette.accentSoft,
    },
    providerText: { flex: 1, color: palette.text, fontSize: 10.5, lineHeight: 16 },
    privacyCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 13,
      borderRadius: 15,
      backgroundColor: palette.aquaSoft,
    },
    privacyText: { flex: 1, color: palette.aquaText, fontSize: 10.5, lineHeight: 16 },
    localReview: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
    actions: { gap: 9 },
    allowButton: {
      minHeight: 49,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: palette.primary,
    },
    allowButtonText: { color: palette.primaryText, fontSize: 13, fontWeight: '700', textAlign: 'center' },
    secondaryActions: { flexDirection: 'row', gap: 8 },
    declineButton: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: palette.danger,
      backgroundColor: palette.surfaceRaised,
    },
    declineButtonText: { color: palette.danger, fontSize: 12, fontWeight: '700', textAlign: 'center' },
    cancelButton: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surfaceRaised,
    },
    cancelButtonText: { color: palette.text, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  });
}
