import { Ionicons } from '@expo/vector-icons';
import { useMemo, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PlayingCard } from '../../components/PlayingCard';
import { bestFiveForSeat, type BeginnerTutorialSeatView, type BeginnerTutorialTableView, type Card, type TutorialActionId, type TutorialHighlightTarget } from '../../domain/tutorial/beginnerTutorial';
import { useLocalization } from '../../localization';
import type { MessageKey } from '../../localization/messages';
import { RADIUS } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ACTION_ICONS: Record<TutorialActionId, IconName> = {
  bet: 'cash-outline',
  call: 'hand-right-outline',
  check: 'checkmark-circle-outline',
  fold: 'close-circle-outline',
  raise: 'trending-up-outline',
};

/** Typed action-label keys (no dynamic-key casts). */
const ACTION_LABEL_KEYS: Record<TutorialActionId, MessageKey> = {
  bet: 'poker.action.bet',
  call: 'poker.action.call',
  check: 'poker.action.check',
  fold: 'poker.action.fold',
  raise: 'poker.action.raise',
};

const SEAT_TEST_IDS = {
  hero: 'tutorial.seat.hero',
  'small-blind': 'tutorial.seat.smallBlind',
  'big-blind': 'tutorial.seat.bigBlind',
} as const;

/**
 * The simplified three-seat tutorial table. The whole view derives from the
 * domain's table selector — no stored deck, stacks, or history. Seats render
 * authored cards through the shared PlayingCard, and every highlighted target
 * pairs its ring with the dealer/blind/badge markers plus the coach copy
 * naming it (never color alone).
 */
