import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from '../learn/ModalSafeArea';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/** The three first-run outcomes AppShell routes on (plan §3/§6.4). */
export type FirstRunExperienceChoice = 'beginner' | 'basics' | 'later';

interface FirstRunOnboardingModalProps {
  /** Explicit experience choice; AppShell owns onboarding completion + routing. */
  onChooseExperience: (choice: FirstRunExperienceChoice) => void;
  visible: boolean;
}

/**
 * The first-run welcome. Page one keeps the existing privacy and play-money
 * disclosures unchanged; page two presents the experience choice from plan
 * §3 as a separate page within the same flow (risk control: the first-run
 * modal never becomes crowded). The completion contract
 * (`rivermind.onboarding.v1`) is owned by AppShell and unchanged here.
 */
export function FirstRunOnboardingModal({ onChooseExperience, visible }: FirstRunOnboardingModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { height } = useWindowDimensions();
  const compactLayout = height < 700;
  const styles = useMemo(() => createStyles(palette, compactLayout), [compactLayout, palette]);
  const reduceMotion = useReducedMotion();
  const [page, setPage] = useState<'disclosures' | 'choice'>('disclosures');
  // Review finding #15: the modal always REOPENS on the disclosure page.
  // After local account deletion (or any other reopen), the privacy and
  // play-money disclosures must be shown again before the experience choice.
  useEffect(() => {
    if (visible) setPage('disclosures');
  }, [visible]);
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

  const choices: Array<{
    key: FirstRunExperienceChoice;
    icon: ComponentIcon;
    title: string;
    description: string;
    testID: string;
    primary?: boolean;
  }> = [
    {
      key: 'beginner',
      icon: 'school-outline',
      title: t('tutorial.onboarding.beginnerTitle'),
      description: t('tutorial.onboarding.beginnerDescription'),
      testID: 'onboarding.choice.beginner',
      primary: true,
    },
    {
      key: 'basics',
      icon: 'compass-outline',
      title: t('tutorial.onboarding.basicsTitle'),
      description: t('tutorial.onboarding.basicsDescription'),
      testID: 'onboarding.choice.basics',
    },
    {
      key: 'later',
      icon: 'flashlight-outline',
      title: t('tutorial.onboarding.laterTitle'),
      description: t('tutorial.onboarding.laterDescription'),
      testID: 'onboarding.choice.later',
    },
  ];

  return (
    <Modal animationType={reduceMotion ? 'none' : "fade"} onRequestClose={() => onChooseExperience('later')} visible={visible}>
      <ModalSafeArea>
        <View accessibilityViewIsModal style={styles.screen}>
          {page === 'disclosures' ? (
            <>
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
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPage('choice')}
                  style={styles.primaryButton}
                  testID="onboarding.disclosuresContinue"
                >
                  <Text style={styles.primaryButtonText}>{t('onboarding.start')}</Text>
                  <Ionicons color={palette.primaryText} name="arrow-forward" size={18} />
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Pressable
                  accessibilityLabel={t('tutorial.back')}
                  accessibilityRole="button"
                  onPress={() => setPage('disclosures')}
                  style={styles.backButton}
                  testID="onboarding.choice.back"
                >
                  <Ionicons color={palette.muted} name="arrow-back" size={19} />
                </Pressable>
                <View style={styles.intro}>
                  <Text accessibilityRole="header" style={styles.title}>{t('tutorial.onboarding.title')}</Text>
                  <Text style={styles.subtitle}>{t('tutorial.onboarding.description')}</Text>
                </View>
                <View style={styles.points}>
                  {choices.map((choice) => (
                    <Pressable
                      accessibilityRole="button"
                      key={choice.key}
                      onPress={() => onChooseExperience(choice.key)}
                      style={({ pressed }) => [
                        styles.choice,
                        choice.primary && styles.choicePrimary,
                        pressed && styles.pressed,
                      ]}
                      testID={choice.testID}
                    >
                      <View style={[styles.pointIcon, choice.primary && styles.choiceIconPrimary]}>
                        <Ionicons
                          color={choice.primary ? palette.primaryText : palette.primary}
                          name={choice.icon}
                          size={compactLayout ? 17 : 20}
                        />
                      </View>
                      <View style={styles.pointCopy}>
                        <Text style={[styles.pointTitle, choice.primary && styles.choiceTitlePrimary]}>
                          {choice.title}
                        </Text>
                        <Text style={[styles.pointDescription, choice.primary && styles.choiceDescriptionPrimary]}>
                          {choice.description}
                        </Text>
                      </View>
                      <Ionicons
                        color={choice.primary ? palette.primaryText : palette.muted}
                        name="chevron-forward"
                        size={17}
                      />
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.note}>{t('tutorial.welcome.playMoney')}</Text>
              </ScrollView>
            </>
          )}
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

type ComponentIcon = 'compass-outline' | 'flashlight-outline' | 'school-outline';

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
    point: { flexDirection: 'row', alignItems: 'flex-start', gap: compact ? 8 : 12, padding: compact ? 12 : 16, borderRadius: compact ? 16 : 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    pointIcon: { width: compact ? 32 : 38, height: compact ? 32 : 38, alignItems: 'center', justifyContent: 'center', borderRadius: compact ? 10 : 12, backgroundColor: palette.accentSoft },
    pointCopy: { flex: 1, gap: 3 },
    pointTitle: { color: palette.text, fontSize: compact ? 12 : 14, lineHeight: compact ? 16 : 19, fontWeight: '700' },
    pointDescription: { color: palette.muted, fontSize: compact ? 10 : 12, lineHeight: compact ? 14 : 18 },
    note: { color: palette.muted, fontSize: compact ? 9 : 10, lineHeight: compact ? 12 : 15, textAlign: 'center', marginTop: compact ? 9 : 18 },
    footer: { paddingHorizontal: compact ? 16 : 22, paddingTop: compact ? 6 : 10, paddingBottom: compact ? 8 : 14, backgroundColor: palette.background },
    primaryButton: { minHeight: compact ? 46 : 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
    backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.soft, marginBottom: 8 },
    choice: { flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 12, padding: compact ? 12 : 16, borderRadius: compact ? 16 : 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    choicePrimary: { borderColor: palette.primary, backgroundColor: palette.primary },
    choiceIconPrimary: { backgroundColor: palette.primaryText },
    choiceTitlePrimary: { color: palette.primaryText },
    choiceDescriptionPrimary: { color: palette.primaryText, opacity: 0.88 },
    pressed: { opacity: 0.82 },
  });
}
