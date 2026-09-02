import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextProps,
  View,
} from 'react-native';

import {
  LEARNING_GOAL_IDS,
  type LearningGoalId,
} from '../../domain/learning/guidedProgress';
import { type MessageKey, useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from './ModalSafeArea';
import { GuidedText } from '../../components/GuidedText';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface LearningSetupModalProps {
  currentGoal: LearningGoalId;
  onChooseGoal: (goal: LearningGoalId) => void;
  onSkip: () => void;
  onStartCalibration: (goal: LearningGoalId) => void;
  visible: boolean;
}

const goalIcons: Record<LearningGoalId, IconName> = {
  balanced: 'compass-outline',
  foundations: 'layers-outline',
  'cash-game': 'grid-outline',
  tournament: 'trophy-outline',
  math: 'calculator-outline',
  opponents: 'people-outline',
};

function goalKey(goal: LearningGoalId, field: 'description' | 'title'): MessageKey {
  return `guided.goal.${goal}.${field}` as MessageKey;
}


export function LearningSetupModal({
  currentGoal,
  onChooseGoal,
  onSkip,
  onStartCalibration,
  visible,
}: LearningSetupModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const reduceMotion = useReducedMotion();
  const [selectedGoal, setSelectedGoal] = useState(currentGoal);

  useEffect(() => {
    if (visible) setSelectedGoal(currentGoal);
  }, [currentGoal, visible]);

  return (
    <Modal animationType={reduceMotion ? 'none' : "slide"} onRequestClose={onSkip} presentationStyle="fullScreen" visible={visible}>
      <ModalSafeArea>
        <View accessibilityViewIsModal style={styles.screen}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <GuidedText style={styles.eyebrow}>{t('guided.setup.eyebrow')}</GuidedText>
              <GuidedText accessibilityRole="header" style={styles.title}>{t('guided.setup.title')}</GuidedText>
            </View>
            <Pressable
              accessibilityLabel={t('guided.setup.skip')}
              accessibilityRole="button"
              hitSlop={10}
              onPress={onSkip}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Ionicons color={palette.muted} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.scroller}>
            <GuidedText style={styles.intro}>{t('guided.setup.description')}</GuidedText>
            <View style={styles.goalList}>
              {LEARNING_GOAL_IDS.map((goal) => {
                const selected = goal === selectedGoal;
                return (
                  <Pressable
                    accessibilityLabel={`${t(goalKey(goal, 'title'))}. ${t(goalKey(goal, 'description'))}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={goal}
                    onPress={() => setSelectedGoal(goal)}
                    style={({ pressed }) => [
                      styles.goalRow,
                      selected && styles.goalRowSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.goalIcon, selected && styles.goalIconSelected]}>
                      <Ionicons color={selected ? palette.primaryText : palette.primary} name={goalIcons[goal]} size={20} />
                    </View>
                    <View style={styles.goalCopy}>
                      <GuidedText style={[styles.goalTitle, selected && styles.goalTitleSelected]}>{t(goalKey(goal, 'title'))}</GuidedText>
                      <GuidedText style={styles.goalDescription}>{t(goalKey(goal, 'description'))}</GuidedText>
                    </View>
                    <Ionicons
                      color={selected ? palette.primary : palette.border}
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                    />
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.privacyNote}>
              <Ionicons color={palette.aqua} name="phone-portrait-outline" size={17} />
              <GuidedText style={styles.privacyText}>{t('guided.setup.localNote')}</GuidedText>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onStartCalibration(selectedGoal)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <View style={styles.buttonCopy}>
                <GuidedText style={styles.primaryButtonText}>{t('guided.setup.checkSkill')}</GuidedText>
                <GuidedText style={styles.primaryButtonDetail}>{t('guided.setup.checkSkillDetail')}</GuidedText>
              </View>
              <Ionicons color={palette.primaryText} name="arrow-forward" size={19} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onChooseGoal(selectedGoal)}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <GuidedText style={styles.secondaryButtonText}>{t('guided.setup.startWithoutCheck')}</GuidedText>
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
    header: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, backgroundColor: palette.surface },
    headerCopy: { flex: 1, minWidth: 0, gap: 3 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.35 },
    closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    scroller: { flex: 1, minHeight: 0 },
    content: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 13, padding: 18, paddingBottom: 24 },
    intro: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    goalList: { gap: 8 },
    goalRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    goalRowSelected: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    goalIcon: { width: 39, height: 39, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.accentSoft },
    goalIconSelected: { backgroundColor: palette.primary },
    goalCopy: { flex: 1, minWidth: 0, gap: 2 },
    goalTitle: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
    goalTitleSelected: { color: palette.primary },
    goalDescription: { color: palette.muted, fontSize: 10, lineHeight: 15 },
    privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 13, backgroundColor: palette.aquaSoft },
    privacyText: { flex: 1, color: palette.aquaText, fontSize: 10, lineHeight: 15, fontWeight: '600' },
    footer: { gap: 8, padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface },
    primaryButton: { width: '100%', maxWidth: 650, minHeight: 55, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 15, backgroundColor: palette.primary },
    buttonCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, lineHeight: 19, fontWeight: '800', textAlign: 'center' },
    primaryButtonDetail: { color: palette.primaryText, opacity: 0.76, fontSize: 9, lineHeight: 13, textAlign: 'center' },
    secondaryButton: { width: '100%', maxWidth: 650, minHeight: 43, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    secondaryButtonText: { color: palette.text, fontSize: 12, fontWeight: '800' },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
