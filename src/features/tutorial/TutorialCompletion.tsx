import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { BEGINNER_TUTORIAL_POT_BY_STEP, BEGINNER_TUTORIAL_STEP_COUNT } from '../../domain/tutorial/beginnerTutorial';
import { useLocalization } from '../../localization';
import { RADIUS } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

/**
 * The recap (storyboard step 10 / completion screen): confirms the concepts
 * learned and offers the three destinations from plan §3. No calibration is
 * opened from here, and nothing here writes statistics.
 */
export function TutorialCompletion({
  onContinueBasics,
  onDone,
  onTryPractice,
  testID,
}: {
  onContinueBasics: () => void;
  onDone: () => void;
  onTryPractice: () => void;
  testID: string;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const concepts = [
    t('tutorial.recap.conceptBlinds'),
    t('tutorial.recap.conceptPrivateCards'),
    t('tutorial.recap.conceptCommunity'),
    t('tutorial.recap.conceptActions'),
    t('tutorial.recap.conceptBestFive'),
    t('tutorial.recap.conceptValue'),
  ];
  const showdownPot = BEGINNER_TUTORIAL_POT_BY_STEP.showdown;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID={testID}
    >
      <View accessible style={styles.winnerCard}>
        <Ionicons color={palette.winnerGold} name="trophy-outline" size={26} />
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.4} style={styles.winnerTitle}>
          {t('tutorial.showdown.winner')}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.winnerPot}>
          {t('tutorial.showdown.potToWinner', { amount: showdownPot })}
        </Text>
      </View>

      <View style={styles.recapCard}>
        <Text maxFontSizeMultiplier={1.4} style={styles.recapTitle}>{t('tutorial.recap.title')}</Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.recapSubtitle}>{t('tutorial.recap.subtitle')}</Text>
        <View style={styles.concepts}>
          {concepts.map((concept) => (
            <View key={concept} style={styles.conceptRow}>
              <Ionicons color={palette.primary} name="checkmark-circle" size={16} />
              <Text maxFontSizeMultiplier={1.4} style={styles.conceptText}>{concept}</Text>
            </View>
          ))}
        </View>
        <Text maxFontSizeMultiplier={1.3} style={styles.playMoney}>{t('tutorial.recap.playMoney')}</Text>
      </View>

      <View style={styles.destinations}>
        <Button
          label={t('tutorial.completion.continueBasics')}
          onPress={onContinueBasics}
          size="primary"
          testID="tutorial.completion.continueBasics"
        />
        <Button
          label={t('tutorial.completion.tryPractice')}
          onPress={onTryPractice}
          testID="tutorial.completion.tryPractice"
          variant="secondary"
        />
        <Button
          label={t('tutorial.completion.done')}
          onPress={onDone}
          testID="tutorial.completion.done"
          variant="ghost"
        />
      </View>
    </ScrollView>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    content: { flexGrow: 1, gap: 12, padding: 16, paddingBottom: 32 },
    winnerCard: {
      alignItems: 'center',
      gap: 8,
      padding: 16,
      borderRadius: RADIUS.lg,
      borderWidth: 2,
      borderColor: palette.winnerGold,
      backgroundColor: palette.surface,
    },
    winnerTitle: { color: palette.text, fontSize: 20, lineHeight: 26, fontWeight: '800' },
    winnerPot: { color: palette.muted, fontSize: 13, fontWeight: '700' },
    recapCard: {
      gap: 12,
      padding: 16,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    recapTitle: { color: palette.text, fontSize: 17, lineHeight: 23, fontWeight: '800' },
    recapSubtitle: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    concepts: { gap: 8 },
    conceptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    conceptText: { flex: 1, color: palette.text, fontSize: 13, lineHeight: 19 },
    playMoney: {
      marginTop: 4,
      padding: 12,
      borderRadius: RADIUS.sm,
      backgroundColor: palette.soft,
      color: palette.muted,
      fontSize: 11,
      lineHeight: 16,
    },
    destinations: { gap: 8 },
  });
}

/** Re-exported for the coordinator's progress label (welcome step shows 1/N). */
export const TUTORIAL_STEP_COUNT = BEGINNER_TUTORIAL_STEP_COUNT;
