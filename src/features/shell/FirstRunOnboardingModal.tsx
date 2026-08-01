import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from '../learn/ModalSafeArea';

interface FirstRunOnboardingModalProps {
  onComplete: () => void;
  visible: boolean;
}

const onboardingPoints = [
  {
    icon: 'game-controller-outline' as const,
    title: 'Practice, never gamble',
    description: 'Every chip is virtual. RiverMind has no cash play, prizes, deposits, or purchases.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Facts before explanations',
    description: 'Poker math comes from RiverMind’s verified engine. AI adds plain-language coaching and can be unavailable.',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'Private learning progress',
    description: 'An anonymous account saves your lessons and known hand history. You can delete everything from Profile.',
  },
];

export function FirstRunOnboardingModal({ onComplete, visible }: FirstRunOnboardingModalProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

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
              <Text style={styles.eyebrow}>Welcome to RiverMind</Text>
              <Text accessibilityRole="header" style={styles.title}>Learn one decision at a time.</Text>
              <Text style={styles.subtitle}>
                Short lessons, realistic heads-up hands, and coaching that separates verified poker facts from AI explanation.
              </Text>
            </View>

            <View style={styles.points}>
              {onboardingPoints.map((point) => (
                <View key={point.title} style={styles.point}>
                  <View style={styles.pointIcon}>
                    <Ionicons color={palette.primary} name={point.icon} size={20} />
                  </View>
                  <View style={styles.pointCopy}>
                    <Text style={styles.pointTitle}>{point.title}</Text>
                    <Text style={styles.pointDescription}>{point.description}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.note}>These details remain available in Profile → Beta & privacy.</Text>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={onComplete} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Start learning</Text>
              <Ionicons color={palette.primaryText} name="arrow-forward" size={18} />
            </Pressable>
          </View>
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 30, paddingBottom: 20 },
    brandMark: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: palette.primary, marginBottom: 25 },
    intro: { gap: 9, marginBottom: 28 },
    eyebrow: { color: palette.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { maxWidth: 340, color: palette.text, fontSize: 31, lineHeight: 37, fontWeight: '700', letterSpacing: -0.8 },
    subtitle: { maxWidth: 390, color: palette.muted, fontSize: 14, lineHeight: 21 },
    points: { gap: 10 },
    point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    pointIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.accentSoft },
    pointCopy: { flex: 1, gap: 3 },
    pointTitle: { color: palette.text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    pointDescription: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    note: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 18 },
    footer: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 14, backgroundColor: palette.background },
    primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
  });
}
