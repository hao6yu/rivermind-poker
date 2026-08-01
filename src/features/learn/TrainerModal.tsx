import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlayingCard } from '../../components/PlayingCard';
import { percentageScore } from '../../domain/learning/progress';
import type { TrainerDefinition } from '../../domain/learning/types';
import { randomizeTrainerSession } from '../../domain/learning/randomizeTrainer';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from './ModalSafeArea';
import { secureRandom } from '../../services/secureRandom';

interface TrainerModalProps {
  bestScore: number | null;
  onClose: () => void;
  onComplete: (trainer: TrainerDefinition, score: number) => void;
  trainer: TrainerDefinition | null;
}

export function TrainerModal({ bestScore, onClose, onComplete, trainer }: TrainerModalProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [resultScore, setResultScore] = useState<number | null>(null);
  const [sessionTrainer, setSessionTrainer] = useState<TrainerDefinition | null>(null);

  useEffect(() => {
    setSessionTrainer(trainer ? randomizeTrainerSession(trainer, secureRandom) : null);
    setQuestionIndex(0);
    setSelectedChoiceId(null);
    setCorrectCount(0);
    setResultScore(null);
  }, [trainer?.id]);

  if (!trainer || !sessionTrainer) {
    return <Modal onRequestClose={onClose} visible={false} />;
  }

  const question = sessionTrainer.questions[questionIndex]!;
  const selectedIsCorrect = selectedChoiceId === question.correctChoiceId;
  const reset = () => {
    setSessionTrainer(randomizeTrainerSession(trainer, secureRandom));
    setQuestionIndex(0);
    setSelectedChoiceId(null);
    setCorrectCount(0);
    setResultScore(null);
  };
  const advance = () => {
    if (!selectedChoiceId) return;
    const nextCorrectCount = correctCount + (selectedIsCorrect ? 1 : 0);
    if (questionIndex === sessionTrainer.questions.length - 1) {
      const score = percentageScore(nextCorrectCount, sessionTrainer.questions.length);
      setCorrectCount(nextCorrectCount);
      setResultScore(score);
      onComplete(sessionTrainer, score);
      return;
    }
    setCorrectCount(nextCorrectCount);
    setQuestionIndex((current) => current + 1);
    setSelectedChoiceId(null);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible>
      <ModalSafeArea>
        <View style={styles.screen}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint="Returns to the Learn screen"
              accessibilityLabel="Back to Learn"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons color={palette.text} name="arrow-back" size={21} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{sessionTrainer.type === 'percentage_drill' ? 'Table math' : 'Decision practice'}</Text>
              <Text style={styles.title}>{sessionTrainer.title}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          {resultScore === null ? (
            <>
              <View style={styles.progressHeader}>
                <Text style={styles.progressText}>Question {questionIndex + 1} of {sessionTrainer.questions.length} · Fresh deal</Text>
                <Text style={styles.progressText}>{correctCount} correct</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${((questionIndex + 1) / sessionTrainer.questions.length) * 100}%` }]} />
              </View>
              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.questionCard}>
                  {question.heroCards?.length ? (
                    <View style={styles.cardExample}>
                      <View style={styles.cardGroup}>
                        <Text style={styles.cardGroupLabel}>Your cards</Text>
                        <View style={styles.cardRow}>
                          {question.heroCards.map((questionCard, index) => <PlayingCard card={questionCard} key={`hero-${index}`} mini />)}
                        </View>
                      </View>
                      {question.board?.length ? (
                        <View style={styles.cardGroup}>
                          <Text style={styles.cardGroupLabel}>Board</Text>
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
                                {revealCorrect ? 'Best answer' : selected ? 'Your choice' : 'Why not'}
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
                    <Text style={[styles.feedbackTitle, !selectedIsCorrect && styles.feedbackTitleIncorrect]}>Core reasoning</Text>
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
                  <Text style={styles.primaryButtonText}>{questionIndex === sessionTrainer.questions.length - 1 ? 'See result' : 'Next question'}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.resultScreen}>
              <View style={styles.resultIcon}>
                <Ionicons color={palette.aqua} name={resultScore >= 80 ? 'sparkles' : 'trending-up'} size={30} />
              </View>
              <Text style={styles.resultEyebrow}>Session complete</Text>
              <Text style={styles.resultScore}>{resultScore}%</Text>
              <Text style={styles.resultTitle}>{resultScore >= 80 ? 'Strong foundation' : resultScore >= 60 ? 'Good progress' : 'Keep building the pattern'}</Text>
              <Text style={styles.resultBody}>
                You answered {correctCount} of {sessionTrainer.questions.length} correctly. Every answer included the reasoning, so the score is a starting point—not the goal.
              </Text>
              <View style={styles.bestScoreCard}>
                <Text style={styles.bestScoreLabel}>Best score</Text>
                <Text style={styles.bestScoreValue}>{Math.max(bestScore ?? 0, resultScore)}%</Text>
              </View>
              <View style={styles.resultActions}>
                <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                  <Text style={styles.primaryButtonText}>Done</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.secondaryButtonText}>Try again</Text>
                </Pressable>
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
    headerCopy: { flex: 1, alignItems: 'center' },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 3 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 14 },
    progressText: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    progressTrack: { height: 4, marginHorizontal: 18, marginTop: 8, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.soft },
    progressFill: { height: '100%', borderRadius: 3, backgroundColor: palette.aqua },
    content: { padding: 18, gap: 14, paddingBottom: 30 },
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
    choiceLabel: { color: palette.text, fontSize: 14, fontWeight: '600' },
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
    primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
    secondaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.soft },
    secondaryButtonText: { color: palette.text, fontSize: 14, fontWeight: '700' },
    disabled: { opacity: 0.38 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
    resultScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 24 },
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
