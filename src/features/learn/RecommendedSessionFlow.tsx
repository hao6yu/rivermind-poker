import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LessonModal } from './LessonModal';
import { JourneyBanner } from './JourneyBanner';
import { TrainerModal } from './TrainerModal';
import { ScenarioTrainingModal } from './ScenarioTrainingModal';

import { useAppTheme } from '../../theme';
import { useLocalization } from '../../localization';

import {
  firstIncompleteRecommendedStep,
  isRecommendedSessionAbandoned,
  isRecommendedSessionCompleted,
  type RecommendedSessionPlan,
  type RecommendedSessionStep,
} from '../../domain/learning/recommendedSession';

import type {
  LessonDefinition,
  LearningProgressEntry,
  ScenarioAttemptReview,
  ScenarioTrainerDefinition,
  TrainerAttemptReview,
  TrainerDefinition,
} from '../../domain/learning/types';
import type { LearningReviewItem } from '../../domain/learning/reviewQueue';
import type { TableMissionId } from '../../domain/learning/tableMissions';
import type { LearningSessionRecord } from '../../domain/learning/history';
import {
  buildClosingSummary,
  buildSessionEvidenceSnapshot,
  type ClosingSummary,
  type GradedHandEvidence,
  type SessionStepDecisions,
} from '../../domain/learning/sessionClosing';
import type { ThemePalette } from '../../theme';
import {
  learningConceptLabel,
  resolveStepLauncher,
  sessionHeaderTitle,
  sessionStepIndex,
  type SessionLoc,
  type StepLauncher,
} from './recommendedSessionPresentation';
import { closingOutcomeCopy } from './closingOutcome';
import {
  applyRecommendedSessionControllerEvent,
  type RecommendedSessionControllerState,
  type RecommendedSessionControllerView,
  selectRecommendedSessionControllerView,
} from './recommendedSessionController';

/**
 * The recommended-session journey controller. It owns step navigation: it
 * launches the modal that matches the step currently on screen (or dispatches a
 * table mission), records each result, and advances the plan exactly one step at
 * a time. It never mutates the checkpoint directly — the shell does that through
 * `onStepChange`, which is what lets the session resume after an app relaunch.
 *
 * The record-then-dismiss contract with the modals:
 *  - `onComplete` fires when the final answer is submitted. It records the
 *    feature result AND persists the step as completed, so a relaunch off a
 *    result screen neither replays the step nor shows a stuck "completed"
 *    lesson. The result screen is then *latched* (kept visible locally) until
 *    the learner dismisses it, at which point the next step renders.
 *  - Aborting before a result is recorded leaves the step untouched so the
 *    session resumes.
 */

export interface RecommendedSessionFlowProps {
  /** The composed plan, loaded from the shell's checkpoint. */
  plan: RecommendedSessionPlan;
  /** Targets an app-update migration could no longer route. */
  skippableStepIds: readonly string[];
  progress: readonly LearningProgressEntry[];
  /** Local session history, feeding the closing outcome's evidence rules. */
  history: readonly LearningSessionRecord[];
  reviewItems: readonly LearningReviewItem[];
  /**
   * Graded, chip-free evidence from completed hands, projected per concept.
   * Backs the "existing strength across hands" claim and the recurring-focus
   * "review spots across hands" alternative.
   */
  handEvidence: readonly GradedHandEvidence[];
  /**
   * Whether the graded hand evidence above has finished loading. A terminal
   * plan may exist from a prior session while the hand history loads only after
   * this session opens, so the closing summary freezes only once it is loaded —
   * a stale/empty load must not win the race and drop hand evidence.
   */
  handHistoryLoaded: boolean;
  /**
   * The session's own decision totals (scored/reviewed decisions and the costly
   * mistakes among them), accumulated by the shell as each step is recorded.
   * Frozen into the evidence snapshot when the session closes.
   */
  sessionDecisions: SessionStepDecisions;
  /** Stable id of the next continue-path activity, or null when none. */
  nextActivityId: string | null;
  onRecordLesson: (lesson: LessonDefinition) => void;
  onRecordTrainer: (trainer: TrainerDefinition, score: number, review: TrainerAttemptReview) => void;
  onRecordScenario: (trainer: ScenarioTrainerDefinition, score: number, review: ScenarioAttemptReview) => void;
  onRecordReview: (trainer: TrainerDefinition, score: number, review: TrainerAttemptReview) => void;
  /** Advance a step: 'completed' when a result is recorded+dismissed, 'skipped' when unreachable. */
  onStepChange: (stepId: string, status: 'completed' | 'skipped') => void;
  /** The shell records the mission result, then advances this step. */
  onLaunchMission: (missionId: TableMissionId, stepId: string) => void;
  /** Leave the journey (Home) after completing or ending a session. */
  onSessionEnd: () => void;
  /** Abandon a step the learner bailed out of before recording a result. */
  onSessionAbort: () => void;
  /** End the whole session early; the shell marks it abandoned. */
  onEndEarly: () => void;
  /** The quiet secondary route to detailed progress from the closing view. */
  onViewProgress: () => void;
}

