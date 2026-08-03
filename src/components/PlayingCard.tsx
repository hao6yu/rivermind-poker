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
  mini?: boolean;
}

const suitNames = {
  clubs: 'clubs',
  diamonds: 'diamonds',
  hearts: 'hearts',
  spades: 'spades',
} as const;

export function PlayingCard({ card, hidden = false, compact = false, mini = false }: PlayingCardProps) {
  const { t } = useLocalization();
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const sizeStyle = mini ? styles.mini : compact ? styles.compact : styles.regular;
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
      <Text style={[styles.rank, compact && styles.compactRank, mini && styles.miniRank, red && styles.red]}>{rankLabels[card.rank]}</Text>
      <Text style={[styles.suit, compact && styles.compactSuit, mini && styles.miniSuit, red && styles.red]}>{suitSymbols[card.suit]}</Text>
    </View>
  );
}

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
    mini: { width: 29, height: 41, borderRadius: 6 },
    rank: { color: palette.cardText, fontSize: 22, fontWeight: '800', lineHeight: 24 },
    suit: { color: palette.cardText, fontSize: 22, lineHeight: 23 },
    compactRank: { fontSize: 18, lineHeight: 20 },
    compactSuit: { fontSize: 18, lineHeight: 19 },
    miniRank: { fontSize: 12, lineHeight: 13 },
    miniSuit: { fontSize: 12, lineHeight: 13 },
    red: { color: palette.cardRed },
    hidden: { borderColor: palette.tableLine },
    empty: { backgroundColor: palette.tableDeep, borderColor: palette.tableLine, borderStyle: 'dashed' },
    backLine: { position: 'absolute', width: 36, height: 1, backgroundColor: palette.tableText, opacity: 0.32, transform: [{ rotate: '45deg' }] },
    backLineOffset: { transform: [{ rotate: '-45deg' }] },
    shadow: { shadowColor: palette.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 },
  });
}
