import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from '../learn/ModalSafeArea';

interface FirstRunOnboardingModalProps {
  onComplete: () => void;
  visible: boolean;
}

export function FirstRunOnboardingModal({ onComplete, visible }: FirstRunOnboardingModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { height } = useWindowDimensions();
  const compactLayout = height < 700;
  const styles = useMemo(() => createStyles(palette, compactLayout), [compactLayout, palette]);
  const onboardingPoints = [
    {
      icon: 'game-controller-outline' as const,
      title: t('onboarding.practiceTitle'),
      description: t('onboarding.practiceDescription'),
    },
    {
      icon: 'shield-checkmark-outline' as const,
      title: t('onboarding.factsTitle'),
      description: t('onboarding.factsDescription'),
    },
    {
      icon: 'lock-closed-outline' as const,
      title: t('onboarding.privacyTitle'),
      description: t('onboarding.privacyDescription'),
    },
  ];

  return (
    <Modal animationType="fade" onRequestClose={onComplete} visible={visible}>
      <ModalSafeArea>
        <View accessibilityViewIsModal style={styles.screen}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandMark}>
              <Ionicons color={palette.primaryText} name="sparkles" size={27} />
            </View>
            <View style={styles.intro}>
              <Text style={styles.eyebrow}>{t('onboarding.welcome')}</Text>
              <Text accessibilityRole="header" style={styles.title}>{t('onboarding.title')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>
            </View>

            <View style={styles.points}>
              {onboardingPoints.map((point) => (
                <View key={point.title} style={styles.point}>
                  <View style={styles.pointIcon}>
                    <Ionicons color={palette.primary} name={point.icon} size={compactLayout ? 17 : 20} />
                  </View>
                  <View style={styles.pointCopy}>
                    <Text style={styles.pointTitle}>{point.title}</Text>
                    <Text style={styles.pointDescription}>{point.description}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.note}>{t('onboarding.note')}</Text>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={onComplete} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('onboarding.start')}</Text>
              <Ionicons color={palette.primaryText} name="arrow-forward" size={18} />
            </Pressable>
          </View>
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

function createStyles(palette: ThemePalette, compact = false) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { flexGrow: 1, paddingHorizontal: compact ? 16 : 22, paddingTop: compact ? 14 : 30, paddingBottom: compact ? 8 : 20 },
    brandMark: { width: compact ? 42 : 54, height: compact ? 42 : 54, alignItems: 'center', justifyContent: 'center', borderRadius: compact ? 14 : 18, backgroundColor: palette.primary, marginBottom: compact ? 12 : 25 },
    intro: { gap: compact ? 5 : 9, marginBottom: compact ? 14 : 28 },
    eyebrow: { color: palette.primary, fontSize: compact ? 9 : 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { maxWidth: 340, color: palette.text, fontSize: compact ? 25 : 31, lineHeight: compact ? 30 : 37, fontWeight: '700', letterSpacing: -0.8 },
    subtitle: { maxWidth: 390, color: palette.muted, fontSize: compact ? 12 : 14, lineHeight: compact ? 17 : 21 },
    points: { gap: compact ? 7 : 10 },
    point: { flexDirection: 'row', alignItems: 'flex-start', gap: compact ? 9 : 12, padding: compact ? 10 : 14, borderRadius: compact ? 14 : 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    pointIcon: { width: compact ? 32 : 38, height: compact ? 32 : 38, alignItems: 'center', justifyContent: 'center', borderRadius: compact ? 10 : 12, backgroundColor: palette.accentSoft },
    pointCopy: { flex: 1, gap: 3 },
    pointTitle: { color: palette.text, fontSize: compact ? 12 : 14, lineHeight: compact ? 16 : 19, fontWeight: '700' },
    pointDescription: { color: palette.muted, fontSize: compact ? 10 : 12, lineHeight: compact ? 14 : 18 },
    note: { color: palette.muted, fontSize: compact ? 9 : 10, lineHeight: compact ? 12 : 15, textAlign: 'center', marginTop: compact ? 9 : 18 },
    footer: { paddingHorizontal: compact ? 16 : 22, paddingTop: compact ? 6 : 10, paddingBottom: compact ? 8 : 14, backgroundColor: palette.background },
    primaryButton: { minHeight: compact ? 46 : 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
  });
}
