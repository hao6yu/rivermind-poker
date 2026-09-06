import { AccessibilityInfo, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { rankLabelKeys, suitLabelKeys } from '../../components/PlayingCard';
import { Button } from '../../components/ui/Button';
import {
  BEGINNER_TUTORIAL_BOARD,
  BEGINNER_TUTORIAL_STEP_COUNT,
  BEGINNER_TUTORIAL_STEP_IDS,
  beginnerTutorialReducer,
  initialBeginnerTutorialState,
  isInteractiveStep,
  recommendedActionId,
  SEATS_FOCUS_SEQUENCE,
  tutorialHighlightTarget,
  tutorialTableView,
  type BeginnerTutorialState,
  type BeginnerTutorialStepId,
  type Rank,
  type Suit,
  type TutorialActionId,
} from '../../domain/tutorial/beginnerTutorial';
import { useLocalization } from '../../localization';
import type { MessageKey } from '../../localization/messages';
import {
  saveBeginnerTutorialCheckpoint,
  saveBeginnerTutorialCompletion,
} from '../../services/beginnerTutorial';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { RADIUS } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';
import {
  coachMessageFor,
  ctaLabelFor,
  FLOP_MATH_VALUES,
  progressLabelFor,
  retryCopyFor,
} from './tutorialPresentation';
import { TutorialActionBar } from './TutorialActionBar';
import { TutorialCoachCard } from './TutorialCoachCard';
import { TutorialCompletion } from './TutorialCompletion';
import { TutorialTable } from './TutorialTable';

const STEP_INDEX: Record<BeginnerTutorialStepId, number> = Object.fromEntries(
  BEGINNER_TUTORIAL_STEP_IDS.map((stepId, index) => [stepId, index]),
) as Record<BeginnerTutorialStepId, number>;

const RANK_ARIA_KEYS = rankLabelKeys as unknown as Record<Rank, MessageKey>;
const SUIT_ARIA_KEYS = suitLabelKeys as unknown as Record<Suit, MessageKey>;

/**
 * Full-screen coordinator for the beginner tutorial. Owns the reducer state
 * and the local checkpointing (plan §6.2/§6.3): the step is saved after every
 * completed step, completion is saved once on reaching the recap, and exiting
 * never counts as failure. Everything on screen derives from the current step
 * through the domain selectors; no table state is ever stored.
 */
export function BeginnerTutorialScreen({
  initialStepId,
  offerResume,
  onContinueBasics,
  onDone,
  onExit,
  onTryPractice,
}: {
  /** Saved step from local progress; 'welcome' for a fresh run. */
  initialStepId: BeginnerTutorialStepId;
  /** True when returning to a mid-tutorial checkpoint (offer Resume / Start over). */
  offerResume: boolean;
  onContinueBasics: () => void;
  onDone: () => void;
  onExit: (stepId: BeginnerTutorialStepId) => void;
  onTryPractice: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 600;
  const styles = useMemo(() => createStyles(palette, tablet, width > height), [palette, tablet, width, height]);
  const [state, dispatch] = useReducer(
    beginnerTutorialReducer,
    initialStepId,
    initialBeginnerTutorialState,
  );
  const [resumePromptVisible, setResumePromptVisible] = useState(offerResume);
  const [mathExpanded, setMathExpanded] = useState(false);
  const announcedStep = useRef<BeginnerTutorialStepId | null>(null);
  const announcedBoardCount = useRef(0);

  // Persist after every completed step: the checkpoint stores the step the
  // player has reached (never table state). Reaching the recap records the
  // completion once; exiting is never a failure.
  useEffect(() => {
    if (state.stepId === 'recap') {
      saveBeginnerTutorialCompletion();
      return;
    }
    saveBeginnerTutorialCheckpoint(state.stepId);
  }, [state.stepId]);

  // Step-change announcement: the new coach message plus the newly dealt
  // community card, without re-reading the whole table (plan §6.6).
  useEffect(() => {
    if (announcedStep.current === state.stepId) return;
    announcedStep.current = state.stepId;
    const boardCount = tutorialBoardCount(state.stepId);
    const parts: string[] = [];
    if (boardCount > announcedBoardCount.current) {
      // Announce every newly dealt card in natural order (review finding
      // #19): the flop announces all three, turn/river one each.
      for (let index = announcedBoardCount.current; index < boardCount; index += 1) {
        const newCard = BEGINNER_TUTORIAL_BOARD[index];
        if (newCard) {
          parts.push(t('tutorial.a11y.newCommunityCard', {
            card: t('card.aria', {
              rank: t(RANK_ARIA_KEYS[newCard.rank]),
              suit: t(SUIT_ARIA_KEYS[newCard.suit]),
            }),
          }));
        }
      }
    }
    announcedBoardCount.current = boardCount;
    const coach = coachMessageFor(state, t);
    if (coach) parts.push(coach);
    if (parts.length > 0) {
      AccessibilityInfo.announceForAccessibility(parts.join('. '));
    }
  }, [state, t]);

  if (state.stepId === 'recap') {
    return (
      <View style={styles.screen} testID="tutorial.screen">
        <TutorialCompletion
          onContinueBasics={onContinueBasics}
          onDone={onDone}
          onTryPractice={onTryPractice}
          testID="tutorial.completion"
        />
      </View>
    );
  }

  const view = tutorialTableView(state.stepId);
  const highlight = tutorialHighlightTarget(state);
  const stepNumber = STEP_INDEX[state.stepId] + 1;
  const progressLabel = progressLabelFor(state.stepId, STEP_INDEX[state.stepId], BEGINNER_TUTORIAL_STEP_COUNT, t);
  const interactive = isInteractiveStep(state.stepId);
  const retryCopy = retryCopyFor(state, t);
  const mathStep = state.stepId === 'flop-decision';
  const coach = coachMessageFor(state, t) ?? '';
  const cta = retryCopy ? null : ctaLabelFor(state, t);
  const choose = (actionId: TutorialActionId) => dispatch({ type: 'choose', actionId });

  return (
    <View style={styles.screen} testID="tutorial.screen">
      <View style={styles.header}>
        {state.stepId !== 'welcome' ? (
          <Button
            accessibilityLabel={t('tutorial.back')}
            label={t('tutorial.back')}
            onPress={() => dispatch({ type: 'back' })}
            size="compact"
            testID="tutorial.back"
            variant="ghost"
          />
        ) : <View style={styles.headerSpacer} />}
        <Text maxFontSizeMultiplier={1.2} style={styles.progressCenter}>{progressLabel}</Text>
        <Button
          accessibilityLabel={t('tutorial.exit')}
          label={t('tutorial.exit')}
          onPress={() => onExit(state.stepId)}
          size="compact"
          testID="tutorial.exit"
          variant="ghost"
        />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <TutorialTable highlight={highlight} view={view} />
        <View style={styles.lessonPanel}>
        {state.stepId === 'showdown' ? (
          <View accessible style={styles.winnerBanner} testID="tutorial.showdown.winner">
            <Text maxFontSizeMultiplier={1.4} style={styles.winnerText}>{t('tutorial.showdown.winner')}</Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.winnerRows}>
              {t('tutorial.showdown.heroRow', { hand: t('tutorial.hand.flush') })}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.winnerRows}>
              {t('tutorial.showdown.opponentRow', { hand: t('tutorial.hand.twoPair') })}
            </Text>
          </View>
        ) : null}
        <TutorialCoachCard
          coachMessage={coach}
          ctaLabel={cta ?? undefined}
          mathDetail={mathStep ? t('tutorial.math.detail', FLOP_MATH_VALUES) : undefined}
          mathExpanded={mathExpanded}
          mathPlain={mathStep ? t('tutorial.math.plain') : undefined}
          onCta={() => {
            if (retryCopy) {
              const recommended = recommendedActionId(state.stepId);
              if (recommended) choose(recommended);
              return;
            }
            dispatch({ type: 'advance' });
          }}
          onToggleMath={() => setMathExpanded((current) => !current)}
          progressLabel={progressLabel}
          retryCopy={retryCopy}
          showMathToggle={mathStep}
          testID="tutorial.coachCard"
        />
        </View>
      </ScrollView>

      {interactive && !retryCopy ? (
        <View style={styles.footer}>
          <TutorialActionBar onChoose={choose} state={state} />
        </View>
      ) : null}

      {resumePromptVisible ? (
        <View
          accessibilityViewIsModal
          style={[styles.resumeOverlay, reduceMotion && styles.resumeOverlayStatic]}
          testID="tutorial.resumePrompt"
        >
          <View style={styles.resumeCard}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.4} style={styles.resumeTitle}>
              {t('tutorial.resume.title')}
            </Text>
            <Text maxFontSizeMultiplier={1.4} style={styles.resumeDescription}>
              {t('tutorial.resume.description')}
            </Text>
            <View style={styles.resumeActions}>
              <Button
                label={t('tutorial.entry.resume')}
                onPress={() => setResumePromptVisible(false)}
                testID="tutorial.resume.resume"
              />
              <Button
                label={t('tutorial.entry.startOver')}
                onPress={() => {
                  setResumePromptVisible(false);
                  dispatch({ type: 'restart' });
                }}
                testID="tutorial.resume.startOver"
                variant="secondary"
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function tutorialBoardCount(stepId: BeginnerTutorialStepId): number {
  const index = STEP_INDEX[stepId];
  if (index <= STEP_INDEX['preflop-raise']) return 0;
  if (index <= STEP_INDEX['flop-decision']) return 3;
  if (stepId === 'turn-check') return 4;
  return 5;
}

function createStyles(palette: ThemePalette, tablet: boolean, landscape: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    headerSpacer: { width: 76 },
    progressCenter: { flex: 1, textAlign: 'center', color: palette.muted, fontSize: 11, fontWeight: '700' },
    body: { flex: 1 },
    lessonPanel: { width: landscape ? '40%' : '100%', flexShrink: 0, gap: 12 },
    bodyContent: { flexDirection: landscape ? 'row' : 'column', flexGrow: 1, width: '100%', maxWidth: tablet ? 1000 : 560, alignSelf: 'center', gap: 12, paddingHorizontal: 12, paddingBottom: 12 },
    winnerBanner: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 560,
      alignItems: 'center',
      gap: 4,
      padding: 12,
      borderRadius: RADIUS.md,
      borderWidth: 2,
      borderColor: palette.winnerGold,
      backgroundColor: palette.surface,
    },
    winnerText: { color: palette.text, fontSize: 16, fontWeight: '900' },
    winnerRows: { color: palette.muted, fontSize: 12, lineHeight: 17 },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
    },
    resumeOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.scrim,
      padding: 20,
    },
    resumeOverlayStatic: { opacity: 1 },
    resumeCard: {
      width: '100%',
      maxWidth: 420,
      gap: 12,
      padding: 16,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    resumeTitle: { color: palette.text, fontSize: 17, lineHeight: 23, fontWeight: '800' },
    resumeDescription: { color: palette.muted, fontSize: 13, lineHeight: 19 },
    resumeActions: { gap: 8, marginTop: 4 },
  });
}
