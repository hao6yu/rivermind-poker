import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../theme';
import { useLocalization } from '../../localization';

import {
  firstIncompleteRecommendedStep,
  type RecommendedSessionPlan,
} from '../../domain/learning/recommendedSession';
import {
  learningConceptLabel,
  sessionReasonLabel,
  sessionStepIndex,
  sessionStepLabel,
  type SessionLoc,
} from './recommendedSessionPresentation';

/**
 * The Home preview for a recommended session. It explains why RiverMind
 * selected the session, previews the first *incomplete* step, and shows how
 * far through the journey it is — and it launches the journey through `onStart`.
 * Keeping it a thin, self-contained card lets the shell render it without
 * recomposing the plan.
 */

interface RecommendedSessionHomeCardProps {
  /** A non-empty, open session plan to preview. */
  plan: RecommendedSessionPlan;
  /** Launch the journey controller when the card is pressed. */
  onStart: () => void;
}

export function RecommendedSessionHomeCard({ plan, onStart }: RecommendedSessionHomeCardProps): React.ReactElement {
  const { palette } = useAppTheme();
  const { t, tCount, activityText, practicePackText, scenarioContent, trainerContent } = useLocalization();

  const loc: SessionLoc = useMemo(
    () => ({ t, tCount, activityText, practicePackText, scenarioContent, trainerContent }),
    [t, tCount, activityText, practicePackText, scenarioContent, trainerContent],
  );

  // A terminal plan (completed or abandoned) has no incomplete step to preview;
  // tapping it opens the closing outcome, so name that summary.
  const isTerminal = plan.status === 'completed' || plan.status === 'abandoned';
  const firstStep = isTerminal ? null : (firstIncompleteRecommendedStep(plan) ?? plan.steps[0] ?? null);
  const index = firstStep ? sessionStepIndex(plan, firstStep) : 1;
  const title = firstStep ? sessionStepLabel(firstStep, loc) : t('learn.sessionTitle');
  const concept = learningConceptLabel(plan.concept, t);
  // Explain why RiverMind picked this session so the preview is not opaque.
  const reason = sessionReasonLabel(plan.reason, t);
  // A terminal plan opens its closing outcome; a resumed (active) session is
  // continued; a freshly composed one is started.
  const buttonLabel = isTerminal
    ? t('learn.sessionSummary')
    : plan.status === 'active'
      ? t('learn.sessionButton')
      : t('learn.sessionStart');
  const progress = t('learn.sessionStepOf', { current: index, total: plan.steps.length });
  const duration = tCount('common.minutes', plan.estimatedMinutes);
  // A single, ordered label so VoiceOver reads the whole preview instead of the
  // generic button text, which hides the concept, reason, progress, and time.
  const label = isTerminal
    ? [buttonLabel, concept, reason, duration].join('. ')
    : [buttonLabel, concept, reason, progress, duration].join('. ');

  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onStart}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.orb} />
      <View style={styles.copy}>
        <View style={styles.topRow}>
          <Text style={[styles.eyebrow, { color: palette.primary }]}>{concept}</Text>
          <Text style={styles.buttonLabel}>{buttonLabel}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.reason, { color: palette.muted }]}>{reason}</Text>
        <Text style={[styles.meta, { color: palette.muted }]}>
          {isTerminal ? duration : `${progress} · ${duration}`}
        </Text>
      </View>
    </Pressable>
  );
}

function createStyles(palette: ReturnType<typeof useAppTheme>['palette']) {
  return StyleSheet.create({
    card: { position: 'relative', borderRadius: 18, padding: 16, overflow: 'hidden' },
    pressed: { opacity: 0.85 },
    orb: { position: 'absolute', right: -24, top: -24, width: 88, height: 88, borderRadius: 44, backgroundColor: palette.primary, opacity: 0.12 },
    copy: { gap: 8, position: 'relative' },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
    // Explicit semantic foreground: the platform default black is unreadable on
    // the dark Home background (Slice 3.11A issue 1).
    buttonLabel: { color: palette.primary, fontSize: 12, fontWeight: '700' },
    title: { color: palette.text, fontSize: 17, fontWeight: '700', lineHeight: 21 },
    reason: { fontSize: 12, fontWeight: '600', fontStyle: 'italic' },
    meta: { fontSize: 12, fontWeight: '600' },
  });
}
