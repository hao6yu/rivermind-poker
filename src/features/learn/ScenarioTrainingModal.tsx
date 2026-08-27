import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PlayingCard } from '../../components/PlayingCard';
import { SuitAwareText } from '../../components/SuitAwareText';
import { practicePackById, practicePackForFocus } from '../../domain/learning/practicePacks';
import { percentageScore } from '../../domain/learning/progress';
import {
  buildScenarioSessionRecap,
  focusedScenarioTrainer,
  generateFocusedScenarioSessionFromRandom,
  generateScenarioSessionForPackFromRandom,
  generateScenarioSessionFromRandom,
  scenarioChoicePoints,
  scenarioTrainer,
  scenarioTrainerForPack,
  selectFreshestScenarioSession,
  type ScenarioSessionDecision,
} from '../../domain/learning/scenarios';
import type { PracticePackId, ScenarioAttemptReview, ScenarioChoice, ScenarioSpot, ScenarioTrainerDefinition } from '../../domain/learning/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { type MessageKey, useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from './ModalSafeArea';
import { JourneyBanner } from './JourneyBanner';
import { secureRandom } from '../../services/secureRandom';

interface ScenarioTrainingModalProps {
  bestScore: number | null;
  onClose: () => void;
  onComplete: (trainer: ScenarioTrainerDefinition, score: number, review: ScenarioAttemptReview) => void;
  onReviewLesson?: (lessonId: string) => void;
  practiceFocus?: string | null;
  practicePackId?: PracticePackId | null;
  visible: boolean;
  journeyEyebrow?: string;
  journeyProgress?: string;
  journeyEndEarly?: () => void;
}