function isStepSkippable(step: NonNullable<ReturnType<typeof firstIncompleteRecommendedStep>>, skippableStepIds: readonly string[]): boolean {
  return skippableStepIds.includes(step.id);
}

export function RecommendedSessionFlow({
  plan,
  skippableStepIds,
  progress,
  history,
  reviewItems,
  handEvidence,
  handHistoryLoaded,
  sessionDecisions,
  nextActivityId,
  onRecordLesson,
  onRecordTrainer,
  onRecordScenario,
  onRecordReview,
  onStepChange,
  onLaunchMission,
  onSessionEnd,
  onSessionAbort,
  onEndEarly,
  onViewProgress,
}: RecommendedSessionFlowProps): React.ReactElement {
  const { palette } = useAppTheme();
  const { t, activityText, practicePackText, scenarioContent, trainerContent } = useLocalization();

  const styles = useMemo(() => createStyles(palette), [palette]);

  const loc: SessionLoc = useMemo(
    () => ({ t, activityText, practicePackText, scenarioContent, trainerContent }),
    [t, activityText, practicePackText, scenarioContent, trainerContent],
  );

  const totalSteps = plan.steps.length;

  // Freeze the session's evidence exactly once, at the terminal transition, so
  // the closing outcome cannot drift from live review-queue or practice-focus
  // changes the learner makes while it is presented (for example, picking a
  // focus inside the detailed-progress route). The snapshot carries the plan's
  // concept and settled step counts; the session's decision totals, prior
  // history, graded-hand evidence, live review queue, and next continue-path
  // activity drive the evidence-bounded statements. Because the next Home
  // recommendation is composed only after the learner dismisses this view, none
  // of it can feed the frozen copy.
  // The latch tracks which step's result screen is currently shown. Stored as an
  // id (not the step object) so the pure controller model resolves it against the
  // plan; reading it through state (not a ref) lets dismissal swap the modal.
  const [latchedStepId, setLatchedStepId] = useState<string | null>(null);
  // The launcher is frozen with the latch: resolving it live re-reads the review
  // queue, and a mastered review step blanks that queue, which would strand the
  // latched result on an undismissable empty shell. Carrying the frozen launcher
  // through the latch keeps the result screen routable until dismissed.
  const [latchedLauncher, setLatchedLauncher] = useState<StepLauncher | null>(null);
  const controllerState = useMemo<RecommendedSessionControllerState>(
    () => ({ latchedStepId, launcher: latchedLauncher }),
    [latchedStepId, latchedLauncher],
  );
  const view: RecommendedSessionControllerView = selectRecommendedSessionControllerView(plan, controllerState);
  const displayedStep = view.kind === 'modal' ? view.step : null;

  // Freeze the closing summary exactly once, at the terminal transition, but
  // only after the graded hand evidence has loaded. On a cold relaunch a terminal
  // plan is present before its hand history loads, and the async load (a plain
  // setState) never triggers a re-render — so freezing on the transition alone
  // would freeze an empty load. The `handHistoryLoaded` gate defers the freeze
  // until that load settles, and the null guard keeps it from recomputing from
  // later live-input changes.
  const frozenClosingSummaryRef = useRef<ClosingSummary | null>(null);
  if (view.kind === 'terminal' && handHistoryLoaded && frozenClosingSummaryRef.current === null) {
    frozenClosingSummaryRef.current = buildClosingSummary({
      snapshot: buildSessionEvidenceSnapshot(plan, sessionDecisions, plan.completedAt ?? undefined),
      history,
      reviewQueue: reviewItems,
      handEvidence,
      nextActivityId,
    });
  }

  // The banner renders `displayedStep`, which is the latched result screen when a
  // result is shown — so the index is derived from `displayedStep`, not the next
  // incomplete step, or a latched result would report the wrong step number.
  const activeIndex = displayedStep ? sessionStepIndex(plan, displayedStep) : 1;

  // The launcher for the step currently on screen. When a result is latched this
  // is overridden by the frozen launcher below, so a mutated review queue can't
  // blank the still-shown result screen.
  const displayedLauncher = useMemo(
    () => (displayedStep ? resolveStepLauncher(displayedStep, progress, reviewItems, loc) : null),
    [displayedStep, progress, reviewItems, loc],
  );
  // Latched while the just-recorded step's result screen is displayed.
  const isLatched = Boolean(latchedStepId) && Boolean(displayedStep) && displayedStep?.id === latchedStepId;
  // Use the frozen launcher for the latched result, otherwise the live one.
  const effectiveLauncher = useMemo(
    () => (isLatched ? controllerState.launcher : displayedLauncher),
    [isLatched, controllerState.launcher, displayedLauncher],
  );
  const displayedSkippable = useMemo(
    () => (displayedStep ? isStepSkippable(displayedStep, skippableStepIds) : false),
    [displayedStep, skippableStepIds],
  );

  // The mission dispatched for the step on screen, carried to the shell so it
  // advances exactly that step when the mission returns.
  const missionStepRef = useRef<{ stepId: string; missionId: TableMissionId } | null>(null);
  // A mission is only dispatched once per id, so relaunches do not restart it.
  const launchedMissionRef = useRef<string | null>(null);

  // The skip/dispatch effect is driven by `displayedStep` so a latched result
  // screen never dispatches the next step while the previous result is shown. It
  // reads the frozen `effectiveLauncher` so a latched result (whose live
  // resolver may have gone null) stays put instead of a rejected skip.
  useEffect(() => {
    if (!displayedStep) return;
    if (displayedSkippable || !effectiveLauncher) {
      // A target an app update can no longer reach is a compatibility skip, not
      // an interruption: mark it skipped so the checkpoint reconciles cleanly.
      onStepChange(displayedStep.id, 'skipped');
      return;
    }
    if (effectiveLauncher.kind === 'mission') {
      // The shell records the mission result and advances this step id, so it
      // is handed over at dispatch rather than carried on a re-mounted controller.
      if (launchedMissionRef.current !== effectiveLauncher.missionId) {
        launchedMissionRef.current = effectiveLauncher.missionId;
        missionStepRef.current = { stepId: displayedStep.id, missionId: effectiveLauncher.missionId };
        onLaunchMission(effectiveLauncher.missionId, displayedStep.id);
      }
    }
  }, [displayedStep, effectiveLauncher, displayedSkippable]);

  if (view.kind === 'terminal') {
    // A terminal plan can be present before its graded hand evidence has loaded
    // (a cold relaunch, or a mission that returned after the session opened).
    // Freeze has already run once the load settles, so we briefly show a
    // labeled loading placeholder until then rather than rendering the closing
    // outcome from an empty freeze.
    if (!handHistoryLoaded) {
      return (
        <View
          style={styles.fallback}
          accessibilityLabel={t('learn.sessionLoading')}
          accessibilityRole="text"
        >
          <ActivityIndicator color={palette.primary} size="small" />
          <Text style={styles.loadingLabel}>{t('learn.sessionLoading')}</Text>
        </View>
      );
    }

    // The terminal view is reachable only once the latch clears, so the learner
    // sees the final step's result screen before it. The closing outcome answers
    // what was practiced, what changed, and what is next, from the summary that
    // was frozen on the terminal transition (never recomputed from live inputs).
    const frozenSummary = frozenClosingSummaryRef.current!;
    return (
      <ClosingOutcomeView
        status={view.status}
        summary={frozenSummary}
        onSessionEnd={onSessionEnd}
        onViewProgress={onViewProgress}
      />
    );
  }

  // A step that is unrenderable (already reconciled, or missing) shows an empty
  // shell rather than crashing: every step can settle and leave no active step.
  if (view.kind === 'empty') return <View />;

  return (
    <View style={styles.container}>
      <View style={styles.body}>{renderLauncher()}</View>
    </View>
  );

  function renderLauncher(): React.ReactNode {
    if (!displayedStep) return <View />;
    // A step can fall out from under us (already reconciled by the effect) or a
    // latched result's live resolver went null; fall back to a neutral
    // placeholder only in those races.
    if (!effectiveLauncher) {
      return <View style={[styles.fallback, { borderColor: palette.border }]} />;
    }
    // Read the latch at callback invocation, not during render, so the decision
    // below reflects the current step regardless of when the modal rendered.
    const abort = () => {
      const next = applyRecommendedSessionControllerEvent(controllerState, { action: 'abort' });
      setLatchedStepId(next.state.latchedStepId);
      setLatchedLauncher(next.state.launcher);
      // A bail-out with nothing latched leaves the step untouched (the session
      // resumes); unmount the controller so the modal disappears.
      if (next.abortController) onSessionAbort();
    };
    const record = (finish: () => void) => {
      // Persist completion on submission (relaunch-safe) and latch this modal —
      // with its launcher frozen — so the result screen stays displayed until
      // dismissal, even after the review queue that built it mutates.
      const next = applyRecommendedSessionControllerEvent(controllerState, {
        action: 'record',
        stepId: displayedStep.id,
        launcher: effectiveLauncher,
      });
      setLatchedStepId(next.state.latchedStepId);
      setLatchedLauncher(next.state.launcher);
      onStepChange(displayedStep.id, 'completed');
      finish();
    };
    const journeyEyebrow = learningConceptLabel(plan.concept, loc.t);
    const journeyProgress = sessionHeaderTitle(displayedStep, activeIndex, totalSteps, loc.t);
    const banner = <JourneyBanner eyebrow={journeyEyebrow} progress={journeyProgress} onEndEarly={onEndEarly} />;

    switch (effectiveLauncher.kind) {
      case 'lesson':
        return (
          <View style={styles.modalWrap}>
            {banner}
            <LessonModal
              lesson={effectiveLauncher.lesson}
              completed={effectiveLauncher.completed}
              onClose={abort}
              journeyEyebrow={journeyEyebrow}
              journeyProgress={journeyProgress}
              journeyEndEarly={onEndEarly}
              onComplete={(lesson) => record(() => onRecordLesson(lesson))}
            />
          </View>
        );
      case 'trainer':
        return (
          <View style={styles.modalWrap}>
            {banner}
            <TrainerModal
              trainer={effectiveLauncher.trainer}
              bestScore={effectiveLauncher.bestScore}
              onClose={abort}
              reviewMode={false}
              journeyEyebrow={journeyEyebrow}
              journeyProgress={journeyProgress}
              journeyEndEarly={onEndEarly}
              onComplete={(trainer, score, review) => record(() => onRecordTrainer(trainer, score, review))}
            />
          </View>
        );
      case 'scenario':
        return (
          <View style={styles.modalWrap}>
            {banner}
            <ScenarioTrainingModal
              bestScore={effectiveLauncher.bestScore}
              practicePackId={effectiveLauncher.practicePackId}
              onClose={abort}
              visible
              journeyEyebrow={journeyEyebrow}
              journeyProgress={journeyProgress}
              journeyEndEarly={onEndEarly}
              onComplete={(trainer, score, review) => record(() => onRecordScenario(trainer, score, review))}
            />
          </View>
        );
      case 'review':
        return (
          <View style={styles.modalWrap}>
            {banner}
            <TrainerModal
              trainer={effectiveLauncher.trainer}
              bestScore={null}
              onClose={abort}
              reviewMode
              journeyEyebrow={journeyEyebrow}
              journeyProgress={journeyProgress}
              journeyEndEarly={onEndEarly}
              onComplete={(trainer, score, review) => record(() => onRecordReview(trainer, score, review))}
            />
          </View>
        );
      case 'mission':
        // A mission leaves the journey controller: the shell navigates to the
        // table and reports the result, which advances the plan here.
        return <View />;
    }
  }
}

