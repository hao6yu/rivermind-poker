import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isRedSuit, rankLabels, suitSymbols } from '../domain/poker/cards';
import type { Card } from '../domain/poker/types';
import { useLocalization } from '../localization';
import { type ThemePalette, useAppTheme } from '../theme';

interface PlayingCardProps {
  card?: Card;
  hidden?: boolean;
  compact?: boolean;
  medium?: boolean;
  micro?: boolean;
  mini?: boolean;
  small?: boolean;
}

const suitNames = {
  clubs: 'clubs',
  diamonds: 'diamonds',
  hearts: 'hearts',
  spades: 'spades',
} as const;

export function PlayingCard({
  card,
  hidden = false,
  compact = false,
  medium = false,
  micro = false,
  mini = false,
  small = false,
}: PlayingCardProps) {
  const { t } = useLocalization();
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const sizeStyle = micro
    ? styles.micro
    : mini
    ? styles.mini
    : small
      ? styles.small
      : medium
        ? styles.medium
        : compact ? styles.compact : styles.regular;
  if (hidden) {
    return (
      <LinearGradient
        accessibilityLabel={t('card.faceDown')}
        accessible
        colors={[palette.primary, palette.tableDeep]}
        style={[styles.card, sizeStyle, styles.hidden]}
      >
        <View style={styles.backLine} />
        <View style={[styles.backLine, styles.backLineOffset]} />
      </LinearGradient>
    );
  }

  if (!card) return <View accessible={false} style={[styles.card, sizeStyle, styles.empty]} />;
  const red = isRedSuit(card.suit);
  return (
    <View
      accessibilityLabel={`${rankLabels[card.rank]} of ${suitNames[card.suit]}`}
      accessible
      style={[styles.card, sizeStyle, styles.shadow]}
    >
      <Text style={[styles.rank, compact && styles.compactRank, medium && styles.mediumRank, small && styles.smallRank, mini && styles.miniRank, micro && styles.microRank, red && styles.red]}>{rankLabels[card.rank]}</Text>
      <Text style={[styles.suit, compact && styles.compactSuit, medium && styles.mediumSuit, small && styles.smallSuit, mini && styles.miniSuit, micro && styles.microSuit, red && styles.red]}>{suitSymbols[card.suit]}</Text>
    </View>
  );
}

/**
 * The variant boxes below are mirrored by `src/features/learn/trainingSizing.ts`,
 * whose fit math picks the largest variant a training card can hold. Change a box
 * here and change that mirror with it.
 */
function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: palette.card,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    regular: { width: 52, height: 74 },
    compact: { width: 44, height: 62, borderRadius: 8 },
    medium: { width: 38, height: 54, borderRadius: 7 },
    small: { width: 34, height: 48, borderRadius: 7 },
    mini: { width: 29, height: 41, borderRadius: 6 },
    micro: { width: 20, height: 26, borderRadius: 4 },
    rank: { color: palette.cardText, fontSize: 22, fontWeight: '800', lineHeight: 24 },
    suit: { color: palette.cardText, fontSize: 22, lineHeight: 23 },
    compactRank: { fontSize: 18, lineHeight: 20 },
    compactSuit: { fontSize: 18, lineHeight: 19 },
    mediumRank: { fontSize: 16, lineHeight: 18 },
    mediumSuit: { fontSize: 16, lineHeight: 17 },
    smallRank: { fontSize: 14, lineHeight: 16 },
    smallSuit: { fontSize: 14, lineHeight: 15 },
    miniRank: { fontSize: 12, lineHeight: 13 },
    miniSuit: { fontSize: 12, lineHeight: 13 },
    microRank: { fontSize: 8, lineHeight: 9 },
    microSuit: { fontSize: 8, lineHeight: 9 },
    red: { color: palette.cardRed },
    hidden: { borderColor: palette.tableLine },
    empty: { backgroundColor: palette.tableDeep, borderColor: palette.tableLine, borderStyle: 'dashed' },
    backLine: { position: 'absolute', width: 36, height: 1, backgroundColor: palette.tableText, opacity: 0.32, transform: [{ rotate: '45deg' }] },
    backLineOffset: { transform: [{ rotate: '-45deg' }] },
    shadow: { shadowColor: palette.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 },
  });
}
