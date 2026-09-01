import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { formatChips } from '../../domain/poker/moneyFormat';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import type { MultiplayerResultPresentation } from './multiplayerGamePresentation';
import { MultiplayerSettledCountdown } from './MultiplayerSettledCountdown';

const DENSE_MAX_FONT_SIZE_MULTIPLIER = 1.4;

interface MultiplayerHandResultPanelProps {
  busy: boolean;
  countdownActionLabel?: string;
  countdownLabel?: string;
  note?: string;
  onCountdownPress?: () => void;
  onPress?: () => void;
  primaryLabel?: string;
  result: MultiplayerResultPresentation;
  wide: boolean;
}

/**
 * Settled-hand summary. Phones reserve the full summary width for the result
 * copy and place the compact continuation below it; landscape keeps the action
 * on the trailing edge where horizontal space is plentiful.
 */
export function MultiplayerHandResultPanel({
  busy,
  countdownActionLabel,
  countdownLabel,
  note,
  onCountdownPress,
  onPress,
  primaryLabel,
  result,
  wide,
}: MultiplayerHandResultPanelProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const accent = result.tone === 'win'
    ? palette.aqua
    : result.tone === 'split' ? palette.primary : palette.danger;
  const payoutAccessibility = result.payouts.map((payout) => t('multiplayer.result.payout', {
    amount: formatChips(payout.amount),
    player: payout.label,
  })).join('. ');
  const showsPayoutBreakdown = result.payouts.length !== 1
    || result.payouts[0]?.amount !== result.totalPot
    || result.headlineAmount === null;
  const resultAccessibility = [
    result.title,
    result.headlineAmount === null ? null : formatChips(result.headlineAmount),
    result.detail,
    showsPayoutBreakdown ? payoutAccessibility : null,
    showsPayoutBreakdown
      ? t('multiplayer.result.finalPot', { amount: formatChips(result.totalPot) })
      : null,
  ].filter(Boolean).join('. ');

  const trailingControl = primaryLabel && onPress ? (
    <Pressable
      accessibilityLabel={primaryLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.resultButton, busy && styles.disabled, pressed && !busy && styles.pressed]}
    >
      {busy ? <ActivityIndicator color={palette.primaryText} size="small" /> : (
        <>
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={DENSE_MAX_FONT_SIZE_MULTIPLIER}
            minimumFontScale={0.72}
            numberOfLines={1}
            style={styles.resultButtonText}
          >
            {primaryLabel}
          </Text>
          <Ionicons color={palette.primaryText} name="arrow-forward" size={wide ? 18 : 16} />
        </>
      )}
    </Pressable>
  ) : note ? (
    <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SIZE_MULTIPLIER} numberOfLines={wide ? 2 : 3} style={styles.resultNote}>
      {note}
    </Text>
  ) : null;

  return (
    <View style={[styles.resultPanel, { borderColor: accent }]}>
      <View style={styles.resultSummaryRow} testID="multiplayer-result-summary">
        <View style={[styles.resultIcon, { backgroundColor: result.tone === 'win' ? palette.aquaSoft : palette.accentSoft }]}>
          <Ionicons
            color={accent}
            name={result.tone === 'split' ? 'git-compare-outline' : 'trophy-outline'}
            size={wide ? 25 : 20}
          />
        </View>
        <View
          accessibilityLabel={resultAccessibility}
          accessibilityLiveRegion="polite"
          accessible
          style={styles.resultCopy}
        >
          <View style={styles.resultHeadline}>
            <Text adjustsFontSizeToFit maxFontSizeMultiplier={DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.76} numberOfLines={1} style={styles.resultTitle}>{result.title}</Text>
            {result.headlineAmount !== null && (
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SIZE_MULTIPLIER} numberOfLines={1} style={styles.resultAmount}>{formatChips(result.headlineAmount)}</Text>
            )}
          </View>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SIZE_MULTIPLIER} numberOfLines={wide ? 2 : 3} style={styles.resultDetail}>{result.detail}</Text>
          {showsPayoutBreakdown ? (
            <View style={styles.resultPayouts}>
              {result.payouts.map((payout) => (
                <Text adjustsFontSizeToFit key={payout.playerId} maxFontSizeMultiplier={DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.7} numberOfLines={1} style={styles.resultPayout}>
                  {t('multiplayer.result.payout', {
                    amount: formatChips(payout.amount),
                    player: payout.label,
                  })}
                </Text>
              ))}
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SIZE_MULTIPLIER} style={styles.resultPot}>{t('multiplayer.result.finalPot', {
                amount: formatChips(result.totalPot),
              })}</Text>
            </View>
          ) : null}
          {countdownLabel ? (
            <MultiplayerSettledCountdown
              actionLabel={countdownActionLabel}
              busy={busy}
              label={countdownLabel}
              onPress={onCountdownPress}
              wide={wide}
            />
          ) : null}
        </View>
        {wide ? trailingControl : null}
      </View>
      {!wide && trailingControl ? (
        <View style={styles.resultFooter} testID="multiplayer-result-footer">
          {trailingControl}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(palette: ThemePalette, wide: boolean) {
  return StyleSheet.create({
    disabled: { opacity: 0.42 },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
    resultPanel: {
      width: '100%',
      maxWidth: 880,
      minHeight: wide ? 104 : 86,
      alignSelf: 'center',
      gap: wide ? 0 : 7,
      padding: wide ? 14 : 9,
      paddingHorizontal: wide ? 16 : 9,
      borderRadius: wide ? 18 : 14,
      borderWidth: 1.5,
      backgroundColor: palette.surface,
    },
    resultSummaryRow: {
      width: '100%',
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: wide ? 14 : 9,
    },
    resultIcon: { width: wide ? 48 : 38, height: wide ? 48 : 38, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: wide ? 15 : 12 },
    resultCopy: { flex: 1, minWidth: 0, gap: wide ? 3 : 2 },
    resultHeadline: { minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: wide ? 8 : 5 },
    resultTitle: { flexShrink: 1, color: palette.text, fontSize: wide ? 16 : 13, fontWeight: '900' },
    resultAmount: { color: palette.primary, fontSize: wide ? 16 : 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
    resultDetail: { color: palette.muted, fontSize: wide ? 11.5 : 10, lineHeight: wide ? 16 : 14, fontWeight: '600' },
    resultPayouts: { flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 7 : 4, marginTop: wide ? 3 : 1 },
    resultPot: { color: palette.muted, fontSize: wide ? 10.5 : 9, fontWeight: '800' },
    resultPayout: { maxWidth: wide ? 180 : 170, color: palette.aqua, fontSize: wide ? 11.5 : 9.5, fontWeight: '900' },
    resultFooter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingLeft: 47 },
    resultButton: { minWidth: wide ? 178 : 124, minHeight: wide ? 50 : 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: wide ? 15 : 13, borderRadius: wide ? 13 : 11, backgroundColor: palette.primary },
    resultButtonText: { color: palette.primaryText, fontSize: wide ? 12.5 : 11, fontWeight: '900' },
    resultNote: { maxWidth: wide ? 190 : '100%', flexShrink: 1, color: palette.muted, fontSize: wide ? 10.5 : 9, lineHeight: wide ? 15 : 12, fontWeight: '700', textAlign: wide ? 'center' : 'left' },
  });
}