export function ScenarioTrainingModal({
  bestScore,
  onClose,
  onComplete,
  onReviewLesson,
  practiceFocus,
  practicePackId,
  visible,
  journeyEyebrow,
  journeyProgress,
  journeyEndEarly,
}: ScenarioTrainingModalProps) {
  const { palette } = useAppTheme();
  const { practicePackText, scenarioContent, t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const pack = practicePackId ? practicePackById(practicePackId) : practicePackForFocus(practiceFocus);
  const compactTable = height < 740;
  const scrollRef = useRef<ScrollView>(null);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [preferredCount, setPreferredCount] = useState(0);
  const [reviewFocuses, setReviewFocuses] = useState<string[]>([]);
  const [missedScenarios, setMissedScenarios] = useState<ScenarioSpot[]>([]);
  const [correctScenarioIds, setCorrectScenarioIds] = useState<string[]>([]);
  const [sessionDecisions, setSessionDecisions] = useState<ScenarioSessionDecision[]>([]);
  const [resultScore, setResultScore] = useState<number | null>(null);
  const generateScenarioCandidate = useCallback(() => practicePackId
    ? generateScenarioSessionForPackFromRandom(practicePackId, secureRandom)
    : practiceFocus
      ? generateFocusedScenarioSessionFromRandom(practiceFocus, secureRandom)
      : generateScenarioSessionFromRandom(secureRandom), [practiceFocus, practicePackId]);
  const [scenarios, setScenarios] = useState(generateScenarioCandidate);
  const previousScenariosRef = useRef<ScenarioSpot[]>(scenarios);
  const displayedScenarios = useMemo(
    () => scenarios.map((spot) => scenarioContent(spot)),
    [scenarioContent, scenarios],
  );
  const packTitle = pack ? practicePackText(pack, 'title') : null;
  const sessionRecap = useMemo(() => buildScenarioSessionRecap(sessionDecisions), [sessionDecisions]);
  const recapLessonId = sessionRecap.focus?.lessonId ?? null;

  const reset = useCallback(() => {
    const nextScenarios = selectFreshestScenarioSession(
      Array.from({ length: 4 }, generateScenarioCandidate),
      previousScenariosRef.current,
    );
    previousScenariosRef.current = nextScenarios;
    setScenarios(nextScenarios);
    setScenarioIndex(0);
    setSelectedChoiceId(null);
    setEarnedPoints(0);
    setPreferredCount(0);
    setReviewFocuses([]);
    setMissedScenarios([]);
    setCorrectScenarioIds([]);
    setSessionDecisions([]);
    setResultScore(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ animated: false, y: 0 }));
  }, [generateScenarioCandidate]);

  useEffect(() => {
    if (visible) reset();
  }, [reset, visible]);

  const scenario = displayedScenarios[scenarioIndex]!;
  const selectedChoice = scenario.choices.find((choice) => choice.id === selectedChoiceId) ?? null;
  const advance = () => {
    if (!selectedChoice) return;
    const nextPoints = earnedPoints + scenarioChoicePoints(selectedChoice);
    const nextPreferredCount = preferredCount + (selectedChoice.grade === 'best' ? 1 : 0);
    const nextReviewFocuses = selectedChoice.grade === 'best'
      ? reviewFocuses
      : [...new Set([...reviewFocuses, scenario.focus])];
    const sourceScenario = scenarios[scenarioIndex]!;
    const nextSessionDecisions = [
      ...sessionDecisions,
      { focus: scenario.focus, grade: selectedChoice.grade, lessonId: sourceScenario.lessonId },
    ];
    const nextMissedScenarios = selectedChoice.grade === 'best'
      ? missedScenarios
      : [...missedScenarios.filter((item) => item.id !== sourceScenario.id), sourceScenario];
    const nextCorrectScenarioIds = selectedChoice.grade === 'best'
      ? [...new Set([...correctScenarioIds, sourceScenario.id])]
      : correctScenarioIds.filter((id) => id !== sourceScenario.id);
    if (scenarioIndex === scenarios.length - 1) {
      const score = percentageScore(nextPoints, scenarios.length);
      setEarnedPoints(nextPoints);
      setPreferredCount(nextPreferredCount);
      setReviewFocuses(nextReviewFocuses);
      setMissedScenarios(nextMissedScenarios);
      setCorrectScenarioIds(nextCorrectScenarioIds);
      setSessionDecisions(nextSessionDecisions);
      setResultScore(score);
      onComplete(practicePackId
        ? scenarioTrainerForPack(practicePackId, scenarios)
        : practiceFocus
          ? focusedScenarioTrainer(practiceFocus, scenarios)
          : { ...scenarioTrainer, scenarios }, score, {
        correctScenarioIds: nextCorrectScenarioIds,
        missedScenarios: nextMissedScenarios,
      });
      return;
    }
    setEarnedPoints(nextPoints);
    setPreferredCount(nextPreferredCount);
    setReviewFocuses(nextReviewFocuses);
    setMissedScenarios(nextMissedScenarios);
    setCorrectScenarioIds(nextCorrectScenarioIds);
    setSessionDecisions(nextSessionDecisions);
    setScenarioIndex((current) => current + 1);
    setSelectedChoiceId(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ animated: false, y: 0 }));
  };

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <ModalSafeArea>
        {journeyEyebrow && journeyProgress ? <JourneyBanner eyebrow={journeyEyebrow} progress={journeyProgress} onEndEarly={journeyEndEarly ?? (() => undefined)} /> : null}
        <View style={styles.screen}>
          <View style={styles.header}>
            <Pressable
              accessibilityHint={t('scenario.closeHint')}
              accessibilityLabel={t('scenario.closeLabel')}
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons color={palette.text} name="arrow-back" size={21} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{pack ? t('scenario.focusedPractice') : t('scenario.guidedDecisions')}</Text>
              <Text numberOfLines={2} style={styles.title}>{packTitle ?? t('scenario.title')}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          {resultScore === null ? (
            <>
              <View style={styles.progressHeader}>
                <Text style={styles.progressText}>
                  {t('scenario.spotProgress', { current: scenarioIndex + 1, total: scenarios.length })} · {packTitle ? t('scenario.pack', { name: packTitle }) : t('scenario.freshDeal')}
                </Text>
                <Text style={styles.focusText}>{scenario.focus}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${((scenarioIndex + 1) / scenarios.length) * 100}%` }]} />
              </View>

              <ScrollView
                contentContainerStyle={styles.content}
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                style={styles.scroller}
              >
                <View style={[styles.tableCard, compactTable && styles.tableCardCompact]}>
                  <View style={styles.tableMeta}>
                    <MetaPill label={t(`poker.street.${scenario.street}` as MessageKey)} />
                    <MetaPill label={t('scenario.effective', { count: scenario.effectiveStackBb })} />
                    {scenario.difficulty === 'intermediate' ? <MetaPill label={t('common.intermediate')} /> : null}
                  </View>
                  <View style={styles.opponentRow}>
                    <View>
                      <Text style={styles.tableLabel}>{t('scenario.opponent')}</Text>
                      <Text style={styles.positionText}>{scenario.opponentPosition}</Text>
                    </View>
                    <View style={styles.cardsRow}>
                      <PlayingCard compact={!compactTable} hidden mini={compactTable} />
                      <PlayingCard compact={!compactTable} hidden mini={compactTable} />
                    </View>
                  </View>
                  <View style={styles.boardArea}>
                    <View style={styles.potPill}>
                      <Text style={styles.potLabel}>{t('scenario.pot')}</Text>
                      <Text style={styles.potValue}>{t('common.bigBlinds', { count: scenario.potBb })}</Text>
                    </View>
                    <View style={styles.boardRow}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <PlayingCard card={scenario.board[index]} compact={!compactTable} key={`board-${index}`} mini={compactTable} />
                      ))}
                    </View>
                  </View>
                  <View style={styles.heroRow}>
                    <View style={styles.cardsRow}>
                      {scenario.heroCards.map((heroCard, index) => <PlayingCard card={heroCard} compact={!compactTable} key={`hero-${index}`} mini={compactTable} />)}
                    </View>
                    <View style={styles.heroCopy}>
                      <Text style={styles.heroLabel}>{t('scenario.you')}</Text>
                      <Text style={styles.positionText}>{scenario.position}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.decisionCard}>
                  <Text style={styles.actionLabel}>{t('scenario.actionBefore')}</Text>
                  <Text style={styles.opponentAction}>{scenario.opponentAction}</Text>
                  <SuitAwareText style={styles.prompt} text={scenario.prompt} />
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
                        {selectedChoice.grade === 'best' ? t('scenario.bestBaseline') : selectedChoice.grade === 'reasonable' ? t('scenario.reasonableMix') : t('scenario.betterLine')}
                      </Text>
                    </View>
                    <Text style={styles.reasoningLabel}>{t('scenario.whyBaseline')}</Text>
                    <Text style={styles.feedbackText}>{scenario.reasoning}</Text>
                    {scenario.calculation ? (
                      <View style={styles.calculation}>
                        <View style={styles.calculationHeading}>
                          <Ionicons color={palette.primary} name="calculator-outline" size={16} />
                          <Text style={styles.calculationTitle}>{t('scenario.verifiedMath')}</Text>
                        </View>
                        <Text style={styles.calculationText}>
                          {scenario.calculation.kind === 'bluff'
                            ? t('scenario.bluffMath', {
                              required: scenario.calculation.requiredFoldPercent,
                              reward: scenario.calculation.rewardBb,
                              risk: scenario.calculation.riskBb,
                            })
                            : scenario.calculation.kind === 'implied-odds'
                              ? t('scenario.impliedMath', {
                                call: scenario.calculation.callAmountBb,
                                equity: scenario.calculation.estimatedCleanEquityPercent,
                                future: scenario.calculation.minimumFutureWinBb,
                                required: scenario.calculation.directRequiredEquityPercent,
                              })
                              : <>
                                {t('scenario.math', { call: scenario.calculation.callAmountBb, pot: scenario.calculation.finalPotBb, required: scenario.calculation.requiredEquityPercent })}
                                {scenario.calculation.estimatedEquityPercent === undefined ? '' : ` · ${t('scenario.estimatedEquity', { equity: scenario.calculation.estimatedEquityPercent })}`}
                              </>}
                        </Text>
                      </View>
                    ) : null}
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
                  <Text style={styles.primaryButtonText}>{scenarioIndex === scenarios.length - 1 ? t('scenario.seeResult') : t('scenario.nextSpot')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <ScrollView contentContainerStyle={styles.resultScreen} showsVerticalScrollIndicator={false}>
              <View style={styles.resultIcon}>
                <Ionicons color={palette.aqua} name={resultScore >= 80 ? 'sparkles' : 'analytics-outline'} size={30} />
              </View>
              <Text style={styles.resultEyebrow}>{pack ? t('scenario.focusedComplete') : t('scenario.sessionComplete')}</Text>
              <Text style={styles.resultScore}>{resultScore}%</Text>
              <Text style={styles.resultTitle}>{resultScore >= 80 ? t('scenario.strongProcess') : resultScore >= 60 ? t('scenario.patternsForming') : t('scenario.reviewReplay')}</Text>
              <Text style={styles.resultBody}>
                {t('scenario.resultBody', { preferred: preferredCount, total: scenarios.length })}
              </Text>
              {sessionRecap.focus ? (
                <View style={styles.reviewCard}>
                  <View style={styles.reviewHeading}>
                    <Ionicons color={palette.primary} name="sparkles-outline" size={17} />
                    <Text style={styles.reviewTitle}>{t('scenario.sessionRecap')}</Text>
                  </View>
                  {sessionRecap.strengths.length > 0 ? (
                    <View style={styles.recapGroup}>
                      <Text style={styles.recapLabel}>{t('scenario.strengths')}</Text>
                      <View style={styles.strengthList}>
                        {sessionRecap.strengths.map((strength) => (
                          <View key={strength} style={styles.strengthChip}>
                            <Ionicons color={palette.aqua} name="checkmark-circle" size={14} />
                            <Text style={styles.strengthText}>{strength}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.recapGroup}>
                    <Text style={styles.recapLabel}>{t('scenario.nextFocus')}</Text>
                    <Text style={styles.reviewText}>{sessionRecap.focus.label}</Text>
                  </View>
                  {reviewFocuses.length > 0 ? (
                    <View style={styles.savedReviewRow}>
                      <Ionicons color={palette.muted} name="time-outline" size={14} />
                      <Text style={styles.savedReviewText}>{t('scenario.savedForReview')}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.bestScoreCard}>
                <Text style={styles.bestScoreLabel}>{packTitle ? t('scenario.packBestScore', { name: packTitle }) : t('scenario.bestScore')}</Text>
                <Text style={styles.bestScoreValue}>{Math.max(bestScore ?? 0, resultScore)}%</Text>
              </View>
              <View style={styles.resultActions}>
                {recapLessonId && onReviewLesson ? (
                  <Pressable accessibilityRole="button" onPress={() => onReviewLesson(recapLessonId)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                    <Text style={styles.primaryButtonText}>{t('scenario.reviewFocusLesson')}</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [recapLessonId && onReviewLesson ? styles.secondaryButton : styles.primaryButton, pressed && styles.pressed]}>
                  <Text style={recapLessonId && onReviewLesson ? styles.secondaryButtonText : styles.primaryButtonText}>{t('common.done')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.secondaryButtonText}>{pack ? t('scenario.practicePackAgain') : t('scenario.practiceAgain')}</Text>
                </Pressable>
              </View>
            </ScrollView>
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
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const revealBest = reveal && choice.grade === 'best';
  const revealReasonable = reveal && choice.grade === 'reasonable';
  const revealMistake = reveal && choice.grade === 'mistake';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        revealBest && styles.choiceBest,
        revealReasonable && styles.choiceReasonable,
        revealMistake && styles.choiceMistake,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.choiceCopy}>
        <View style={styles.choiceHeader}>
          <Text style={[
            styles.choiceLabel,
            revealBest && styles.choiceLabelBest,
            revealReasonable && styles.choiceLabelReasonable,
            revealMistake && styles.choiceLabelMistake,
          ]}>{choice.label}</Text>
          {revealBest && <Ionicons color={palette.aqua} name="checkmark-circle" size={21} />}
          {revealReasonable && <Ionicons color={palette.primary} name="git-compare-outline" size={20} />}
          {revealMistake && <Ionicons color={palette.danger} name="close-circle" size={21} />}
        </View>
        {reveal ? (
          <View style={styles.choiceReview}>
            <Text style={[
              styles.choiceVerdict,
              revealBest ? styles.choiceVerdictBest : revealReasonable ? styles.choiceVerdictReasonable : styles.choiceVerdictMistake,
            ]}>
              {revealBest ? t('scenario.bestBaseline') : revealReasonable ? t('scenario.playableAlternative') : t('scenario.usuallyAvoid')}{selected ? t('scenario.yourChoiceSuffix') : ''}
            </Text>
            {selected && choice.mistakeCategory ? (
              <View style={styles.mistakeTag}>
                <Ionicons color={palette.danger} name="alert-circle-outline" size={12} />
                <Text style={styles.mistakeTagText}>{t(`scenario.mistake.${choice.mistakeCategory}` as MessageKey)}</Text>
              </View>
            ) : null}
            <Text style={styles.choiceFeedback}>{choice.feedback}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, backgroundColor: palette.surface },
    iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 16, lineHeight: 20, fontWeight: '700', textAlign: 'center', marginTop: 3 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 13 },
    progressText: { flex: 1, minWidth: 0, color: palette.muted, fontSize: 10, lineHeight: 14, fontWeight: '600' },
    focusText: { flexShrink: 1, maxWidth: '42%', color: palette.primary, fontSize: 10, lineHeight: 14, fontWeight: '700', textAlign: 'right' },
    progressTrack: { height: 4, marginHorizontal: 18, marginTop: 8, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.soft },
    progressFill: { height: '100%', borderRadius: 3, backgroundColor: palette.aqua },
    scroller: { flex: 1, minHeight: 0 },
    content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 13, paddingBottom: 30 },
    tableCard: { minHeight: 300, justifyContent: 'space-between', padding: 15, borderRadius: 22, backgroundColor: palette.table, borderWidth: 1, borderColor: palette.tableLine, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 4 },
    tableCardCompact: { minHeight: 215, padding: 12, borderRadius: 19 },
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
    choice: { minHeight: 53, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    choiceCopy: { flex: 1, gap: 9 },
    choiceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    choiceBest: { borderColor: palette.aqua, backgroundColor: palette.aquaSoft },
    choiceReasonable: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    choiceMistake: { borderColor: palette.danger },
    choiceLabel: { flex: 1, minWidth: 0, color: palette.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
    choiceLabelBest: { color: palette.aquaText },
    choiceLabelReasonable: { color: palette.primary },
    choiceLabelMistake: { color: palette.danger },
    choiceReview: { gap: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    choiceVerdict: { fontSize: 9, fontWeight: '800', letterSpacing: 0.55, textTransform: 'uppercase' },
    choiceVerdictBest: { color: palette.aquaText },
    choiceVerdictReasonable: { color: palette.primary },
    choiceVerdictMistake: { color: palette.danger },
    mistakeTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: palette.surfaceRaised },
    mistakeTagText: { color: palette.danger, fontSize: 9, lineHeight: 12, fontWeight: '800' },
    choiceFeedback: { color: palette.muted, fontSize: 11, lineHeight: 17 },
    feedback: { gap: 7, padding: 15, borderRadius: 17, borderLeftWidth: 3 },
    feedbackBest: { backgroundColor: palette.aquaSoft, borderLeftColor: palette.aqua },
    feedbackReasonable: { backgroundColor: palette.accentSoft, borderLeftColor: palette.primary },
    feedbackMistake: { backgroundColor: palette.surface, borderLeftColor: palette.danger },
    feedbackHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    feedbackTitle: { color: palette.aquaText, fontSize: 12, fontWeight: '800' },
    feedbackTitleReasonable: { color: palette.primary },
    feedbackTitleMistake: { color: palette.danger },
    feedbackText: { color: palette.text, fontSize: 12, lineHeight: 18 },
    calculation: { gap: 5, padding: 11, borderRadius: 13, backgroundColor: palette.surfaceRaised },
    calculationHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    calculationTitle: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.55, textTransform: 'uppercase' },
    calculationText: { color: palette.text, fontSize: 10, lineHeight: 15, fontWeight: '600' },
    reasoningLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    takeaway: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 13, backgroundColor: palette.surfaceRaised, marginTop: 3 },
    takeawayText: { flex: 1, color: palette.text, fontSize: 11, lineHeight: 16, fontWeight: '600' },
    footer: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface },
    primaryButton: { width: '100%', maxWidth: 720, alignSelf: 'center', minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { flexShrink: 1, color: palette.primaryText, fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
    secondaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.soft },
    secondaryButtonText: { flexShrink: 1, color: palette.text, fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
    disabled: { opacity: 0.38 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
    resultScreen: { width: '100%', maxWidth: 720, alignSelf: 'center', flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 24 },
    resultIcon: { width: 68, height: 68, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.aquaSoft, marginBottom: 7 },
    resultEyebrow: { color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase' },
    resultScore: { color: palette.text, fontSize: 52, fontWeight: '800', letterSpacing: -2 },
    resultTitle: { color: palette.text, fontSize: 19, fontWeight: '700', textAlign: 'center' },
    resultBody: { maxWidth: 350, color: palette.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
    reviewCard: { width: '100%', gap: 6, padding: 14, borderRadius: 16, backgroundColor: palette.accentSoft, marginTop: 6 },
    reviewHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reviewTitle: { color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.55, textTransform: 'uppercase' },
    reviewText: { color: palette.text, fontSize: 12, lineHeight: 18, fontWeight: '600' },
    recapGroup: { gap: 5, paddingTop: 4 },
    recapLabel: { color: palette.muted, fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    strengthList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    strengthChip: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: palette.surfaceRaised },
    strengthText: { flexShrink: 1, color: palette.text, fontSize: 10, lineHeight: 14, fontWeight: '700' },
    savedReviewRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 3 },
    savedReviewText: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 15 },
    bestScoreCard: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, marginTop: 12 },
    bestScoreLabel: { color: palette.muted, fontSize: 12, fontWeight: '600' },
    bestScoreValue: { color: palette.aqua, fontSize: 18, fontWeight: '800' },
    resultActions: { width: '100%', gap: 9, marginTop: 8 },
  });
}
