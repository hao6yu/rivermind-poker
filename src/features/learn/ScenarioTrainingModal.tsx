import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlayingCard } from '../../components/PlayingCard';
import { percentageScore } from '../../domain/learning/progress';
import { scenarioChoicePoints, scenarioTrainer } from '../../domain/learning/scenarios';
import type { ScenarioChoice, ScenarioTrainerDefinition } from '../../domain/learning/types';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from './ModalSafeArea';

interface ScenarioTrainingModalProps {
  bestScore: number | null;
  onClose: () => void;
  onComplete: (trainer: ScenarioTrainerDefinition, score: number) => void;
  visible: boolean;
}

export function ScenarioTrainingModal({ bestScore, onClose, onComplete, visible }: ScenarioTrainingModalProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [preferredCount, setPreferredCount] = useState(0);
  const [resultScore, setResultScore] = useState<number | null>(null);

  const reset = () => {
    setScenarioIndex(0);
    setSelectedChoiceId(null);
    setEarnedPoints(0);
    setPreferredCount(0);
    setResultScore(null);
  };

  useEffect(() => {
    if (visible) reset();
  }, [visible]);

  const scenario = scenarioTrainer.scenarios[scenarioIndex]!;
  const selectedChoice = scenario.choices.find((choice) => choice.id === selectedChoiceId) ?? null;
  const advance = () => {
    if (!selectedChoice) return;
    const nextPoints = earnedPoints + scenarioChoicePoints(selectedChoice);
    const nextPreferredCount = preferredCount + (selectedChoice.grade === 'best' ? 1 : 0);
    if (scenarioIndex === scenarioTrainer.scenarios.length - 1) {
      const score = percentageScore(nextPoints, scenarioTrainer.scenarios.length);
      setEarnedPoints(nextPoints);
      setPreferredCount(nextPreferredCount);
      setResultScore(score);
      onComplete(scenarioTrainer, score);
      return;
    }
    setEarnedPoints(nextPoints);
    setPreferredCount(nextPreferredCount);
    setScenarioIndex((current) => current + 1);
    setSelectedChoiceId(null);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <ModalSafeArea>
        <View style={styles.screen}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint="Returns to the previous screen"
              accessibilityLabel="Close scenario training"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons color={palette.text} name="arrow-back" size={21} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Guided decisions</Text>
              <Text style={styles.title}>Scenario training</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          {resultScore === null ? (
            <>
              <View style={styles.progressHeader}>
                <Text style={styles.progressText}>Spot {scenarioIndex + 1} of {scenarioTrainer.scenarios.length}</Text>
                <Text style={styles.focusText}>{scenario.focus}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${((scenarioIndex + 1) / scenarioTrainer.scenarios.length) * 100}%` }]} />
              </View>

              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.tableCard}>
                  <View style={styles.tableMeta}>
                    <MetaPill label={scenario.street.toUpperCase()} />
                    <MetaPill label={`${scenario.effectiveStackBb} BB effective`} />
                  </View>
                  <View style={styles.opponentRow}>
                    <View>
                      <Text style={styles.tableLabel}>Opponent</Text>
                      <Text style={styles.positionText}>{scenario.opponentPosition}</Text>
                    </View>
                    <View style={styles.cardsRow}>
                      <PlayingCard compact hidden />
                      <PlayingCard compact hidden />
                    </View>
                  </View>
                  <View style={styles.boardArea}>
                    <View style={styles.potPill}>
                      <Text style={styles.potLabel}>POT</Text>
                      <Text style={styles.potValue}>{scenario.potBb} BB</Text>
                    </View>
                    <View style={styles.boardRow}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <PlayingCard card={scenario.board[index]} compact key={`board-${index}`} />
                      ))}
                    </View>
                  </View>
                  <View style={styles.heroRow}>
                    <View style={styles.cardsRow}>
                      {scenario.heroCards.map((heroCard, index) => <PlayingCard card={heroCard} compact key={`hero-${index}`} />)}
                    </View>
                    <View style={styles.heroCopy}>
                      <Text style={styles.heroLabel}>You</Text>
                      <Text style={styles.positionText}>{scenario.position}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.decisionCard}>
                  <Text style={styles.actionLabel}>Action before you</Text>
                  <Text style={styles.opponentAction}>{scenario.opponentAction}</Text>
                  <Text style={styles.prompt}>{scenario.prompt}</Text>
                </View>

                <View style={styles.choices}>
                  {scenario.choices.map((choice) => (
                    <ScenarioChoiceButton
                      choice={choice}
                      disabled={Boolean(selectedChoice)}
                      key={choice.id}
                      onPress={() => setSelectedChoiceId(choice.id)}
                      reveal={Boolean(selectedChoice)}
                      selected={selectedChoiceId === choice.id}
                    />
                  ))}
                </View>

                {selectedChoice && (
                  <View style={[
                    styles.feedback,
                    selectedChoice.grade === 'best'
                      ? styles.feedbackBest
                      : selectedChoice.grade === 'reasonable'
                        ? styles.feedbackReasonable
                        : styles.feedbackMistake,
                  ]}>
                    <View style={styles.feedbackHeading}>
                      <Ionicons
                        color={selectedChoice.grade === 'best' ? palette.aqua : selectedChoice.grade === 'reasonable' ? palette.primary : palette.danger}
                        name={selectedChoice.grade === 'best' ? 'checkmark-circle' : selectedChoice.grade === 'reasonable' ? 'git-compare-outline' : 'close-circle'}
                        size={20}
                      />
                      <Text style={[
                        styles.feedbackTitle,
                        selectedChoice.grade === 'reasonable' && styles.feedbackTitleReasonable,
                        selectedChoice.grade === 'mistake' && styles.feedbackTitleMistake,
                      ]}>
                        {selectedChoice.grade === 'best' ? 'Best baseline' : selectedChoice.grade === 'reasonable' ? 'Reasonable mix' : 'Better line available'}
                      </Text>
                    </View>
                    <Text style={styles.feedbackText}>{selectedChoice.feedback}</Text>
                    <View style={styles.reasoningDivider} />
                    <Text style={styles.reasoningLabel}>Why</Text>
                    <Text style={styles.feedbackText}>{scenario.reasoning}</Text>
                    <View style={styles.takeaway}>
                      <Ionicons color={palette.aqua} name="bulb-outline" size={17} />
                      <Text style={styles.takeawayText}>{scenario.takeaway}</Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              <View style={styles.footer}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!selectedChoice}
                  onPress={advance}
                  style={({ pressed }) => [styles.primaryButton, !selectedChoice && styles.disabled, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryButtonText}>{scenarioIndex === scenarioTrainer.scenarios.length - 1 ? 'See session result' : 'Next scenario'}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.resultScreen}>
              <View style={styles.resultIcon}>
                <Ionicons color={palette.aqua} name={resultScore >= 80 ? 'sparkles' : 'analytics-outline'} size={30} />
              </View>
              <Text style={styles.resultEyebrow}>Session complete</Text>
              <Text style={styles.resultScore}>{resultScore}%</Text>
              <Text style={styles.resultTitle}>{resultScore >= 80 ? 'Strong decision process' : resultScore >= 60 ? 'Useful patterns are forming' : 'Review the reasons, then replay'}</Text>
              <Text style={styles.resultBody}>
                You chose the preferred baseline in {preferredCount} of {scenarioTrainer.scenarios.length} spots. Reasonable mixed actions received partial credit; the result never depends on which card came next.
              </Text>
              <View style={styles.bestScoreCard}>
                <Text style={styles.bestScoreLabel}>Best scenario score</Text>
                <Text style={styles.bestScoreValue}>{Math.max(bestScore ?? 0, resultScore)}%</Text>
              </View>
              <View style={styles.resultActions}>
                <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                  <Text style={styles.primaryButtonText}>Done</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.secondaryButtonText}>Practice again</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

function MetaPill({ label }: { label: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <Text style={styles.metaPill}>{label}</Text>;
}

function ScenarioChoiceButton({
  choice,
  disabled,
  onPress,
  reveal,
  selected,
}: {
  choice: ScenarioChoice;
  disabled: boolean;
  onPress: () => void;
  reveal: boolean;
  selected: boolean;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const revealBest = reveal && choice.grade === 'best';
  const revealSelectedReasonable = reveal && selected && choice.grade === 'reasonable';
  const revealSelectedMistake = reveal && selected && choice.grade === 'mistake';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        revealBest && styles.choiceBest,
        revealSelectedReasonable && styles.choiceReasonable,
        revealSelectedMistake && styles.choiceMistake,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[
        styles.choiceLabel,
        revealBest && styles.choiceLabelBest,
        revealSelectedReasonable && styles.choiceLabelReasonable,
        revealSelectedMistake && styles.choiceLabelMistake,
      ]}>{choice.label}</Text>
      {revealBest && <Ionicons color={palette.aqua} name="checkmark-circle" size={21} />}
      {revealSelectedReasonable && <Ionicons color={palette.primary} name="git-compare-outline" size={20} />}
      {revealSelectedMistake && <Ionicons color={palette.danger} name="close-circle" size={21} />}
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, backgroundColor: palette.surface },
    iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    headerCopy: { flex: 1, alignItems: 'center' },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 3 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 13 },
    progressText: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    focusText: { color: palette.primary, fontSize: 10, fontWeight: '700' },
    progressTrack: { height: 4, marginHorizontal: 18, marginTop: 8, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.soft },
    progressFill: { height: '100%', borderRadius: 3, backgroundColor: palette.aqua },
    content: { padding: 18, gap: 13, paddingBottom: 30 },
    tableCard: { minHeight: 300, justifyContent: 'space-between', padding: 15, borderRadius: 22, backgroundColor: palette.table, borderWidth: 1, borderColor: palette.tableLine, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 4 },
    tableMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    metaPill: { color: palette.tableText, fontSize: 9, fontWeight: '700', letterSpacing: 0.4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: palette.tableDeep, overflow: 'hidden' },
    opponentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    heroCopy: { alignItems: 'flex-end' },
    tableLabel: { color: palette.tableText, fontSize: 12, fontWeight: '700' },
    heroLabel: { color: palette.tableText, fontSize: 13, fontWeight: '800' },
    positionText: { color: palette.tableText, opacity: 0.58, fontSize: 9, marginTop: 2 },
    cardsRow: { flexDirection: 'row', gap: 5 },
    boardArea: { alignItems: 'center', gap: 9 },
    boardRow: { flexDirection: 'row', gap: 4 },
    potPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: palette.tableDeep },
    potLabel: { color: palette.tableText, opacity: 0.55, fontSize: 8, fontWeight: '800' },
    potValue: { color: palette.tableText, fontSize: 10, fontWeight: '800' },
    decisionCard: { gap: 6, padding: 15, borderRadius: 17, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised },
    actionLabel: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    opponentAction: { color: palette.muted, fontSize: 11, lineHeight: 17 },
    prompt: { color: palette.text, fontSize: 17, lineHeight: 23, fontWeight: '700', marginTop: 3 },
    choices: { gap: 8 },
    choice: { minHeight: 53, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    choiceBest: { borderColor: palette.aqua, backgroundColor: palette.aquaSoft },
    choiceReasonable: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    choiceMistake: { borderColor: palette.danger },
    choiceLabel: { color: palette.text, fontSize: 13, fontWeight: '700' },
    choiceLabelBest: { color: palette.aquaText },
    choiceLabelReasonable: { color: palette.primary },
    choiceLabelMistake: { color: palette.danger },
    feedback: { gap: 7, padding: 15, borderRadius: 17, borderLeftWidth: 3 },
    feedbackBest: { backgroundColor: palette.aquaSoft, borderLeftColor: palette.aqua },
    feedbackReasonable: { backgroundColor: palette.accentSoft, borderLeftColor: palette.primary },
    feedbackMistake: { backgroundColor: palette.surface, borderLeftColor: palette.danger },
    feedbackHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    feedbackTitle: { color: palette.aquaText, fontSize: 12, fontWeight: '800' },
    feedbackTitleReasonable: { color: palette.primary },
    feedbackTitleMistake: { color: palette.danger },
    feedbackText: { color: palette.text, fontSize: 12, lineHeight: 18 },
    reasoningDivider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: 2 },
    reasoningLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    takeaway: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 13, backgroundColor: palette.surfaceRaised, marginTop: 3 },
    takeawayText: { flex: 1, color: palette.text, fontSize: 11, lineHeight: 16, fontWeight: '600' },
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
    resultBody: { maxWidth: 350, color: palette.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
    bestScoreCard: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, marginTop: 12 },
    bestScoreLabel: { color: palette.muted, fontSize: 12, fontWeight: '600' },
    bestScoreValue: { color: palette.aqua, fontSize: 18, fontWeight: '800' },
    resultActions: { width: '100%', gap: 9, marginTop: 8 },
  });
}
