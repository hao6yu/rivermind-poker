import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isRedSuit, rankLabels, suitSymbols } from '../domain/poker/cards';
import type { Card, Rank, Suit } from '../domain/poker/types';
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

/** Localized rank label keys per rank (the card-face glyph stays on the card). */
export const rankLabelKeys: Record<Rank, string> = {
  14: 'card.rank.ace',
  13: 'card.rank.king',
  12: 'card.rank.queen',
  11: 'card.rank.jack',
  10: 'card.rank.ten',
  9: 'card.rank.nine',
  8: 'card.rank.eight',
  7: 'card.rank.seven',
  6: 'card.rank.six',
  5: 'card.rank.five',
  4: 'card.rank.four',
  3: 'card.rank.three',
  2: 'card.rank.two',
};

const suitLabelKeys: Record<Suit, string> = {
  clubs: 'card.suit.clubs',
  diamonds: 'card.suit.diamonds',
  hearts: 'card.suit.hearts',
  spades: 'card.suit.spades',
} as const;

export { suitLabelKeys };

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
  // Localized spoken label (plan §6.6): each locale names the rank and suit in
  // its own language through the card.aria template.
  const ariaLabel = t('card.aria', {
    rank: t(rankLabelKeys[card.rank] as Parameters<typeof t>[0]),
    suit: t(suitLabelKeys[card.suit] as Parameters<typeof t>[0]),
  });
  return (
    <View
      accessibilityLabel={ariaLabel}
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