/**
 * The terminal closing outcome, reachable only after the final result screen is
 * dismissed. It answers, in order, what the learner practiced, what changed, and
 * what is next — each statement bounded by the session's frozen evidence and the
 * learner's prior history (never by chip profit). A quiet secondary route opens
 * detailed progress; Finish is the single primary action and returns to Home,
 * where the shell composes the next session only after this view is dismissed.
 * The informational content is one ordered VoiceOver element; the route and
 * Finish buttons announce themselves separately, in that order.
 */
function ClosingOutcomeView({
  status,
  summary,
  onSessionEnd,
  onViewProgress,
}: {
  status: 'completed' | 'abandoned';
  summary: ClosingSummary;
  onSessionEnd: () => void;
  onViewProgress: () => void;
}): React.ReactElement {
  const { palette } = useAppTheme();
  const { t, activityText, practicePackText, scenarioContent, trainerContent } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const loc: SessionLoc = useMemo(
    () => ({ t, activityText, practicePackText, scenarioContent, trainerContent }),
    [t, activityText, practicePackText, scenarioContent, trainerContent],
  );
  const copy = closingOutcomeCopy(summary, status, loc);

  return (
    <View style={styles.closingCard}>
      <Text accessibilityRole="header" style={styles.closingTitle}>{copy.title}</Text>

      {/* The informational sections scroll; the quiet route and the single
          primary Finish stay pinned below so both remain reachable at the
          largest supported text sizes. */}
      <ScrollView style={styles.closingScroll}>
        <View
          accessible
          accessibilityLabel={copy.accessibilityLabel}
          accessibilityRole="text"
          style={styles.closingContent}
        >
          <View style={styles.closingSection}>
            <Text style={[styles.closingSectionHeader, { color: palette.primary }]}>{copy.practicedHeader}</Text>
            <Text style={styles.closingConcept}>{copy.practicedConcept}</Text>
            <Text style={styles.closingBody}>{copy.practicedSteps}</Text>
            <Text style={styles.closingBody}>{copy.practicedDecisions}</Text>
          </View>

          <View style={styles.closingSection}>
            <Text style={[styles.closingSectionHeader, { color: palette.primary }]}>{copy.changedHeader}</Text>
            <Text style={styles.closingBody}>{copy.changedStatement}</Text>
            {copy.changedFocus ? <Text style={styles.closingFocus}>{copy.changedFocus}</Text> : null}
          </View>

          <View style={styles.closingSection}>
            <Text style={[styles.closingSectionHeader, { color: palette.primary }]}>{copy.nextHeader}</Text>
            <Text style={styles.closingBody}>{copy.nextAction}</Text>
          </View>
        </View>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.progressRoute}
        onPress={onViewProgress}
        style={({ pressed }) => [styles.closingRoute, pressed && styles.closingPressed]}
      >
        <Text style={styles.closingRouteLabel}>{copy.progressRoute}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.finish}
        onPress={onSessionEnd}
        style={({ pressed }) => [styles.closingPrimaryButton, pressed && styles.closingPressed]}
      >
        <Text style={styles.closingPrimaryButtonLabel}>{copy.finish}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1 },
    body: { flex: 1 },
    modalWrap: { flex: 1 },
    fallback: { flex: 1, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    loadingLabel: { color: palette.muted, fontSize: 13, fontWeight: '600', marginTop: 12 },
    closingCard: { flex: 1, margin: 16, borderRadius: 22, padding: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    closingTitle: { color: palette.text, fontSize: 21, lineHeight: 27, fontWeight: '800', marginBottom: 12 },
    closingScroll: { flex: 1 },
    closingContent: { gap: 14, paddingBottom: 4 },
    closingSection: { gap: 6 },
    closingSectionHeader: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
    closingConcept: { color: palette.text, fontSize: 16, fontWeight: '700' },
    closingBody: { color: palette.muted, fontSize: 14, lineHeight: 20 },
    closingFocus: { color: palette.text, fontSize: 14, lineHeight: 20, marginTop: 4 },
    closingRoute: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    closingRouteLabel: { color: palette.primary, fontSize: 14, lineHeight: 18, fontWeight: '700', textDecorationLine: 'underline', textAlign: 'center' },
    closingPrimaryButton: { minHeight: 52, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primary },
    closingPrimaryButtonLabel: { color: palette.primaryText, fontSize: 15, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
    closingPressed: { opacity: 0.7 },
  });
}
