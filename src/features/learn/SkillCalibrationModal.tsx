import { Ionicons } from '@expo/vector-icons';
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
  CALIBRATION_SKILL_IDS,
  calibrationQuestions,
  calibrationSkillForGoal,
  scoreSkillCalibration,
  type CalibrationAnswer,
  type CalibrationKind,
  type CalibrationQuestion,
  type LearningGoalId,
  type LearningSkillSnapshot,
} from '../../domain/learning/guidedProgress';
import { type MessageKey, useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from './ModalSafeArea';
import { GuidedText } from '../../components/GuidedText';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface SkillCalibrationModalProps {
  goal: LearningGoalId;
  kind: CalibrationKind;
  onClose: () => void;
  onComplete: (answers: readonly CalibrationAnswer[]) => void;
  previousSnapshot?: LearningSkillSnapshot | null;
  sessionCount: number;
  visible: boolean;
}

function questionKey(question: CalibrationQuestion, field: 'context' | 'prompt'): MessageKey {
  return `guided.calibration.${question.id}.${field}` as MessageKey;
}

function choiceKey(question: CalibrationQuestion, choiceId: string): MessageKey {
  return `guided.calibration.${question.id}.choice.${choiceId}` as MessageKey;
}

function skillKey(skill: string): MessageKey {
  return `guided.skill.${skill}` as MessageKey;
}

function goalKey(goal: LearningGoalId): MessageKey {
  return `guided.goal.${goal}.title` as MessageKey;
}

function signedChange(change: number): string {
  return change > 0 ? `+${change}` : String(change);
}


export function SkillCalibrationModal({
  goal,
  kind,
  onClose,
  onComplete,
  previousSnapshot,
  sessionCount,
  visible,
}: SkillCalibrationModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const reduceMotion = useReducedMotion();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<CalibrationAnswer[]>([]);
  const [result, setResult] = useState<LearningSkillSnapshot | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQuestionIndex(0);
    setSelectedChoiceId(null);
    setAnswers([]);
    setResult(null);
  }, [visible]);

  const question = calibrationQuestions[questionIndex]!;
  const advance = () => {
    if (!selectedChoiceId) return;
    const nextAnswers = [
      ...answers.filter((answer) => answer.questionId !== question.id),
      { choiceId: selectedChoiceId, questionId: question.id },
    ];
    setAnswers(nextAnswers);
    if (questionIndex === calibrationQuestions.length - 1) {
      setResult(scoreSkillCalibration(nextAnswers, kind, sessionCount));
      return;
    }
    setQuestionIndex((current) => current + 1);
    setSelectedChoiceId(null);
  };

  const goalSkill = calibrationSkillForGoal(goal);
  const overallChange = result && previousSnapshot
    ? result.overallScore - previousSnapshot.overallScore
    : null;
  const goalChange = result && previousSnapshot && goalSkill
    ? result.scores[goalSkill] - previousSnapshot.scores[goalSkill]
    : null;

  return (
    <Modal animationType={reduceMotion ? 'none' : "slide"} onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <ModalSafeArea>
        <View accessibilityViewIsModal style={styles.screen}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel={t('guided.calibration.close')}
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons color={palette.text} name="arrow-back" size={21} />
            </Pressable>
            <View style={styles.headerCopy}>
              <GuidedText style={styles.eyebrow}>{t(kind === 'baseline' ? 'guided.calibration.baselineEyebrow' : 'guided.calibration.checkpointEyebrow')}</GuidedText>
              <GuidedText numberOfLines={2} style={styles.title}>{t('guided.calibration.title')}</GuidedText>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          {result ? (
            <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false} style={styles.scroller}>
              <View style={styles.resultIcon}>
                <Ionicons color={palette.aqua} name="analytics-outline" size={29} />
              </View>
              <GuidedText style={styles.resultEyebrow}>{t(kind === 'baseline' ? 'guided.result.baseline' : 'guided.result.checkpoint')}</GuidedText>
              <GuidedText style={styles.resultScore}>{result.overallScore}%</GuidedText>
              <GuidedText style={styles.resultTitle}>{t('guided.result.title')}</GuidedText>
              <GuidedText style={styles.resultDescription}>{t('guided.result.description')}</GuidedText>
              {overallChange !== null ? (
                <View style={styles.changeGroup}>
                  <View style={styles.changePill}>
                    <Ionicons color={overallChange >= 0 ? palette.aqua : palette.danger} name={overallChange >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={16} />
                    <GuidedText style={[styles.changeText, overallChange < 0 && styles.changeTextDown]}>
                      {t('guided.result.overallChange', { change: signedChange(overallChange) })}
                    </GuidedText>
                  </View>
                  {goalChange !== null ? (
                    <View style={styles.changePill}>
                      <Ionicons color={goalChange >= 0 ? palette.aqua : palette.danger} name={goalChange >= 0 ? 'navigate-outline' : 'trending-down-outline'} size={16} />
                      <GuidedText style={[styles.changeText, goalChange < 0 && styles.changeTextDown]}>
                        {t('guided.result.goalChange', {
                          change: signedChange(goalChange),
                          goal: t(goalKey(goal)),
                        })}
                      </GuidedText>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.scoreCard}>
                {CALIBRATION_SKILL_IDS.map((skill) => {
                  const emphasized = skill === goalSkill;
                  return (
                    <View key={skill} style={[styles.scoreRow, emphasized && styles.scoreRowGoal]}>
                      <View style={styles.scoreCopy}>
                        <View style={styles.scoreHeading}>
                          <GuidedText style={[styles.scoreLabel, emphasized && styles.scoreLabelGoal]}>{t(skillKey(skill))}</GuidedText>
                          {emphasized ? <GuidedText style={styles.goalBadge}>{t('guided.result.yourGoal')}</GuidedText> : null}
                        </View>
                        <View style={styles.scoreTrack}>
                          <View style={[styles.scoreFill, { width: `${result.scores[skill]}%` }]} />
                        </View>
                      </View>
                      <GuidedText style={styles.scoreValue}>{result.scores[skill]}%</GuidedText>
                    </View>
                  );
                })}
              </View>
              <View style={styles.resultNote}>
                <Ionicons color={palette.primary} name="information-circle-outline" size={18} />
                <GuidedText style={styles.resultNoteText}>{t('guided.result.note')}</GuidedText>
              </View>
            </ScrollView>
          ) : (
            <>
              <View style={styles.progressHeader}>
                <GuidedText style={styles.progressText}>{t('guided.calibration.progress', { current: questionIndex + 1, total: calibrationQuestions.length })}</GuidedText>
                <GuidedText style={styles.skillLabel}>{t(skillKey(question.skill))}</GuidedText>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${((questionIndex + 1) / calibrationQuestions.length) * 100}%` }]} />
              </View>
              <ScrollView contentContainerStyle={styles.questionContent} showsVerticalScrollIndicator={false} style={styles.scroller}>
                <View style={styles.questionCard}>
                  <View style={styles.questionIcon}>
                    <Ionicons color={palette.primary} name="sparkles-outline" size={21} />
                  </View>
                  <GuidedText style={styles.context}>{t(questionKey(question, 'context'))}</GuidedText>
                  <GuidedText accessibilityRole="header" style={styles.prompt}>{t(questionKey(question, 'prompt'))}</GuidedText>
                </View>
                <View accessibilityRole="radiogroup" style={styles.choices}>
                  {question.choiceIds.map((choiceId) => {
                    const selected = selectedChoiceId === choiceId;
                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        key={choiceId}
                        onPress={() => setSelectedChoiceId(choiceId)}
                        style={({ pressed }) => [
                          styles.choice,
                          selected && styles.choiceSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <GuidedText style={[styles.choiceText, selected && styles.choiceTextSelected]}>{t(choiceKey(question, choiceId))}</GuidedText>
                        <Ionicons color={selected ? palette.primary : palette.border} name={selected ? 'radio-button-on' : 'radio-button-off'} size={21} />
                      </Pressable>
                    );
                  })}
                </View>
                <GuidedText style={styles.calibrationNote}>{t('guided.calibration.noFeedback')}</GuidedText>
              </ScrollView>
            </>
          )}

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              disabled={!result && !selectedChoiceId}
              onPress={() => result ? onComplete(answers) : advance()}
              style={({ pressed }) => [styles.primaryButton, !result && !selectedChoiceId && styles.disabled, pressed && styles.pressed]}
            >
              <GuidedText style={styles.primaryButtonText}>{result
                ? t('guided.result.usePlan')
                : questionIndex === calibrationQuestions.length - 1
                  ? t('guided.calibration.seeResult')
                  : t('guided.calibration.next')}</GuidedText>
              <Ionicons color={palette.primaryText} name={result ? 'checkmark' : 'arrow-forward'} size={18} />
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
    header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, backgroundColor: palette.surface },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.soft },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.75, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 16, lineHeight: 20, fontWeight: '800', textAlign: 'center', marginTop: 3 },
    scroller: { flex: 1, minHeight: 0 },
    progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 18, paddingTop: 14 },
    progressText: { color: palette.muted, fontSize: 10, fontWeight: '700' },
    skillLabel: { color: palette.primary, fontSize: 10, fontWeight: '800' },
    progressTrack: { height: 4, marginHorizontal: 18, marginTop: 8, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.soft },
    progressFill: { height: '100%', borderRadius: 3, backgroundColor: palette.aqua },
    questionContent: { width: '100%', maxWidth: 680, alignSelf: 'center', flexGrow: 1, gap: 13, padding: 18, paddingBottom: 28 },
    questionCard: { gap: 9, padding: 17, borderRadius: 19, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised },
    questionIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.accentSoft },
    context: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    prompt: { color: palette.text, fontSize: 19, lineHeight: 26, fontWeight: '800', letterSpacing: -0.25 },
    choices: { gap: 9 },
    choice: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    choiceSelected: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    choiceText: { flex: 1, minWidth: 0, color: palette.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
    choiceTextSelected: { color: palette.primary },
    calibrationNote: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 12 },
    footer: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface },
    primaryButton: { width: '100%', maxWidth: 650, minHeight: 50, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '800' },
    disabled: { opacity: 0.38 },
    resultContent: { width: '100%', maxWidth: 680, alignSelf: 'center', flexGrow: 1, alignItems: 'center', gap: 10, padding: 20, paddingBottom: 28 },
    resultIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: palette.aquaSoft, marginTop: 4 },
    resultEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    resultScore: { color: palette.text, fontSize: 48, lineHeight: 55, fontWeight: '800', letterSpacing: -1.8 },
    resultTitle: { color: palette.text, fontSize: 19, lineHeight: 24, fontWeight: '800', textAlign: 'center' },
    resultDescription: { maxWidth: 430, color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
    changeGroup: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7 },
    changePill: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11, backgroundColor: palette.aquaSoft },
    changeText: { color: palette.aquaText, fontSize: 11, fontWeight: '800' },
    changeTextDown: { color: palette.danger },
    scoreCard: { width: '100%', gap: 5, padding: 11, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    scoreRow: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 9, borderRadius: 12 },
    scoreRowGoal: { backgroundColor: palette.accentSoft },
    scoreCopy: { flex: 1, minWidth: 0, gap: 6 },
    scoreHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    scoreLabel: { color: palette.text, fontSize: 11, fontWeight: '700' },
    scoreLabelGoal: { color: palette.primary, fontWeight: '800' },
    goalBadge: { color: palette.primary, fontSize: 7, fontWeight: '800', letterSpacing: 0.45, textTransform: 'uppercase' },
    scoreTrack: { height: 4, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.soft },
    scoreFill: { height: '100%', borderRadius: 3, backgroundColor: palette.aqua },
    scoreValue: { minWidth: 35, color: palette.aquaText, fontSize: 12, fontWeight: '800', textAlign: 'right' },
    resultNote: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.accentSoft },
    resultNoteText: { flex: 1, color: palette.text, fontSize: 10, lineHeight: 15 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
