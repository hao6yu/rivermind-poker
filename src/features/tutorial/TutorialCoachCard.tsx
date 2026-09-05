import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { useLocalization } from '../../localization';
import { RADIUS } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

/**
 * One teaching point plus the active call to action. The card is the single
 * step-change live region: a new coach message is announced as a whole, so a
 * step change never re-reads the table (plan §6.6).
 */
export function TutorialCoachCard({
  coachMessage,
  ctaLabel,
  mathDetail,
  mathExpanded,
  mathPlain,
  onCta,
  onToggleMath,
  progressLabel,
  retryCopy,
  showMathToggle,
  testID,
}: {
  coachMessage: string;
  ctaLabel?: string;
  mathDetail?: string;
  mathExpanded?: boolean;
  mathPlain?: string;
  onCta?: () => void;
  onToggleMath?: () => void;
  progressLabel: string;
  retryCopy?: string | null;
  showMathToggle?: boolean;
  testID: string;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);

  if (retryCopy) {
    // A non-recommended choice: supportive explanation plus the recommended
    // action. No failure state, no branching (plan §4 interaction rules).
    return (
      <View style={[styles.card, styles.retryCard]} testID={testID}>
        <View style={styles.retryHeader}>
          <Ionicons color={palette.aqua} name="happy-outline" size={18} />
          <Text maxFontSizeMultiplier={1.4} style={styles.retryTitle}>{t('tutorial.retry.title')}</Text>
        </View>
        <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.4} style={styles.retryCopy}>
          {retryCopy}
        </Text>
        <Button label={t('tutorial.retry.tryRecommended')} onPress={onCta} testID="tutorial.retry.tryRecommended" />
      </View>
    );
  }

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.headerRow}>
        <View style={styles.eyebrowRow}>
          <Ionicons color={palette.aqua} name="school-outline" size={13} />
          <Text maxFontSizeMultiplier={1.2} style={styles.eyebrow}>{t('tutorial.a11y.coachMessage')}</Text>
        </View>
        <Text maxFontSizeMultiplier={1.2} style={styles.progress}>{progressLabel}</Text>
      </View>
      <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.5} style={styles.coach}>
        {coachMessage}
      </Text>
      {mathPlain ? (
        <Text maxFontSizeMultiplier={1.4} style={styles.mathPlain}>{mathPlain}</Text>
      ) : null}
      {showMathToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: mathExpanded }}
          onPress={onToggleMath}
          style={({ pressed }) => [styles.mathToggle, pressed && styles.pressed]}
          testID="tutorial.math.toggle"
        >
          <Ionicons color={palette.primary} name={mathExpanded ? 'eye-off-outline' : 'calculator-outline'} size={14} />
          <Text maxFontSizeMultiplier={1.2} style={styles.mathToggleText}>
            {mathExpanded ? t('tutorial.math.hide') : t('tutorial.math.show')}
          </Text>
        </Pressable>
      ) : null}
      {mathExpanded && mathDetail ? (
        <View accessible style={styles.mathDetail}>
          <Text maxFontSizeMultiplier={1.4} style={styles.mathDetailText}>{mathDetail}</Text>
        </View>
      ) : null}
      {ctaLabel ? (
        <Button label={ctaLabel} onPress={onCta} testID="tutorial.coach.cta" />
      ) : null}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      gap: 12,
      padding: 16,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    eyebrow: { color: palette.aqua, fontSize: 10, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    progress: { color: palette.muted, fontSize: 10, fontWeight: '700' },
    coach: { color: palette.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
    mathPlain: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    mathToggle: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.soft,
    },
    mathToggleText: { color: palette.primary, fontSize: 12, fontWeight: '800' },
    mathDetail: {
      gap: 4,
      padding: 12,
      borderRadius: RADIUS.sm,
      backgroundColor: palette.soft,
    },
    mathDetailText: { color: palette.text, fontSize: 12, lineHeight: 18 },
    retryCard: { borderColor: palette.aqua },
    retryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    retryTitle: { color: palette.aquaText, fontSize: 14, fontWeight: '800' },
    retryCopy: { color: palette.text, fontSize: 14, lineHeight: 21 },
    pressed: { opacity: 0.8 },
  });
}
