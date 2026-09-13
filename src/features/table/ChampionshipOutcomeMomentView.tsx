import { Pressable, StyleSheet, Text, View } from 'react-native';

import { championshipEvent } from '../../domain/poker/championship';
import { DecorativeIcon } from '../../components/DecorativeIcon';
import { championshipAchievementDisplay, championshipEventText } from '../../localization/championship';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { championshipPalette } from '../../themePalette';
import type { ChampionshipOutcomeMoment } from './championshipVictory';

/**
 * B3: the end-of-run Championship moment — distinct presentation for a
 * victory, a qualification, and an elimination. Skippable with one tap, names
 * the newly unlocked destination (a hidden event only after its gate opened)
 * and the cosmetic title granted from existing progress. Presentation is
 * static, so reduced-motion preferences are honored by construction, and the
 * moment never blocks the summary sheet underneath.
 */
export function ChampionshipOutcomeMomentView({
  eventTitle,
  moment,
  onContinue,
}: {
  eventTitle: string;
  moment: ChampionshipOutcomeMoment;
  onContinue: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemoStyles(palette);
  const title = t(moment.titleKey, { event: eventTitle });
  return (
    <Pressable
      accessibilityLiveRegion="polite"
      accessibilityRole="button"
      accessibilityLabel={`${t(moment.eyebrowKey)}. ${title}`}
      onPress={onContinue}
      style={styles.scrim}
      testID="championship.moment"
    >
      <View style={styles.card}>
        <View style={styles.badge}>
          <DecorativeIcon
            color={championshipPalette.primary}
            name={moment.kind === 'victory' ? 'trophy' : moment.kind === 'qualification' ? 'flag-outline' : 'exit-outline'}
            size={30}
          />
        </View>
        <Text style={styles.eyebrow}>{t(moment.eyebrowKey)}</Text>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{t(moment.detailKey)}</Text>
        {moment.unlockedEventId ? (
          <Text style={styles.unlock}>
            {t('championship.moment.unlocked', { event: championshipEventText(championshipEvent(moment.unlockedEventId), 'title', t) })}
          </Text>
        ) : null}
        {moment.rewardAchievement ? (
          <View style={styles.rewardPill}>
            {/* B3 (review): the achievement resolves through the localized,
                hidden-aware display helper — the model never carries the
                authored English title into the view. */}
            <Text style={styles.rewardText}>{t('championship.moment.reward', { title: championshipAchievementDisplay(moment.rewardAchievement, t).title })}</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onContinue}
          style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}
          testID="championship.moment.continue"
        >
          <Text style={styles.continueText}>{t('championship.moment.continue')}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function useMemoStyles(palette: ThemePalette) {
  return StyleSheet.create({
    badge: {
      alignItems: 'center',
      backgroundColor: palette.accentSoft,
      borderRadius: 30,
      height: 60,
      justifyContent: 'center',
      marginBottom: 12,
      width: 60,
    },
    card: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: 8,
      marginHorizontal: 24,
      paddingHorizontal: 24,
      paddingVertical: 28,
      width: '100%',
    },
    continueButton: {
      alignItems: 'center',
      backgroundColor: championshipPalette.primary,
      borderRadius: 14,
      justifyContent: 'center',
      marginTop: 8,
      minHeight: 48,
      width: '100%',
    },
    continueText: { color: palette.primaryText, fontSize: 15, fontWeight: '800' },
    detail: { color: palette.muted, fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
    eyebrow: { color: championshipPalette.primary, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
    pressed: { opacity: 0.74 },
    rewardPill: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    rewardText: { color: palette.text, fontSize: 12.5, fontWeight: '700' },
    scrim: {
      alignItems: 'center',
      backgroundColor: palette.scrim,
      flex: 1,
      justifyContent: 'center',
    },
    title: {
      color: palette.text,
      fontSize: 20,
      fontWeight: '800',
      lineHeight: 27,
      textAlign: 'center',
    },
    unlock: { color: championshipPalette.primary, fontSize: 13.5, fontWeight: '700' },
  });
}