export function TutorialTable({
  highlight,
  view,
}: {
  highlight: TutorialHighlightTarget;
  view: BeginnerTutorialTableView;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const potLabel = t('table.pot', { amount: view.pot });

  // Showdown: the exact five cards each showdown hand plays (plan §4 step 9).
  const showdown = view.street === 'showdown';
  const bestFiveKeys = new Set<string>();
  if (showdown) {
    for (const seatId of ['hero', 'big-blind'] as const) {
      for (const card of bestFiveForSeat(seatId)) bestFiveKeys.add(cardKey(card));
    }
  }

  const renderSeat = (seat: BeginnerTutorialSeatView) => {
    const highlighted = highlight?.kind === 'seat' && highlight.seatId === seat.seatId;
    const cardsHighlighted = highlight?.kind === 'hole-cards' && highlight.seatId === seat.seatId;
    const actionHighlighted = highlight?.kind === 'action' && highlight.seatId === seat.seatId;
    const seatName = seat.seatId === 'hero'
      ? t('tutorial.seat.hero')
      : seat.seatId === 'small-blind'
        ? t('tutorial.seat.smallBlind')
        : t('tutorial.seat.bigBlind');
    const statusParts = [
      seat.hasDealerButton ? t('tutorial.a11y.dealerButton') : null,
      seat.folded ? t('poker.action.fold') : null,
      seat.streetBet > 0 ? `${t('poker.action.bet')} ${seat.streetBet}` : null,
    ].filter((part): part is string => part !== null);
    return (
      <View
        accessibilityLabel={[seatName, ...statusParts].join(', ')}
        key={seat.seatId}
        style={[
          styles.seat,
          seat.seatId === 'hero' ? styles.seatHero : styles.seatOpponent,
          highlighted && styles.seatHighlighted,
          seat.folded && styles.seatFolded,
        ]}
        testID={SEAT_TEST_IDS[seat.seatId]}
      >
        <View style={styles.seatHeader}>
          {seat.hasDealerButton ? (
            <View accessibilityLabel={t('tutorial.a11y.dealerButton')} style={styles.dealerButton}>
              <Text maxFontSizeMultiplier={1.2} style={styles.dealerButtonText}>D</Text>
            </View>
          ) : null}
          <Text maxFontSizeMultiplier={1.3} style={styles.seatName}>{seatName}</Text>
        </View>
        <View style={styles.seatCards}>
          {seat.cards.map((card, index) => {
            const inBestFive = showdown && bestFiveKeys.has(cardKey(card));
            return (
              <View
                key={index}
                style={inBestFive ? styles.bestFiveCard : undefined}
              >
                <PlayingCard
                  card={seat.cardsRevealed ? card : undefined}
                  hidden={!seat.cardsRevealed}
                  small
                />
              </View>
            );
          })}
        </View>
        <View style={styles.seatMeta}>
          {seat.blind === 'small' ? (
            <Text maxFontSizeMultiplier={1.3} style={styles.blindBadge}>{t('tutorial.seat.smallBlind')}</Text>
          ) : null}
          {seat.blind === 'big' ? (
            <Text maxFontSizeMultiplier={1.3} style={styles.blindBadge}>{t('tutorial.seat.bigBlind')}</Text>
          ) : null}
          {seat.streetBet > 0 ? (
            <View style={styles.betChip}>
              <Ionicons color={palette.amberText} name="cash-outline" size={11} />
              <Text maxFontSizeMultiplier={1.2} style={styles.betChipText}>{seat.streetBet}</Text>
            </View>
          ) : null}
          {seat.lastAction ? (
            <View
              accessibilityLabel={`${seatName}: ${t(ACTION_LABEL_KEYS[seat.lastAction])}`}
              style={[styles.actionBadge, actionHighlighted && styles.actionBadgeHighlighted]}
            >
              <Ionicons color={palette.tableText} name={ACTION_ICONS[seat.lastAction]} size={11} />
              <Text maxFontSizeMultiplier={1.2} style={styles.actionBadgeText}>
                {t(ACTION_LABEL_KEYS[seat.lastAction])}
              </Text>
            </View>
          ) : null}
        </View>
        {cardsHighlighted ? <View accessible={false} style={styles.cardsHighlightRing} /> : null}
      </View>
    );
  };

  const smallBlind = view.seats.find((seat) => seat.seatId === 'small-blind');
  const bigBlind = view.seats.find((seat) => seat.seatId === 'big-blind');
  const hero = view.seats.find((seat) => seat.seatId === 'hero');

  return (
    <View accessibilityLabel={t('tutorial.a11y.table')} style={styles.table}>
      <View style={styles.felt}>
        <View style={styles.opponentRow}>
          {smallBlind ? renderSeat(smallBlind) : null}
          {bigBlind ? renderSeat(bigBlind) : null}
        </View>
        <View style={styles.center}>
          <View accessibilityLabel={potLabel} style={styles.potPlaque}>
            <Ionicons color={palette.tableText} name="ellipse-outline" size={12} />
            <Text maxFontSizeMultiplier={1.3} style={styles.potText}>{potLabel}</Text>
          </View>
          <View accessibilityLabel={t('tutorial.a11y.communityCards')} style={styles.board}>
            {view.board.length > 0
              ? view.board.map((card) => {
                const inBestFive = showdown && bestFiveKeys.has(cardKey(card));
                return (
                  <View
                    key={`${card.rank}-${card.suit}`}
                    style={[inBestFive && styles.bestFiveCard, showdown && !inBestFive && styles.dimmedCard]}
                  >
                    <PlayingCard card={card} small />
                  </View>
                );
              })
              : Array.from({ length: 5 }, (_, index) => <PlayingCard key={index} />)}
          </View>
        </View>
        {hero ? <View style={styles.heroRow}>{renderSeat(hero)}</View> : null}
      </View>
    </View>
  );
}

function cardKey(card: Card): string {
  return `${card.rank}:${card.suit}`;
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    table: { width: '100%', maxWidth: 560, alignSelf: 'center' },
    felt: {
      borderRadius: RADIUS.xl,
      borderWidth: 2,
      borderColor: palette.tableLine,
      backgroundColor: palette.table,
      paddingVertical: 16,
      paddingHorizontal: 12,
      gap: 12,
    },
    opponentRow: { flexDirection: 'row', justifyContent: 'space-evenly', gap: 12 },
    center: { alignItems: 'center', gap: 12 },
    potPlaque: {
      minHeight: 30,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: palette.tableDeep,
      borderWidth: 1,
      borderColor: palette.tableLine,
    },
    potText: { color: palette.tableText, fontSize: 13, fontWeight: '800' },
    board: { flexDirection: 'row', gap: 8, minHeight: 48, alignItems: 'center' },
    heroRow: { alignItems: 'center' },
    seat: {
      minWidth: 132,
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: RADIUS.lg,
      borderWidth: 2,
      borderColor: palette.tableLine,
      backgroundColor: palette.tableDeep,
    },
    seatHero: { minWidth: 190 },
    seatOpponent: { minWidth: 132 },
    seatHighlighted: { borderColor: palette.winnerGold },
    seatFolded: { opacity: 0.55 },
    seatHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dealerButton: {
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.pill,
      backgroundColor: palette.winnerGold,
    },
    dealerButtonText: { color: palette.tableDeep, fontSize: 10, fontWeight: '900' },
    seatName: { color: palette.tableText, fontSize: 12, fontWeight: '800' },
    seatCards: { flexDirection: 'row', gap: 4 },
    bestFiveCard: {
      borderRadius: RADIUS.xs,
      borderWidth: 2,
      borderColor: palette.winnerGold,
    },
    dimmedCard: { opacity: 0.45 },
    cardsHighlightRing: {
      position: 'absolute',
      top: 26,
      left: 10,
      right: 10,
      height: 52,
      borderRadius: RADIUS.sm,
      borderWidth: 2,
      borderColor: palette.winnerGold,
    },
    seatMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 },
    blindBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: RADIUS.xs,
      backgroundColor: palette.soft,
      color: palette.text,
      fontSize: 9,
      fontWeight: '800',
    },
    betChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
      backgroundColor: palette.amber,
    },
    betChipText: { color: palette.amberText, fontSize: 10, fontWeight: '900' },
    actionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: RADIUS.xs,
      backgroundColor: palette.table,
      borderWidth: 1,
      borderColor: palette.tableLine,
    },
    actionBadgeHighlighted: { borderColor: palette.winnerGold },
    actionBadgeText: { color: palette.tableText, fontSize: 9, fontWeight: '800' },
  });
}
