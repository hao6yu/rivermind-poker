import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlayingCard } from '../../components/PlayingCard';
import { percentageScore } from '../../domain/learning/progress';
import type { TrainerAttemptReview, TrainerDefinition } from '../../domain/learning/types';
import { randomizeTrainerSession } from '../../domain/learning/randomizeTrainer';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from './ModalSafeArea';
import { JourneyBanner } from './JourneyBanner';
import { secureRandom } from '../../services/secureRandom';

interface TrainerModalProps {
  bestScore: number | null;
  onClose: () => void;
  onComplete: (trainer: TrainerDefinition, score: number, review: TrainerAttemptReview) => void;
  reviewMode?: boolean;
  trainer: TrainerDefinition | null;
  journeyEyebrow?: string;
  journeyProgress?: string;
  journeyEndEarly?: () => void;
}

export function TrainerModal({ bestScore, onClose, onComplete, reviewMode = false, trainer, journeyEyebrow, journeyProgress, journeyEndEarly }: TrainerModalProps) {
  const { palette } = useAppTheme();
  const { language, t, trainerContent } = useLocalization();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [resultScore, setResultScore] = useState<number | null>(null);
  const [sessionTrainer, setSessionTrainer] = useState<TrainerDefinition | null>(null);
  const [questionResults, setQuestionResults] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSessionTrainer(trainer ? randomizeTrainerSession(trainerContent(trainer), secureRandom) : null);
    setQuestionIndex(0);
    setSelectedChoiceId(null);
    setCorrectCount(0);
    setResultScore(null);
    setQuestionResults({});
  }, [language, trainer?.id, trainerContent]);

  if (!trainer || !sessionTrainer) {
    return <Modal onRequestClose={onClose} visible={false} />;
  }

  const question = sessionTrainer.questions[questionIndex]!;
  const masteryThreshold = sessionTrainer.masteryThreshold ?? null;
  const selectedIsCorrect = selectedChoiceId === question.correctChoiceId;
  const reset = () => {
    setSessionTrainer(randomizeTrainerSession(trainerContent(trainer), secureRandom));
    setQuestionIndex(0);
    setSelectedChoiceId(null);
    setCorrectCount(0);
    setResultScore(null);
    setQuestionResults({});
  };
  const advance = () => {
    if (!selectedChoiceId) return;
    const nextCorrectCount = correctCount + (selectedIsCorrect ? 1 : 0);
    const nextQuestionResults = { ...questionResults, [question.id]: selectedIsCorrect };
    if (questionIndex === sessionTrainer.questions.length - 1) {
      const score = percentageScore(nextCorrectCount, sessionTrainer.questions.length);
      setCorrectCount(nextCorrectCount);
      setResultScore(score);
      setQuestionResults(nextQuestionResults);
      onComplete(sessionTrainer, score, {
        correctQuestionIds: Object.entries(nextQuestionResults).filter(([, correct]) => correct).map(([id]) => id),
        missedQuestionIds: Object.entries(nextQuestionResults).filter(([, correct]) => !correct).map(([id]) => id),
      });
      return;
    }
    setCorrectCount(nextCorrectCount);
    setQuestionResults(nextQuestionResults);
    setQuestionIndex((current) => current + 1);
    setSelectedChoiceId(null);
  };

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} presentationStyle="fullScreen" visible>
      <ModalSafeArea>
        {journeyEyebrow && journeyProgress ? <JourneyBanner eyebrow={journeyEyebrow} progress={journeyProgress} onEndEarly={journeyEndEarly ?? (() => undefined)} /> : null}
        <View style={styles.screen}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint={t('learn.backHint')}
              accessibilityLabel={t('learn.backToLearn')}
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons color={palette.text} name="arrow-back" size={21} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{reviewMode ? t('trainer.spacedReview') : masteryThreshold !== null ? t('trainer.masteryCheck') : sessionTrainer.type === 'percentage_drill' ? t('trainer.tableMath') : t('trainer.decisionPractice')}</Text>
              <Text numberOfLines={2} style={styles.title}>{sessionTrainer.title}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          {resultScore === null ? (
            <>
              <View style={styles.progressHeader}>
                <Text style={styles.progressText}>{t('trainer.questionProgress', { current: questionIndex + 1, total: sessionTrainer.questions.length })}</Text>
                <Text style={styles.progressText}>{t('trainer.correctCount', { count: correctCount })}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${((questionIndex + 1) / sessionTrainer.questions.length) * 100}%` }]} />
              </View>
              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.questionCard}>
                  {question.heroCards?.length ? (
                    <View style={styles.cardExample}>
                      <View style={styles.cardGroup}>
                        <Text style={styles.cardGroupLabel}>{t('trainer.yourCards')}</Text>
                        <View style={styles.cardRow}>
                          {question.heroCards.map((questionCard, index) => <PlayingCard card={questionCard} key={`hero-${index}`} mini />)}
                        </View>
                      </View>
                      {question.board?.length ? (
                        <View style={styles.cardGroup}>
                          <Text style={styles.cardGroupLabel}>{t('learn.board')}</Text>
                          <View style={styles.cardRow}>
                            {question.board.map((questionCard, index) => <PlayingCard card={questionCard} key={`board-${index}`} mini />)}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <Text style={styles.question}>{question.prompt}</Text>
                  <Text style={styles.context}>{question.context}</Text>
                </View>
                <View style={styles.choices}>
                  {question.choices.map((choice) => {
                    const selected = selectedChoiceId === choice.id;
                    const revealCorrect = Boolean(selectedChoiceId) && choice.id === question.correctChoiceId;
                    const revealIncorrect = selected && !selectedIsCorrect;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        disabled={Boolean(selectedChoiceId)}
                        key={choice.id}
                        onPress={() => setSelectedChoiceId(choice.id)}
                        style={({ pressed }) => [
                          styles.choice,
                          revealCorrect && styles.choiceCorrect,
                          revealIncorrect && styles.choiceIncorrect,
                          pressed && !selectedChoiceId && styles.pressed,
                        ]}
                      >
                        <View style={styles.choiceCopy}>
                          <View style={styles.choiceHeader}>
                            <Text style={[styles.choiceLabel, revealCorrect && styles.choiceLabelCorrect, revealIncorrect && styles.choiceLabelIncorrect]}>{choice.label}</Text>
                            {revealCorrect && <Ionicons color={palette.aqua} name="checkmark-circle" size={21} />}
                            {revealIncorrect && <Ionicons color={palette.danger} name="close-circle" size={21} />}
                          </View>
                          {selectedChoiceId ? (
                            <View style={styles.choiceReview}>
                              <Text style={[styles.choiceVerdict, revealCorrect ? styles.choiceVerdictCorrect : styles.choiceVerdictAlternative]}>
                                {revealCorrect ? t('trainer.bestAnswer') : selected ? t('trainer.yourChoice') : t('trainer.whyNot')}
                              </Text>
                              <Text style={styles.choiceFeedback}>{choice.feedback}</Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {selectedChoiceId && (
                  <View style={[styles.feedback, selectedIsCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect]}>
                    <Text style={[styles.feedbackTitle, !selectedIsCorrect && styles.feedbackTitleIncorrect]}>{t('trainer.coreReasoning')}</Text>
                    <Text style={styles.feedbackText}>{question.explanation}</Text>
                  </View>
                )}
              </ScrollView>
              <View style={styles.footer}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!selectedChoiceId}
                  onPress={advance}
                  style={({ pressed }) => [styles.primaryButton, !selectedChoiceId && styles.disabled, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryButtonText}>{questionIndex === sessionTrainer.questions.length - 1 ? t('trainer.seeResult') : t('trainer.nextQuestion')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.resultScreen}>
              <View style={styles.resultIcon}>
                <Ionicons color={palette.aqua} name={resultScore >= (masteryThreshold ?? 80) ? 'sparkles' : 'trending-up'} size={30} />
              </View>
              <Text style={styles.resultEyebrow}>{t('trainer.sessionComplete')}</Text>
              <Text style={styles.resultScore}>{resultScore}%</Text>
              <Text style={styles.resultTitle}>{reviewMode
                ? t('trainer.reviewComplete')
                : masteryThreshold !== null
                ? t(resultScore >= masteryThreshold ? 'trainer.masteryPassed' : 'trainer.masteryReview')
                : resultScore >= 80 ? t('trainer.strongFoundation') : resultScore >= 60 ? t('trainer.goodProgress') : t('trainer.keepBuilding')}</Text>
              <Text style={styles.resultBody}>
                {masteryThreshold !== null
                  ? t('trainer.masteryResultBody', { correct: correctCount, threshold: masteryThreshold, total: sessionTrainer.questions.length })
                  : t('trainer.resultBody', { correct: correctCount, total: sessionTrainer.questions.length })}
              </Text>
              <View style={styles.bestScoreCard}>
                <Text style={styles.bestScoreLabel}>{t(reviewMode ? 'trainer.reviewSchedule' : 'trainer.bestScore')}</Text>
                <Text style={styles.bestScoreValue}>{reviewMode ? t('trainer.reviewScheduled') : `${Math.max(bestScore ?? 0, resultScore)}%`}</Text>
              </View>
              <View style={styles.resultActions}>
                <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                  <Text style={styles.primaryButtonText}>{t('common.done')}</Text>
                </Pressable>
                {!reviewMode ? (
                  <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                    <Text style={styles.secondaryButtonText}>{t('trainer.tryAgain')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1 },
    header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, backgroundColor: palette.surface },
    iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 16, lineHeight: 20, fontWeight: '700', textAlign: 'center', marginTop: 3 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 14 },
    progressText: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    progressTrack: { height: 4, marginHorizontal: 18, marginTop: 8, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.soft },
    progressFill: { height: '100%', borderRadius: 3, backgroundColor: palette.aqua },
    content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18, gap: 14, paddingBottom: 30 },
    questionCard: { minHeight: 146, justifyContent: 'center', gap: 11, padding: 18, borderRadius: 20, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    cardExample: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, paddingBottom: 3 },
    cardGroup: { gap: 5 },
    cardGroupLabel: { color: palette.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    cardRow: { flexDirection: 'row', gap: 4 },
    question: { color: palette.text, fontSize: 19, lineHeight: 27, fontWeight: '700', letterSpacing: -0.25 },
    context: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    choices: { gap: 9 },
    choice: { minHeight: 55, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    choiceCopy: { flex: 1, gap: 9 },
    choiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    choiceCorrect: { borderColor: palette.aqua, backgroundColor: palette.aquaSoft },
    choiceIncorrect: { borderColor: palette.danger, backgroundColor: palette.surface },
    choiceLabel: { flex: 1, minWidth: 0, color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    choiceLabelCorrect: { color: palette.aquaText },
    choiceLabelIncorrect: { color: palette.danger },
    choiceReview: { gap: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    choiceVerdict: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    choiceVerdictCorrect: { color: palette.aquaText },
    choiceVerdictAlternative: { color: palette.muted },
    choiceFeedback: { color: palette.muted, fontSize: 11, lineHeight: 17 },
    feedback: { gap: 6, padding: 15, borderRadius: 16, borderLeftWidth: 3 },
    feedbackCorrect: { backgroundColor: palette.aquaSoft, borderLeftColor: palette.aqua },
    feedbackIncorrect: { backgroundColor: palette.surface, borderLeftColor: palette.danger },
    feedbackTitle: { color: palette.aquaText, fontSize: 12, fontWeight: '800' },
    feedbackTitleIncorrect: { color: palette.danger },
    feedbackText: { color: palette.text, fontSize: 12, lineHeight: 18 },
    footer: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface },
    primaryButton: { width: '100%', maxWidth: 720, alignSelf: 'center', minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { flexShrink: 1, color: palette.primaryText, fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
    secondaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.soft },
    secondaryButtonText: { flexShrink: 1, color: palette.text, fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
    disabled: { opacity: 0.38 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
    resultScreen: { width: '100%', maxWidth: 720, alignSelf: 'center', flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 24 },
    resultIcon: { width: 68, height: 68, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.aquaSoft, marginBottom: 7 },
    resultEyebrow: { color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase' },
    resultScore: { color: palette.text, fontSize: 52, fontWeight: '800', letterSpacing: -2 },
    resultTitle: { color: palette.text, fontSize: 19, fontWeight: '700', textAlign: 'center' },
    resultBody: { maxWidth: 340, color: palette.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
    bestScoreCard: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, marginTop: 12 },
    bestScoreLabel: { color: palette.muted, fontSize: 12, fontWeight: '600' },
    bestScoreValue: { color: palette.aqua, fontSize: 18, fontWeight: '800' },
    resultActions: { width: '100%', gap: 9, marginTop: 8 },
  });
}
